"""Seed data và startup config — admin account, default cells, fingerprint config."""

import asyncio
from datetime import datetime

import httpx

from config import (
    ADMIN_USERNAME, ADMIN_PASSWORD,
    FP_FINGER_CODES, FP_SERVICE_URL,
    get_fp_min_quality, sanitize_fp_map, update_fp_cache,
    _fp_min_quality_cache,
)
from auth import hash_password
import database


async def ensure_admin():
    """Tạo tài khoản admin mặc định nếu chưa có."""
    existing = await database.db.users.find_one({"username": ADMIN_USERNAME})
    if not existing:
        await database.db.users.insert_one({
            "username": ADMIN_USERNAME,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin",
            "full_name": "Nguyễn Tuấn Anh",
            "created_at": datetime.utcnow(),
        })
    else:
        if not existing.get("full_name"):
            await database.db.users.update_one(
                {"_id": existing["_id"]},
                {"$set": {"full_name": "Nguyễn Tuấn Anh"}},
            )


async def ensure_default_cells():
    """Tạo cơ sở giam giữ mẫu nếu collection rỗng."""
    if await database.db.cells.count_documents({}) == 0:
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
        await database.db.cells.insert_many(seeds)


async def load_fp_config():
    """Đọc ngưỡng chất lượng từng ngón từ db.settings; seed mặc định nếu chưa có."""
    doc = await database.db.settings.find_one({"_id": "fingerprint"})
    if doc is None:
        await database.db.settings.insert_one({
            "_id": "fingerprint",
            "by_finger": dict(_fp_min_quality_cache),
        })
        return
    got = sanitize_fp_map(doc.get("by_finger"))
    # Tương thích bản trước: khi còn là một ngưỡng chung, áp cho cả 10 ngón.
    if not got and doc.get("min_quality") is not None:
        one = sanitize_fp_map({c: doc.get("min_quality") for c in _fp_min_quality_cache})
        got = one
    if got:
        update_fp_cache(got)


async def push_fp_quality(by_finger: dict) -> bool:
    """Đẩy ngưỡng từng ngón sang service Morfin (8765) - nơi thực sự chặn.

    Mongo là nguồn thật; hàm này chỉ đồng bộ. Trả False nếu service không nhận
    (đang tắt / lỗi) để caller báo cho admin biết là chưa áp dụng ngay.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{FP_SERVICE_URL}/api/config/quality",
                json={"by_finger": dict(by_finger)},
            )
        return resp.status_code == 200
    except Exception:  # noqa: BLE001 - service tắt là bình thường, không được raise
        return False


async def push_fp_quality_safe():
    """Đồng bộ ngưỡng lúc backend startup. Service Morfin tự respawn nên giá trị
    trong RAM của nó có thể cũ hơn Mongo; push lại để hai bên khớp nhau."""
    try:
        await push_fp_quality(get_fp_min_quality())
    except Exception:  # noqa: BLE001 - task background, không được làm sập app
        pass
