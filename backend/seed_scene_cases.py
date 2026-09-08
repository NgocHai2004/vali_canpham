"""Seed du an gia cho tab Dau vet hien truong: 6 vu an + 60 dau vet.

Chay: .venv/Scripts/python.exe backend/seed_scene_cases.py
Idempotent — moi doc seed deu co seed_demo=True, chay lai thi xoa roi bom lai.

ponytail: tro url thang vao /uploads/latent_cut/ (anh da co san) thay vi copy
sang /uploads/scene/. Copy file khi nao can xoa doc lap tung anh.
Cung bo anh voi LATENT trong frontend/src/sceneDemo.js => anh dau vet o bang
KET QUA DOI SANH / DAU VET HIEN TRUONG khop voi anh demo.
"""
import os
import sys
from datetime import datetime, timedelta

from pymongo import MongoClient

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "app_cccd")
OFFICER = os.getenv("SEED_OFFICER", "canbo01")

IMG_DIR = os.path.join(os.path.dirname(__file__), "uploads", "latent_cut")
PER_CASE = 10

# 6 vu an: (ten vu an, dia diem, xa/phuong)
CASES = [
    ("Trom cap tai san tai cua hang dien may Hoa Binh", "So 12 Le Duan, P. Hai Chau 1", "20194"),
    ("Trom cap dot nhap nha dan pho Nguyen Chi Thanh", "So 88 Nguyen Chi Thanh, P. Thach Thang", "20195"),
    ("Cuop giat tai san tren duong Bach Dang", "Duong Bach Dang, P. Thach Thang", "20195"),
    ("Pha khoa xe may tai bai xe cho Con", "Bai xe cho Con, P. Hai Chau 2", "20196"),
    ("Dot nhap kho hang khu cong nghiep Hoa Khanh", "KCN Hoa Khanh, P. Hoa Khanh Bac", "20203"),
    ("Trom cap tai quan ca phe duong Tran Phu", "So 45 Tran Phu, P. Hai Chau 1", "20194"),
]

# Loai dau vet + noi thu — cot "Loai dau vet" / "Nguon thu thap" tren bang.
TRACE_TYPES = ["Van tay latent", "Van tay latent", "Van tay latent", "Dau ban tay"]
PLACES = [
    "Cua kinh", "Dien thoai", "Tay nam cua", "Ly thuy tinh",
    "Ban go", "Vo lon", "Tuong son", "May tinh", "Khung nhom", "Mat kinh tu",
]
NOTE = "Van tay thu duoc tren be mat ngoai, da chup va luu tai hien truong."


def main():
    imgs = sorted(f for f in os.listdir(IMG_DIR) if f.endswith(".png")) if os.path.isdir(IMG_DIR) else []
    if not imgs:
        sys.exit(f"Khong tim thay anh trong {IMG_DIR} — chay script sinh anh truoc.")

    db = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)[DB_NAME]
    db.command("ping")

    if not db.users.find_one({"username": OFFICER}):
        sys.exit(f"Chua co tai khoan '{OFFICER}'. Tao truoc roi chay lai.")
    full_name = db.users.find_one({"username": OFFICER}).get("full_name") or OFFICER

    # Xoa lan seed truoc (chi doc co seed_demo) — khong dung vao data that.
    old = [d["_id"] for d in db.work_sessions.find({"seed_demo": True}, {"_id": 1})]
    db.scene_traces.delete_many({"seed_demo": True})
    db.work_sessions.delete_many({"seed_demo": True})
    print(f"da xoa {len(old)} phien seed cu")

    # Phien dang mo san (neu co) duoc backfill case_name thay vi tao trung.
    live = db.work_sessions.find_one({"officer": OFFICER, "status": "open"})
    base = datetime(2026, 8, 3, 8, 30)
    n_tr = 0

    for i, (case_name, location, commune) in enumerate(CASES):
        opened = base + timedelta(days=i * 4, hours=i)
        if i == 0 and live:
            sid = live["_id"]
            db.work_sessions.update_one({"_id": sid}, {"$set": {
                "case_name": case_name, "commune_code": commune, "location": location,
            }})
            print(f"backfill case_name cho phien dang mo {live.get('code')}")
        else:
            sid = db.work_sessions.insert_one({
                "code": f"S{opened.strftime('%Y%m%d')}-{i + 1:04d}",
                "status": "closed",
                "case_name": case_name,
                "commune_code": commune,
                "officer": OFFICER,
                "officer_full_name": full_name,
                "location": location,
                "note": "Phien seed demo.",
                "opened_at": opened,
                "closed_at": opened + timedelta(hours=6),
                "detainee_count": 0,
                "report_url": None,
                "report_filename": None,
                "seed_demo": True,
            }).inserted_id

        for k in range(PER_CASE):
            g = i * PER_CASE + k
            at = opened + timedelta(minutes=18 * k)
            db.scene_traces.insert_one({
                "session_id": sid,
                "seq": k + 1,
                "url": f"/uploads/latent_cut/{imgs[g % len(imgs)]}",
                "size": 90000 + (g * 5137) % 40000,
                "mime": "image/png",
                "note": NOTE,
                "trace_type": TRACE_TYPES[g % len(TRACE_TYPES)],
                "collection_source": f"Hien truong - {PLACES[g % len(PLACES)]}",
                "source": "push" if g % 3 == 0 else "upload",
                "device_id": f"DEV-{g % 3 + 1:02d}" if g % 3 == 0 else "",
                "captured_at": at,
                "created_at": at,
                "created_by": "" if g % 3 == 0 else OFFICER,
                "face_embedding": None,
                "face_count": None,
                "seed_demo": True,
            })
            n_tr += 1

    # self-check: du 6 vu an co ten, du 60 dau vet, moi vu du PER_CASE
    codes = list(db.work_sessions.find({"officer": OFFICER, "case_name": {"$ne": ""}}))
    assert len(codes) == len(CASES), f"vu an: {len(codes)} != {len(CASES)}"
    assert n_tr == len(CASES) * PER_CASE, n_tr
    for s in codes:
        c = db.scene_traces.count_documents({"session_id": s["_id"]})
        assert c == PER_CASE, f"{s['code']}: {c} dau vet"
    print(f"OK: {len(codes)} vu an, {n_tr} dau vet ({PER_CASE}/vu an)")


if __name__ == "__main__":
    main()
