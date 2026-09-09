"""FastAPI service cho Morfin slap scanner. Thay the zkfp service (port 8765).

Giu nguyen contract cua service cu de frontend doi it nhat:
    GET  /api/health
    GET  /api/fingers
    POST /api/session/start           {user_name}
    GET  /api/session/{sid}
    POST /api/session/{sid}/capture   {step?}   <-- chup 1 CUM, khong phai 1 ngon
    POST /api/session/{sid}/confirm_step  {step}          <-- chap nhan ca cum
    POST /api/session/{sid}/mark_none {codes, value?}     <-- ghi none cho 1 ngon
    POST /api/session/{sid}/redo/{finger_code}
    GET  /api/session/{sid}/preview/{finger_code}.png
    DELETE /api/session/{sid}
    POST /api/match_pair              {t1_b64, t2_b64}

Khac biet co ban so voi zkfp: 1 lan capture lay 4 ngon (slap) thay vi 1 ngon.
Enroll 10 ngon = 4 lan chup thay vi 10 lan bam.

Chay:
    python -m uvicorn --app-dir backend/services/morfin_service api:app \
        --host 127.0.0.1 --port 8765
"""
from __future__ import annotations

import base64
import io
import json
import os
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from PIL import Image, ImageFilter
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import engine as E  # noqa: E402
from engine import MorfinError, engine  # noqa: E402
from morfin import CAPTURE_TIMEOUT as MORFIN_TIMEOUT  # noqa: E402
from morfin import FingerType, SlapPosition  # noqa: E402

# ---------- Mapping slap -> ma ngon ----------
# Fingers[1] la ngon TRAI NHAT trong anh slap (theo header SDK), khong phai
# theo giai phau. Mapping duoi day chi dung khi nguoi dan dat tay DUNG CHIEU
# (long ban tay up xuong, dau ngon huong ra xa nguoi dat).
#
# NGON CAI CHUP CHUM CA HAI NGON trong MOT lan - khong tach duoc.
#
# DA THU tach thanh 2 buoc 1 ngon (thumb_left / thumb_right, moi buoc khai ngon
# cai ben kia vao tham so `exceptions` cua StartCapture) va SDK TU CHOI. Log tu
# thiet bi that (Morfin MORPHS, serial 10783121):
#
#   step=thumb_left THAT BAI code=-2019 (Capture timeout) frames=64 count=4
#   msg='Hand Position [UNKNOWN]'
#
# Doc ra: frames=64 nghia la cam bien CO thay ngon (preview doc duoc Quality 62),
# nen khong phai loi dat tay hay thiet bi. Nhung count=4: SDK VAN cho DU 4 ngon
# du da khai 1 ngon vao exceptions => `exceptions` KHONG ha duoc so ngon SDK cho
# o che do chum. Va 'Hand Position [UNKNOWN]' cho biet no khong nhan ra tu the
# mot ngon cai don le. auto_capture khong bao gio chot frame => het timeout.
#
# count=4 cung LOAI duong "chup ngon cai o LEFT_HAND/RIGHT_HAND voi 3 ngon kia
# khai absent": cung dua vao exceptions de ha so ngon, se 408 y nhu vay.
#
# => Ngon cai phai chup chum 2 ngon. Hau qua phai chap nhan: slot nao la ngon cai
#    TRAI phai suy theo toa do x (slot 1 = trai nhat trong anh), vi SDK chi tra
#    "Thumb A"/"Thumb B" chu khong noi ben nao. Nguoi dan dat nguoc hai ngon cai
#    thi template bi gan lech sang ngon kia. Khong co duong nao khac o che do FLAT.
#    Muon chup rieng tung ngon cai thi phai dung FingerType.ROLL (van LAN, da chay
#    tot - xem ROLL_STEPS), nhung do la van lan chu khong phai van phang.
#
# Thu tu 3 buoc chum = DUNG THU TU 3 O TREN MAN HINH, trai sang phai:
#   4 ngon trai -> 2 ngon cai -> 4 ngon phai
# Cung quy uoc voi ROLL_ORDER: can bo doc mot mach, khong phai nhay o.
SLAP_STEPS: list[dict] = [
    {
        "step": "left_hand",
        "slap": SlapPosition.LEFT_HAND,
        "label_vi": "4 ngon ban tay trai",
        "expect": 4,
        "codes": ["left_little", "left_ring", "left_middle", "left_index"],
    },
    {
        "step": "thumbs",
        "slap": SlapPosition.THUMB,
        "label_vi": "2 ngon cai",
        "expect": 2,
        "codes": ["left_thumb", "right_thumb"],
    },
    {
        "step": "right_hand",
        "slap": SlapPosition.RIGHT_HAND,
        "label_vi": "4 ngon ban tay phai",
        "expect": 4,
        "codes": ["right_index", "right_middle", "right_ring", "right_little"],
    },
]

# ---------- Buoc VAN LAN: 1 ngon = 1 buoc ----------
# Van lan la MOT lan StartCapture(ROLL) cho MOI ngon. Truoc day 10 o "van lan" o
# frontend duoc dien bang cach CAT tung ngon ra tu anh chum (engine.capture_slap
# tra fingers[] tach san) - tuc la khong he co van lan nao, chi la anh phang bi
# crop. Gio moi ngon co buoc rieng, chup rieng, o che do FingerType.ROLL.
#
# Vi sao 1 ngon = 1 buoc chu khong gom thanh 1 buoc 10 ngon: mot StartCapture chi
# tra ve DUNG MOT anh (mot completeCb). Khong co tham so nao cho phep mot lan
# StartCapture tra nhieu anh cua nhieu ngon.
# THU TU LAN = dung thu tu cac o TU TRAI SANG PHAI tren luoi 10 o cua frontend
# (luoi nhom 4 trai | 2 cai | 4 phai, o ngoai cung ben trai la UT TRAI):
#   ut trai -> ap ut -> giua -> tro trai | cai trai -> cai phai | tro phai -> ...
#     ... -> giua -> ap ut -> ut phai
# Nho vay o dang nhap nhay chay tuan tu tu trai sang phai, can bo doc mot mach,
# khong phai nhay o. Doi thu tu o day thi PHAI doi FP_CLUSTERS o frontend cho khop
# (frontend suy FP_ROLL_ORDER tu FP_CLUSTERS).
ROLL_ORDER: list[str] = [
    "left_little", "left_ring", "left_middle", "left_index",
    "left_thumb", "right_thumb",
    "right_index", "right_middle", "right_ring", "right_little",
]
ROLL_STEPS: list[dict] = [
    {
        "step": "roll_" + code,
        "slap": SlapPosition.ROLL,
        "label_vi": "Lan " + {
            "left_thumb": "cai trai", "left_index": "tro trai",
            "left_middle": "giua trai", "left_ring": "ap ut trai",
            "left_little": "ut trai", "right_thumb": "cai phai",
            "right_index": "tro phai", "right_middle": "giua phai",
            "right_ring": "ap ut phai", "right_little": "ut phai",
        }[code],
        "expect": 1,
        "codes": [code],
        "roll": True,
    }
    for code in ROLL_ORDER
]

# Thu tu: lan het 10 ngon TRUOC, roi moi sang 3 lan chum.
#
# Thu tu nay do nguoi dung chot, va no cung la thu tu re nhat: FingerType chi dat
# duoc luc InitDevice nen moi lan doi lan<->chum la mot lan UninitDevice + init
# lai. Xep lan lien nhau roi chum lien nhau => dung MOT lan doi che do cho ca ho
# so. Neu cho nhay qua lai tuy y thi moi lan nhay ton them mot lan mo lai thiet bi.
STEPS: list[dict] = ROLL_STEPS + SLAP_STEPS
STEP_BY_NAME = {s["step"]: s for s in STEPS}

# Giu nguyen thu tu / ten tieng Viet cua service cu de FE khong phai doi i18n.
FINGERS: list[dict[str, str]] = [
    {"code": "left_little",  "name_vi": "Ut trai",    "hand": "left",  "step": "left_hand"},
    {"code": "left_ring",    "name_vi": "Ap ut trai", "hand": "left",  "step": "left_hand"},
    {"code": "left_middle",  "name_vi": "Giua trai",  "hand": "left",  "step": "left_hand"},
    {"code": "left_index",   "name_vi": "Tro trai",   "hand": "left",  "step": "left_hand"},
    {"code": "left_thumb",   "name_vi": "Cai trai",   "hand": "left",  "step": "thumbs"},
    {"code": "right_thumb",  "name_vi": "Cai phai",   "hand": "right", "step": "thumbs"},
    {"code": "right_index",  "name_vi": "Tro phai",   "hand": "right", "step": "right_hand"},
    {"code": "right_middle", "name_vi": "Giua phai",  "hand": "right", "step": "right_hand"},
    {"code": "right_ring",   "name_vi": "Ap ut phai", "hand": "right", "step": "right_hand"},
    {"code": "right_little", "name_vi": "Ut phai",    "hand": "right", "step": "right_hand"},
]
FINGER_NAME = {f["code"]: f["name_vi"] for f in FINGERS}
FINGER_CODES = [f["code"] for f in FINGERS]

# Quality toi thieu de nhan 1 ngon. Duoi nguong nay TU CHOI ca cum va bat
# chup lai - khong luu template kem vao Mongo, vi template kem se lam sai ket
# qua tra cuu ve sau ma khong ai biet.
#
# Nguong RIENG cho TUNG ngon, admin dat trong Settings. Ly do can rieng tung
# ngon: hinh hoc slap khien hai ngon ria (ut, tro) luon ep nhe hon hai ngon giua
# nen kho dat cung mot muc; nguoi lon tuoi / lao dong tay chan cung co ngon mon
# van tay rieng le. Bat buoc dung 1 nguong chung thi phai ha het 10 ngon xuong
# theo ngon yeu nhat, tuc la ha chuan cua ca 9 ngon con lai.
#
# Gia tri env chi la MAC DINH luc chua co config. Nguon that la db.settings
# (_id="fingerprint") o backend chinh, day sang qua POST /api/config/quality.
MIN_QUALITY_DEFAULT = int(os.getenv("MORFIN_MIN_QUALITY", "50"))

# Luu xuong file canh api.py de song qua restart service. Service nay tu
# respawn; neu chi giu trong RAM thi moi lan restart nguong lai am tham ve
# mac dinh, admin da dat nguong rieng nhung khong he biet no da bi reset.
_QUALITY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "quality.json")

_min_quality_map: dict[str, int] = {c: MIN_QUALITY_DEFAULT for c in FINGER_CODES}
_cfg_lock = threading.Lock()


def _clamp_quality(v) -> Optional[int]:
    """0-100. Tra None neu khong doc duoc - de caller giu gia tri cu."""
    try:
        n = int(float(v))
    except (TypeError, ValueError):
        return None
    return n if 0 <= n <= 100 else None


def _parse_quality_map(raw) -> dict[str, int]:
    """Loc lay cac ma ngon HOP LE. Ma la va gia tri ngoai 0-100 bi bo qua.

    Bo qua thay vi raise: config den tu Mongo co the con key cu tu phien ban
    truoc, va mot key rac khong duoc lam ca service khong doc duoc nguong.
    """
    out: dict[str, int] = {}
    if isinstance(raw, dict):
        for code, val in raw.items():
            if code in _min_quality_map:
                n = _clamp_quality(val)
                if n is not None:
                    out[code] = n
    return out


def _load_quality_file() -> None:
    try:
        with open(_QUALITY_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        return
    except Exception as e:  # noqa: BLE001 - file loi khong duoc chan service start
        print("[MORFIN] doc quality.json loi: %r (dung mac dinh %d cho ca 10 ngon)"
              % (e, MIN_QUALITY_DEFAULT), flush=True)
        return
    got = _parse_quality_map(data.get("by_finger"))
    if got:
        _min_quality_map.update(got)
        print("[MORFIN] nguong tung ngon (tu quality.json): %s"
              % sorted(_min_quality_map.items()), flush=True)


def _save_quality_file() -> None:
    tmp = _QUALITY_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"by_finger": _min_quality_map}, f)
    os.replace(tmp, _QUALITY_FILE)


def _min_quality(code: str) -> int:
    return _min_quality_map.get(code, MIN_QUALITY_DEFAULT)


# Doc ngay luc import, TRUOC khi co request nao vao: neu doc muon hon thi lan
# capture dau tien sau restart se dung nguong mac dinh chu khong phai nguong
# admin da dat.
_load_quality_file()


# Nguong coi mot pixel la CO MUC (co van tay). Anh vân tay tu platen la nen SANG
# gan trang, van la net TOI => pixel < nguong nay thuoc vung van.
_FP_INK_THRESHOLD = 200
# Vien chua quanh bbox, tinh theo px cua anh goc. De van khong bi cat sat mep -
# nhin sat mep trong nhu anh bi crop thieu.
_FP_PAD = 8


def _fingerprint_bbox(gray: Image.Image) -> Optional[tuple]:
    """Bbox cua vung CO VAN trong anh grayscale, hoac None neu anh trong.

    Loc nhieu bang MedianFilter TRUOC khi lay bbox: chi mot pixel toi le o goc anh
    (bui tren platen, nhieu cam bien) la du lam bbox bung ra ca khung, va luc do
    canh giua thanh vo nghia vi bbox = ca anh.
    """
    mask = gray.point(lambda p: 255 if p < _FP_INK_THRESHOLD else 0)
    return mask.filter(ImageFilter.MedianFilter(3)).getbbox()


def _center_fingerprint(img: Image.Image) -> Image.Image:
    """Cat lay vung van roi dat vao GIUA khung, giu nguyen kich thuoc anh goc.

    Vi sao can: SDK tra ca vung platen ma ngon dat len, nen van tay nam lech ve
    mot goc tuy nguoi dan ap tay o dau. Tren luoi 10 o cua FE, moi o mot kieu
    lech nhin nhu may chup sai; can bo cung kho so hai o canh nhau.

    Giu NGUYEN kich thuoc anh goc (khong crop sat bbox) de ti le cac o tren luoi
    khong doi - crop sat se lam moi o mot ti le khac nhau, layout nhay theo anh.
    """
    gray = img.convert("L")
    box = _fingerprint_bbox(gray)
    if box is None:
        # Anh trang tron (khong tach duoc van): tra nguyen, khong dung cham.
        return gray
    w, h = gray.size
    x0, y0, x1, y1 = box
    x0 = max(0, x0 - _FP_PAD)
    y0 = max(0, y0 - _FP_PAD)
    x1 = min(w, x1 + _FP_PAD)
    y1 = min(h, y1 + _FP_PAD)
    crop = gray.crop((x0, y0, x1, y1))
    # Nen TRANG de khop nen anh van tay; vung them vao khong duoc toi hon nen,
    # neu khong se thanh vien xam quanh anh.
    canvas = Image.new("L", (w, h), 255)
    canvas.paste(crop, ((w - crop.width) // 2, (h - crop.height) // 2))
    return canvas


def _bmp_to_png_b64(blob: bytes, thumb: Optional[int] = None,
                    center: bool = False) -> str:
    """SDK tra BMP; FE dung data:image/png => phai convert.

    center=True: cat bbox van tay roi canh giua truoc khi tra ve (xem
    _center_fingerprint). Canh giua TRUOC thumbnail: lam nguoc lai thi bbox doc
    tren anh da thu nho, mat do chinh xac va vien pad lech ti le.
    """
    if not blob:
        return ""
    img = Image.open(io.BytesIO(blob))
    if center:
        img = _center_fingerprint(img)
    if thumb:
        img.thumbnail((thumb, thumb))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _png_width(blob: bytes) -> int:
    """Be ngang anh slap THO (pixel), de quy toa do x cua ngon ra phan tram.

    Doc tu anh GOC chu khong phai anh da thumbnail: toa do x trong ImageInfo la
    toa do tren anh goc. Tra 0 khi khong doc duoc - caller bo qua viec dat so.
    """
    if not blob:
        return 0
    try:
        return Image.open(io.BytesIO(blob)).width
    except Exception:  # noqa: BLE001 - anh loi khong duoc lam do ca lan chup
        return 0


def _mark_x_pct(fc, slap_w: int) -> Optional[float]:
    """Vi tri ngang (phan tram) de dat so % cua mot ngon tren anh chum.

    Dung phan tram chu khong pixel: anh FE hien la ban da thumbnail(600) roi con
    scale theo CSS, nen pixel cua anh goc khong con y nghia o phia FE.

    Lay DIEM GIUA ngon (x -> x2). Neu SDK khong ghi RightBottomCordinates (x2 <=
    x) thi lui ve dung canh trai: so lech ve ben trai mot chut nhung VAN dung
    ngon, hon la khong hien so nao.
    """
    if slap_w <= 0:
        return None
    x = fc.x + (fc.x2 - fc.x) / 2 if fc.x2 > fc.x else fc.x
    return round(max(0.0, min(100.0, x / slap_w * 100)), 1)


@dataclass
class FingerRecord:
    code: str
    name_vi: str
    hand: str
    step: str
    template_b64: Optional[str] = None
    image_b64: Optional[str] = None
    quality: int = 0
    # SDK khong tra so do quality cho ngon nay. quality=0 luc do KHONG co nghia
    # "van tay te" ma la "khong do duoc" - phai phan biet, neu khong UI hien 0%
    # va can bo tuong ngon hong roi chup lai vo ich.
    no_quality: bool = False
    captured_at: Optional[float] = None
    # Can bo da danh dau ngon nay "khong co van tay" => ghi none, KHONG co anh.
    # Dat qua POST /mark_none. Danh dau TRUOC khi chup: cum se chi cho dung so
    # ngon that su co, nho do mapping slot->ngon khong the lech (xem capture()).
    missing: bool = False

    @property
    def done(self) -> bool:
        # "Da xu ly xong" = da thu duoc template HAY da xac nhan khong co van.
        return self.template_b64 is not None or self.missing

    def to_public(self, include_template: bool = False) -> dict:
        out = {
            "code": self.code, "name_vi": self.name_vi, "hand": self.hand,
            "step": self.step, "done": self.done, "quality": self.quality,
            "missing": self.missing, "no_quality": self.no_quality,
            # Chi danh dau "chat luong kem" khi CO template that va duoi nguong.
            # Ngon da confirm missing co quality = 0 mac dinh - neu khong chan
            # template_b64 is not None se hien nham la kem thay vi khong co van.
            "low_quality": (self.template_b64 is not None
                            and self.quality < _min_quality(self.code)),
            "min_quality": _min_quality(self.code),
            "captured_at": self.captured_at,
        }
        if include_template:
            out["template_b64"] = self.template_b64
        return out


@dataclass
class Session:
    id: str
    user_name: str
    fingers: dict[str, FingerRecord] = field(default_factory=dict)
    slap_images: dict[str, str] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    # Cac step can bo DA BAM "Xac nhan". Day la DIEU KIEN DUY NHAT de mot cum
    # duoc coi la xong: chup xong khong tu dong sang cum ke tiep nua, vi can bo
    # phai xem anh ca cum roi moi chap nhan. Chua xac nhan => next_step van tra
    # ve chinh cum do => bam chup lai la thu lai dung cum dang lam.
    confirmed: set[str] = field(default_factory=set)

    def step_captured(self, step: str) -> bool:
        """Da co du lieu cho MOI ngon can co trong cum (chua chac da xac nhan).

        Ngon danh dau none khong can anh - no da "xong" theo nghia khong con gi
        phai thu. Ngon con lai phai co template.
        """
        return all(self.fingers[c].done for c in STEP_BY_NAME[step]["codes"])

    def step_done(self, step: str) -> bool:
        # Buoc ma MOI ngon deu danh dau "khong co van tay" => XONG, khong doi xac nhan.
        #
        # Xac nhan ton tai de can bo XEM ANH roi chap nhan. Buoc nay khong co anh nao
        # ca, nen khong co gi de xem va khong co gi de xac nhan.
        #
        # Thieu nhanh nay thi buoc lan cua ngon thieu KHONG BAO GIO done: ten buoc
        # ("roll_left_little") chi duoc vao self.confirmed ben trong capture()
        # (auto_confirmed cho buoc lan), ma ngon thieu thi khong bao gio chup =>
        # next_step() tra ve mai buoc do => finished mai la False. Hau qua tren FE:
        # bao "chua xong" va BO QUA tra cuu trung 10 ngon (matchFingerprint nam trong
        # nhanh srvDone) - mat mot chuc nang nghiep vu that voi moi nguoi thieu ngon.
        # mark_none cung khong vao duoc: no discard(rec.step), ma rec.step la ten buoc
        # CHUM ("left_hand"), khong phai "roll_left_little".
        #
        # Ap cho ca buoc chum: cum ma ca 4 ngon deu thieu cung thoat duoc (truoc day
        # capture() tra 400 "khong con ngon nao de chup" lap vo han).
        codes = STEP_BY_NAME[step]["codes"]
        if all(self.fingers[c].missing for c in codes):
            return True
        return step in self.confirmed and self.step_captured(step)

    def next_step(self) -> Optional[dict]:
        for s in STEPS:
            if not self.step_done(s["step"]):
                return s
        return None

    @property
    def finished(self) -> bool:
        return self.next_step() is None

    def public(self) -> dict:
        ns = self.next_step()
        done = sum(1 for f in self.fingers.values() if f.done)
        return {
            "session_id": self.id,
            "user_name": self.user_name,
            "finished": self.finished,
            "progress": {"done": done, "total": len(FINGER_CODES)},
            "steps": [
                {"step": s["step"], "label_vi": s["label_vi"],
                 "expect": s["expect"], "codes": s["codes"],
                 # roll=True => buoc lan 1 ngon; False => buoc chum. Frontend can
                 # co nay de biet ve o don hay ve ca ban tay, va de hien huong dan
                 # "lan tu canh mong ben nay sang ben kia" thay vi "ap tay xuong".
                 "roll": bool(s.get("roll")),
                 "done": self.step_done(s["step"])}
                for s in STEPS
            ],
            "next_step": {"step": ns["step"], "label_vi": ns["label_vi"],
                          "expect": ns["expect"], "codes": ns["codes"],
                          "roll": bool(ns.get("roll"))} if ns else None,
            "fingers": [self.fingers[c].to_public() for c in FINGER_CODES],
        }


sessions: dict[str, Session] = {}
_lock = threading.Lock()
# 1 handle thiet bi cho ca process => chi cho 1 capture chay cung luc.
_capture_lock = threading.Lock()
# Thoi gian toi da /api/capture/stop cho luong chup cu nha _capture_lock.
# Dai hon mot nhip SDK thoat khoi cho, nhung khong de request treo vo han.
# /api/capture/stop cho luong chup cu nha _capture_lock. Phai LON HON thoi gian
# cho toi da cua engine (ROLL_TIMEOUT 30 + 10 = 40s) — dat 8s nhu truoc la bo cho
# truoc khi lock duoc nha, tra ve som va client tuong thiet bi ranh.
STOP_LOCK_TIMEOUT = 45.0
# capture() cho bao lau sau khi engine.stop() de giat thiet bi tu lan chup cu.
# engine.stop() cat cho ngay nen luong cu thoat trong ~1s; 12s la du du.
PREEMPT_TIMEOUT = 12.0

app = FastAPI(title="Morfin Slap Enroll")


@app.on_event("shutdown")
def _shutdown() -> None:
    engine.shutdown()


def _get_session(sid: str) -> Session:
    with _lock:
        s = sessions.get(sid)
    if not s:
        raise HTTPException(404, "Session khong ton tai.")
    return s


@app.get("/api/health")
def health():
    try:
        return engine.health()
    except MorfinError as e:
        return JSONResponse({"ok": False, "error": str(e), "code": e.code},
                            status_code=503)


@app.get("/api/fingers")
def list_fingers() -> list[dict]:
    return FINGERS


@app.get("/api/steps")
def list_steps() -> list[dict]:
    # `roll` PHAI co o day, khong chi o /api/session/{sid}.
    # Frontend retryFingerprint (double-click vao o de thu lai) lay group tu DUNG
    # endpoint nay roi set fpActiveRoll = !!group.roll. Thieu co => fpActiveRoll
    # luon false trong ca lan thu lai => dieu kien `fpRunning && fpActiveRoll` o
    # luoi 10 o khong bao gio dung => o KHONG nhay vien lam, can bo double-click
    # xong khong biet may dang doi ngon nao. Vong thu chinh khong bi vi no doc
    # next_step tu /session (cho do da tra `roll`).
    return [{"step": s["step"], "label_vi": s["label_vi"],
             "expect": s["expect"], "codes": s["codes"],
             "roll": bool(s.get("roll"))} for s in STEPS]


@app.get("/api/live")
def live() -> dict:
    """Trang thai preview live (quality tung ngon) de UI ve ROI khi dang chup."""
    return engine.live_state()


class StartReq(BaseModel):
    user_name: str


@app.post("/api/session/start")
def start_session(body: StartReq) -> dict:
    name = (body.user_name or "").strip()
    if not name:
        raise HTTPException(400, "user_name khong duoc trong.")
    try:
        # Mo san o che do LAN vi buoc dau tien cua phien la lan ngon cai trai.
        # Mo dung che do ngay tu dau de lan dau bam Chup khong phai cho
        # UninitDevice + init lai (moi lan doi che do mat vai giay).
        engine.ensure_open(FingerType.ROLL)
    except MorfinError as e:
        raise HTTPException(503, str(e))
    sid = uuid.uuid4().hex[:12]
    s = Session(id=sid, user_name=name,
                fingers={f["code"]: FingerRecord(**f) for f in FINGERS})
    with _lock:
        sessions[sid] = s
    return s.public()


@app.get("/api/session/{sid}")
def session_status(sid: str) -> dict:
    return _get_session(sid).public()


class CaptureReq(BaseModel):
    step: Optional[str] = None


@app.post("/api/session/{sid}/capture")
def capture(sid: str, body: CaptureReq | None = None) -> dict:
    """Chup 1 cum (4 ngon ban tay, hoac 1 ngon cai)."""
    s = _get_session(sid)
    want = (body.step if body else None)
    if want:
        step = STEP_BY_NAME.get(want)
        if not step:
            raise HTTPException(400, f"step khong hop le: {want}")
    else:
        step = s.next_step()
        if step is None:
            raise HTTPException(400, "Da xong tat ca 10 ngon.")

    # Ngon da danh dau none (khong co van tay) bi loai KHOI CUM: khong cho no
    # nua, va cum chi con cho dung so ngon that su co. Day la ly do phai danh
    # dau none TRUOC khi chup: neu cum cho 4 ngon ma nguoi ta chi co 3, moi lan
    # chup deu 422 vinh vien, khong co duong nao di tiep.
    #
    # Phai tinh TRUOC khi goi capture_slap: danh sach ngon vang con phai truyen
    # vao SDK (tham so exceptions cua StartCapture), khong chi dung de kiem tra
    # ket qua. auto_capture chi chot frame khi thay DU so ngon cua slap position,
    # nen neu khong khai bao ngon vang thi SDK cho den het timeout roi tra -2019
    # => api tra 408 "chup that bai", khong bao gio den duoc 422 co huong dan.
    codes = [c for c in step["codes"] if not s.fingers[c].missing]
    # absent_extra = ngon KHONG thuoc buoc nay nhung phai khai voi SDK la vang, de
    # auto_capture chot frame o dung so ngon cua buoc. Chi buoc ngon cai dung: chup
    # cai trai thi cai phai la absent_extra. Thieu no thi SlapPosition.THUMB cho du
    # 2 ngon den het timeout roi tra -2019 => 408 vinh vien.
    if not codes:
        raise HTTPException(
            400,
            f"Ca cum {step['label_vi']} da danh dau khong co van tay - khong con "
            "ngon nao de chup.",
        )
    expect = len(codes)
    absent = ([c for c in step["codes"] if s.fingers[c].missing]
              + step.get("absent_extra", []))

    # Khong tra 409 ngay. Lan chup cu co the con dang cho tay TOI 40 GIAY
    # (ROLL_TIMEOUT 30 + 10 trong engine.done.wait), va truong hop pho bien nhat
    # la: can bo roi trang giua luc dang cho => React unmount, mount lai, phien
    # MOI goi capture trong khi luong cu chua thoat. Tra 409 o day lam man hinh
    # moi dung ~40s (nguoi dung: "1 luc sau da duoc").
    #
    # Xu ly: GIANH thiet bi - bao SDK thoi cho (engine.stop()) de luong cu thoat
    # som, roi cho lock trong PREEMPT_TIMEOUT. Chi 409 khi that su khong giat duoc.
    if not _capture_lock.acquire(blocking=False):
        engine.stop()
        if not _capture_lock.acquire(timeout=PREEMPT_TIMEOUT):
            raise HTTPException(409, "Dang co lenh chup khac chay.")
    try:
        if step.get("roll"):
            # Lan: 1 ngon, mot lan StartCapture(ROLL) keo dai (~50 khung/giay
            # duoc SDK khau lai thanh mot anh). Khong co exceptions vi chi co
            # mot ngon - ngon khong co van tay thi da bi chan o tren (codes rong).
            result = engine.capture_roll()
        else:
            result = engine.capture_slap(step["slap"], expect=expect, absent=absent)
    except MorfinError as e:
        raise HTTPException(500, str(e))
    finally:
        _capture_lock.release()

    # Timeout co nghia la SDK KHONG chot duoc frame nao. Nguyen nhan thuong gap
    # nhat khong phai loi thiet bi ma la dat THIEU ngon: auto_capture doi du so
    # ngon cua slap position. Truoc day cho ra "Chup that bai: <ma loi SDK>" -
    # can bo doc khong biet lam gi. Gio noi ro so ngon dang cho va duong ra
    # (danh dau 'khong co van tay'), vi day la tinh huong duy nhat ma nguoi dan
    # khong the tu khac phuc bang cach ap tay lai.
    if not result.ok:
        # Log THAT BAI. Phai dat o day chu khong o duoi: cac dong log diag phia sau
        # nam SAU cua result.ok nen lan that bai truoc gio khong in gi ca - dung luc
        # can so lieu nhat. Log HTTP chi thay "408" lap lai, khong cho biet vi sao.
        #
        # frames la so khung previewCb SDK da nhan. Day la so lieu phan biet duy nhat:
        #   frames = 0  -> cam bien khong thay gi (ngon chua ap vao kinh, hoac device
        #                  dang o che do sai / chua thuc su chup).
        #   frames > 0  -> SDK CO nhan anh nhung khong khau (mosaic) thanh anh lan
        #                  duoc: dong tac lan, hoac index anh/quality doc sai.
        # Khong co so nay thi moi phong doan ve "can bo lan sai" deu la doan mo.
        print("[MORFIN] step=%s THAT BAI code=%s (%s) frames=%s count=%s msg=%r "
              "diag=%s dropped=%s" % (
                  step["step"], result.code, engine.err(result.code), result.frames,
                  result.finger_count, result.message, result.diag,
                  result.dropped[:8]), flush=True)
        # Huong dan loi cua LAN khac han cua CHUM: lan that bai khong bao gio vi
        # "thieu ngon" (chi co 1 ngon) ma vi dong tac lan - lan chua het chieu
        # ngang, lan qua nhanh, hoac nhac ngon giua lan. Dung nguyen thong bao cua
        # chum o day se bao can bo "dat du 1 ngon", vo nghia.
        if step.get("roll"):
            raise HTTPException(
                408,
                f"{step['label_vi']}: chua lay duoc van. Dat canh mong mot ben ap "
                "vao kinh, lan CHAM va DEU sang canh mong ben kia, an vua tay va "
                "khong nhac ngon giua lan. Bam Chup lai de lan lai ngon nay.",
            )
        if result.code == MORFIN_TIMEOUT:
            raise HTTPException(
                408,
                f"Het thoi gian cho: may can du {expect} ngon cua {step['label_vi']} "
                "moi chot duoc anh. Dat du ngon, ap deu va giu yen. Neu co ngon "
                "khong co van tay (cut, tat, bang bo), danh dau 'khong co van tay' "
                "o o ngon do roi chup lai.",
            )
        raise HTTPException(408, f"Chup that bai: {engine.err(result.code)}")
    if not result.fingers:
        raise HTTPException(422, "Khong tach duoc ngon nao. Dat lai tay len sensor.")

    got = result.fingers[:expect]
    # Van chan khi thieu ngon. KHONG dua vao thu tu slot de doan ngon nao thieu:
    # engine gom slot 1->4 va bo qua slot rong, nen thieu 1 ngon giua cum se lam
    # zip(codes, got) gan template LECH SANG NGON KHAC - sai nguy hiem hon 422
    # nhieu vi khong ai phat hien duoc. Ngon that su khong co van thi can bo danh
    # dau none tren o ngon do (POST /mark_none), roi cum se chi cho so ngon con lai.
    if len(got) < expect:
        raise HTTPException(
            422,
            f"Chi nhan duoc {len(got)}/{expect} ngon. "
            "Dat du ngon, ap deu va giu yen. Neu co ngon khong co van tay, "
            "danh dau 'khong co van tay' o o ngon do roi chup lai.",
        )

    # Log gia tri THO tu SDK. Phai dat TRUOC cong quality: neu dat sau thi lan
    # chup bi tu choi se khong log gi ca - dung luc can so lieu nhat.
    print("[MORFIN] step=%s raw (slot,quality,x): %s" % (
        step["step"],
        [(fc.slot, fc.quality, fc.x) for fc in got]), flush=True)
    # Toa do x cua tung slot la CACH DUY NHAT xac dinh slot nao la ngon nao:
    # slot co x nho nhat la ngon ben trai nhat TRONG ANH. Can so lieu nay vi
    # slot 1 tay phai (dang gan right_index) do te nhat trong khi slot 4 (gan
    # right_little) do tot hon - nguoc voi hinh hoc ban tay. Neu SDK danh slot
    # theo thu tu ngon co dinh (ut->tro) cho ca hai tay thi mapping tay phai
    # dang NGUOC, va template se bi gan sai ngon (nguy hiem hon loi 422 nhieu).
    if result.diag:
        print("[MORFIN] step=%s diag: %s" % (step["step"], result.diag), flush=True)
    if result.dropped:
        print("[MORFIN] step=%s dropped (ngoai mien 0-100): %s" % (
            step["step"], result.dropped[:8]), flush=True)

    # LUU MOI NGON tach duoc, KHONG cong quality o day.
    #
    # Nguong khong con la cong chan luc chup: no chi de danh dau ngon nao yeu
    # (low_quality) cho can bo THAY tren anh. Ly do doi: cong chan lam ngon van
    # tay mon khong bao gio qua duoc, ca cum bi chup lai vo han, va can bo khong
    # co cach nao chap nhan mot anh "kem nhung la anh tot nhat nguoi nay co the
    # cho". Gio quyet dinh nam o can bo: xem anh ca cum roi bam Xac nhan.
    #
    # no_quality (SDK khong tra so do) chi khac weak o cho quality khong dang tin,
    # KHONG phai ly do tu choi luu: anh + template van tach duoc va van dung duoc
    # de tra cuu. Danh dau bang co no_quality de FE hien "khong do duoc" thay vi
    # hien 0%, tranh can bo tuong ngon nay hong.
    nq_slots = set(result.no_quality)
    captured = []
    low = []
    # marks = so % dat DUNG VI TRI tung ngon tren anh chum. Chi buoc CHUM: anh lan
    # co 1 ngon va % cua no da hien o o ngon trong luoi 10 o.
    marks = []
    slap_w = _png_width(result.slap_image) if not step.get("roll") else 0
    for code, fc in zip(codes, got):
        rec = s.fingers[code]
        rec.template_b64 = base64.b64encode(fc.template).decode("ascii")
        # center=True: van tay duoc cat bbox roi dat vao giua khung. SDK tra ca vung
        # platen ma ngon dat len nen van nam lech theo cach nguoi dan ap tay; tren
        # luoi 10 o moi o lech mot kieu, nhin nhu may chup sai.
        # CHI anh de HIEN THI di qua day. Template (dung de tra cuu) lay tu fc.template
        # cua SDK, khong sinh lai tu anh nay - nen canh giua khong the anh huong do
        # chinh xac cua so khop.
        rec.image_b64 = _bmp_to_png_b64(fc.image, center=True)
        rec.quality = fc.quality
        rec.no_quality = fc.slot in nq_slots
        rec.captured_at = time.time()
        # thumb_b64 cung phai center: day la anh FE hien trong luoi 10 o (thumb nho).
        # Bo qua day thi anh to canh giua ma o luoi van lech - dung cho de thay nhat.
        captured.append({**rec.to_public(include_template=True),
                         "image_b64": rec.image_b64,
                         "thumb_b64": _bmp_to_png_b64(fc.image, thumb=200, center=True)})
        weak = rec.quality < _min_quality(code)
        if rec.no_quality or weak:
            low.append({
                "code": code, "name_vi": FINGER_NAME[code],
                "reason": "no_quality" if rec.no_quality else "weak",
                "quality": fc.quality, "need": _min_quality(code),
            })
        # Mot mark = mot so % dat len anh chum. `low` o tren la danh sach ngon dang
        # ngo (FE dung cho o xac nhan); mark la CHO DAT SO, ngon nao cung co - nen
        # hai cai nay khong gop duoc.
        if slap_w > 0:
            x_pct = _mark_x_pct(fc, slap_w)
            if x_pct is not None:
                marks.append({
                    "code": code, "name_vi": FINGER_NAME[code],
                    "quality": fc.quality, "no_quality": rec.no_quality,
                    # `low` tinh o service, khong de FE tu suy: nguong RIENG tung
                    # ngon la chuyen cua service (xem _min_quality), FE ghep hai
                    # bang de to mau la mot cho lech nua khong can co.
                    "low": weak, "x_pct": x_pct,
                })

    # Chup lai cum thi coi nhu xac nhan cu khong con hieu luc: can bo phai xem
    # anh MOI roi xac nhan lai. Neu khong bo, cum da xac nhan mot lan se tu dong
    # "xong" ngay khi chup lai, bo qua chinh anh vua chup.
    s.confirmed.discard(step["step"])
    # Anh CA BAN TAY (hoac ca ngon lan), thumb 600 de FE hien to. Voi buoc chum
    # day la anh slap tong - FE hien nguyen anh nay chu KHONG con cat ra 10 o.
    #
    # KHONG center anh nay, va do la co y:
    #   - Vi tri tuong doi giua cac ngon trong anh chum la THONG TIN THAT (thu tu
    #     ngon, khoang cach) - day la ban ghi chinh thuc cua van chum, khong phai
    #     thumbnail de xem cho dep. Dich chuyen no la sua ban ghi.
    #   - 4 ngon trai rong nen bbox phu gan het khung: canh giua gan nhu khong doi
    #     gi, chi ton CPU cho moi lan chup.
    s.slap_images[step["step"]] = _bmp_to_png_b64(result.slap_image, thumb=600)

    # Buoc LAN tu xac nhan, buoc CHUM cho can bo bam Xac nhan.
    #
    # Vi sao phan biet theo LOAI BUOC chu khong theo nguong (`not low` nhu ban dau):
    #   - Lan la 10 buoc lien tiep, moi buoc 1 ngon. Dung lai hoi o TUNG ngon la 10
    #     lan bam de di qua mot viec ma may lam duoc mot mach; can bo phai dung tay
    #     bam giua luc dang giu tay nguoi khac tren platen.
    #   - Ngon lan mo KHONG can chan vong: anh da hien len o va % do san, can bo thay
    #     thi DOUBLE-CLICK vao o do de thu lai rieng ngon ay (retryFingerprint, thu
    #     lai dung 1 ngon vi step lan chi co 1 ma trong codes). Sua duoc sau nen
    #     khong phai chan truoc.
    #   - Chum thi khac: 1 lan chup = 4 (hoac 2) ngon va la ban ghi chinh thuc cua
    #     van chum, chi co 3 lan bam cho ca ho so. Do la luc dang de can bo xem anh
    #     ca ban tay roi quyet dinh.
    # `low` VAN duoc tra ve cho ca buoc lan - FE dung no to do so % de can bo biet
    # ngon nao dang ngo ma double-click thu lai.
    auto_confirmed = bool(step.get("roll"))
    # PHAI ghi vao s.confirmed, khong chi tra co ve FE. step_done() doc dung set nay,
    # va next_step() tra buoc dau tien CHUA done. Thieu dong nay thi buoc lan tra
    # needs_confirm=False (FE chay tiep) nhung next_step VAN la chinh ngon do
    # => vong thu lap vo han mot ngon. s.confirmed.discard() o tren vua xoa xac nhan
    # cu, nen day cung la cho dat lai xac nhan cho anh VUA chup.
    if auto_confirmed:
        s.confirmed.add(step["step"])
    none_codes = [c for c in step["codes"] if s.fingers[c].missing]
    out = s.public()
    out.update({
        "ok": True,
        "step": step["step"],
        "captured": captured,
        "slap_thumb_b64": s.slap_images[step["step"]],
        # So % dat DUNG VI TRI tung ngon tren anh chum (xem _mark_x_pct). Rong voi
        # buoc lan: anh lan chi co 1 ngon va % cua no da hien o o ngon trong luoi.
        "slap_marks": marks,
        # Nguong tung ngon. Frontend phai dung map nay de to mau badge, khong
        # hardcode 50 - admin dat nguong RIENG cho tung ngon trong Settings.
        "min_quality_by_code": {c: _min_quality(c) for c in codes},
        # Chi con dung lai khi CO ngon dang ngo (xem auto_confirmed o tren). Buoc
        # dat nguong het thi tu xac nhan, FE chay tiep ngay.
        "needs_confirm": not auto_confirmed,
        "auto_confirmed": auto_confirmed,
        "low": low,
        "none_codes": none_codes,
    })
    parts = [f"Da chup {len(captured)} ngon ({step['label_vi']})"]
    if none_codes:
        parts.append("%d ngon danh dau khong co van tay" % len(none_codes))
    if low:
        parts.append("%d ngon chat luong thap: %s" % (
            len(low), ", ".join("%s %s" % (
                w["name_vi"],
                "khong do duoc" if w["reason"] == "no_quality" else "%d%%" % w["quality"],
            ) for w in low)))
    # Mot thong diep duy nhat: khong con nhanh "tu dong sang buoc tiep".
    out["message"] = ". ".join(parts) + ". Xem anh roi bam Xac nhan de sang buoc tiep."
    return out


class ConfirmStepReq(BaseModel):
    step: str


@app.post("/api/session/{sid}/confirm_step")
def confirm_step(sid: str, body: ConfirmStepReq) -> dict:
    """Can bo chap nhan CA CUM sau khi xem anh 10 ngon.

    Day la buoc bat buoc cho MOI cum, ke ca cum ma ca 4 ngon deu vuot nguong:
    quyet dinh "anh nay dung duoc" thuoc ve can bo, khong thuoc ve nguong so.
    Ngon duoi nguong trong cum duoc chap nhan van giu template + anh binh thuong;
    no chi mang co low_quality de admin doc lai ho so con thay duoc.

    Khong chap nhan => khong goi endpoint nay, chup lai cum (capture cung step).
    """
    if body.step not in STEP_BY_NAME:
        raise HTTPException(400, f"step khong hop le: {body.step}")
    s = _get_session(sid)
    # Chua chup xong thi khong co gi de xac nhan. Chan o day de mot lenh confirm
    # den som (FE goi sai thu tu) khong lam cum bi coi la xong voi ngon rong,
    # roi session ket thuc voi ngon khong co ca template ca danh dau none.
    if not s.step_captured(body.step):
        missing_names = ", ".join(
            FINGER_NAME[c] for c in STEP_BY_NAME[body.step]["codes"]
            if not s.fingers[c].done)
        raise HTTPException(
            400,
            f"Cum nay chua co du lieu cho: {missing_names}. Chup cum roi moi xac nhan.",
        )
    s.confirmed.add(body.step)
    out = s.public()
    out["ok"] = True
    out["confirmed_step"] = body.step
    ns = out.get("next_step")
    out["message"] = (
        "Da xac nhan %s. %s" % (
            STEP_BY_NAME[body.step]["label_vi"],
            ("Tiep theo: %s." % ns["label_vi"]) if ns else "Da xong ca 10 ngon.",
        ))
    return out


class MarkNoneReq(BaseModel):
    codes: list[str]
    # False = bo danh dau (can bo bam nham, hoac ngon do van chup duoc).
    value: bool = True


@app.post("/api/session/{sid}/mark_none")
def mark_none(sid: str, body: MarkNoneReq) -> dict:
    """Danh dau / bo danh dau ngon "khong co van tay" => ghi none, khong co anh.

    Khac confirm_missing cu: KHONG doi ngon phai that bai o lan chup truoc. Can bo
    nhin thay ngon mat/mon van la danh dau duoc ngay, ke ca truoc khi chup lan nao.
    Do la muc dich chinh: danh dau TRUOC khi chup lam cum chi cho dung so ngon
    that su co, nen khong con canh cum 4 ngon ma nguoi ta chi co 3 thi 422 mai.

    Danh dau xong thi xac nhan cua cum bi rut lai: so ngon trong cum da doi, can
    bo phai xem lai va xac nhan lai.
    """
    s = _get_session(sid)
    if not body.codes:
        raise HTTPException(400, "codes khong duoc rong.")
    unknown = [c for c in body.codes if c not in s.fingers]
    if unknown:
        raise HTTPException(400, f"Ma ngon khong hop le: {', '.join(unknown)}")

    changed = []
    for code in body.codes:
        rec = s.fingers[code]
        rec.missing = bool(body.value)
        if rec.missing:
            # Ngon "khong co van" khong co template/anh - xoa neu tung chup duoc.
            rec.template_b64 = None
            rec.image_b64 = None
            rec.quality = 0
            rec.no_quality = False
        rec.captured_at = time.time() if rec.missing else None
        s.confirmed.discard(rec.step)
        changed.append(rec.to_public())

    out = s.public()
    out["ok"] = True
    out["changed"] = changed
    out["message"] = "Da %s %d ngon khong co van tay." % (
        "danh dau" if body.value else "bo danh dau", len(changed))
    return out


@app.post("/api/session/{sid}/redo/{finger_code}")
def redo(sid: str, finger_code: str) -> dict:
    """Xoa du lieu de chup lai.

    CHUM: phai xoa CA CUM - mot StartCapture(slap) tra ve ca 4 ngon cung luc,
    khong co cach chup le 1 ngon trong cum.
    LAN: chi xoa DUNG ngon do - moi ngon la mot lan StartCapture(ROLL) rieng nen
    lan lai mot ngon khong anh huong 9 ngon kia. Neu dung chung duong cua chum thi
    "lan lai ut phai" se xoa sach ca 10 ngon da lan - mat het cong.
    """
    s = _get_session(sid)
    rec = s.fingers.get(finger_code)
    if not rec:
        raise HTTPException(404, "Ngon tay khong ton tai.")
    step = STEP_BY_NAME[rec.step]
    for code in step["codes"]:
        r = s.fingers[code]
        r.template_b64 = r.image_b64 = None
        r.quality = 0
        r.no_quality = False
        r.captured_at = None
        # Chup lai ca cum => ngon tung danh dau thieu co co hoi thu lai.
        r.missing = False
    # Buoc lan chi co 1 ma trong codes nen vong tren da tu dong chi xoa dung ngon
    # do - khong can nhanh rieng. 9 ngon da lan van con nguyen.
    # Cum ve trang chua chup => xac nhan cu khong con nghia gi.
    s.confirmed.discard(step["step"])
    s.slap_images.pop(step["step"], None)
    out = s.public()
    out.update({"ok": True, "redo_step": step["step"],
                "message": f"Chup lai: {step['label_vi']}."})
    return out


@app.get("/api/session/{sid}/preview/{finger_code}.png")
def preview(sid: str, finger_code: str):
    s = _get_session(sid)
    rec = s.fingers.get(finger_code)
    if not rec or not rec.image_b64:
        raise HTTPException(404, "Chua co anh cho ngon nay.")
    return StreamingResponse(io.BytesIO(base64.b64decode(rec.image_b64)),
                             media_type="image/png")


@app.delete("/api/session/{sid}")
def del_session(sid: str) -> dict:
    with _lock:
        sessions.pop(sid, None)
    engine.stop()
    return {"ok": True}


@app.post("/api/capture/stop")
def stop_capture() -> dict:
    """Dung lan chup dang chay VA cho den khi thiet bi that su ranh.

    Vi sao phai cho: engine.stop() chi bao SDK thoi cho tay. Request capture() cu
    van dang block trong engine.capture_slap()/capture_roll(), nen no CHUA chay
    den `finally` de nha _capture_lock. Neu tra ve ngay tai day, client (frontend
    luc roi trang) tuong thiet bi da ranh, mount lai trang va goi capture moi ->
    acquire(blocking=False) that bai -> 409 "Dang co lenh chup khac chay."
    Do dung la bug "thoat giua luc thu nhan roi vao lai thi van tay khong chay".

    Cho bang cach acquire chinh _capture_lock: acquire duoc = luong cu da thoat
    va da nha lock = thiet bi ranh thuc su. Nha ra ngay sau do.
    """
    code = engine.stop()
    # Timeout de khong treo request neu luong cu vi ly do nao do khong thoat.
    got = _capture_lock.acquire(timeout=STOP_LOCK_TIMEOUT)
    if got:
        _capture_lock.release()
    return {"ok": True, "code": code, "device_free": got}


class QualityCfgReq(BaseModel):
    by_finger: dict[str, int]


@app.get("/api/config/quality")
def get_quality_cfg() -> dict:
    return {"by_finger": dict(_min_quality_map),
            "default": MIN_QUALITY_DEFAULT,
            "codes": FINGER_CODES}


@app.post("/api/config/quality")
def set_quality_cfg(body: QualityCfgReq) -> dict:
    """Nhan nguong TUNG NGON tu backend chinh (8000) sau khi admin doi Settings.

    KHONG co auth o service nay - service chi bind 127.0.0.1 va khong duoc
    expose qua Vite proxy. Auth (require_admin) + audit log nam o backend
    chinh, la duong duy nhat den day. Day la control bao ve chat luong data
    sinh trac nen khong de lo ra LAN.
    """
    got = _parse_quality_map(body.by_finger)
    if not got:
        raise HTTPException(
            400, "by_finger phai co it nhat 1 ma ngon hop le, gia tri 0-100.")
    with _cfg_lock:
        _min_quality_map.update(got)
        try:
            _save_quality_file()
            saved = True
        except Exception as e:  # noqa: BLE001 - ghi file loi khong duoc mat gia tri RAM
            print("[MORFIN] ghi quality.json loi: %r" % (e,), flush=True)
            saved = False
        snapshot = dict(_min_quality_map)
    print("[MORFIN] nguong tung ngon (admin doi, persisted=%s): %s"
          % (saved, sorted(snapshot.items())), flush=True)
    # persisted=False => gia tri dang ap dung nhung se mat khi restart service.
    # Backend chinh push lai luc startup nen van tu phuc hoi, chi bao ra de biet.
    return {"ok": True, "by_finger": snapshot, "persisted": saved}


class MatchPairReq(BaseModel):
    t1_b64: str
    t2_b64: str


@app.post("/api/match_pair")
def match_pair(body: MatchPairReq) -> dict:
    """So khop 2 template. Giu nguyen contract cua service cu.

    LUU Y: template Morfin (FMR) KHONG so khop duoc voi template ZKFinger cu.
    fp_templates da luu bang ZK phai enroll lai.
    """
    try:
        t1 = base64.b64decode(body.t1_b64)
        t2 = base64.b64decode(body.t2_b64)
    except Exception:
        raise HTTPException(400, "Template khong hop le (base64 sai).")
    if not t1 or not t2:
        raise HTTPException(400, "Template rong.")
    try:
        score = engine.match(t1, t2)
    except MorfinError as e:
        raise HTTPException(503 if e.code == -1 else 500, str(e))
    return {"score": int(score), "format": E.TEMPLATE_FORMAT.name}
