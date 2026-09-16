"""Photo upload route."""

import os
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from bson import ObjectId

from config import UPLOAD_DIR
from auth import get_current_user

router = APIRouter()


@router.post("/api/upload/photo")
async def upload_photo(
    file: UploadFile = File(...),
    type: str = Query(default=""),
    user: dict = Depends(get_current_user),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(400, "Chỉ hỗ trợ ảnh jpg/png/webp")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Ảnh vượt quá 5MB")

    name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{ObjectId()}{ext}"
    path = os.path.join(UPLOAD_DIR, name)
    with open(path, "wb") as f:
        f.write(data)
    return {
        "url": f"/uploads/{name}",
        "size": len(data),
    }
