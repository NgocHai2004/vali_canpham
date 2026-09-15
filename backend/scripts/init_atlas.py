"""
Script khoi tao database va cac collection (bang) tren MongoDB Atlas / Local.
Chay:
    .\\.venv\\Scripts\\python.exe backend/scripts/init_atlas.py
"""
import os
import sys
from datetime import datetime
import bcrypt
from pymongo import MongoClient

# Tim .env
candidate_envs = [
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env")),
]
for env_file in candidate_envs:
    if os.path.exists(env_file):
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if k not in os.environ:
                        os.environ[k] = v

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "app_cccd")

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def main():
    print(f"[*] Dang ket noi MongoDB: {MONGO_URL[:35]}... | DB: {DB_NAME}")
    try:
        client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        print("[+] Ket noi thanh cong!")
    except Exception as e:
        print(f"[-] Loi ket noi: {e}")
        sys.exit(1)

    db = client[DB_NAME]

    # Danh sach cac collections can tao
    collections = [
        "users",
        "detainees",
        "cells",
        "counters",
        "settings",
        "audit_logs",
        "cases",
        "traces",
        "work_sessions",
    ]

    existing = db.list_collection_names()
    print(f"[*] Cac collection hien co: {existing}")

    for col in collections:
        if col not in existing:
            db.create_collection(col)
            print(f"  -> Da tao collection: {col}")
        else:
            print(f"  -> Collection da ton tai: {col}")

    # Tao index
    db.detainees.create_index("personal_id", unique=True, sparse=True)
    db.detainees.create_index([("full_name", 1), ("dob", 1)])
    print("[+] Da tao indexes cho detainees")

    # Khoi tao user admin mac dinh
    admin_user = db.users.find_one({"username": "admin"})
    if not admin_user:
        db.users.insert_one({
            "username": "admin",
            "password_hash": hash_password("admin123"),
            "role": "admin",
            "full_name": "Nguyen Tuan Anh",
            "created_at": datetime.utcnow(),
        })
        print("[+] Da tao tai khoan admin (user: admin / pass: admin123)")
    else:
        print("[+] Tai khoan admin da ton tai")

    # Khoi tao settings do dac
    if not db.settings.find_one({"_id": "measurement"}):
        db.settings.insert_one({
            "_id": "measurement",
            "height_image": 100.0,
            "height_offset": 103.0,
        })
        print("[+] Da tao cau hinh do chieu cao mac dinh")

    print("[OK] Hoan tat khoi tao database!")

if __name__ == "__main__":
    main()
