"""Detainee routes — CRUD, check-cccd, check-duplicate, transfer, by-personal-id."""

import re
from datetime import datetime
from typing import Optional

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query, Request

import face_recognition_service
from models import DetaineeIn, TransferBody
from auth import get_current_user
from helpers import (
    parse_object_id, serialize_doc, scope_filter, audit_log,
    ensure_can_touch, ensure_session_editable, parse_dob,
    require_capture_fields, find_duplicates, resolve_upload_path,
    MATCH_PROJECTION,
)
import database

router = APIRouter()


# ---------------------------------------------------------------------------
# Face embedding helper (lives here because it's used only by detainee CRUD)
# ---------------------------------------------------------------------------

async def _compute_face_embedding(portrait_url: str) -> list[float] | None:
    """Tính embedding 512d từ ảnh portrait_front (URL local /uploads/...).

    Trả None nếu model chưa ready / không detect mặt / URL ngoài. Không raise.
    """
    if not portrait_url or not face_recognition_service.is_ready():
        return None
    path = resolve_upload_path(portrait_url)
    if not path:
        return None
    try:
        with open(path, "rb") as f:
            img_bytes = f.read()
        emb, _n, _m = await anyio.to_thread.run_sync(
            face_recognition_service.get_embedding, img_bytes
        )
        if emb is None:
            return None
        return [float(x) for x in emb.tolist()]
    except Exception:  # noqa: BLE001
        return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/api/detainees")
async def list_detainees(
    q: str = Query("", alias="q"),
    cell_code: str = Query(""),
    gender: str = Query(""),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    filt = scope_filter(user)
    if q:
        rx = re.escape(q.strip())
        filt["$or"] = [
            {"full_name": {"$regex": rx, "$options": "i"}},
            {"cccd_number": {"$regex": rx, "$options": "i"}},
            {"personal_id": {"$regex": rx, "$options": "i"}},
        ]
    if cell_code:
        filt["cell_code"] = cell_code
    if gender:
        filt["gender"] = gender
    total = await database.db.detainees.count_documents(filt)
    items = [
        serialize_doc(d)
        async for d in database.db.detainees.find(filt).sort("created_at", -1).skip(skip).limit(limit)
    ]
    return {"total": total, "items": items, "skip": skip, "limit": limit}


# CHÚ Ý thứ tự route: các route TĨNH (check-cccd, check-duplicate) phải khai báo
# TRƯỚC route động "/api/detainees/{det_id}", nếu không FastAPI sẽ coi "check-cccd"
# là det_id và ném "invalid id" (route match theo thứ tự khai báo).
@router.get("/api/detainees/check-cccd")
async def check_cccd(
    cccd_number: str = Query("", min_length=1),
    user: dict = Depends(get_current_user),
):
    """Kiểm tra 1 số CCCD đã có trong hệ thống chưa (tra cứu toàn hệ thống,
    KHÔNG lọc theo người đăng ký — dùng cảnh báo "đối tượng có trong danh sách").

    Trả về hồ sơ đầu tiên khớp exact số CCCD, hoặc matched=false nếu chưa có.
    """
    cccd = re.sub(r"\D", "", cccd_number or "")
    if not cccd:
        raise HTTPException(400, "Thiếu số CCCD.")
    doc = await database.db.detainees.find_one(
        {"cccd_number": cccd},
        MATCH_PROJECTION,
    )
    return {"matched": doc is not None, "detainee": serialize_doc(doc) if doc else None}


@router.post("/api/detainees/check-duplicate")
async def check_duplicate(body: DetaineeIn, user: dict = Depends(get_current_user)):
    dob = parse_dob(body.dob)
    dups = await find_duplicates(body.full_name, dob, body.gender)
    return {"count": len(dups), "duplicates": dups}


@router.get("/api/detainees/{det_id}")
async def get_detainee(det_id: str, user: dict = Depends(get_current_user)):
    doc = await database.db.detainees.find_one({"_id": parse_object_id(det_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    ensure_can_touch(doc, user)
    return serialize_doc(doc)


@router.post("/api/detainees")
async def create_detainee(body: DetaineeIn, request: Request, user: dict = Depends(get_current_user)):
    # Quản trị hệ thống không đi thu nhận can phạm → không TẠO hồ sơ mới.
    # Vẫn giữ quyền SỬA/XOÁ hồ sơ để chữa dữ liệu cán bộ nhập sai.
    if user.get("role") == "admin":
        raise HTTPException(403, "Tài khoản quản trị hệ thống không thu nhận hồ sơ. Việc này do cán bộ thu nhận thực hiện.")
    if not body.session_id:
        raise HTTPException(400, "Bạn phải mở 1 phiên làm việc trước khi tạo hồ sơ.")
    session_doc = await database.db.work_sessions.find_one({"_id": parse_object_id(body.session_id)})
    if not session_doc:
        raise HTTPException(400, "Phiên làm việc không tồn tại.")
    is_admin = user.get("role") == "admin"
    ensure_session_editable(session_doc, user["username"], is_admin)
    require_capture_fields(body)
    dob = parse_dob(body.dob)
    now = datetime.utcnow()

    personal_id = (body.personal_id or "").strip()
    if not personal_id:
        raise HTTPException(400, "Thiếu mã can phạm (personal_id).")
    if await database.db.detainees.find_one({"personal_id": personal_id}):
        raise HTTPException(400, f"Mã can phạm '{personal_id}' đã có trong hệ thống.")

    doc = body.model_dump()
    doc.pop("session_id", None)
    doc.update({
        "personal_id": personal_id,
        "cccd_number": body.cccd_number or "",
        "dob": dob,
        "date_in": parse_dob(body.date_in),
        "issued_date": parse_dob(body.issued_date),
        "expiry_date": parse_dob(body.expiry_date),
        "created_at": now,
        "updated_at": now,
        "created_by": user["username"],
        "session_id": session_doc["_id"],
    })
    try:
        res = await database.db.detainees.insert_one(doc)
    except Exception as e:
        if "duplicate key" in str(e):
            raise HTTPException(400, f"Số định danh '{personal_id}' đã tồn tại (đồng thời), vui lòng thử lại.")
        raise
    doc["_id"] = res.inserted_id
    await database.db.work_sessions.update_one(
        {"_id": session_doc["_id"]},
        {"$inc": {"detainee_count": 1}, "$set": {"updated_at": now}},
    )
    # Face embedding từ portrait_front (nếu có ảnh local + model ready)
    portrait_url = (doc.get("photos") or {}).get("portrait_front") or ""
    fe = await _compute_face_embedding(portrait_url)
    if fe:
        await database.db.detainees.update_one({"_id": doc["_id"]}, {"$set": {"photos.face_embedding": fe}})
        doc.setdefault("photos", {})["face_embedding"] = fe
    await audit_log(request, user, "create", "detainee", personal_id, {"full_name": body.full_name, "session": session_doc.get("code")}, ref_id=str(res.inserted_id), session_id=session_doc["_id"])
    return serialize_doc(doc)


@router.patch("/api/detainees/{det_id}")
async def update_detainee(det_id: str, body: DetaineeIn, request: Request, user: dict = Depends(get_current_user)):
    existing = await database.db.detainees.find_one({"_id": parse_object_id(det_id)})
    if not existing:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    ensure_can_touch(existing, user)
    sid = existing.get("session_id")
    if sid is not None:
        session_doc = await database.db.work_sessions.find_one({"_id": sid})
        if session_doc and session_doc.get("status") != "open":
            raise HTTPException(403, "Hồ sơ này thuộc phiên đã đóng, không thể chỉnh sửa.")
    upd = body.model_dump()
    upd.pop("session_id", None)
    upd["dob"] = parse_dob(body.dob)
    upd["date_in"] = parse_dob(body.date_in)
    upd["issued_date"] = parse_dob(body.issued_date)
    upd["expiry_date"] = parse_dob(body.expiry_date)
    new_pid = (body.personal_id or "").strip()
    if new_pid:
        conflict = await database.db.detainees.find_one({"personal_id": new_pid, "_id": {"$ne": parse_object_id(det_id)}})
        if conflict:
            raise HTTPException(400, f"Mã can phạm '{new_pid}' đã có trong hồ sơ khác.")
        upd["personal_id"] = new_pid
        upd["cccd_number"] = body.cccd_number or upd.get("cccd_number", "")
    upd["updated_at"] = datetime.utcnow()
    doc = await database.db.detainees.find_one_and_update({"_id": parse_object_id(det_id)}, {"$set": upd}, return_document=True)
    # Cập nhật face_embedding nếu portrait_front thay đổi
    portrait_url = (doc.get("photos") or {}).get("portrait_front") or ""
    fe = await _compute_face_embedding(portrait_url)
    if fe:
        await database.db.detainees.update_one({"_id": parse_object_id(det_id)}, {"$set": {"photos.face_embedding": fe}})
        doc.setdefault("photos", {})["face_embedding"] = fe
    elif not portrait_url:
        # Portrait bị xoá → xoá embedding cũ
        await database.db.detainees.update_one({"_id": parse_object_id(det_id)}, {"$unset": {"photos.face_embedding": ""}})
    await audit_log(request, user, "update", "detainee", doc.get("personal_id", det_id), {"full_name": body.full_name}, ref_id=det_id, session_id=doc.get("session_id"))
    return serialize_doc(doc)


@router.delete("/api/detainees/{det_id}")
async def delete_detainee(det_id: str, request: Request, user: dict = Depends(get_current_user)):
    doc = await database.db.detainees.find_one({"_id": parse_object_id(det_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    ensure_can_touch(doc, user)
    sid = doc.get("session_id")
    if sid is not None:
        session_doc = await database.db.work_sessions.find_one({"_id": sid})
        if session_doc and session_doc.get("status") != "open":
            raise HTTPException(403, "Hồ sơ này thuộc phiên đã đóng, không thể xoá.")
    await database.db.detainees.delete_one({"_id": parse_object_id(det_id)})
    if sid is not None:
        await database.db.work_sessions.update_one(
            {"_id": sid},
            {"$inc": {"detainee_count": -1}, "$set": {"updated_at": datetime.utcnow()}},
        )
    await audit_log(request, user, "delete", "detainee", doc.get("personal_id", det_id), ref_id=det_id, session_id=sid)
    return {"ok": True}


@router.get("/api/detainees/by-personal-id/{personal_id}")
async def get_detainee_by_personal_id(personal_id: str, user: dict = Depends(get_current_user)):
    doc = await database.db.detainees.find_one({"personal_id": personal_id})
    if not doc:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    ensure_can_touch(doc, user)
    return serialize_doc(doc)


@router.post("/api/detainees/{det_id}/transfer")
async def transfer_detainee(det_id: str, body: TransferBody, request: Request, user: dict = Depends(get_current_user)):
    doc = await database.db.detainees.find_one({"_id": parse_object_id(det_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    ensure_can_touch(doc, user)
    new_code = (body.cell_code or "").strip()
    if new_code and not await database.db.cells.find_one({"code": new_code}):
        raise HTTPException(400, f"Buồng {new_code} không tồn tại")
    old_code = doc.get("cell_code") or ""
    if old_code == new_code:
        raise HTTPException(400, "Can phạm đã ở buồng này")
    await database.db.detainees.update_one(
        {"_id": parse_object_id(det_id)},
        {"$set": {"cell_code": new_code or None, "updated_at": datetime.utcnow()}},
    )
    await audit_log(
        request, user, "update", "detainee", doc.get("personal_id", det_id),
        {"transfer": {"from": old_code, "to": new_code}}, ref_id=det_id,
    )
    return {"ok": True, "from": old_code, "to": new_code}
