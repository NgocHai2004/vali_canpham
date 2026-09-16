"""Scan OCR routes — Chỉ bản 295 / Danh bản 204."""

import os
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

import config
from auth import get_current_user

# Service OCR ben ngoai quet xong 1 file -> POST /api/scan/push -> scan_inbox
# quyet dinh co chen vao DUNG MOT form dang ky dang mo hay khong. Khac dau doc
# CCCD (phat cho moi session), scan co the chua nhieu ho so nen chi chen khi
# file tra ra DUNG MOT doi tuong va DUNG MOT form dang mo — xem scan_inbox.py.
from scan_inbox import (
    capture_start as _scan_capture_start,
    capture_wait as _scan_capture_wait,
    capture_end as _scan_capture_end,
    capture_count as _scan_capture_count,
    push as _scan_push,
)

router = APIRouter()


def _require_scan_ocr() -> None:
    """Chan cac route scan khi FEATURE_SCAN_OCR=0."""
    if not config.FEATURE_SCAN_OCR:
        raise HTTPException(503, "Tính năng scan Chỉ bản/Danh bản đang tắt.")


def _require_scan_key(request: Request) -> None:
    """Service OCR chay voi tai khoan may, khong co JWT — dung key chung."""
    if config.SCAN_API_KEY and request.headers.get("X-Scan-Key", "") != config.SCAN_API_KEY:
        raise HTTPException(401, "Sai X-Scan-Key")


@router.post("/api/scan/capture/start")
async def scan_capture_start(user: dict = Depends(get_current_user)):
    """Mo session cap nhat-form — frontend goi luc form dang ky MOI hiện lên."""
    _require_scan_ocr()
    return {"session_id": _scan_capture_start()}


@router.get("/api/scan/session/{sid}/wait")
async def scan_session_wait(sid: str, timeout: int = Query(25, ge=1, le=60),
                            user: dict = Depends(get_current_user)):
    """Long-poll cua form: doi ket qua scan; 204 khi het gio, 404 khi session mat."""
    _require_scan_ocr()
    result = await _scan_capture_wait(sid, timeout)
    if result is None:
        raise HTTPException(404, "Phiên không tồn tại hoặc đã hết hạn.")
    if result.get("status") == "timeout":
        return Response(status_code=204)
    return result


@router.delete("/api/scan/session/{sid}")
async def scan_session_delete(sid: str, user: dict = Depends(get_current_user)):
    """Dong session: luu xong, huy, dieu huong khac, hoac chuyen sang sua."""
    _scan_capture_end(sid)
    return {"ok": True}


@router.post("/api/scan/push")
async def scan_push(body: dict, request: Request):
    """Service OCR quet xong 1 file gui ket qua len. scan_inbox quyet dinh
    chen hay tu choi; tu choi van tra 200 kem ly do de ben OCR log duoc."""
    _require_scan_ocr()
    _require_scan_key(request)
    return _scan_push(body)
