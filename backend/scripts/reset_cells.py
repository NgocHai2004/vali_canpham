"""
Reset + seed lại collection `cells` theo cây phân cấp giam giữ mới.
- Xoá toàn bộ documents cũ trong `cells` (dữ liệu buồng phẳng A01/B01...).
- Xoá `facility_type` cũ trên detainees (trường đã bỏ).
- Chèn cây mới: facility -> sub_camp -> cell.

Chạy:  python backend/scripts/reset_cells.py
"""
import os
from datetime import datetime
from pymongo import MongoClient

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "app_cccd")


def main():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=3000)
    db = client[DB_NAME]

    # 1. Xoá cells cũ
    n_cells = db.cells.count_documents({})
    print(f"[cells] xoá {n_cells} documents cũ...")
    db.cells.delete_many({})

    # 2. Xoá trường facility_type cũ trên detainees (đã bỏ khỏi model)
    res = db.detainees.update_many(
        {"facility_type": {"$exists": True}},
        {"$unset": {"facility_type": ""}},
    )
    print(f"[detainees] xoá facility_type cũ trên {res.modified_count} documents")

    # 3. Seed cây mới
    now = datetime.utcnow()
    seeds = [
        # Cấp facility (cơ sở giam giữ)
        {"code": "TTG", "name": "Trại tạm giam", "capacity": 0, "note": "",
         "level": "facility", "parent": None, "custody_type": "tam_giam"},
        {"code": "NTG", "name": "Nhà tạm giữ", "capacity": 0, "note": "",
         "level": "facility", "parent": None, "custody_type": "tam_giu"},
        # Cấp sub_camp (phân trại — con của Trại tạm giam)
        {"code": "PT1", "name": "Phân trại 1", "capacity": 0, "note": "",
         "level": "sub_camp", "parent": "TTG", "custody_type": None},
        {"code": "PT2", "name": "Phân trại 2", "capacity": 0, "note": "",
         "level": "sub_camp", "parent": "TTG", "custody_type": None},
        # Cấp cell (buồng)
        {"code": "B101", "name": "Buồng 101", "capacity": 20, "note": "Phân trại 1",
         "level": "cell", "parent": "PT1", "custody_type": None},
        {"code": "B102", "name": "Buồng 102", "capacity": 20, "note": "Phân trại 1",
         "level": "cell", "parent": "PT1", "custody_type": None},
        {"code": "B201", "name": "Buồng 201", "capacity": 25, "note": "Phân trại 2",
         "level": "cell", "parent": "PT2", "custody_type": None},
        {"code": "B01", "name": "Buồng 01", "capacity": 15, "note": "Nhà tạm giữ",
         "level": "cell", "parent": "NTG", "custody_type": None},
        {"code": "B02", "name": "Buồng 02", "capacity": 15, "note": "Nhà tạm giữ - nữ",
         "level": "cell", "parent": "NTG", "custody_type": None},
    ]
    for s in seeds:
        s.update({"created_at": now, "updated_at": now})

    db.cells.insert_many(seeds)
    print(f"[cells] chèn {len(seeds)} nodes cây mới:")

    # In cây để xác nhận
    for s in seeds:
        indent = {"facility": "", "sub_camp": "  ", "cell": "    "}[s["level"]]
        extra = f" (custody={s['custody_type']})" if s["custody_type"] else ""
        print(f"  {indent}{s['level']:9} {s['code']:5} {s['name']}{extra}  parent={s['parent']}")

    # Tạo index
    db.cells.create_index("code", unique=True)
    print("\n✓ Xong. Khởi động lại backend để load lại dữ liệu.")


if __name__ == "__main__":
    main()
