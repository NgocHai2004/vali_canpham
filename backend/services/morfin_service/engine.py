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
# threshold 0..100 va ve bar theo min(quality,100)). Nhung tren thuc te da doc
# duoc 128 => co frame SDK tra field chua duoc ghi. Loc TAI CHO DOC: gia tri
# ngoai mien la rac, bo han, khong clamp. Clamp bien 128 thanh "100%" - dung
# la cai te nhat: 1 frame rac se thanh 1 ngon "hoan hao" va lot qua cong
# MIN_QUALITY, luu template kem vao Mongo ma khong ai biet.
def _plausible(d: dict) -> bool:
    return 0 <= d["quality"] <= 100 and 0 <= d["nfiq"] <= 100


@dataclass
class FingerCapture:
    """Ket qua 1 ngon trong 1 lan slap."""
    slot: int                      # 1..4, vi tri trong anh slap tu trai sang
    quality: int = 0
    nfiq: int = 0
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
    # Cac gia tri quality/nfiq bi loai vi ngoai mien 0-100. Neu list nay day
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
        # Event cua lan capture DANG cho SDK tra ket qua, + co danh dau bi huy.
        # stop() phai set duoc event nay, khong thi vong cho trong capture_slap
        # nam den het timeout SDK (30s) va api.py giu _capture_lock ca quang do
        # => vao lai trang la 409 "Dang co lenh chup khac chay".
        self._cur_done: Optional[threading.Event] = None
        self._cancelled = False
        self._cur_lock = threading.Lock()

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
    ) -> CaptureResult:
        """Chup 1 slap va cho den khi SDK bao hoan tat.

        expect = so ngon mong doi (4 cho ban tay, 1 cho ngon cai). Dung de
        canh bao khi nguoi dan dat thieu ngon, khong dung de chan.
        """
        sdk = self.ensure_open()
        done = threading.Event()
        # Dang ky event cho stop() danh thuc. Xoa co _cancelled cua lan truoc,
        # neu khong lan chup MOI se thay co con bat va tu huy ngay.
        with self._cur_lock:
            self._cur_done = done
            self._cancelled = False
        # "best" giu quality CAO NHAT tung slot qua cac frame preview. Dung
        # max thay vi frame cuoi vi frame cuoi co the la luc nguoi dan nhac
        # tay ra (quality tut ve 0) du SDK da thay frame dep truoc do.
        state = {"code": M.CAPTURE_TIMEOUT, "count": 0, "frames": 0,
                 "per": [], "best": {}, "final": {}, "msg": "",
                 "dropped": [], "diag": {}}

        def on_preview(code: int, p) -> None:
            if code < 0 or not p:
                return
            try:
                ip = p.contents.ImageParams
                n = max(0, min(ip.ImageCount, 4))
                per = []
                for i in range(n):
                    fi = ip.ImageInfo[i]
                    d = {
                        "slot": i + 1,
                        "quality": fi.Quality,
                        "nfiq": fi.NFIQScore,
                        "x": fi.LeftTopCordinates[0],
                        "y": fi.LeftTopCordinates[1],
                    }
                    if _plausible(d):
                        per.append(d)
                    elif len(state["dropped"]) < 20:
                        state["dropped"].append(d)
                msg = ip.FingerRoiInfo.FingerPreviewMessage.decode(
                    errors="replace").strip()
                state["frames"] += 1
                state["per"] = per
                state["msg"] = msg
                # Giu quality tot nhat tung slot qua toan bo frame.
                for d in per:
                    cur = state["best"].get(d["slot"])
                    if cur is None or d["quality"] > cur["quality"]:
                        state["best"][d["slot"]] = d
                self._set_live(active=True, fingers=per, message=msg,
                               frames=state["frames"])
                if on_frame:
                    on_frame(per, msg)
            except Exception:  # noqa: BLE001 - callback tu thread SDK, khong duoc raise
                pass

        def on_complete(code: int, params, lst) -> None:
            state["code"] = code
            state["count"] = lst.contents.FingerCount if lst else 0
            # Doc THEM quality tu ImageParams cua complete callback, lam nguon
            # DU PHONG cho preview.
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
                    d = {
                        "slot": i + 1,
                        "quality": fi.Quality,
                        "nfiq": fi.NFIQScore,
                        "x": fi.LeftTopCordinates[0],
                        "y": fi.LeftTopCordinates[1],
                    }
                    # Ghi lai MOI gia tri doc duoc, ke ca gia tri se bi
                    # _plausible() loai. Neu khong log thi khong phan biet duoc
                    # "SDK khong bao slot nay" voi "SDK bao nhung gia tri rac".
                    raw.append((i, fi.Quality, fi.NFIQScore, fi.result,
                                fi.LeftTopCordinates[0], fi.LeftTopCordinates[1]))
                    if _plausible(d):
                        state["final"][d["slot"]] = d
                    elif len(state["dropped"]) < 20:
                        state["dropped"].append(d)
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
                                   slap=slap, auto_capture=True,
                                   nfiq_quality=gate)
            if rc != M.SUCCESS:
                self._set_live(active=False)
                raise MorfinError(rc, f"StartCapture that bai: {sdk.err(rc)}")

        # Cho complete callback. +10s dem so voi timeout cua SDK vi SDK con
        # phai tach ngon + tinh NFIQ sau khi het thoi gian cho.
        try:
            if not done.wait(timeout + 10):
                with self._lock:
                    sdk.stop_capture()
                self._set_live(active=False)
                raise MorfinError(-1, "SDK khong tra ket qua capture (treo).")
        finally:
            with self._cur_lock:
                if self._cur_done is done:
                    self._cur_done = None
                cancelled = self._cancelled
                self._cancelled = False

        self._set_live(active=False)
        # Bi stop() danh thuc (roi trang / bam huy), KHONG phai SDK tra ket qua.
        # Phai raise de api.py nha _capture_lock ngay, khong doc tiep get_image
        # (chua co du lieu) va khong luu nua cum vao session.
        if cancelled:
            raise MorfinError(-2, "Lenh chup da bi huy.")
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
        # Quality co HAI nguon, gop lai vi moi nguon deu co the thieu slot:
        #   - state["final"]: ImageParams cua complete callback = gia tri SDK
        #     CHOT lai luc ket thuc. Uu tien nguon nay.
        #   - state["best"] : quality cao nhat qua cac frame preview. Du phong
        #     cho slot ma complete khong bao.
        # Ca hai da qua _plausible() nen khong con duong nao dua gia tri rac vao.
        #
        # Chi dung 1 nguon la sinh loi: neu slot khong co so do nao thi nhan
        # quality = 0 mac dinh cua Python, roi cong MIN_QUALITY tuong la van tay
        # qua kem va tu choi ca cum (da thay buoc thumbs log (1,0,0),(2,0,0) 4
        # lan lien du anh + template tach duoc binh thuong).
        per_meta = dict(state["best"])
        per_meta.update(state["final"])
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
                nfiq=meta.get("nfiq", 0),
                x=meta.get("x", 0),
                y=meta.get("y", 0),
                template=tmpl,
                image=img,
            ))
        result.no_quality = missing
        return result

    def stop(self) -> int:
        """Huy lenh chup dang chay VA danh thuc vong cho trong capture_slap.

        StopCapture cua SDK khong bao complete callback, nen chi goi no thi
        capture_slap van nam trong done.wait() den het timeout+10 (30s) va
        api.py giu _capture_lock ca quang do => moi lenh chup moi bi 409. Phai
        tu set event de tra luong ve ngay.
        """
        sdk = self._sdk
        if sdk is None:
            return M.SUCCESS
        rc = sdk.stop_capture()
        with self._cur_lock:
            cur = self._cur_done
            if cur is not None:
                self._cancelled = True
                cur.set()
        self._set_live(active=False)
        return rc

    # ---------- match ----------
    def match(self, t1: bytes, t2: bytes) -> int:
        sdk = self.ensure_open()
        with self._lock:
            rc, score = sdk.match_template(t1, t2, TEMPLATE_FORMAT)
        if rc != M.SUCCESS:
            raise MorfinError(rc, f"MatchTemplate loi: {sdk.err(rc)}")
        return score


engine = CaptureEngine()
