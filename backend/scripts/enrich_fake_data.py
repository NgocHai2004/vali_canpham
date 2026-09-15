"""
Script lam giau du lieu (fake data phong phu) cho backend va MongoDB Atlas:
- Ho so can pham day du: chieu cao, can nang, dac diem nhan dang, buong giam, dien giam giu, van tay
- Thong ke buong giam / phan trai / trai tam giam
- Nhat ky thao tac (audit logs)
- Cac vu an dau vet hien truong
Chay:
    .\\.venv\\Scripts\\python.exe backend/scripts/enrich_fake_data.py
"""
import os
import random
from datetime import datetime, timedelta
from pymongo import MongoClient

# Load .env
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
                    if k.strip() not in os.environ:
                        os.environ[k.strip()] = v.strip().strip('"').strip("'")

MONGO_URL = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME", "app_cccd")

CELL_CONFIGS = [
    # (facility, sub_camp, cell, custody_type)
    ("TTG", "PT1", "B101", "tam_giam"),
    ("TTG", "PT1", "B102", "tam_giam"),
    ("TTG", "PT2", "B201", "tam_giam"),
    ("NTG", None,  "B01",  "tam_giu"),
    ("NTG", None,  "B02",  "tam_giu"),
]

IDENTIFYING_MARKS = [
    "Sẹo thẳng 2cm cách đuôi lông mày phải 1.5cm",
    "Nốt ruồi đen chìm 0.5cm dưới cánh mũi trái",
    "Hình xăm rồng nghệ thuật ở bắp tay phải",
    "Sẹo tròn đường kính 1cm ở mu bàn tay trái",
    "Nốt ruồi nổi màu nâu cách khóe miệng phải 2cm",
    "Sẹo mổ cũ dài 5cm vùng cẳng tay trái",
    "Vết chàm mờ màu xanh xám vùng thái dương trái",
    "Sẹo lõm 0.5cm ở sống mũi",
    "Hình xăm hoa văn Maori ở cổ chân phải",
    "Nốt ruồi đen nổi 0.3cm cách dái tai phải 1cm",
    "Không phát hiện dấu vết dị hình, dị tật đặc biệt",
]

OFFICERS = ["admin", "canbo01", "canbo02", "canbo03"]

ACTIONS = [
    ("login", "auth", "Đăng nhập hệ thống thành công"),
    ("create", "detainee", "Thu thập và lập hồ sơ can phạm mới"),
    ("update", "detainee", "Cập nhật thông tin nhận dạng và buồng giam"),
    ("capture_photo", "biometric", "Chụp ảnh chân dung 3 góc độ"),
    ("scan_fp", "fingerprint", "Thu nhận 10 vân tay can phạm"),
    ("view", "detainee", "Tra cứu chi tiết hồ sơ can phạm"),
    ("export", "report", "Xuất báo cáo danh sách can phạm ra Excel"),
    ("transfer_cell", "cell", "Điều chuyển buồng giam"),
]

def main():
    print(f"[*] Ket noi MongoDB Atlas: {MONGO_URL[:35]}... | DB: {DB_NAME}")
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    db = client[DB_NAME]

    # 1. Cap nhat detainees voi day du truong thong tin thuc te
    detainees = list(db.detainees.find())
    print(f"[*] Dang lam giau du lieu cho {len(detainees)} can pham...")

    for idx, d in enumerate(detainees):
        # Buong giam & dien giam giu
        fac, sub, cell, c_type = CELL_CONFIGS[idx % len(CELL_CONFIGS)]
        
        # The chat
        height = round(random.uniform(155.0, 182.0), 1) if d.get("gender") == "male" else round(random.uniform(148.0, 168.0), 1)
        weight = round(random.uniform(52.0, 85.0), 1) if d.get("gender") == "male" else round(random.uniform(44.0, 65.0), 1)
        
        # Dac diem nhan dang
        mark = random.choice(IDENTIFYING_MARKS)
        
        # Van tay tong hop (lay tu thu muc uploads da sinh)
        fp_synth_id = (idx % 48) + 2
        fp_url = f"/uploads/vantay_synth/vantay_synth_{fp_synth_id:02d}.png"
        
        update_fields = {
            "facility_code": fac,
            "sub_camp_code": sub,
            "cell_code": cell,
            "custody_type": c_type,
            "height_cm": height,
            "weight_kg": weight,
            "identification_features": mark,
            "identifying_marks": mark,
            "photo_url": f"/uploads/faces/face_{(idx % 10) + 1:02d}.jpg",
            "fingerprints_captured": True,
            "photos_captured": True,
            "fingerprint_sample_url": fp_url,
            "status": "in_custody" if idx % 10 != 0 else "released",
        }
        
        db.detainees.update_one({"_id": d["_id"]}, {"$set": update_fields})

    print("[+] Da cap nhat toan bo detainees voi chieu cao, can nang, buong giam, dac diem nhan dang!")

    # 2. Sinh them 80 Audit Logs sinh dong theo thoi gian 7 ngay gan nhat
    now = datetime.utcnow()
    new_logs = []
    for i in range(80):
        action, resource, desc = random.choice(ACTIONS)
        actor = random.choice(OFFICERS)
        target_d = random.choice(detainees)
        log_time = now - timedelta(days=random.randint(0, 7), hours=random.randint(0, 23), minutes=random.randint(0, 59))
        
        new_logs.append({
            "at": log_time,
            "actor": actor,
            "action": action,
            "resource": resource,
            "ref": target_d.get("full_name", ""),
            "ref_id": str(target_d["_id"]),
            "ip": f"192.168.1.{random.randint(10, 99)}",
            "data": {
                "desc": desc,
                "code": target_d.get("code", ""),
                "cell": target_d.get("cell_code", "B101"),
            },
        })

    if new_logs:
        db.audit_logs.insert_many(new_logs)
        print(f"[+] Da tao them {len(new_logs)} nhat ky hoat dong (Audit Logs) trong 7 ngay gan nhat")

    # 3. Cap nhat capacity & occupancy thuc te cho collection cells
    cell_counts = {}
    for d in db.detainees.find({"status": "in_custody"}):
        c = d.get("cell_code")
        if c:
            cell_counts[c] = cell_counts.get(c, 0) + 1

    for cell_code, count in cell_counts.items():
        db.cells.update_one(
            {"code": cell_code},
            {"$set": {"current_occupancy": count, "updated_at": now}}
        )
    print(f"[+] Da dong bo si so thuc te can pham vao tung buong giam: {cell_counts}")

    print("[OK] Hoan tat fake du lieu Backend phong phu va hop le!")

if __name__ == "__main__":
    main()
