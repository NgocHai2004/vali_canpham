"""Sync proxy routes — tránh CORS khi gọi hệ thống bên ngoài."""

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from config import SYNC_REMOTE
from auth import get_current_user

router = APIRouter()


@router.post("/api/proxy/upload-image")
async def proxy_upload_image(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    data = await file.read()
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{SYNC_REMOTE}/api/upload-image",
            files={"image": (file.filename, data, file.content_type)},
        )
    if not res.is_success:
        raise HTTPException(res.status_code, res.text)
    return res.json()


@router.post("/api/proxy/sync-detainee")
async def proxy_sync_detainee(request: Request, user: dict = Depends(get_current_user)):
    body = await request.body()
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            f"{SYNC_REMOTE}/api/sync-detainee",
            content=body,
            headers={"Content-Type": "application/json"},
        )
    if not res.is_success:
        raise HTTPException(res.status_code, res.text)
    return res.json()


@router.get("/api/proxy/pham-nhan")
async def proxy_pham_nhan(user: dict = Depends(get_current_user)):
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.get(f"{SYNC_REMOTE}/api/pham-nhan", params={"limit": 1000})
    if not res.is_success:
        raise HTTPException(res.status_code, res.text)
    return res.json()
