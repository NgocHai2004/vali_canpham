"""
Seed dữ liệu mẫu cho dashboard.

Chạy:
    cd C:\\Users\\vali-01\\Documents\\App_CCCD\\app_cccd
    .\\.venv\\Scripts\\Activate.ps1
    python -m backend.seed_dashboard          # thêm dữ liệu, giữ nguyên cái đang có
    python -m backend.seed_dashboard --reset  # xoá sạch detainees/sessions/logs trước khi seed
"""

import argparse
import asyncio
import random
import sys
from datetime import datetime, timedelta

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "app_cccd"


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


NAMES_MALE = [
    "Nguyễn Văn An", "Trần Quang Bình", "Lê Hoàng Cường", "Phạm Minh Đức",
    "Hoàng Trọng Phú", "Vũ Đình Hải", "Đặng Quốc Huy", "Bùi Thanh Nam",
    "Đinh Công Khánh", "Ngô Bá Long", "Đỗ Xuân Mạnh", "Trịnh Văn Nghĩa",
    "Phan Đức Phong", "Dương Ngọc Quân", "Lý Thành Sơn", "Hồ Văn Tùng",
    "Cao Bá Việt", "Tô Minh Toàn", "Chu Trọng Uy", "Mai Đình Vinh",
]
NAMES_FEMALE = [
    "Trần Thị Bích", "Phạm Ngọc Dung", "Vũ Thị Hà", "Bùi Thanh Lan",
    "Nguyễn Hồng Hoa", "Lê Thu Hằng", "Đỗ Thị Kim", "Hoàng Bích Ngọc",
    "Đặng Mai Phương", "Trịnh Thu Quỳnh", "Phan Thanh Thảo", "Dương Kim Yến",
]
CHARGES = [
    "Trộm cắp tài sản",
    "Cố ý gây thương tích",
    "Mua bán trái phép chất ma tuý",
    "Lừa đảo chiếm đoạt tài sản",
    "Đánh bạc",
    "Cướp giật tài sản",
    "Vi phạm quy định về giao thông đường bộ",
]
HOMETOWNS = ["Hà Nội", "Hải Phòng", "Đà Nẵng", "TP.HCM", "Cần Thơ",
             "Bắc Ninh", "Thái Bình", "Nam Định", "Nghệ An", "Quảng Ninh"]

OFFICERS = [
    ("canbo01", "Nguyễn Ngọc Hải"),
    ("canbo02", "Trần Văn Long"),
    ("canbo03", "Phạm Thu Trang"),
]


def rand_cccd() -> str:
    return "".join(str(random.randint(0, 9)) for _ in range(12))


async def ensure_officers(db) -> list[dict]:
    now = datetime.utcnow()
    users = []
    for uname, full in OFFICERS:
        u = await db.users.find_one({"username": uname})
        if not u:
            doc = {
                "username": uname,
                "full_name": full,
                "role": "user",
                "password_hash": hash_password("canbo123"),
                "created_at": now,
                "avatar_url": None,
            }
            r = await db.users.insert_one(doc)
            doc["_id"] = r.inserted_id
            u = doc
        users.append(u)
    admin = await db.users.find_one({"username": "admin"})
    if admin:
        users.append(admin)
    return users


async def _next_code(db, key: str, prefix: str, width: int = 4) -> str:
    doc = await db.counters.find_one_and_update(
        {"_id": key},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return f"{prefix}{doc['seq']:0{width}d}"


async def seed(reset: bool):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    if reset:
        print("[reset] xoá detainees / work_sessions / audit_logs")
        await db.detainees.delete_many({})
        await db.work_sessions.delete_many({})
        await db.audit_logs.delete_many({})

    officers = await ensure_officers(db)
    print(f"[users] có {len(officers)} cán bộ khả dụng")

    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # 1) Tạo 6 phiên rải trong 14 ngày, 1 phiên đang mở cho admin
    sessions = []
    for i in range(6):
        officer = random.choice(officers)
        days_ago = random.randint(0, 13)
        opened = today_start - timedelta(days=days_ago, hours=random.randint(0, 6))
        is_last = i == 5
        # đảm bảo phiên đang mở là của admin để dashboard admin thấy hero card
        if is_last:
            officer = next((o for o in officers if o["username"] == "admin"), officer)
            opened = now - timedelta(hours=1)
        status = "open" if is_last else "closed"
        closed = None if is_last else opened + timedelta(hours=random.randint(2, 6))
        code = await _next_code(db, f"session_code_{opened.strftime('%Y%m%d')}", f"S{opened.strftime('%Y%m%d')}-")
        doc = {
            "code": code,
            "status": status,
            "officer": officer["username"],
            "officer_full_name": officer.get("full_name", officer["username"]),
            "location": random.choice(["Trại tạm giam số 1", "Trại tạm giam số 2", "Nhà tạm giữ CAH Cầu Giấy"]),
            "note": "",
            "opened_at": opened,
            "closed_at": closed,
            "detainee_count": 0,
            "report_url": None,
            "report_filename": None,
        }
        r = await db.work_sessions.insert_one(doc)
        doc["_id"] = r.inserted_id
        sessions.append(doc)
    print(f"[sessions] tạo {len(sessions)} phiên (1 đang mở của admin)")

    # 2) Tạo detainees rải trong 14 ngày qua
    n_target = 60
    inserted = 0
    for i in range(n_target):
        # phân bổ ngày: nhiều hơn ở những ngày gần đây (0 = hôm nay)
        days_ago = min(13, int(random.expovariate(1 / 3.0)))
        created = (
            today_start
            - timedelta(days=days_ago)
            + timedelta(hours=random.randint(0, 22), minutes=random.randint(0, 59))
        )
        if created > now:
            created = now - timedelta(minutes=random.randint(1, 120))
        # chọn phiên: ưu tiên phiên cùng ngày, không thì bất kỳ
        same_day = [s for s in sessions
                    if s["opened_at"].date() == created.date()]
        sess = random.choice(same_day) if same_day else random.choice(sessions)
        gender = "female" if random.random() < 0.28 else "male"
        name = random.choice(NAMES_FEMALE if gender == "female" else NAMES_MALE)
        code = await _next_code(db, "detainee_code", "CP", width=5)
        birth_year = random.randint(1970, 2005)
        dob = datetime(birth_year, random.randint(1, 12), random.randint(1, 28))
        # KHÔNG set URL ảnh giả — file thật không tồn tại → broken image icon.
        # Frontend fallback sẵn sang chữ cái đầu / khung trống, đẹp hơn.
        has_cccd = random.random() > 0.10
        doc = {
            "code": code,
            "full_name": name,
            "full_name_norm": name.lower(),
            "gender": gender,
            "dob": dob,
            "cccd_number": rand_cccd() if has_cccd else None,
            "nationality": "Việt Nam",
            "hometown": random.choice(HOMETOWNS),
            "address": f"Số {random.randint(1, 300)}, {random.choice(HOMETOWNS)}",
            "ethnicity": "Kinh",
            "religion": "Không",
            "charge": random.choice(CHARGES),
            "date_in": created,
            "note": "",
            "photos": {},
            "created_at": created,
            "updated_at": created,
            "created_by": sess["officer"],
            "session_id": sess["_id"],
        }
        try:
            r = await db.detainees.insert_one(doc)
        except Exception as e:
            print(f"  skip {code}: {e}")
            continue
        inserted += 1
        await db.work_sessions.update_one(
            {"_id": sess["_id"]}, {"$inc": {"detainee_count": 1}}
        )
        await db.audit_logs.insert_one({
            "at": created,
            "actor": sess["officer"],
            "action": "create",
            "resource": "detainee",
            "ref": code,
            "ref_id": str(r.inserted_id),
            "ip": "127.0.0.1",
            "data": {"full_name": name, "session": sess["code"]},
            "session_id": sess["_id"],
        })
    print(f"[detainees] tạo {inserted} hồ sơ + audit log tương ứng")

    # 3) Vài audit log khác cho activity feed
    for _ in range(6):
        officer = random.choice(officers)
        action = random.choice(["update", "login", "import"])
        at = now - timedelta(minutes=random.randint(5, 300))
        await db.audit_logs.insert_one({
            "at": at,
            "actor": officer["username"],
            "action": action,
            "resource": "detainee" if action == "update" else ("auth" if action == "login" else "detainee"),
            "ref": "",
            "ip": "127.0.0.1",
            "data": {},
            "session_id": None,
        })

    print("[done] seed hoàn tất")
    client.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="Xoá dữ liệu detainees/sessions/logs trước khi seed")
    args = parser.parse_args()
    asyncio.run(seed(args.reset))


if __name__ == "__main__":
    main()
