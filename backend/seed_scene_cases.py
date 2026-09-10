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

# 6 vu an: (ten vu an, dia diem)
CASES = [
    ("Trom cap tai san tai cua hang dien may Hoa Binh", "So 12 Le Duan, P. Hai Chau 1"),
    ("Trom cap dot nhap nha dan pho Nguyen Chi Thanh", "So 88 Nguyen Chi Thanh, P. Thach Thang"),
    ("Cuop giat tai san tren duong Bach Dang", "Duong Bach Dang, P. Thach Thang"),
    ("Pha khoa xe may tai bai xe cho Con", "Bai xe cho Con, P. Hai Chau 2"),
    ("Dot nhap kho hang khu cong nghiep Hoa Khanh", "KCN Hoa Khanh, P. Hoa Khanh Bac"),
    ("Trom cap tai quan ca phe duong Tran Phu", "So 45 Tran Phu, P. Hai Chau 1"),
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

    # Xoa lan seed truoc (chi doc co seed_demo) — khong dung vao data that.
    old = [d["_id"] for d in db.cases.find({"seed_demo": True}, {"_id": 1})]
    db.scene_traces.delete_many({"seed_demo": True})
    db.cases.delete_many({"seed_demo": True})
    print(f"da xoa {len(old)} vu an seed cu")

    # ponytail: CA 6 vu an deu la doc moi co seed_demo=True. Ban goc backfill
    # case_name vao phien THAT dang mo => sua data that, va lan chay sau khong don
    # duoc vi phien do khong co co seed_demo.
    base = datetime(2026, 8, 3, 8, 30)
    n_tr = 0

    # 2 vu de "dang dieu tra" de con thu luong them dau vet / them ho so;
    # 4 vu con lai "closed" de thu man hinh bi khoa.
    for i, (name, location) in enumerate(CASES):
        occurred = base + timedelta(days=i * 4, hours=i)
        created = occurred + timedelta(hours=3)
        status = "investigating" if i < 2 else "closed"
        cid = db.cases.insert_one({
            "code": f"VA{occurred.strftime('%Y%m%d')}-{i + 1:04d}",
            "status": status,
            "name": name,
            "location": location,
            "occurred_at": occurred,
            "note": "Vu an seed demo.",
            "created_at": created,
            "created_by": OFFICER,
            "closed_at": None if status == "investigating" else created + timedelta(days=6),
            "report_url": None,
            "report_filename": None,
            "seed_demo": True,
        }).inserted_id

        for k in range(PER_CASE):
            g = i * PER_CASE + k
            at = occurred + timedelta(minutes=18 * k)
            db.scene_traces.insert_one({
                "case_id": cid,
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

        # counters phai khop seq da bom, khong thi anh them sau se trung seq.
        db.counters.update_one(
            {"_id": f"scene_seq_{cid}"},
            {"$set": {"seq": PER_CASE}},
            upsert=True,
        )

    # self-check: du 6 vu an, du 60 dau vet, moi vu du PER_CASE.
    # ponytail: loc theo seed_demo. Ban goc dung {"case_name": {"$ne": ""}} => match
    # ca phien THAT co case_name=None (None != "") nen assert fail oan tren DB co san.
    rows = list(db.cases.find({"seed_demo": True}))
    assert len(rows) == len(CASES), f"vu an: {len(rows)} != {len(CASES)}"
    assert n_tr == len(CASES) * PER_CASE, n_tr
    for c in rows:
        n = db.scene_traces.count_documents({"case_id": c["_id"]})
        assert n == PER_CASE, f"{c['code']}: {n} dau vet"
    n_open = sum(1 for c in rows if c["status"] == "investigating")
    print(f"OK: {len(rows)} vu an ({n_open} dang dieu tra), {n_tr} dau vet ({PER_CASE}/vu an)")


if __name__ == "__main__":
    main()
