"""Face recognition routes — disabled stub (InsightFace buffalo_sc removed)."""

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from auth import get_current_user

router = APIRouter()


@router.get("/api/face/health")
async def face_health(user: dict = Depends(get_current_user)):
    return {
        "ready": False,
        "enabled": False,
        "model": "none",
        "device": "cpu",
        "n_faces": 0,
    }


@router.post("/api/face/recognize")
async def face_recognize(
    request: Request,
    file: UploadFile | None = File(None),
    user: dict = Depends(get_current_user),
):
    """Nhận diện khuôn mặt (đã tắt)."""
    return {"ready": False, "method": "none", "n_faces": 0, "matches": []}


@router.post("/api/face/backfill")
async def face_backfill(user: dict = Depends(get_current_user)):
    """Tính lại face_embedding (đã tắt)."""
    return {"updated": 0, "skipped": 0, "failed": 0}
