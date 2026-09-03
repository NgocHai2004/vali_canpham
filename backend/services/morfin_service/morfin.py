"""ctypes binding cho Morfin_Enroll_Core.dll (x64)."""

import ctypes as C
import os
from ctypes import POINTER, byref
from enum import IntEnum
from pathlib import Path

_HERE = Path(__file__).resolve().parent


def _find_sdk_dir():
    """Tim thu muc chua runtime DLL, khong phu thuoc o dia / duong dan tuyet doi.

    MORFIN_SDK_DIR cho phep tro sang thu muc runtime dung chung, tranh phai
    copy ~273MB DLL vao moi noi deploy.
    """
    env = os.getenv("MORFIN_SDK_DIR", "").strip()
    cands = [Path(env)] if env else []
    cands += [_HERE / "runtime", _HERE,
              _HERE.parent / "sample" / "x64" / "Release"]
    for cand in cands:
        if (cand / "Morfin_Enroll_Core.dll").exists():
            return cand
    return Path(env) if env else _HERE / "runtime"


# nist_plain_tir-ink.yaml duoc iseglib mo theo duong dan tuong doi -> phai chdir vao day
SDK_DIR = _find_sdk_dir()

MAX_MAIN_IMAGE_SIZE = 2401078
MAX_SUB_IMAGE_SIZE = 201078


class ImageFormat(IntEnum):
    BMP = 0
    JPEG2000 = 1
    WSQ = 2
    RAW = 3
    FIR_V2011 = 4
    FIR_WSQ_V2011 = 5
    FIR_JPEG2000_V2011 = 6
    FIR_V2005 = 7
    FIR_JPEG2000_V2005 = 8


EXT = {
    ImageFormat.BMP: ".bmp",
    ImageFormat.JPEG2000: ".jp2",
    ImageFormat.WSQ: ".wsq",
    ImageFormat.RAW: ".raw",
    ImageFormat.FIR_V2011: ".iso",
    ImageFormat.FIR_WSQ_V2011: ".iso",
    ImageFormat.FIR_JPEG2000_V2011: ".iso",
    ImageFormat.FIR_V2005: ".iso",
    ImageFormat.FIR_JPEG2000_V2005: ".iso",
}


class TemplateFormat(IntEnum):
    FMR_V2005 = 0
    FMR_V2011 = 1
    ANSI_V378 = 2


class SlapPosition(IntEnum):
    LEFT_HAND = 0
    RIGHT_HAND = 1
    THUMB = 2
    ROLL = 3


class FingerType(IntEnum):
    FLAT = 0
    ROLL = 1


class RoiColor(IntEnum):
    NONE = 0
    WHITE = 1
    RED = 2
    GREEN = 3
    ORANGE = 4


class HandPosition(IntEnum):
    UNKNOWN = 0
    LEFT = 1
    RIGHT = 2


class LogLevel(IntEnum):
    OFF = 0
    ERROR = 1


SUCCESS = 0
CAPTURE_STOP = -2051
CAPTURE_TIMEOUT = -2019


class DeviceInfo(C.Structure):
    _fields_ = [
        ("SerialNo", C.c_char * 13),
        ("Firmware", C.c_char * 13),
        ("Make", C.c_char * 7),
        ("Model", C.c_char * 12),
        ("Width", C.c_int),
        ("Height", C.c_int),
        ("DPI", C.c_int),
    ]


class FingerPosition(C.Structure):
    _fields_ = [
        (n, C.c_bool)
        for n in (
            "LEFT_THUMB", "LEFT_INDEX", "LEFT_MIDDLE", "LEFT_RING", "LEFT_LITTLE",
            "RIGHT_THUMB", "RIGHT_INDEX", "RIGHT_MIDDLE", "RIGHT_RING", "RIGHT_LITTLE",
        )
    ]


class ImageInfo(C.Structure):
    _fields_ = [
        ("Intensity", C.c_int),
        ("Quality", C.c_int),
        ("NFIQScore", C.c_int),
        ("out_score", C.c_float),
        ("result", C.c_int),
        ("LeftTopCordinates", C.c_int * 2),
        ("RightTopCordinates", C.c_int * 2),
        ("RightBottomCordinates", C.c_int * 2),
        ("LeftBottomCordinates", C.c_int * 2),
    ]


class FingerRoiInfo(C.Structure):
    _fields_ = [("roiColor", C.c_int), ("FingerPreviewMessage", C.c_char * 256)]


class ImageParams(C.Structure):
    _fields_ = [
        ("ImageCount", C.c_int),
        ("ImageInfo", ImageInfo * 4),
        ("HandPosition", C.c_int),
        ("FingerRoiInfo", FingerRoiInfo),
        ("PalmMode", C.c_int),
    ]


class PreviewImgPara(C.Structure):
    _fields_ = [
        ("BoxedBmpImageLength", C.c_int),
        ("BoxedBmpImage", POINTER(C.c_ubyte)),
        ("ImageParams", ImageParams),
    ]


class Finger(C.Structure):
    _fields_ = [("Data", POINTER(C.c_ubyte)), ("DataLen", C.c_int)]


class FingerList(C.Structure):
    _fields_ = [("FingerCount", C.c_int), ("Fingers", Finger * 5)]


class DeviceListItem(C.Structure):
    _fields_ = [("Model", C.c_char * 12)]


PREVIEW_CB = C.CFUNCTYPE(None, C.c_int, POINTER(PreviewImgPara))
COMPLETE_CB = C.CFUNCTYPE(None, C.c_int, POINTER(ImageParams), POINTER(FingerList))
DETECTION_CB = C.CFUNCTYPE(None, C.c_char_p, C.c_int)

_EXPECTED_SIZES = {
    DeviceInfo: 60, ImageInfo: 52, ImageParams: 480,
    PreviewImgPara: 496, FingerList: 88,
}


def _check_layout():
    bad = [(t.__name__, C.sizeof(t), n) for t, n in _EXPECTED_SIZES.items() if C.sizeof(t) != n]
    if bad:
        raise RuntimeError(f"struct layout mismatch: {bad}")


class Morfin:
    def __init__(self, sdk_dir=SDK_DIR):
        self.sdk_dir = Path(sdk_dir)
        dll = self.sdk_dir / "Morfin_Enroll_Core.dll"
        if not dll.exists():
            raise FileNotFoundError(dll)
        _check_layout()
        os.add_dll_directory(str(self.sdk_dir))
        os.chdir(self.sdk_dir)
        self.lib = C.CDLL(str(dll))
        self._bind()
        # SDK goi callback tu thread noi bo -> phai giu ref, khong de GC thu hoi
        self._cb_refs = []
        self.initialized = False

    def _bind(self):
        L = self.lib
        L.MORFIN_Enroll_InitDevice.argtypes = [
            C.c_int, C.c_char_p, C.c_int, POINTER(DeviceInfo), C.c_int, C.c_char_p]
        L.MORFIN_Enroll_InitDevice.restype = C.c_int
        L.MORFIN_Enroll_IsDeviceConnected.argtypes = [C.c_int, C.c_char_p, C.c_int]
        L.MORFIN_Enroll_IsDeviceConnected.restype = C.c_int
        L.MORFIN_Enroll_UninitDevice.argtypes = []
        L.MORFIN_Enroll_UninitDevice.restype = C.c_int
        # default args cua C++ khong ton tai qua FFI -> phai truyen du 7 tham so
        L.MORFIN_Enroll_StartCapture.argtypes = [
            C.c_int, C.c_int, FingerPosition, PREVIEW_CB, COMPLETE_CB, C.c_bool, C.c_int]
        L.MORFIN_Enroll_StartCapture.restype = C.c_int
        L.MORFIN_Enroll_StopCapture.argtypes = []
        L.MORFIN_Enroll_StopCapture.restype = C.c_int
        L.MORFIN_Enroll_GetImage.argtypes = [POINTER(FingerList), C.c_int, C.c_int]
        L.MORFIN_Enroll_GetImage.restype = C.c_int
        L.MORFIN_Enroll_GetTemplate.argtypes = [POINTER(FingerList), C.c_int]
        L.MORFIN_Enroll_GetTemplate.restype = C.c_int
        L.MORFIN_Enroll_MatchTemplate.argtypes = [
            POINTER(C.c_ubyte), C.c_int, POINTER(C.c_ubyte), C.c_int, POINTER(C.c_int), C.c_int]
        L.MORFIN_Enroll_MatchTemplate.restype = C.c_int
        L.MORFIN_Enroll_GetErrDescription.argtypes = [C.c_int]
        L.MORFIN_Enroll_GetErrDescription.restype = C.c_char_p
        L.MORFIN_Enroll_GetVersion.argtypes = [C.c_char_p]
        L.MORFIN_Enroll_GetVersion.restype = C.c_int
        L.MORFIN_Enroll_EnableLogs.argtypes = [C.c_int, C.c_char_p]
        L.MORFIN_Enroll_EnableLogs.restype = C.c_int
        L.MORFIN_Enroll_GetDeviceList.argtypes = [POINTER(DeviceListItem), POINTER(C.c_int)]
        L.MORFIN_Enroll_GetDeviceList.restype = C.c_int
        L.MORFIN_Enroll_GetSupportedDeviceList.argtypes = [POINTER(DeviceListItem), POINTER(C.c_int)]
        L.MORFIN_Enroll_GetSupportedDeviceList.restype = C.c_int
        L.MORFIN_Enroll_RegisterDetectionCallback.argtypes = [DETECTION_CB]
        L.MORFIN_Enroll_RegisterDetectionCallback.restype = C.c_int

    def err(self, code):
        s = self.lib.MORFIN_Enroll_GetErrDescription(code)
        return f"{s.decode(errors='replace')} ({code})" if s else f"error {code}"

    def version(self):
        buf = C.create_string_buffer(32)
        return buf.value.decode() if self.lib.MORFIN_Enroll_GetVersion(buf) == SUCCESS else ""

    def _list(self, fn):
        cnt = C.c_int(0)
        if fn(None, byref(cnt)) != SUCCESS or cnt.value <= 0:
            return []
        arr = (DeviceListItem * cnt.value)()
        if fn(arr, byref(cnt)) != SUCCESS:
            return []
        return [a.Model.decode(errors="replace").strip("\x00") for a in arr[: cnt.value]]

    def device_list(self):
        return self._list(self.lib.MORFIN_Enroll_GetDeviceList)

    def supported_devices(self):
        return self._list(self.lib.MORFIN_Enroll_GetSupportedDeviceList)

    def is_connected(self, product):
        p = product.encode()
        return self.lib.MORFIN_Enroll_IsDeviceConnected(0, p, len(p))

    def init_device(self, product, finger_type=FingerType.FLAT, client_key=None):
        p = product.encode()
        info = DeviceInfo()
        # DLL deref pcClientKey vo dieu kien -> NULL gay access violation.
        # Sample MFC luon truyen buffer 1024 byte (rong neu khong co key).
        key = C.create_string_buffer((client_key or "").encode(), 1024)
        rc = self.lib.MORFIN_Enroll_InitDevice(0, p, len(p), byref(info), int(finger_type), key)
        self.initialized = rc == SUCCESS
        return rc, info

    def uninit_device(self):
        rc = self.lib.MORFIN_Enroll_UninitDevice()
        self.initialized = False
        return rc

    def start_capture(self, on_preview, on_complete, timeout_ms=30000,
                      slap=SlapPosition.RIGHT_HAND, exceptions=None,
                      auto_capture=True, nfiq_quality=0):
        """timeout_ms tinh bang MILLISECOND - khong phai giay.

        Header (Morfin_Enroll.h:381) chi ghi "amount of time after which capturing
        is stopped", KHONG ghi don vi. Don vi ms duoc xac dinh tu bo tham chieu
        chay duoc tren chinh may nay: morfin_roll_ui/morfin_sdk.py:482 dat ten
        `timeout_ms=30000` va test_capture.py truyen `TIMEOUT_S * 1000`.
        Ca hai deu vao cung mot tham so C `int Timeout`.

        Truyen so GIAY vao day la loi im lang dat nhat cua module nay: 30 -> SDK
        nhan 30ms, het han truoc khi ngon kip cham kinh, goi completeCb voi ma
        timeout ngay. Trieu chung la "chup mot cai xong khong co gi", frames=0, va
        408 lien tuc - khong he giong loi cau hinh hay loi dong tac lan, nen rat
        de truy sai huong. Ten tham so co hau to _ms de chan lap lai.
        """
        pcb, ccb = PREVIEW_CB(on_preview), COMPLETE_CB(on_complete)
        self._cb_refs = [pcb, ccb]
        return self.lib.MORFIN_Enroll_StartCapture(
            int(timeout_ms), int(slap), exceptions or FingerPosition(),
            pcb, ccb, auto_capture, nfiq_quality)

    def stop_capture(self):
        return self.lib.MORFIN_Enroll_StopCapture()

    def enable_logs(self, level=LogLevel.ERROR, folder=None):
        return self.lib.MORFIN_Enroll_EnableLogs(
            int(level), folder.encode() if folder else None)

    def _alloc_list(self):
        fl = FingerList()
        self._bufs = [C.create_string_buffer(MAX_MAIN_IMAGE_SIZE)] + [
            C.create_string_buffer(MAX_SUB_IMAGE_SIZE) for _ in range(4)]
        for i, b in enumerate(self._bufs):
            fl.Fingers[i].Data = C.cast(b, POINTER(C.c_ubyte))
            fl.Fingers[i].DataLen = 0
        return fl

    @staticmethod
    def _extract(fl):
        out = []
        for i in range(min(fl.FingerCount + 1, 5)):
            n = fl.Fingers[i].DataLen
            out.append(bytes(bytearray(fl.Fingers[i].Data[:n])) if n > 0 else b"")
        return out

    def get_image(self, fmt=ImageFormat.BMP, compression=0):
        fl = self._alloc_list()
        rc = self.lib.MORFIN_Enroll_GetImage(byref(fl), int(fmt), compression)
        return rc, (self._extract(fl) if rc == SUCCESS else [])

    def get_template(self, fmt=TemplateFormat.FMR_V2005):
        fl = self._alloc_list()
        rc = self.lib.MORFIN_Enroll_GetTemplate(byref(fl), int(fmt))
        return rc, (self._extract(fl) if rc == SUCCESS else [])

    def match_template(self, a, b, fmt=TemplateFormat.FMR_V2005):
        ba, bb = (C.c_ubyte * len(a)).from_buffer_copy(a), (C.c_ubyte * len(b)).from_buffer_copy(b)
        score = C.c_int(0)
        rc = self.lib.MORFIN_Enroll_MatchTemplate(ba, len(a), bb, len(b), byref(score), int(fmt))
        return rc, score.value
