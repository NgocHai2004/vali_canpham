"""Script chuyển đổi dữ liệu lưu trữ ảnh sang cấu trúc thư mục riêng cho từng can phạm:
- Quét toàn bộ detainees trong database MongoDB
- Gom tất cả ảnh (portrait, cccd, vân tay, quét) vào thư mục: uploads/detainees/{personal_id}/
- Cập nhật lại đường dẫn URL trong MongoDB

Cách chạy:
    python backend/scripts/migrate_storage_structure.py
"""

import os
import sys
import asyncio

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from motor.motor_asyncio import AsyncIOMotorClient
from config import (
    MONGO_URL, UPLOAD_DIR, TMP_UPLOAD_DIR, DETAINEES_UPLOAD_DIR,
    AVATARS_UPLOAD_DIR, REPORTS_DIR,
)
from helpers import commit_detainee_photos, commit_detainee_file, sanitize_folder_name


async def migrate_storage():
    print("=" * 60)
    print("[*] BẮT ĐẦU CHUYỂN ĐỔI CẤU TRÚC LƯU TRỮ ẢNH (STORAGE MIGRATION)")
    print(f"[*] Thư mục Uploads: {UPLOAD_DIR}")
    print(f"[*] Thư mục Can phạm: {DETAINEES_UPLOAD_DIR}")
    print("=" * 60)

    for d in [UPLOAD_DIR, TMP_UPLOAD_DIR, DETAINEES_UPLOAD_DIR, AVATARS_UPLOAD_DIR, REPORTS_DIR]:
        os.makedirs(d, exist_ok=True)

    client = AsyncIOMotorClient(MONGO_URL)
    all_dbs = await client.list_database_names()
    app_dbs = [name for name in all_dbs if "app_cccd" in name]

    print(f"[*] Các database tìm thấy: {app_dbs}")

    total_migrated = 0
    total_detainees = 0

    for db_name in app_dbs:
        db = client[db_name]
        print(f"\n[+] Đang xử lý database: {db_name}...")

        async for doc in db.detainees.find({}):
            total_detainees += 1
            det_id = doc["_id"]
            pid = doc.get("personal_id") or str(det_id)
            old_photos = doc.get("photos") or {}
            old_photo_url = doc.get("photo_url") or ""

            new_photos = commit_detainee_photos(old_photos, pid)
            new_photo_url = commit_detainee_file(old_photo_url, pid) if old_photo_url else ""
            if not new_photo_url and new_photos.get("portrait_front"):
                new_photo_url = new_photos.get("portrait_front")

            upd = {}
            if new_photos != old_photos:
                upd["photos"] = new_photos
            if new_photo_url != old_photo_url:
                upd["photo_url"] = new_photo_url

            if upd:
                await db.detainees.update_one({"_id": det_id}, {"$set": upd})
                total_migrated += 1
                print(f"    -> Đã chuyển ảnh của can phạm {pid} ({doc.get('full_name', '')}) vào uploads/detainees/{sanitize_folder_name(pid)}/")

    client.close()

    print("\n" + "=" * 60)
    print(f"[✓] HOÀN TẤT CHUYỂN ĐỔI:")
    print(f"    - Tổng số hồ sơ quét: {total_detainees}")
    print(f"    - Hồ sơ đã cập nhật đường dẫn ảnh mới: {total_migrated}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(migrate_storage())
