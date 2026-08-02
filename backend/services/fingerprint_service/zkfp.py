"""
ZKFinger SDK Python wrapper (ctypes) cho SLK20R / Live20R / ZK4500/7500/8500.

Yeu cau:
    - Da chay setup.exe cua ZKFinger driver (dat libzkfp.dll vao System32/SysWOW64).
    - Python 64-bit dung voi libzkfp.dll 64-bit; Python 32-bit dung voi 32-bit.
    - Cam thiet bi vao truoc khi goi ZKFP.init().
"""
from __future__ import annotations

import ctypes
from ctypes import (
    CDLL,
    POINTER,
    c_char_p,
    c_int,
    c_uint,
    c_ubyte,
    c_void_p,
)
import os
import sys


# ---------- Ma loi (trich tu libzkfperrdef.h) ----------
ZKFP_ERR_OK = 0
ZKFP_ERR_ALREADY_INIT = 1
ZKFP_ERR_INITLIB = -1
ZKFP_ERR_INIT = -2
ZKFP_ERR_NO_DEVICE = -3
ZKFP_ERR_NOT_SUPPORT = -4
ZKFP_ERR_INVALID_PARAM = -5
ZKFP_ERR_OPEN = -6
ZKFP_ERR_INVALID_HANDLE = -7
ZKFP_ERR_CAPTURE = -8
ZKFP_ERR_EXTRACT_FP = -9
ZKFP_ERR_ABORT = -10
ZKFP_ERR_MEMORY_NOT_ENOUGH = -11
ZKFP_ERR_BUSY = -12
ZKFP_ERR_ADD_FINGER = -13
ZKFP_ERR_DEL_FINGER = -14
ZKFP_ERR_FAIL = -17
ZKFP_ERR_CANCEL = -18
ZKFP_ERR_VERIFY_FP = -20
ZKFP_ERR_MERGE = -22
ZKFP_ERR_TIMEOUT = -28

ERROR_MESSAGES = {
    0: "OK",
    1: "Da khoi tao roi",
    -1: "Loi khoi tao thu vien thuat toan",
    -2: "Loi khoi tao thu vien capture",
    -3: "Khong tim thay thiet bi",
    -4: "Chuc nang khong ho tro",
    -5: "Tham so khong hop le",
    -6: "Mo thiet bi that bai",
    -7: "Handle khong hop le",
    -8: "Chup van tay that bai",
    -9: "Trich template that bai",
    -10: "Bi huy",
    -11: "Khong du bo nho",
    -12: "Thiet bi dang ban",
    -13: "Them van tay that bai",
    -14: "Xoa van tay that bai",
    -17: "That bai",
    -18: "Huy chup",
    -20: "Doi chieu van tay that bai",
    -22: "Ghep 3 mau dang ky that bai",
    -28: "Het thoi gian cho",
}

MAX_TEMPLATE_SIZE = 2048


def _load_dll() -> CDLL:
    """Nap libzkfp.dll. Uu tien PATH cua he thong, sau do thu ben canh driver."""
    candidates = [
        "libzkfp.dll",  # tim theo PATH / System32
        r"C:\Windows\System32\libzkfp.dll",
        r"C:\Windows\SysWOW64\libzkfp.dll",
    ]
    last_err = None
    for path in candidates:
        try:
            return ctypes.WinDLL(path)
        except OSError as exc:
            last_err = exc
    raise RuntimeError(
        "Khong nap duoc libzkfp.dll. Chay setup.exe cua ZKFinger driver truoc. "
        f"Loi cuoi: {last_err}"
    )


_dll = _load_dll()

# ---------- Khai bao chu ky ham (theo libzkfp.h) ----------
_dll.ZKFPM_Init.argtypes = []
_dll.ZKFPM_Init.restype = c_int

_dll.ZKFPM_Terminate.argtypes = []
_dll.ZKFPM_Terminate.restype = c_int

_dll.ZKFPM_GetDeviceCount.argtypes = []
_dll.ZKFPM_GetDeviceCount.restype = c_int

_dll.ZKFPM_OpenDevice.argtypes = [c_int]
_dll.ZKFPM_OpenDevice.restype = c_void_p

_dll.ZKFPM_CloseDevice.argtypes = [c_void_p]
_dll.ZKFPM_CloseDevice.restype = c_int

_dll.ZKFPM_GetParameters.argtypes = [c_void_p, c_int, POINTER(c_ubyte), POINTER(c_uint)]
_dll.ZKFPM_GetParameters.restype = c_int

_dll.ZKFPM_SetParameters.argtypes = [c_void_p, c_int, POINTER(c_ubyte), c_uint]
_dll.ZKFPM_SetParameters.restype = c_int

_dll.ZKFPM_AcquireFingerprint.argtypes = [
    c_void_p, POINTER(c_ubyte), c_uint, POINTER(c_ubyte), POINTER(c_uint)
]
_dll.ZKFPM_AcquireFingerprint.restype = c_int

_dll.ZKFPM_DBInit.argtypes = []
_dll.ZKFPM_DBInit.restype = c_void_p

_dll.ZKFPM_DBFree.argtypes = [c_void_p]
_dll.ZKFPM_DBFree.restype = c_int

_dll.ZKFPM_DBMerge.argtypes = [
    c_void_p,
    POINTER(c_ubyte), POINTER(c_ubyte), POINTER(c_ubyte),
    POINTER(c_ubyte), POINTER(c_uint),
]
_dll.ZKFPM_DBMerge.restype = c_int

_dll.ZKFPM_DBAdd.argtypes = [c_void_p, c_uint, POINTER(c_ubyte), c_uint]
_dll.ZKFPM_DBAdd.restype = c_int

_dll.ZKFPM_DBDel.argtypes = [c_void_p, c_uint]
_dll.ZKFPM_DBDel.restype = c_int

_dll.ZKFPM_DBClear.argtypes = [c_void_p]
_dll.ZKFPM_DBClear.restype = c_int

_dll.ZKFPM_DBCount.argtypes = [c_void_p, POINTER(c_uint)]
_dll.ZKFPM_DBCount.restype = c_int

_dll.ZKFPM_DBIdentify.argtypes = [
    c_void_p, POINTER(c_ubyte), c_uint, POINTER(c_uint), POINTER(c_uint)
]
_dll.ZKFPM_DBIdentify.restype = c_int

_dll.ZKFPM_DBMatch.argtypes = [
    c_void_p, POINTER(c_ubyte), c_uint, POINTER(c_ubyte), c_uint
]
_dll.ZKFPM_DBMatch.restype = c_int

_dll.ZKFPM_DBSetParameter.argtypes = [c_void_p, c_int, c_int]
_dll.ZKFPM_DBSetParameter.restype = c_int


def err_text(code: int) -> str:
    return ERROR_MESSAGES.get(code, f"loi {code}")


class ZKFPError(RuntimeError):
    def __init__(self, code: int, where: str = ""):
        self.code = code
        msg = f"{where}: {err_text(code)} (code={code})" if where else err_text(code)
        super().__init__(msg)


class ZKFP:
    """Wrapper OOP: init/open -> capture -> enroll/identify -> close/terminate."""

    def __init__(self):
        self._dev = None
        self._db = None
        self._initialized = False
        self.width = 0
        self.height = 0
        self.img_size = 0

    # ---------- vong doi ----------
    def init(self) -> None:
        rc = _dll.ZKFPM_Init()
        if rc != ZKFP_ERR_OK:
            raise ZKFPError(rc, "ZKFPM_Init")
        self._initialized = True

    def device_count(self) -> int:
        return _dll.ZKFPM_GetDeviceCount()

    def open(self, index: int = 0) -> None:
        h = _dll.ZKFPM_OpenDevice(index)
        if not h:
            raise ZKFPError(ZKFP_ERR_OPEN, "ZKFPM_OpenDevice")
        self._dev = h
        db = _dll.ZKFPM_DBInit()
        if not db:
            _dll.ZKFPM_CloseDevice(self._dev)
            self._dev = None
            raise ZKFPError(ZKFP_ERR_INITLIB, "ZKFPM_DBInit")
        self._db = db
        self.width, self.height = self._read_size()
        self.img_size = self.width * self.height

    def close(self) -> None:
        if self._db:
            _dll.ZKFPM_DBFree(self._db)
            self._db = None
        if self._dev:
            _dll.ZKFPM_CloseDevice(self._dev)
            self._dev = None

    def terminate(self) -> None:
        self.close()
        if self._initialized:
            _dll.ZKFPM_Terminate()
            self._initialized = False

    def __enter__(self):
        self.init()
        if self.device_count() < 1:
            self.terminate()
            raise ZKFPError(ZKFP_ERR_NO_DEVICE, "device_count")
        self.open(0)
        return self

    def __exit__(self, exc_type, exc, tb):
        self.terminate()

    # ---------- tham so ----------
    def _read_size(self) -> tuple[int, int]:
        buf = (c_ubyte * 4)()
        size = c_uint(4)
        rc = _dll.ZKFPM_GetParameters(self._dev, 1, buf, ctypes.byref(size))
        if rc != ZKFP_ERR_OK:
            raise ZKFPError(rc, "GetParameters(width)")
        width = int.from_bytes(bytes(buf), "little", signed=False)
        size = c_uint(4)
        rc = _dll.ZKFPM_GetParameters(self._dev, 2, buf, ctypes.byref(size))
        if rc != ZKFP_ERR_OK:
            raise ZKFPError(rc, "GetParameters(height)")
        height = int.from_bytes(bytes(buf), "little", signed=False)
        return width, height

    def set_threshold_1n(self, value: int) -> None:
        """Nguong 1:N (goi y 35-70). value trong khoang 0-100."""
        _dll.ZKFPM_DBSetParameter(self._db, 2, int(value))

    def set_threshold_11(self, value: int) -> None:
        """Nguong 1:1 (goi y 15-50)."""
        _dll.ZKFPM_DBSetParameter(self._db, 1, int(value))

    # ---------- chup ----------
    def acquire(self) -> tuple[bytes, bytes] | None:
        """Doc 1 lan tu sensor.

        Tra ve (image_bytes, template_bytes) neu co van tay, hoac None neu chua co.
        Goi lien tuc trong vong lap (co Sleep nho) cho den khi khac None.
        """
        img = (c_ubyte * self.img_size)()
        tmpl = (c_ubyte * MAX_TEMPLATE_SIZE)()
        tmpl_len = c_uint(MAX_TEMPLATE_SIZE)
        rc = _dll.ZKFPM_AcquireFingerprint(
            self._dev, img, c_uint(self.img_size), tmpl, ctypes.byref(tmpl_len)
        )
        if rc == ZKFP_ERR_OK:
            return bytes(img), bytes(tmpl[: tmpl_len.value])
        if rc in (ZKFP_ERR_CAPTURE, ZKFP_ERR_EXTRACT_FP, ZKFP_ERR_TIMEOUT):
            return None  # chua co van tay, thu lai
        raise ZKFPError(rc, "AcquireFingerprint")

    # ---------- DB thao tac ----------
    def merge(self, t1: bytes, t2: bytes, t3: bytes) -> bytes:
        """Ghep 3 template thanh 1 template dang ky."""
        b1 = (c_ubyte * len(t1)).from_buffer_copy(t1)
        b2 = (c_ubyte * len(t2)).from_buffer_copy(t2)
        b3 = (c_ubyte * len(t3)).from_buffer_copy(t3)
        out = (c_ubyte * MAX_TEMPLATE_SIZE)()
        out_len = c_uint(MAX_TEMPLATE_SIZE)
        rc = _dll.ZKFPM_DBMerge(self._db, b1, b2, b3, out, ctypes.byref(out_len))
        if rc != ZKFP_ERR_OK:
            raise ZKFPError(rc, "DBMerge")
        return bytes(out[: out_len.value])

    def db_add(self, fid: int, template: bytes) -> None:
        buf = (c_ubyte * len(template)).from_buffer_copy(template)
        rc = _dll.ZKFPM_DBAdd(self._db, c_uint(fid), buf, c_uint(len(template)))
        if rc != ZKFP_ERR_OK:
            raise ZKFPError(rc, "DBAdd")

    def db_del(self, fid: int) -> None:
        rc = _dll.ZKFPM_DBDel(self._db, c_uint(fid))
        if rc != ZKFP_ERR_OK:
            raise ZKFPError(rc, "DBDel")

    def db_clear(self) -> None:
        _dll.ZKFPM_DBClear(self._db)

    def db_count(self) -> int:
        n = c_uint(0)
        _dll.ZKFPM_DBCount(self._db, ctypes.byref(n))
        return int(n.value)

    def identify(self, template: bytes) -> tuple[int, int] | None:
        """1:N. Tra ve (fid, score) neu khop, None neu khong."""
        buf = (c_ubyte * len(template)).from_buffer_copy(template)
        fid = c_uint(0)
        score = c_uint(0)
        rc = _dll.ZKFPM_DBIdentify(
            self._db, buf, c_uint(len(template)),
            ctypes.byref(fid), ctypes.byref(score),
        )
        if rc == ZKFP_ERR_OK:
            return int(fid.value), int(score.value)
        return None

    def match(self, t1: bytes, t2: bytes) -> int:
        """1:1. Tra ve score (>0 la khop, <=0 la khong khop / loi)."""
        b1 = (c_ubyte * len(t1)).from_buffer_copy(t1)
        b2 = (c_ubyte * len(t2)).from_buffer_copy(t2)
        return _dll.ZKFPM_DBMatch(self._db, b1, c_uint(len(t1)), b2, c_uint(len(t2)))

    # ---------- tien ich ----------
    def save_bmp(self, image_bytes: bytes, path: str) -> None:
        """Ghi anh xam 8-bit ra file BMP."""
        w, h = self.width, self.height
        # Row padding to 4-byte boundary
        row_size = (w + 3) & ~3
        padded = bytearray()
        for row in range(h - 1, -1, -1):
            start = row * w
            padded.extend(image_bytes[start:start + w])
            padded.extend(b"\x00" * (row_size - w))
        palette = bytearray()
        for i in range(256):
            palette.extend(bytes((i, i, i, 0)))
        pixel_offset = 14 + 40 + len(palette)
        file_size = pixel_offset + len(padded)
        bmp = bytearray()
        bmp.extend(b"BM")
        bmp.extend(file_size.to_bytes(4, "little"))
        bmp.extend(b"\x00\x00\x00\x00")
        bmp.extend(pixel_offset.to_bytes(4, "little"))
        bmp.extend((40).to_bytes(4, "little"))
        bmp.extend(w.to_bytes(4, "little", signed=True))
        bmp.extend(h.to_bytes(4, "little", signed=True))
        bmp.extend((1).to_bytes(2, "little"))
        bmp.extend((8).to_bytes(2, "little"))
        bmp.extend(b"\x00" * 24)
        bmp.extend(palette)
        bmp.extend(padded)
        with open(path, "wb") as f:
            f.write(bmp)


if __name__ == "__main__":
    print("libzkfp.dll loaded OK")
    z = ZKFP()
    z.init()
    print("device count:", z.device_count())
    z.terminate()
