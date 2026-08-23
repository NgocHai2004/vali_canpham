"""FastAPI service cho Morfin slap scanner. Thay the zkfp service (port 8765).

Giu nguyen contract cua service cu de frontend doi it nhat:
    GET  /api/health
    GET  /api/fingers
    POST /api/session/start           {user_name}
    GET  /api/session/{sid}
    POST /api/session/{sid}/capture   {step?}   <-- chup 1 CUM, khong phai 1 ngon
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
from PIL import Image
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import engine as E  # noqa: E402
from engine import MorfinError, engine  # noqa: E402
from morfin import SlapPosition  # noqa: E402

# ---------- Mapping slap -> ma ngon ----------
# Fingers[1] la ngon TRAI NHAT trong anh slap (theo header SDK), khong phai
# theo giai phau. Mapping duoi day chi dung khi nguoi dan dat tay DUNG CHIEU
# (long ban tay up xuong, dau ngon huong ra xa nguoi dat).
#
# SDK khong cho biet ngon cai nao la trai/phai (SLAP_LABELS chi co
# "Thumb A"/"Thumb B") => chup ngon cai TUNG BEN MOT, ban tay do frontend
# chi dinh qua step, khong doan.
# Thu tu 3 buoc: 4 ngon trai -> 2 ngon cai -> 4 ngon phai.
#
# CHUA XAC MINH DUOC tren thiet bi that: voi SlapPosition.THUMB, slot nao la
# ngon cai TRAI. SDK chi tra "Thumb A"/"Thumb B", khong noi ben nao. Mapping
# duoi day theo dung quy uoc cua cac slap khac (slot 1 = trai nhat trong anh),
# tuc la nguoi dan dat 2 ngon cai canh nhau thi cai trai nam ben trai anh.
# => Can 1 lan chup that de xac nhan. Neu bi nguoc, doi thu tu 2 ma trong
#    "codes" cua buoc "thumbs" la xong, khong phai sua logic.
STEPS: list[dict] = [
    {
        "step": "left_hand",
        "slap": SlapPosition.LEFT_HAND,
        "label_vi": "4 ngon ban tay trai",
        "expect": 4,
        "codes": ["left_little", "left_ring", "left_middle", "left_index"],
    },
    {
        "step": "right_hand",
        "slap": SlapPosition.RIGHT_HAND,
        "label_vi": "4 ngon ban tay phai",
        "expect": 4,
        "codes": ["right_index", "right_middle", "right_ring", "right_little"],
    },
    {
        "step": "thumbs",
        "slap": SlapPosition.THUMB,
        "label_vi": "2 ngon cai",
        "expect": 2,
        "codes": ["left_thumb", "right_thumb"],
    },
]
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


def _bmp_to_png_b64(blob: bytes, thumb: Optional[int] = None) -> str:
    """SDK tra BMP; FE dung data:image/png => phai convert."""
    if not blob:
        return ""
    img = Image.open(io.BytesIO(blob))
    if thumb:
        img.thumbnail((thumb, thumb))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


@dataclass
class FingerRecord:
    code: str
    name_vi: str
    hand: str
    step: str
    template_b64: Optional[str] = None
    image_b64: Optional[str] = None
    quality: int = 0
    nfiq: int = 0
    captured_at: Optional[float] = None

    @property
    def done(self) -> bool:
        return self.template_b64 is not None

    def to_public(self, include_template: bool = False) -> dict:
        out = {
            "code": self.code, "name_vi": self.name_vi, "hand": self.hand,
            "step": self.step, "done": self.done, "quality": self.quality,
            "nfiq": self.nfiq,
            "low_quality": self.done and self.quality < _min_quality(self.code),
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

    def step_done(self, step: str) -> bool:
        return all(self.fingers[c].done for c in STEP_BY_NAME[step]["codes"])

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
                 "done": self.step_done(s["step"])}
                for s in STEPS
            ],
            "next_step": {"step": ns["step"], "label_vi": ns["label_vi"],
                          "expect": ns["expect"], "codes": ns["codes"]} if ns else None,
            "fingers": [self.fingers[c].to_public() for c in FINGER_CODES],
        }


sessions: dict[str, Session] = {}
_lock = threading.Lock()
# 1 handle thiet bi cho ca process => chi cho 1 capture chay cung luc.
_capture_lock = threading.Lock()

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
    return [{"step": s["step"], "label_vi": s["label_vi"],
             "expect": s["expect"], "codes": s["codes"]} for s in STEPS]


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
        engine.ensure_open()
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

    if not _capture_lock.acquire(blocking=False):
        raise HTTPException(409, "Dang co lenh chup khac chay.")
    try:
        result = engine.capture_slap(step["slap"], expect=step["expect"])
    except MorfinError as e:
        raise HTTPException(500, str(e))
    finally:
        _capture_lock.release()

    if not result.ok:
        raise HTTPException(408, f"Chup that bai: {engine.err(result.code)}")
    if not result.fingers:
        raise HTTPException(422, "Khong tach duoc ngon nao. Dat lai tay len sensor.")

    codes = step["codes"]
    got = result.fingers[: len(codes)]
    if len(got) < step["expect"]:
        raise HTTPException(
            422,
            f"Chi nhan duoc {len(got)}/{step['expect']} ngon. "
            "Dat du ngon, ap deu va giu yen.",
        )

    # Log gia tri THO tu SDK. Phai dat TRUOC cong quality: neu dat sau thi lan
    # chup bi tu choi se khong log gi ca - dung luc can so lieu nhat.
    print("[MORFIN] step=%s raw (slot,quality,nfiq,x): %s" % (
        step["step"],
        [(fc.slot, fc.quality, fc.nfiq, fc.x) for fc in got]), flush=True)
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

    # Slot tach duoc anh + template nhung SDK khong tra so do quality nao (ca
    # preview lan complete) - engine.py bao ra qua result.no_quality.
    #
    # Yeu cau nghiep vu la MOI ngon phai >= 50%. Khong do duoc quality thi
    # KHONG CHUNG MINH DUOC ngon do dat 50% => phai tu choi va chup lai, giong
    # nhu ngon do duoc ma thap. Truoc day cho cac slot nay di qua cong chan, ket
    # qua la ngon hien "0%" tren frontend ma van duoc luu - vua sai yeu cau vua
    # giau mat van de. Bao loi RIENG (khong gop vao "chat luong thap") vi nguyen
    # nhan khac han: khong phai tay ban kem, ma la SDK khong tra so do.
    no_q = set(result.no_quality)
    if no_q:
        print("[MORFIN] step=%s slot khong co so do quality: %s "
              "(tu choi ca cum)" % (step["step"], sorted(no_q)), flush=True)
        names_nq = ", ".join(
            FINGER_NAME[code] for code, fc in zip(codes, got) if fc.slot in no_q)
        raise HTTPException(
            422,
            f"Khong do duoc chat luong: {names_nq}. "
            "Nhac tay len, dat lai ngay ngan giua sensor va giu yen roi chup lai.",
        )

    # Chan quality TRUOC khi luu: neu co ngon duoi nguong thi tu choi CA CUM.
    # Khong luu mot phan roi bat chup lai phan con lai, vi 4 ngon nay den tu
    # cung 1 anh slap - chup lai la chup lai ca ban tay.
    weak = [
        {"code": code, "name_vi": FINGER_NAME[code], "quality": fc.quality,
         "nfiq": fc.nfiq, "need": _min_quality(code)}
        for code, fc in zip(codes, got) if fc.quality < _min_quality(code)
    ]
    if weak:
        # detail phai la STRING: frontend lam new Error(data.detail), dict se
        # bien thanh "[object Object]" tren man hinh nguoi dan.
        names = ", ".join(
            f"{w['name_vi']} {w['quality']}% (can >= {w['need']}%)" for w in weak)
        raise HTTPException(
            422,
            f"Chat luong chua dat: {names}. "
            "Lau kho tay, ap deu ngon va giu yen roi chup lai.",
        )

    captured = []
    for code, fc in zip(codes, got):
        rec = s.fingers[code]
        rec.template_b64 = base64.b64encode(fc.template).decode("ascii")
        rec.image_b64 = _bmp_to_png_b64(fc.image)
        rec.quality = fc.quality
        rec.nfiq = fc.nfiq
        rec.captured_at = time.time()
        captured.append({**rec.to_public(include_template=True),
                         "image_b64": rec.image_b64,
                         "thumb_b64": _bmp_to_png_b64(fc.image, thumb=200)})

    s.slap_images[step["step"]] = _bmp_to_png_b64(result.slap_image, thumb=600)
    out = s.public()
    out.update({
        "ok": True,
        "step": step["step"],
        "captured": captured,
        "slap_thumb_b64": s.slap_images[step["step"]],
        # Nguong tung ngon. Frontend phai dung map nay de to mau badge, khong
        # hardcode 50 - admin dat nguong RIENG cho tung ngon trong Settings.
        "min_quality_by_code": {c: _min_quality(c) for c in codes},
        "message": f"Da luu {len(captured)} ngon ({step['label_vi']}).",
    })
    return out


@app.post("/api/session/{sid}/redo/{finger_code}")
def redo(sid: str, finger_code: str) -> dict:
    """Xoa ca CUM chua ngon nay (khong chup le 1 ngon trong slap duoc)."""
    s = _get_session(sid)
    rec = s.fingers.get(finger_code)
    if not rec:
        raise HTTPException(404, "Ngon tay khong ton tai.")
    step = STEP_BY_NAME[rec.step]
    for code in step["codes"]:
        r = s.fingers[code]
        r.template_b64 = r.image_b64 = None
        r.quality = r.nfiq = 0
        r.captured_at = None
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
    return {"ok": True, "code": engine.stop()}


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
