"""Script dọn dẹp dữ liệu lưu trữ:
1. Quét toàn bộ MongoDB (tất cả các database) để tìm file ảnh/vân tay đang được sử dụng.
2. Di chuyển các file đang sử dụng vào đúng thư mục: uploads/detainees/{personal_id}/ và cập nhật DB.
3. Xoá sạch toàn bộ file rác / file tạm (orphan files) không gắn với bất kỳ hồ sơ nào trong DB.
4. Đảm bảo cấu trúc thư mục sạch sẽ, chuẩn hoá.

Cách chạy:
    python backend/scripts/clean_and_organize_storage.py
"""

import os
import sys
import shutil
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


async def clean_and_organize():
    print("=" * 60)
    print("[*] BẮT ĐẦU DỌN DẸP & TỔ CHỨC LẠI DỮ LIỆU LƯU TRỮ (STORAGE CLEANUP)")
    print(f"[*] Thư mục Uploads gốc: {UPLOAD_DIR}")
    print("=" * 60)

    # Đảm bảo các thư mục cấu trúc chuẩn luôn tồn tại
    for d in [UPLOAD_DIR, TMP_UPLOAD_DIR, DETAINEES_UPLOAD_DIR, AVATARS_UPLOAD_DIR, REPORTS_DIR]:
        os.makedirs(d, exist_ok=True)

    client = AsyncIOMotorClient(MONGO_URL)
    all_dbs = await client.list_database_names()
    app_dbs = [name for name in all_dbs if "app_cccd" in name]

    print(f"[*] Tìm thấy các databases liên quan: {app_dbs}")

    in_use_paths = set()
    total_migrated_detainees = 0

    # 1. Duyệt qua tất cả database để chuyển file đang dùng vào đúng vị trí
    for db_name in app_dbs:
        db = client[db_name]
        print(f"\n[+] Đang xử lý database: {db_name}...")

        # Xử lý detainees
        async for doc in db.detainees.find({}):
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
                total_migrated_detainees += 1
                print(f"    -> Đã chuyển file của hồ sơ {pid} ({doc.get('full_name', '')})")

            # Thu thập đường dẫn các file đang dùng
            for u in [new_photo_url, (doc.get("photos") or {}).get("portrait_front")]:
                if u and isinstance(u, str) and u.startswith("/uploads/"):
                    rel = u[len("/uploads/"):]
                    in_use_paths.add(os.path.abspath(os.path.join(UPLOAD_DIR, rel.replace("/", os.sep))))

            for key in ("portrait_front", "portrait_left", "portrait_right", "cccd_front", "cccd_back"):
                val = new_photos.get(key)
                if val and isinstance(val, str) and val.startswith("/uploads/"):
                    rel = val[len("/uploads/"):]
                    in_use_paths.add(os.path.abspath(os.path.join(UPLOAD_DIR, rel.replace("/", os.sep))))

            # Vân tay hoặc các sub-dict
            for k, val in new_photos.items():
                if k == "face_embedding":
                    continue
                if isinstance(val, str) and val.startswith("/uploads/"):
                    rel = val[len("/uploads/"):]
                    in_use_paths.add(os.path.abspath(os.path.join(UPLOAD_DIR, rel.replace("/", os.sep))))
                elif isinstance(val, dict):
                    for sub_url in val.values():
                        if isinstance(sub_url, str) and sub_url.startswith("/uploads/"):
                            rel = sub_url[len("/uploads/"):]
                            in_use_paths.add(os.path.abspath(os.path.join(UPLOAD_DIR, rel.replace("/", os.sep))))

        # Xử lý users avatars
        async for u in db.users.find({}):
            av = u.get("avatar_url")
            if av and isinstance(av, str) and av.startswith("/uploads/"):
                rel = av[len("/uploads/"):]
                in_use_paths.add(os.path.abspath(os.path.join(UPLOAD_DIR, rel.replace("/", os.sep))))

    client.close()

    print(f"\n[*] Tổng số file hợp lệ đang được gắn với dữ liệu trong DB: {len(in_use_paths)}")

    # 2. Quét và dọn dẹp các file rác trong uploads/
    print("\n[*] Đang quét và dọn dẹp các file rác không sử dụng trong uploads/...")
    deleted_files = 0

    # 2.1 Xoá các file phẳng nằm trực tiếp dưới thư mục UPLOAD_DIR
    for item in os.listdir(UPLOAD_DIR):
        full_path = os.path.abspath(os.path.join(UPLOAD_DIR, item))
        if os.path.isfile(full_path):
            if full_path not in in_use_paths:
                try:
                    os.remove(full_path)
                    deleted_files += 1
                except Exception as e:
                    print(f"    [!] Không thể xoá file {item}: {e}")

    # 2.2 Xoá toàn bộ file trong tmp/
    if os.path.isdir(TMP_UPLOAD_DIR):
        for item in os.listdir(TMP_UPLOAD_DIR):
            fpath = os.path.abspath(os.path.join(TMP_UPLOAD_DIR, item))
            if os.path.isfile(fpath) and fpath not in in_use_paths:
                try:
                    os.remove(fpath)
                    deleted_files += 1
                except Exception:
                    pass

    # 2.3 Xoá các thư mục can phạm rỗng trong detainees/ nếu có
    if os.path.isdir(DETAINEES_UPLOAD_DIR):
        for folder in os.listdir(DETAINEES_UPLOAD_DIR):
            fpath = os.path.join(DETAINEES_UPLOAD_DIR, folder)
            if os.path.isdir(fpath) and not os.listdir(fpath):
                try:
                    os.rmdir(fpath)
                except Exception:
                    pass

    print("=" * 60)
    print(f"[✓] HOÀN TẤT DỌN DẸP DỮ LIỆU:")
    print(f"    - Hồ sơ đã đồng bộ vị trí: {total_migrated_detainees}")
    print(f"    - File rác / tạm đã dọn sạch: {deleted_files}")
    print(f"    - Cấu trúc thư mục sạch sẽ tại: {UPLOAD_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(clean_and_organize())
