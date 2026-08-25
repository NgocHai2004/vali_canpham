"""Doc secret qua Windows DPAPI thay vi doc plaintext tu .env.

VAN DE: .env de secret dang chu ro ngay canh binary. Dong bin (Nuitka/PyInstaller)
bao ve CODE nhung khong bao ve SECRET - ai co may chi can mo Notepad la thay
JWT_SECRET, khong can dich nguoc dong nao. Do la lo hong lon hon ca chuyen code.

CACH LAM: DPAPI (CryptProtectData) ma hoa buoc theo MAY + USER. Blob copy sang
may khac hoac user khac thi KHONG giai duoc. File .secrets.dat thay cho .env.

GIOI HAN PHAI BIET (dung tuong day la chong duoc moi thu):
  - KHONG chong duoc ke co quyen admin/chay duoc code duoi CHINH user do: ho goi
    CryptUnprotectData la ra. DPAPI chan viec COPY FILE di, khong chan debugger.
  - Secret vao RAM dang chu ro luc dung. Ai attach debugger la doc duoc.
Muc tieu that su: chan "mo Notepad la thay", khong phai chan chuyen gia RE.

DUNG ctypes chu KHONG dung pywin32: bot 1 dependency, va Nuitka dong goi
ctypes on dinh hon pywin32 (pywin32 co .pyd + dang ky COM, hay vo khi onefile).
"""
from __future__ import annotations

import base64
import ctypes
import json
import os
from ctypes import wintypes
from pathlib import Path
from typing import Optional

# Ten cac khoa la SECRET => phai nam trong .secrets.dat, khong duoc de trong .env.
# Cac gia tri khac (MORFIN_SDK_DIR, height_image, DEPLOY_PROVINCE_*) la CONFIG
# thuong, khong bi mat, cu de .env cho de sua.
SECRET_KEYS = ("JWT_SECRET", "DONGLE_SECRET", "WEIGHT_API_KEY", "CCCD_API_KEY",
               "SCENE_API_KEY")

# Dat canh .env (goc App_CCCD), khong dat trong backend/ - de 2 service
# (backend + usb_service) doc cung 1 file, tranh lech secret gay 401 hang loat.
_ROOT = Path(__file__).resolve().parents[2]
STORE_PATH = Path(os.getenv("CCCD_SECRET_STORE", str(_ROOT / ".secrets.dat")))


class _Blob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD),
                ("pbData", ctypes.POINTER(ctypes.c_char))]


_crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
_kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
_crypt32.CryptProtectData.restype = wintypes.BOOL
_crypt32.CryptUnprotectData.restype = wintypes.BOOL

# Buoc blob theo MAY (khong chi theo user) - de service chay duoi Task Scheduler
# hay LocalSystem van giai duoc. Bo co nay thi doi user la mat secret.
_LOCAL_MACHINE = 0x04


def _to_blob(data: bytes) -> _Blob:
    buf = ctypes.create_string_buffer(data, len(data))
    return _Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))


def _from_blob(blob: _Blob) -> bytes:
    try:
        return ctypes.string_at(blob.pbData, blob.cbData)
    finally:
        # PHAI free: CryptUnprotectData cap phat bang LocalAlloc. Khong free thi
        # ro ri bo nho CHUA SECRET - te hon ro ri thuong.
        _kernel32.LocalFree(blob.pbData)


def protect(plain: str) -> bytes:
    """Ma hoa 1 chuoi bang DPAPI. Chi chay duoc tren Windows."""
    src, out = _to_blob(plain.encode("utf-8")), _Blob()
    if not _crypt32.CryptProtectData(ctypes.byref(src), None, None, None, None,
                                     _LOCAL_MACHINE, ctypes.byref(out)):
        raise OSError(ctypes.get_last_error(), "CryptProtectData that bai")
    return _from_blob(out)


def unprotect(blob: bytes) -> str:
    src, out = _to_blob(blob), _Blob()
    if not _crypt32.CryptUnprotectData(ctypes.byref(src), None, None, None, None,
                                       _LOCAL_MACHINE, ctypes.byref(out)):
        raise OSError(ctypes.get_last_error(),
                      "CryptUnprotectData that bai (blob tu may/user khac?)")
    return _from_blob(out).decode("utf-8")


_cache: Optional[dict] = None


def _load_store() -> dict:
    global _cache
    if _cache is not None:
        return _cache
    try:
        raw = STORE_PATH.read_bytes()
    except FileNotFoundError:
        _cache = {}
        return _cache
    try:
        _cache = json.loads(unprotect(base64.b64decode(raw)))
    except Exception as e:  # noqa: BLE001
        # KHONG raise: co the dang chay tren may chua migrate. Bao ro roi de
        # caller fallback ve .env, con hon sap ca app.
        print(f"[secret] khong doc duoc {STORE_PATH.name}: {e}", flush=True)
        _cache = {}
    return _cache


def save_all(values: dict) -> None:
    """Ghi ca bo secret vao store (dung luc cai dat / migrate)."""
    blob = protect(json.dumps(values, ensure_ascii=False))
    STORE_PATH.write_bytes(base64.b64encode(blob))
    global _cache
    _cache = dict(values)


def get(name: str, dotenv_fallback=None) -> str:
    """Uu tien env var -> DPAPI store -> .env (fallback lui dan).

    Giu fallback .env de may chua migrate van chay duoc; sau khi migrate xong
    thi xoa dong secret trong .env di la duong doc plaintext bien mat.
    """
    val = os.getenv(name, "").strip()
    if val:
        return val
    val = (_load_store().get(name) or "").strip()
    if val:
        return val
    return (dotenv_fallback(name) if dotenv_fallback else "") or ""
