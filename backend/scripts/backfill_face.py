"""Backfill face_embedding cho mọi detainee có portrait_front + chưa có embedding.

Chạy độc lập (không cần server đang chạy):
    python scripts/backfill_face.py

Kết nối thẳng Mongo (MONGO_URL env), gọi face_recognition_service trực tiếp.
"""
import asyncio
import os
import sys

# Cho phép import module backend khi chạy từ scripts/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
import face_recognition_service
from main import _resolve_upload_path, MONGO_URL, DB_NAME


async def main():
    face_recognition_service.load_blocking()
    if not face_recognition_service.is_ready():
        print("ERROR: face_recognition model chưa ready:",
              face_recognition_service.get_status().get("error"))
        return 1
    client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=3000)
    db = client[DB_NAME]
    updated = skipped = failed = 0
    cursor = db.detainees.find(
        {"photos.portrait_front": {"$exists": True, "$ne": ""}},
        {"_id": 1, "photos.portrait_front": 1, "photos.face_embedding": 1},
    )
    async for d in cursor:
        photos = d.get("photos") or {}
        if photos.get("face_embedding"):
            skipped += 1
            continue
        url = photos.get("portrait_front") or ""
        path = _resolve_upload_path(url)
        if not path:
            failed += 1
            continue
        with open(path, "rb") as f:
            img_bytes = f.read()
        emb, _n, _m = face_recognition_service.get_embedding(img_bytes)
        if emb is None:
            failed += 1
            continue
        await db.detainees.update_one(
            {"_id": d["_id"]},
            {"$set": {"photos.face_embedding": [float(x) for x in emb.tolist()]}},
        )
        updated += 1
    client.close()
    print(f"backfill done: updated={updated} skipped={skipped} failed={failed}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
