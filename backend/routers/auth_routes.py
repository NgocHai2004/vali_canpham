"""Auth routes — login, me."""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm

from models import LoginResp, MePatch
from auth import (
    get_current_user, verify_password, hash_password, make_token,
)
from helpers import audit_log
import database

router = APIRouter()


@router.post("/api/auth/login", response_model=LoginResp)
async def login(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    user = await database.db.users.find_one({"username": form.username})
    if not user or not verify_password(form.password, user["password_hash"]):
        raise HTTPException(401, "Sai tài khoản hoặc mật khẩu")
    role = user.get("role", "admin")
    full_name = user.get("full_name", "") or ""
    await audit_log(request, {"username": form.username}, "login", "auth")
    return LoginResp(
        access_token=make_token(form.username, role),
        username=form.username,
        role=role,
        full_name=full_name,
    )


@router.get("/api/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@router.patch("/api/auth/me")
async def update_me(body: MePatch, request: Request, user: dict = Depends(get_current_user)):
    target = await database.db.users.find_one({"username": user["username"]})
    if not target:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    upd: dict = {}
    wants_name = body.full_name is not None
    wants_pw = bool(body.password)
    if not wants_name and not wants_pw:
        return {
            "username": user["username"],
            "role": user["role"],
            "full_name": target.get("full_name", "") or "",
        }
    if not body.current_password or not verify_password(body.current_password, target["password_hash"]):
        raise HTTPException(400, "Mật khẩu hiện tại không đúng")
    if wants_name:
        upd["full_name"] = body.full_name.strip()
    if wants_pw:
        upd["password_hash"] = hash_password(body.password)
    doc = await database.db.users.find_one_and_update(
        {"username": user["username"]},
        {"$set": upd},
        return_document=True,
    )
    if not doc:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    await audit_log(request, user, "update", "user", user["username"], {"fields": list(upd.keys()), "self": True})
    return {
        "username": doc["username"],
        "role": doc.get("role", "user"),
        "full_name": doc.get("full_name", "") or "",
    }
