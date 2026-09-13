"""
Seed dữ liệu mẫu cho dashboard.

Chạy:
    cd C:\\Users\\vali-01\\Documents\\Vali_hientruong\\app_cccd
    .\\.venv\\Scripts\\Activate.ps1
    python -m backend.seed_dashboard          # thêm dữ liệu, giữ nguyên cái đang có
    python -m backend.seed_dashboard --reset  # xoá sạch detainees/sessions/logs trước khi seed
"""

import argparse
import asyncio
import os
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

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27018")
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

CASE_NAMES = [
    "Trộm cắp tài sản tại cửa hàng điện máy",
    "Cướp giật tài sản trên đường Bạch Đằng",
    "Đột nhập kho hàng khu công nghiệp",
    "Phá khoá xe máy tại bãi xe chợ Cồn",
    "Trộm cắp đột nhập nhà dân",
    "Cố ý gây thương tích tại quán ăn",
]
CASE_LOCATIONS = [
    "Số 12 Lê Duẩn, P. Hải Châu 1",
    "Số 88 Nguyễn Chí Thanh, P. Thạch Thang",
    "Đường Bạch Đằng, P. Thạch Thang",
    "Bãi xe chợ Cồn, P. Hải Châu 2",
    "KCN Hoà Khánh, P. Hoà Khánh Bắc",
    "Số 45 Trần Phú, P. Hải Châu 1",
]

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
        print("[reset] xoá detainees / cases / audit_logs")
        await db.detainees.delete_many({})
        await db.cases.delete_many({})
        await db.audit_logs.delete_many({})

    officers = await ensure_officers(db)
    print(f"[users] có {len(officers)} cán bộ khả dụng")

    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # 1) Tạo 6 vụ án rải trong 14 ngày, 2 vụ còn đang điều tra.
    # Vụ án không thuộc riêng cán bộ nào nên không gán officer; created_by chỉ ghi
    # ai lập hồ sơ trong máy.
    cases = []
    for i in range(6):
        creator = random.choice(officers)
        days_ago = random.randint(0, 13)
        occurred = today_start - timedelta(days=days_ago, hours=random.randint(0, 6))
        created = occurred + timedelta(hours=random.randint(1, 5))
        if created > now:
            created = now - timedelta(minutes=random.randint(1, 60))
        status = "investigating" if i >= 4 else "closed"
        code = await _next_code(db, f"case_code_{occurred.strftime('%Y%m%d')}", f"VA{occurred.strftime('%Y%m%d')}-")
        doc = {
            "code": code,
            "status": status,
            "name": random.choice(CASE_NAMES),
            "location": random.choice(CASE_LOCATIONS),
            "occurred_at": occurred,
            "note": "",
            "created_at": created,
            "created_by": creator["username"],
            "closed_at": None if status == "investigating" else created + timedelta(days=random.randint(2, 9)),
            "report_url": None,
            "report_filename": None,
        }
        r = await db.cases.insert_one(doc)
        doc["_id"] = r.inserted_id
        cases.append(doc)
    n_open = sum(1 for c in cases if c["status"] == "investigating")
    print(f"[cases] tạo {len(cases)} vụ án ({n_open} đang điều tra)")

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
        # chọn vụ án: ưu tiên vụ xảy ra cùng ngày, không thì bất kỳ
        same_day = [c for c in cases
                    if c["occurred_at"].date() == created.date()]
        case = random.choice(same_day) if same_day else random.choice(cases)
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
            "created_by": case["created_by"],
            "case_id": case["_id"],
        }
        try:
            r = await db.detainees.insert_one(doc)
        except Exception as e:
            print(f"  skip {code}: {e}")
            continue
        inserted += 1
        # Khong $inc dem hồ sơ vào vụ án: backend đếm động bằng aggregate
        # (_case_detainee_counts) nên không có field nào phải giữ đồng bộ.
        await db.audit_logs.insert_one({
            "at": created,
            "actor": case["created_by"],
            "action": "create",
            "resource": "detainee",
            "ref": code,
            "ref_id": str(r.inserted_id),
            "ip": "127.0.0.1",
            "data": {"full_name": name, "case": case["code"]},
            "case_id": case["_id"],
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
            "case_id": None,
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
