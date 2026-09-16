"""User management routes — admin only."""

import os
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from config import ADMIN_USERNAME, UPLOAD_DIR
from models import UserIn, UserPatch
from auth import get_current_user, require_admin, hash_password
from helpers import parse_object_id, serialize_user, audit_log
import database

router = APIRouter()


@router.post("/api/users/{user_id}/avatar")
async def upload_user_avatar(user_id: str, file: UploadFile = File(...), request: Request = None, admin: dict = Depends(require_admin)):
    target = await database.db.users.find_one({"_id": parse_object_id(user_id)})
    if not target:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(400, "Chỉ hỗ trợ ảnh jpg/png/webp")
    data = await file.read()
    if len(data) > 3 * 1024 * 1024:
        raise HTTPException(400, "Ảnh vượt quá 3MB")
    avatars_dir = os.path.join(UPLOAD_DIR, "avatars")
    os.makedirs(avatars_dir, exist_ok=True)
    name = f"avatar_{target['username']}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}{ext}"
    path = os.path.join(avatars_dir, name)
    with open(path, "wb") as f:
        f.write(data)
    avatar_url = f"/uploads/avatars/{name}"
    await database.db.users.update_one({"_id": parse_object_id(user_id)}, {"$set": {"avatar_url": avatar_url}})
    await audit_log(request, admin, "update", "user", target["username"], {"action": "avatar"})
    return {"ok": True, "avatar_url": avatar_url}


@router.get("/api/users")
async def list_users(user: dict = Depends(require_admin)):
    return [serialize_user(u) async for u in database.db.users.find({}).sort("username", 1)]


@router.post("/api/users")
async def create_user(body: UserIn, request: Request, admin: dict = Depends(require_admin)):
    if await database.db.users.find_one({"username": body.username}):
        raise HTTPException(400, "Tên tài khoản đã tồn tại")
    doc = {
        "username": body.username,
        "password_hash": hash_password(body.password),
        "role": body.role,
        "full_name": body.full_name or "",
        "created_at": datetime.utcnow(),
    }
    res = await database.db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    await audit_log(request, admin, "create", "user", body.username, {"role": body.role})
    return serialize_user(doc)


@router.patch("/api/users/{user_id}")
async def update_user(user_id: str, body: UserPatch, request: Request, admin: dict = Depends(require_admin)):
    target = await database.db.users.find_one({"_id": parse_object_id(user_id)})
    if not target:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    upd: dict = {}
    if body.password:
        upd["password_hash"] = hash_password(body.password)
    if body.role:
        if target["username"] == ADMIN_USERNAME and body.role != "admin":
            raise HTTPException(400, "Không thể hạ quyền tài khoản admin gốc")
        upd["role"] = body.role
    if body.full_name is not None:
        upd["full_name"] = body.full_name
    if not upd:
        return serialize_user(target)
    doc = await database.db.users.find_one_and_update({"_id": parse_object_id(user_id)}, {"$set": upd}, return_document=True)
    await audit_log(request, admin, "update", "user", doc["username"], {"fields": list(upd.keys())})
    return serialize_user(doc)


@router.delete("/api/users/{user_id}")
async def delete_user(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    target = await database.db.users.find_one({"_id": parse_object_id(user_id)})
    if not target:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    if target["username"] == ADMIN_USERNAME:
        raise HTTPException(400, "Không thể xoá tài khoản admin gốc")
    if target["username"] == admin["username"]:
        raise HTTPException(400, "Không thể xoá tài khoản của chính bạn")
    await database.db.users.delete_one({"_id": parse_object_id(user_id)})
    await audit_log(request, admin, "delete", "user", target["username"])
    return {"ok": True}
