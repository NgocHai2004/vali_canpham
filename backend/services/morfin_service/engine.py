"""Capture engine cho Morfin slap scanner (MORPHS 1600x1500 @500dpi).

Khac biet quan trong so voi ZKFinger (zkfp.py):

1. StartCapture la ASYNC. No tra ve ngay lap tuc; capture chay o thread noi bo
   cua SDK va bao ket qua qua complete callback. Da xac minh tren thiet bi that:
   start_capture tra Success roi ~21s sau complete callback moi ban ve -2019
   (timeout). => KHONG duoc goi GetImage/GetTemplate ngay sau StartCapture,
   se nhan -2038 "Capture finger not found".

2. Moi lan capture lay NHIEU ngon cung luc (slap). GetImage/GetTemplate tra
   mang: index 0 = anh slap tong, index 1..4 = tung ngon da tach.

3. morfin.py goi os.chdir(SDK_DIR) luc khoi tao vi iseglib mo
   nist_plain_tir-ink.yaml theo duong dan tuong doi. Day la side-effect toan
   cuc cua process => moi duong dan khac trong service phai la absolute.

4. Chi mo duoc 1 handle thiet bi cho ca process. Toan bo truy cap phai qua
   1 instance CaptureEngine + lock.
"""
from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

import morfin as M
from morfin import FingerType, ImageFormat, SlapPosition, TemplateFormat

# Product name cua thiet bi. device_list() tra ['MORPHS'] tren may nay.
PRODUCT = os.getenv("MORFIN_PRODUCT", "")

# Nguong quality de SDK tu dong chot frame (tham so NFIQ_Quality cua
# StartCapture). 0 = khong tu dong dung, cho den timeout. Sample MFC truyen
# gia tri nay vao va de SDK tu quyet dinh khi nao "du dep".
DEFAULT_GATE = int(os.getenv("MORFIN_QUALITY_GATE", "40"))
DEFAULT_TIMEOUT = int(os.getenv("MORFIN_CAPTURE_TIMEOUT", "20"))

# Toan bo template luu xuong Mongo dung 1 format duy nhat. Doi format => toan
# bo template da luu thanh vo dung, y nhu viec doi tu ZK sang Morfin.
TEMPLATE_FORMAT = TemplateFormat.FMR_V2005


# Quality tu SDK la thang 0-100 (app.py hien thi thang, fingers.py cho dat
# threshold 0..100 va ve bar theo min(quality,100)). Gia tri ngoai mien la rac:
# bo han, KHONG clamp. Clamp bien 128 hay 240 thanh "100%" la cai te nhat - 1
# gia tri rac se thanh 1 ngon "hoan hao", lot cong MIN_QUALITY va luu template
# kem vao Mongo ma khong ai biet.
#
# Slot 1 (ngon ngoai cung ben TRAI anh slap = ut trai o left_hand, tro phai o
# right_hand) LUON tra ImageInfo.Quality ngoai mien 0-100 trong complete
# callback: do duoc 193/215/223/230/240/305 qua 7 lan chup, ca hai tay, khong
# lan nao slot 2/3/4 bi. Truoc day loc theo mien roi de quality = 0 MAC DINH
# => ngon ro rang van hien 0%.
#
# NFIQScore la duong ra: voi slot 2/3/4 no BANG DUNG Quality tung lan
# (48/48, 52/52, 54/54, 65/65, 67/67) => hai field mang cung mot so do, cung
# thang 0-100. Rieng slot 1 thi Quality hong ma NFIQScore van hop ly (45, 54).
# Nen day la doc field lanh thay field hong, KHONG phai doi thang do hay doan.
#
# NFIQScore di TRUOC, khong phai lam fallback cho Quality. Ly do la so hoc, do
# duoc tu log that:
#     slot1.Quality=193 == 45+48+48+52 = sum(NFIQScore ca 4 ngon)
#     slot1.Quality=240 == 54+54+65+67 = sum(NFIQScore ca 4 ngon)
# Khop tuyet doi 2/2 lan => ImageInfo[0].Quality trong complete callback KHONG
# phai quality cua ngon ngoai cung, no la TONG quality ca cum. Suy nguoc cho 5
# lan chup truoc do cung nhat quan (230-170=60, 223-172=51, 215-173=42,
# 215-157=58, 305-225=80 - deu trong 0-100 va hop ly).
#
# Vi vay "Quality truoc, NFIQ sau" la BAY: 4 ngon moi ngon 18% -> tong 72 -> lot
# mien 0-100 -> bao ngon ngoai cung 72% thay vi 18%. Sai kieu nay con kho phat
# hien hon 0% vi no trong nhu so do that.
#
# NFIQScore la so do per-finger dung cho MOI slot: voi slot 2/3/4 no bang dung
# Quality tung lan (48/48, 52/52, 54/54, 65/65, 67/67 - hai field cung mot so
# do, cung thang 0-100), voi slot 1 no la so duy nhat khong bi nhiem tong.
# Gia tri quan sat duoc (26..86) dung thang NFIQ 2.0 (0-100, cao = tot), khop
# nguong 0-100 va spinbox 0..100 trong UI cua hang, khong phai NFIQ 1.0 (1-5).
#
# Ca hai field ngoai mien -> None = "khong co so do", de api.py xu ly nhu
# no_quality thay vi bao 0% oan cho ngon.
def _quality_of(raw_quality: int, raw_nfiq: int) -> tuple[Optional[int], str]:
    if 0 <= raw_nfiq <= 100:
        return raw_nfiq, "NFIQScore"
    if 0 <= raw_quality <= 100:
        return raw_quality, "Quality"
    return None, "none"


@dataclass
class FingerCapture:
    """Ket qua 1 ngon trong 1 lan slap."""
    slot: int                      # 1..4, vi tri trong anh slap tu trai sang
    quality: int = 0
    x: int = 0
    y: int = 0
    template: bytes = b""
    image: bytes = b""


@dataclass
class CaptureResult:
    code: int
    finger_count: int
    slap_image: bytes = b""
    fingers: list[FingerCapture] = field(default_factory=list)
    message: str = ""
    frames: int = 0
    # Cac gia tri quality bi loai vi ngoai mien 0-100. Neu list nay day
    # ma fingers[].quality toan 0 => thang do cua SDK KHONG phai 0-100 va
    # _plausible dang loai sach; luc do phai calibrate lai chu khong phai
    # noi long cong MIN_QUALITY.
    dropped: list[dict] = field(default_factory=list)
    # Slot tach duoc anh + template nhung KHONG co so do quality tu bat ky nguon
    # nao (ca preview lan complete). quality cua no la 0 MAC DINH, khong phai so
    # do => api.py khong duoc dem 0 nay vao cong chan.
    no_quality: list[int] = field(default_factory=list)
    # So lieu chan doan cho truong hop no_quality: can biet slot mat so do la vi
    # ImageCount khong phu tới no, hay vi gia tri bi _plausible() loai. Hai
    # nguyen nhan nay can cach sua khac nhau nen phai do, khong duoc doan.
    diag: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.code in (M.SUCCESS, M.CAPTURE_STOP)


class MorfinError(RuntimeError):
    def __init__(self, code: int, detail: str):
        self.code = code
        super().__init__(detail)


class CaptureEngine:
    """Bao boc morfin.Morfin, bien StartCapture async thanh 1 lenh dong bo."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sdk: Optional[M.Morfin] = None
        self._info = None
        self._product = ""
        # Trang thai live cua lan capture dang chay, cho endpoint /api/live doc.
        self._live: dict = {"active": False, "fingers": [], "message": "", "frames": 0}
        self._live_lock = threading.Lock()

    # ---------- vong doi ----------
    def _load(self) -> M.Morfin:
        if self._sdk is None:
            self._sdk = M.Morfin()
        return self._sdk

    def ensure_open(self) -> M.Morfin:
        with self._lock:
            sdk = self._load()
            if sdk.initialized:
                return sdk
            product = PRODUCT or ""
            if not product:
                devs = sdk.device_list()
                if not devs:
                    raise MorfinError(-1, "Khong tim thay thiet bi van tay Morfin.")
                product = devs[0]
            kf = sdk.sdk_dir / "ClientKey.txt"
            key = kf.read_text().strip() if kf.exists() else ""
            rc, info = sdk.init_device(product, FingerType.FLAT, key or None)
            if rc != M.SUCCESS:
                raise MorfinError(rc, f"Init thiet bi that bai: {sdk.err(rc)}")
            self._info = info
            self._product = product
            return sdk

    def health(self) -> dict:
        sdk = self.ensure_open()
        i = self._info
        return {
            "ok": True,
            "product": self._product,
            "sdk_version": sdk.version(),
            "serial": i.SerialNo.decode(errors="replace") if i else "",
            "firmware": i.Firmware.decode(errors="replace") if i else "",
            "width": i.Width if i else 0,
            "height": i.Height if i else 0,
            "dpi": i.DPI if i else 0,
            "template_format": TEMPLATE_FORMAT.name,
        }

    def shutdown(self) -> None:
        with self._lock:
            if self._sdk is None:
                return
            try:
                self._sdk.stop_capture()
                if self._sdk.initialized:
                    self._sdk.uninit_device()
            except Exception:  # noqa: BLE001 - shutdown khong duoc raise
                pass

    def err(self, code: int) -> str:
        sdk = self._sdk
        return sdk.err(code) if sdk else f"error {code}"

    # ---------- live state ----------
    def live_state(self) -> dict:
        with self._live_lock:
            return dict(self._live)

    def _set_live(self, **kw) -> None:
        with self._live_lock:
            self._live.update(kw)

    # ---------- capture ----------
    def capture_slap(
        self,
        slap: SlapPosition,
        expect: int,
        timeout: int = DEFAULT_TIMEOUT,
        gate: int = DEFAULT_GATE,
        on_frame: Optional[Callable[[list, str], None]] = None,
        absent: Optional[list[str]] = None,
    ) -> CaptureResult:
        """Chup 1 slap va cho den khi SDK bao hoan tat.

        expect = so ngon mong doi CON LAI cua cum (da tru ngon danh dau khong co
        van tay). Chi de bao vao diag cho caller dung khi dung thong bao loi -
        SDK khong nhan tham so nay.

        absent = danh sach ma ngon KHONG CO VAN TAY (vd ["left_middle"]), truyen
        vao SDK qua tham so exceptions cua StartCapture. Day la duong DUY NHAT
        noi cho SDK biet dung cho du ngon: auto_capture chi chot frame khi thay
        du so ngon cua slap position, nen nguoi thieu 1 ngon ma khong khai bao se
        lam moi lan chup chay het timeout roi tra -2019, khong bao gio co anh.
        """
        sdk = self.ensure_open()
        # Ma ngon -> ten field trong FingerPosition ("left_middle" ->
        # "LEFT_MIDDLE"). hasattr de mot ma sai khong lam do ca lan chup: bo qua
        # con tra ve timeout, dung hon la nem AttributeError tu giua capture.
        exceptions = None
        if absent:
            exceptions = M.FingerPosition()
            for code in absent:
                fld = code.upper()
                if hasattr(exceptions, fld):
                    setattr(exceptions, fld, True)
        done = threading.Event()
        # Quality chi lay tu ImageParams cua complete callback (state["final"]),
        # la gia tri SDK CHOT luc ket thuc capture. Frame preview chi dung de
        # hien thi live, KHONG dung de tinh quality: max qua preview la mot phep
        # lac quan - 1 frame nhieu luc nguoi dang dat tay co the cho quality cao
        # bat thuong, khong tuong ung voi anh duoc GetImage tra ve.
        state = {"code": M.CAPTURE_TIMEOUT, "count": 0, "frames": 0,
                 "per": [], "final": {}, "msg": "",
                 "dropped": [], "diag": {}}

        def on_preview(code: int, p) -> None:
            if code < 0 or not p:
                return
            try:
                ip = p.contents.ImageParams
                n = max(0, min(ip.ImageCount, 4))
                per = []
                praw = []
                for i in range(n):
                    fi = ip.ImageInfo[i]
                    q, src = _quality_of(fi.Quality, fi.NFIQScore)
                    praw.append({"slot": i + 1, "Quality": fi.Quality,
                                 "NFIQScore": fi.NFIQScore,
                                 "Intensity": fi.Intensity,
                                 "out_score": round(float(fi.out_score), 3),
                                 "result": fi.result, "used": src})
                    if q is None:
                        if len(state["dropped"]) < 20:
                            state["dropped"].append(
                                {"slot": i + 1, "Quality": fi.Quality,
                                 "NFIQScore": fi.NFIQScore, "where": "preview"})
                        continue
                    per.append({
                        "slot": i + 1,
                        "quality": q,
                        "x": fi.LeftTopCordinates[0],
                        "y": fi.LeftTopCordinates[1],
                    })
                # Chi giu frame preview CUOI: du de biet slot 1 co so do dung duoc
                # o field nao, khong lam phinh log. Phai nam TRONG state["diag"]
                # moi ra tới CaptureResult.diag => api.py moi in ra.
                state["diag"]["preview_raw_last"] = praw
                msg = ip.FingerRoiInfo.FingerPreviewMessage.decode(
                    errors="replace").strip()
                state["frames"] += 1
                state["per"] = per
                state["msg"] = msg
                self._set_live(active=True, fingers=per, message=msg,
                               frames=state["frames"])
                if on_frame:
                    on_frame(per, msg)
            except Exception:  # noqa: BLE001 - callback tu thread SDK, khong duoc raise
                pass

        def on_complete(code: int, params, lst) -> None:
            state["code"] = code
            state["count"] = lst.contents.FingerCount if lst else 0
            # Doc quality tu ImageParams cua complete callback - day la NGUON
            # DUY NHAT cho quality cua moi ngon (da bo max qua preview).
            #
            # Truoc day o day khong doc params, vi params bi nghi la nguon gia
            # tri rac (128%). Nhung nguyen nhan that cua 128 la doc slot >=
            # ImageCount (bo nho chua khoi tao), va _plausible() da chan tan
            # goc. Chi dua vao preview thi sinh loi nang hon: slot nao khong co
            # frame preview nao mang metadata se nhan quality = 0 MAC DINH CUA
            # PYTHON (meta.get("quality", 0)), roi cong MIN_QUALITY tuong day la
            # "van tay qua kem" va tu choi ca cum. Da thay that voi buoc thumbs:
            # log ra (1, 0, 0), (2, 0, 0) 4 lan lien du anh + template deu tach
            # duoc - slap THUMB thuong khong bao ImageCount trong preview.
            # 0 chinh xac khong phai so do; no la "khong co so do".
            try:
                if not params:
                    state["diag"]["complete_params"] = "NULL"
                    return
                ip = params.contents
                raw_n = ip.ImageCount
                state["diag"]["complete_image_count"] = raw_n
                n = max(0, min(raw_n, 4))
                raw: list[tuple] = []
                for i in range(n):
                    fi = ip.ImageInfo[i]
                    q, src = _quality_of(fi.Quality, fi.NFIQScore)
                    # Ghi lai MOI gia tri doc duoc, ke ca gia tri bi loai, cung
                    # voi field da dung ("used"). Neu khong log thi khong phan
                    # biet duoc "SDK khong bao slot nay" voi "SDK bao gia tri rac",
                    # va khong kiem chung lai duoc gia thuyet tong-quality.
                    raw.append({"slot": i + 1, "Quality": fi.Quality,
                                "NFIQScore": fi.NFIQScore,
                                "Intensity": fi.Intensity,
                                "out_score": round(float(fi.out_score), 3),
                                "result": fi.result, "used": src,
                                "x": fi.LeftTopCordinates[0],
                                "y": fi.LeftTopCordinates[1]})
                    if q is None:
                        if len(state["dropped"]) < 20:
                            state["dropped"].append(
                                {"slot": i + 1, "Quality": fi.Quality,
                                 "NFIQScore": fi.NFIQScore, "where": "complete"})
                        continue
                    state["final"][i + 1] = {
                        "slot": i + 1,
                        "quality": q,
                        "x": fi.LeftTopCordinates[0],
                        "y": fi.LeftTopCordinates[1],
                    }
                state["diag"]["complete_raw"] = raw
            except Exception as e:  # noqa: BLE001 - callback tu thread SDK, khong duoc raise
                state["diag"]["complete_error"] = repr(e)
            finally:
                done.set()

        with self._lock:
            self._set_live(active=True, fingers=[], message="", frames=0)
            # auto_capture=True bat buoc: o che do False SDK chi preview, khong
            # chot frame nao -> GetImage tra -2038.
            rc = sdk.start_capture(on_preview, on_complete, timeout=timeout,
                                   slap=slap, exceptions=exceptions,
                                   auto_capture=True,
                                   nfiq_quality=gate)
            if rc != M.SUCCESS:
                self._set_live(active=False)
                raise MorfinError(rc, f"StartCapture that bai: {sdk.err(rc)}")

        # Cho complete callback. +10s dem so voi timeout cua SDK vi SDK con
        # phai tach ngon + tinh NFIQ sau khi het thoi gian cho.
        if not done.wait(timeout + 10):
            with self._lock:
                sdk.stop_capture()
            self._set_live(active=False)
            raise MorfinError(-1, "SDK khong tra ket qua capture (treo).")

        self._set_live(active=False)
        result = CaptureResult(code=state["code"], finger_count=state["count"],
                              frames=state["frames"], message=state["msg"],
                              dropped=state["dropped"], diag=state["diag"])
        if not result.ok:
            return result

        with self._lock:
            rc_i, images = sdk.get_image(ImageFormat.BMP)
            rc_t, tmpls = sdk.get_template(TEMPLATE_FORMAT)
        if rc_i != M.SUCCESS:
            raise MorfinError(rc_i, f"GetImage loi: {sdk.err(rc_i)}")
        if rc_t != M.SUCCESS:
            raise MorfinError(rc_t, f"GetTemplate loi: {sdk.err(rc_t)}")

        result.slap_image = images[0] if images else b""
        # index 0 la anh slap tong; tung ngon bat dau tu index 1.
        #
        # Quality chi co MOT nguon: state["final"] - ImageParams cua complete
        # callback, da qua _plausible() nen khong con duong nao dua gia tri rac
        # vao. Da bo max qua preview frames (best): max la phep lac quan, 1
        # frame nhiue co the cho quality cao bat thuong khong tuong ung voi anh
        # duoc GetImage tra ve, gay ra "quality cao ma anh mo".
        #
        # Slot nao final khong bao so do -> khong co so do de danh gia (khong
        # phai "van tay qua kem") -> roi vao no_quality, api.py xu ly tach biet
        # voi truong hop do duoc va that su kem (xem phia duoi).
        per_meta = state["final"]
        # Slot co anh/template nhung KHONG co so do nao tu ca 2 nguon. Khong the
        # bao 0 (cong chan se tuong la van tay kem, tu choi ca cum) va khong the
        # bao 100 (lot cong ma khong biet that gia). Bao ra ngoai de api.py xu ly
        # tach biet voi truong hop "do duoc va that su kem".
        missing: list[int] = []
        for slot in range(1, 5):
            img = images[slot] if slot < len(images) else b""
            tmpl = tmpls[slot] if slot < len(tmpls) else b""
            if not tmpl and not img:
                continue
            meta = per_meta.get(slot)
            if meta is None:
                missing.append(slot)
                meta = {}
            result.fingers.append(FingerCapture(
                slot=slot,
                quality=meta.get("quality", 0),
                x=meta.get("x", 0),
                y=meta.get("y", 0),
                template=tmpl,
                image=img,
            ))
        result.no_quality = missing
        return result

    def stop(self) -> int:
        sdk = self._sdk
        if sdk is None:
            return M.SUCCESS
        return sdk.stop_capture()

    # ---------- match ----------
    def match(self, t1: bytes, t2: bytes) -> int:
        sdk = self.ensure_open()
        with self._lock:
            rc, score = sdk.match_template(t1, t2, TEMPLATE_FORMAT)
        if rc != M.SUCCESS:
            raise MorfinError(rc, f"MatchTemplate loi: {sdk.err(rc)}")
        return score


engine = CaptureEngine()
