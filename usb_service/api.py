"""
USB Dongle Verification Service — App CCCD.

Chay song song voi backend main.py (:8000), tren may co USB dongle cam vao.
Cung cap 3 endpoint:

- GET  /api/usb/health              - service health + so drive USB dang cam
- GET  /api/usb/verify              - tim USB co file .key hop le (HMAC verified)
- POST /api/usb/provision           - tao file .key moi tren USB user chi dinh

Chay:
    $env:DONGLE_SECRET = "<mat khau bi mat cua co quan>"
    .\.venv\Scripts\python.exe -m uvicorn --app-dir usb_service api:app \
        --host 127.0.0.1 --port 8766

Backend main.py phai co cung DONGLE_SECRET de verify HMAC signature.
"""
from __future__ import annotations

import ctypes
import hashlib
import hmac
import json
import os
import secrets
import subprocess
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

try:
    import psutil
except ImportError:
    raise SystemExit(
        "psutil chua duoc cai. Chay: pip install -r usb_service/requirements.txt"
    )


def _get_volume_serial(drive: str) -> Optional[str]:
    """Doc volume serial number cua USB (chong clone).

    Windows: gọi GetVolumeInformationW qua ctypes (không cần dep ngoài).
    Linux/macOS: dùng blkid hoặc diskutil (fallback None nếu không có).
    """
    if os.name == "nt":
        # Windows: chuẩn hóa "D:" -> "D:\\"
        root = drive if drive.endswith("\\") else drive + "\\"
        try:
            kernel32 = ctypes.windll.kernel32
            volume_name = ctypes.create_unicode_buffer(1024)
            fs_name = ctypes.create_unicode_buffer(1024)
            serial = ctypes.c_ulong(0)
            max_component = ctypes.c_ulong(0)
            fs_flags = ctypes.c_ulong(0)
            ok = kernel32.GetVolumeInformationW(
                ctypes.c_wchar_p(root),
                volume_name, ctypes.sizeof(volume_name),
                ctypes.byref(serial),
                ctypes.byref(max_component),
                ctypes.byref(fs_flags),
                fs_name, ctypes.sizeof(fs_name),
            )
            if not ok:
                return None
            return f"{serial.value:08X}"
        except Exception:
            return None
    # Linux/macOS: dùng blkid
    try:
        out = subprocess.check_output(
            ["blkid", "-s", "UUID", "-o", "value", drive],
            stderr=subprocess.DEVNULL, timeout=2,
        )
        return out.decode("ascii", errors="ignore").strip() or None
    except Exception:
        return None


# ---------- Config ----------
_secret_str = os.getenv("DONGLE_SECRET", "").strip()
if not _secret_str:
    raise SystemExit(
        "Bat buoc set env DONGLE_SECRET truoc khi chay usb_service.\n"
        "  PowerShell:  $env:DONGLE_SECRET = 'your-secret-here'\n"
        "  Bash:        export DONGLE_SECRET='your-secret-here'"
    )
DONGLE_SECRET = _secret_str.encode("utf-8")

KEY_FILENAME = os.getenv("DONGLE_KEY_FILENAME", "cccd_dongle.key")
KEY_SEPARATOR = b"\n---SIG---\n"

app = FastAPI(title="USB Dongle Service", version="1.0.0")


# ---------- Helpers ----------
def _list_usb_drives() -> list[str]:
    """List cac drive removable dang mount (Windows USB, Linux /media/*, macOS /Volumes/*)."""
    drives: list[str] = []
    try:
        parts = psutil.disk_partitions(all=False)
    except Exception:
        return []

    for p in parts:
        opts = (p.opts or "").lower()
        mnt = p.mountpoint or ""

        # Windows: removable/cdrom cua psutil
        if "removable" in opts or "cdrom" in opts:
            drives.append(mnt)
            continue

        # Linux
        if os.name != "nt" and (mnt.startswith("/media/") or mnt.startswith("/mnt/")):
            drives.append(mnt)
            continue

        # macOS
        if mnt.startswith("/Volumes/") and mnt != "/Volumes/Macintosh HD":
            drives.append(mnt)

    return drives


def _read_key_file(drive: str) -> Optional[dict]:
    """Doc file .key tren drive, verify HMAC + volume serial. Tra None neu invalid."""
    path = os.path.join(drive, KEY_FILENAME)
    if not os.path.isfile(path):
        return None

    try:
        with open(path, "rb") as f:
            raw = f.read()
    except (OSError, PermissionError):
        return None

    if KEY_SEPARATOR not in raw:
        return None

    payload_b, _, sig_hex_b = raw.partition(KEY_SEPARATOR)
    sig_hex = sig_hex_b.strip().decode("ascii", errors="ignore")

    expect_sig = hmac.new(DONGLE_SECRET, payload_b, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expect_sig, sig_hex):
        return None

    try:
        payload = json.loads(payload_b.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None

    # Chong clone: so volume serial trong payload voi serial hien tai cua drive
    bound_serial = payload.get("volume_serial")
    if bound_serial:
        current_serial = _get_volume_serial(drive)
        if not current_serial or current_serial.upper() != bound_serial.upper():
            return None  # file copy sang USB khac -> tu choi

    return {
        "drive": drive,
        "signature": expect_sig,
        "issued_at": payload.get("issued_at"),
        "org": payload.get("org", ""),
        "nonce": payload.get("nonce"),
        "volume_serial": bound_serial,
    }


# ---------- Models ----------
class ProvisionReq(BaseModel):
    drive: str  # vi du "E:\\", "/media/usb"
    org: str = "CAND"


# ---------- Endpoints ----------
@app.get("/api/usb/health")
def health() -> dict:
    """Service health + so drive USB dang thay."""
    drives = _list_usb_drives()
    return {
        "ok": True,
        "drives_visible": len(drives),
        "drives": drives,
        "key_filename": KEY_FILENAME,
    }


@app.get("/api/usb/verify")
def verify() -> dict:
    """Tim USB co file .key hop le. Tra ve drive dau tien khop.

    Response:
      { ok: true,  drive, signature, issued_at, org, nonce }  -- co dongle hop le
      { ok: false, error }                                    -- khong tim thay
    """
    for drive in _list_usb_drives():
        info = _read_key_file(drive)
        if info:
            return {"ok": True, **info}
    return {"ok": False, "error": "Khong tim thay USB dongle hop le"}


@app.post("/api/usb/provision")
def provision(body: ProvisionReq) -> dict:
    """Tao file .key moi tren USB duoc chi dinh. Bind serial de chong clone."""
    drive = body.drive
    if not drive:
        raise HTTPException(400, "Thieu drive.")
    if not os.path.isdir(drive):
        raise HTTPException(
            400,
            f"Drive '{drive}' khong ton tai hoac khong writable. "
            "Kiem cong USB va thu lai.",
        )

    volume_serial = _get_volume_serial(drive)
    if not volume_serial:
        raise HTTPException(
            500,
            f"Khong lay duoc Volume Serial cua drive '{drive}'. "
            "Khong the tao dongle chong clone.",
        )

    payload = {
        "issued_at": secrets.token_hex(8),
        "org": body.org,
        "nonce": secrets.token_hex(16),
        "volume_serial": volume_serial,
    }
    payload_b = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sig = hmac.new(DONGLE_SECRET, payload_b, hashlib.sha256).hexdigest()

    path = os.path.join(drive, KEY_FILENAME)
    try:
        with open(path, "wb") as f:
            f.write(payload_b + KEY_SEPARATOR + sig.encode("ascii"))
    except (OSError, PermissionError) as e:
        raise HTTPException(500, f"Khong ghi duoc file .key: {e}")

    return {
        "ok": True,
        "path": path,
        "drive": drive,
        "org": body.org,
        "volume_serial": volume_serial,
    }
