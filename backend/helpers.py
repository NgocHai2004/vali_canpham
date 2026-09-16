"""Helper functions — serialization, date parsing, audit logging, scope filtering, validation."""

import os
import re
from datetime import datetime
from typing import Optional, List

from fastapi import HTTPException, Request
from bson import ObjectId

from config import UPLOAD_DIR
import database


# ---------------------------------------------------------------------------
# ObjectId / Serialization
# ---------------------------------------------------------------------------

def parse_object_id(s: str) -> ObjectId:
    """Parse string thành ObjectId, raise 400 nếu invalid."""
    try:
        return ObjectId(s)
    except Exception:
        raise HTTPException(400, "invalid id")


def serialize_doc(doc: dict) -> dict:
    """Chuẩn hoá document MongoDB thành dict JSON-safe (detainee và generic docs)."""
    if not doc:
        return doc
    doc["id"] = str(doc.pop("_id"))
    if "session_id" in doc and doc["session_id"] is not None:
        doc["session_id"] = str(doc["session_id"])
    for k in ("created_at", "updated_at", "dob"):
        if k in doc and isinstance(doc[k], datetime):
            doc[k] = doc[k].isoformat()
    return doc


def serialize_session(doc: dict) -> dict:
    """Chuẩn hoá document work_session thành dict JSON-safe."""
    if not doc:
        return doc
    out = dict(doc)
    out["id"] = str(out.pop("_id"))
    for k in ("opened_at", "closed_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


def serialize_user(u: dict) -> dict:
    """Chuẩn hoá document user thành dict JSON-safe."""
    return {
        "id": str(u["_id"]),
        "username": u["username"],
        "role": u.get("role", "user"),
        "full_name": u.get("full_name", ""),
        "avatar_url": u.get("avatar_url", "") or "",
        "created_at": u["created_at"].isoformat() if isinstance(u.get("created_at"), datetime) else None,
    }


# ---------------------------------------------------------------------------
# Date parsing
# ---------------------------------------------------------------------------

def parse_dob(s: Optional[str]) -> Optional[str]:
    """Parse ngày sinh / ngày cấp / ngày hết hạn → chuẩn hoá string YYYY-MM-DD."""
    if not s:
        return None
    s = str(s).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except Exception:
            continue
    return None


def parse_dt(s: Optional[str]) -> Optional[datetime]:
    """Parse ISO 8601 or 'YYYY-MM-DDTHH:MM' from <input type=datetime-local>."""
    if not s:
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except Exception:
            continue
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Scope filtering / Permission checks
# ---------------------------------------------------------------------------

def scope_filter(user: dict, base: dict = None) -> dict:
    """Non-admin users only see records they created."""
    filt = dict(base or {})
    if user.get("role") != "admin":
        filt["created_by"] = user["username"]
    return filt


def ensure_can_touch(doc: dict, user: dict) -> None:
    """Kiểm tra user có quyền thao tác trên document không."""
    if user.get("role") == "admin":
        return
    if doc.get("created_by") != user["username"]:
        raise HTTPException(403, "Bạn chỉ được thao tác trên hồ sơ do chính mình đăng ký")


def ensure_session_editable(session_doc: dict, username: str, is_admin: bool) -> None:
    """Kiểm tra phiên còn mở và user có quyền thao tác."""
    if session_doc.get("status") != "open":
        raise HTTPException(403, "Hồ sơ này thuộc phiên đã đóng, không thể chỉnh sửa.")
    if session_doc.get("officer") != username and not is_admin:
        raise HTTPException(403, "Bạn không có quyền thao tác trên phiên này.")


# ---------------------------------------------------------------------------
# Capture validation
# ---------------------------------------------------------------------------

def require_capture_fields(body) -> None:
    """Enforce mandatory fields for the "Thu nhận dữ liệu" flow.

    CHI 2 TRUONG BAT BUOC (dung 2 dau * tren giao dien): ma ho so (personal_id)
    va so CCCD 12 chu so. Moi truong khac — ho ten, ngay sinh, gioi tinh, anh,
    van tay — co hoac khong deu luu duoc; can bo bo sung sau.

    personal_id KHONG kiem o day: create_detainee da tu kiem (bat buoc + chong
    trung), con update_detainee cho phep de trong. Kiem lai o day se lam hong
    duong sua ho so.

    Anh CCCD mat truoc KHONG con bat buoc: mau chi bản moi bo han khoi anh the,
    photos["cccd_front"] gio chi co khi doc duoc chip the — khong the lam dieu
    kien chan luu.
    """
    missing = []
    if not body.cccd_number:
        missing.append("Số CCCD (12 chữ số)")
    if missing:
        raise HTTPException(400, "Thiếu thông tin bắt buộc: " + ", ".join(missing))


# ---------------------------------------------------------------------------
# Duplicate check
# ---------------------------------------------------------------------------

async def find_duplicates(full_name: str, dob: Optional[str], gender: str, exclude_id: Optional[str] = None) -> List[dict]:
    if not full_name:
        return []
    q = {"full_name": full_name.strip(), "gender": gender}
    if dob:
        q["dob"] = dob
    if exclude_id:
        q["_id"] = {"$ne": parse_object_id(exclude_id)}
    return [serialize_doc(d) async for d in database.db.detainees.find(q).limit(5)]


# ---------------------------------------------------------------------------
# Audit logging
# ---------------------------------------------------------------------------

async def audit_log(request: Request, user: dict, action: str, resource: str, ref: str = "", data: dict = None, ref_id: str = "", session_id=None):
    """Ghi audit log vào database."""
    try:
        entry = {
            "at": datetime.utcnow(),
            "actor": user["username"],
            "action": action,
            "resource": resource,
            "ref": ref,
            "ref_id": ref_id,
            "ip": (request.client.host if request and request.client else ""),
            "data": data or {},
            "session_id": session_id,
        }
        await database.db.audit_logs.insert_one(entry)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# File path resolution
# ---------------------------------------------------------------------------

def resolve_upload_path(url: str) -> str | None:
    """Map URL '/uploads/...' → đường dẫn file local. Trả None nếu không phải URL local."""
    if not url or not url.startswith("/uploads/"):
        return None
    rel = url[len("/uploads/"):]
    path = os.path.join(UPLOAD_DIR, rel.replace("/", os.sep))
    return path if os.path.isfile(path) else None


# ---------------------------------------------------------------------------
# Session counter
# ---------------------------------------------------------------------------

async def next_session_code() -> str:
    """Sinh mã phiên tự động: S{YYYYMMDD}-{NNNN}."""
    today = datetime.utcnow().strftime("%Y%m%d")
    counter_id = f"session_code_{today}"
    doc = await database.db.counters.find_one_and_update(
        {"_id": counter_id},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = doc["seq"] if doc else 1
    return f"S{today}-{seq:04d}"


async def next_cell_code() -> str:
    """Sinh mã buồng tự động: BG{NNN}."""
    doc = await database.db.counters.find_one_and_update(
        {"_id": "cell_code"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = doc["seq"] if doc else 1
    return f"BG{seq:03d}"


async def next_cell_code_by_level(level: str, parent: Optional[str]) -> str:
    """Sinh mã tự động theo cấp, đảm bảo duy nhất trong collection cells."""
    prefix_map = {"facility": "CS", "sub_camp": "PT", "cell": "BG"}
    counter_id = f"cell_code_{prefix_map.get(level, 'X')}"
    doc = await database.db.counters.find_one_and_update(
        {"_id": counter_id},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = doc["seq"] if doc else 1
    return f"{prefix_map.get(level, 'X')}{seq:03d}"


async def get_open_session_or_none(username: str) -> Optional[dict]:
    """Tìm phiên đang mở của cán bộ, trả None nếu không có."""
    return await database.db.work_sessions.find_one({"officer": username, "status": "open"})


# Fields trả về đủ để hiển thị modal cảnh báo, KHÔNG kèm template/ảnh nặng.
MATCH_PROJECTION = {
    "personal_id": 1, "full_name": 1, "cccd_number": 1, "gender": 1, "dob": 1,
    "cell_code": 1, "custody_type": 1, "facility_code": 1, "sub_camp_code": 1,
    "charge": 1, "hometown": 1, "address": 1,
    "photos.portrait_front": 1, "photos.cccd_front": 1,
    "created_at": 1, "created_by": 1,
}
