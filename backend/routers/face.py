"""Face recognition routes — recognize, health, backfill."""

import anyio
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

import face_recognition_service
from config import FACE_MATCH_THRESHOLD
from auth import get_current_user
from helpers import parse_object_id, serialize_doc, resolve_upload_path, MATCH_PROJECTION
import database

router = APIRouter()


@router.get("/api/face/health")
async def face_health(user: dict = Depends(get_current_user)):
    return face_recognition_service.get_status()


@router.post("/api/face/recognize")
async def face_recognize(
    request: Request,
    file: UploadFile | None = File(None),
    user: dict = Depends(get_current_user),
):
    """Nhận diện khuôn mặt + match toàn hệ thống.

    Nhận multipart 'file' HOẶC JSON body {url: '/uploads/...'}.
    Trả {ready, method, n_faces, matches:[{detainee(gọn), score}]} —
    cosine >= FACE_MATCH_THRESHOLD, sort desc, limit 5.
    """
    # Lấy bytes ảnh: từ file upload hoặc từ URL local
    img_bytes = None
    if file is not None:
        img_bytes = await file.read()
    else:
        try:
            body = await request.json()
        except Exception:
            body = {}
        url = (body or {}).get("url", "")
        path = resolve_upload_path(url)
        if not path:
            raise HTTPException(400, "Cần gửi file ảnh hoặc url '/uploads/...'.")
        with open(path, "rb") as f:
            img_bytes = f.read()

    if not img_bytes:
        raise HTTPException(400, "Ảnh trống.")

    if not face_recognition_service.is_ready():
        return {"ready": False, "method": "none", "n_faces": 0, "matches": []}

    embedding, n_faces, method = await anyio.to_thread.run_sync(
        face_recognition_service.get_embedding, img_bytes
    )
    if embedding is None:
        return {"ready": True, "method": method, "n_faces": 0, "matches": []}

    # Scan toàn hệ thống các doc có face_embedding
    candidates = []
    cursor = database.db.detainees.find(
        {"photos.face_embedding": {"$exists": True, "$ne": []}},
        {"_id": 1, "photos.face_embedding": 1},
    )
    async for d in cursor:
        fe = (d.get("photos") or {}).get("face_embedding")
        if fe:
            candidates.append({"_id": d["_id"], "face_embedding": fe})

    hits = await anyio.to_thread.run_sync(
        lambda: face_recognition_service.match(embedding, candidates, FACE_MATCH_THRESHOLD)
    )
    hits = hits[:5]
    # Lấy doc gọn cho top hits
    matches = []
    if hits:
        ids = [parse_object_id(h["_id"]) for h in hits]
        score_by_id = {str(parse_object_id(h["_id"])): h["score"] for h in hits}
        async for d in database.db.detainees.find({"_id": {"$in": ids}}, MATCH_PROJECTION):
            det_id = str(d["_id"])
            matches.append({
                "detainee": serialize_doc(d),
                "score": score_by_id.get(det_id, 0.0),
            })
    # Giữ thứ tự sort desc
    matches.sort(key=lambda m: -m["score"])
    return {"ready": True, "method": method, "n_faces": n_faces, "matches": matches}


@router.post("/api/face/backfill")
async def face_backfill(user: dict = Depends(get_current_user)):
    """Tính lại face_embedding cho mọi detainee có portrait_front + chưa có embedding.

    Admin only. Chạy batch, không block. Trả {updated, skipped, failed}.
    """
    if user.get("role") != "admin":
        raise HTTPException(403, "Chỉ admin mới được backfill.")

    async def _compute_face_embedding(portrait_url: str) -> list[float] | None:
        if not portrait_url or not face_recognition_service.is_ready():
            return None
        path = resolve_upload_path(portrait_url)
        if not path:
            return None
        try:
            with open(path, "rb") as f:
                img_bytes = f.read()
            emb, _n, _m = await anyio.to_thread.run_sync(
                face_recognition_service.get_embedding, img_bytes
            )
            if emb is None:
                return None
            return [float(x) for x in emb.tolist()]
        except Exception:  # noqa: BLE001
            return None

    updated = skipped = failed = 0
    cursor = database.db.detainees.find(
        {"photos.portrait_front": {"$exists": True, "$ne": ""}},
        {"_id": 1, "photos.portrait_front": 1, "photos.face_embedding": 1},
    )
    async for d in cursor:
        photos = d.get("photos") or {}
        if photos.get("face_embedding"):
            skipped += 1
            continue
        url = photos.get("portrait_front") or ""
        fe = await _compute_face_embedding(url)
        if fe:
            await database.db.detainees.update_one({"_id": d["_id"]}, {"$set": {"photos.face_embedding": fe}})
            updated += 1
        else:
            failed += 1
    return {"updated": updated, "skipped": skipped, "failed": failed}
