"""Photo upload route."""

import os
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from bson import ObjectId

from config import UPLOAD_DIR, TMP_UPLOAD_DIR, DETAINEES_UPLOAD_DIR
from helpers import sanitize_folder_name
from auth import get_current_user

router = APIRouter()


@router.post("/api/upload/photo")
async def upload_photo(
    file: UploadFile = File(...),
    type: str = Query(default=""),
    personal_id: str = Query(default=""),
    user: dict = Depends(get_current_user),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(400, "Chỉ hỗ trợ ảnh jpg/png/webp")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Ảnh vượt quá 5MB")

    name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{ObjectId()}{ext}"

    if personal_id and personal_id.strip():
        clean_pid = sanitize_folder_name(personal_id.strip())
        target_dir = os.path.join(DETAINEES_UPLOAD_DIR, clean_pid)
        os.makedirs(target_dir, exist_ok=True)
        rel_url = f"/uploads/detainees/{clean_pid}/{name}"
    else:
        target_dir = TMP_UPLOAD_DIR
        os.makedirs(target_dir, exist_ok=True)
        rel_url = f"/uploads/tmp/{name}"

    path = os.path.join(target_dir, name)
    with open(path, "wb") as f:
        f.write(data)
    return {
        "url": rel_url,
        "size": len(data),
    }
