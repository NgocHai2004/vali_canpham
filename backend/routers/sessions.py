"""Session routes — CRUD, close, report, sync-log, sheets."""

import io
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from openpyxl import Workbook

from config import REPORTS_DIR, SYNC_REMOTE
from models import WorkSessionIn, SyncLogBody
from auth import get_current_user
from helpers import (
    parse_object_id, serialize_doc, serialize_session, audit_log,
    ensure_session_editable, parse_dt, next_session_code,
    get_open_session_or_none,
)
import database

router = APIRouter()


# ---------------------------------------------------------------------------
# Session place validation
# ---------------------------------------------------------------------------

async def _resolve_session_place(body: WorkSessionIn) -> dict:
    """Kiểm tra + chuẩn hoá nơi giam giữ của phiên (diện / cơ sở / phân trại / buồng).

    Cả 4 trường đều tuỳ chọn để phiên cũ (và client cũ) vẫn mở được. Nhưng khi đã
    gửi thì phải khớp nhau, vì hồ sơ trong phiên sẽ lấy y nguyên các giá trị này:
    một buồng gán sai cơ sở sẽ làm mọi hồ sơ của phiên nằm sai chỗ, và đó là loại
    sai không ai phát hiện lúc nhập.

    Quan hệ được kiểm theo đúng cây của collection cells (xem create_cell):
    buồng -> cha là phân trại HOẶC cơ sở (Nhà tạm giữ không có phân trại).
    """
    custody = (body.custody_type or "").strip() or None
    facility = (body.facility_code or "").strip() or None
    sub_camp = (body.sub_camp_code or "").strip() or None
    cell = (body.cell_code or "").strip() or None

    # Buồng/phân trại không thể đứng một mình: không có cơ sở thì không biết chúng
    # thuộc đâu, và hồ sơ sẽ thiếu facility_code.
    if (cell or sub_camp) and not facility:
        raise HTTPException(400, "Chọn cơ sở giam giữ trước khi chọn phân trại/buồng.")

    fac_doc = None
    if facility:
        fac_doc = await database.db.cells.find_one({"code": facility, "level": "facility"})
        if not fac_doc:
            raise HTTPException(400, f"Cơ sở giam giữ '{facility}' không tồn tại.")
        # Diện là thuộc tính của cơ sở => lấy theo cơ sở, không tin giá trị client
        # gửi lên. Client gửi lệch thì báo lỗi thay vì âm thầm ghi sai.
        if custody and fac_doc.get("custody_type") != custody:
            raise HTTPException(
                400,
                f"Cơ sở '{fac_doc.get('name', facility)}' thuộc diện khác với diện đã chọn.",
            )
        custody = fac_doc.get("custody_type") or custody

    if sub_camp:
        sc_doc = await database.db.cells.find_one({"code": sub_camp, "level": "sub_camp"})
        if not sc_doc:
            raise HTTPException(400, f"Phân trại '{sub_camp}' không tồn tại.")
        if sc_doc.get("parent") != facility:
            raise HTTPException(400, "Phân trại không thuộc cơ sở giam giữ đã chọn.")

    if cell:
        cell_doc = await database.db.cells.find_one({"code": cell, "level": "cell"})
        if not cell_doc:
            raise HTTPException(400, f"Buồng '{cell}' không tồn tại.")
        parent = cell_doc.get("parent")
        # Cha hợp lệ: phân trại đã chọn, hoặc chính cơ sở (trường hợp Nhà tạm giữ).
        expected = {p for p in (sub_camp, facility) if p}
        if parent not in expected:
            raise HTTPException(400, "Buồng không thuộc cơ sở/phân trại đã chọn.")

    return {
        "custody_type": custody,
        "facility_code": facility,
        "sub_camp_code": sub_camp,
        "cell_code": cell,
    }


# ---------------------------------------------------------------------------
# Report builder
# ---------------------------------------------------------------------------

async def _build_session_report_xlsx(session_doc: dict) -> tuple[str, str]:
    wb = Workbook()
    ws1 = wb.active
    ws1.title = "Thông tin phiên"
    opened = session_doc.get("opened_at")
    closed = session_doc.get("closed_at")

    def _fmt_dt(dt):
        return dt.strftime("%d/%m/%Y %H:%M") if isinstance(dt, datetime) else ""

    rows = [
        ["PHIẾU BÁO CÁO PHIÊN LÀM VIỆC"],
        [],
        ["Mã phiên:", session_doc.get("code", "")],
        ["Cán bộ:", session_doc.get("officer_full_name", "") or session_doc.get("officer", "")],
        ["Địa điểm:", session_doc.get("location", "") or ""],
        ["Ghi chú:", session_doc.get("note", "") or ""],
        ["Mở lúc:", _fmt_dt(opened)],
        ["Đóng lúc:", _fmt_dt(closed)],
        ["Tổng hồ sơ:", session_doc.get("detainee_count", 0)],
    ]
    for r in rows:
        ws1.append(r)
    ws1.column_dimensions["A"].width = 18
    ws1.column_dimensions["B"].width = 42

    ws2 = wb.create_sheet("Danh sách hồ sơ")
    headers = ["STT", "Số định danh", "Họ và tên", "Giới tính", "Ngày sinh", "Số CCCD", "Quê quán", "Buồng", "Ghi chú"]
    ws2.append(headers)
    i = 0
    async for d in database.db.detainees.find({"session_id": session_doc["_id"]}).sort("created_at", 1):
        i += 1
        dob_str = d.get("dob") or ""
        gender = "Nam" if d.get("gender") == "male" else "Nữ"
        ws2.append([
            i,
            d.get("personal_id", "") or d.get("cccd_number", "") or "",
            d.get("full_name", ""),
            gender,
            dob_str,
            d.get("cccd_number", "") or "",
            d.get("hometown", "") or "",
            d.get("cell_code", "") or session_doc.get("cell_code", "") or "",
            d.get("note", "") or "",
        ])
    for col in ws2.columns:
        letter = col[0].column_letter
        ws2.column_dimensions[letter].width = 18

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"session_{session_doc.get('code','')}_{ts}.xlsx"
    filepath = os.path.join(REPORTS_DIR, filename)
    wb.save(filepath)
    return filepath, filename


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/api/sessions")
async def open_session(body: WorkSessionIn, request: Request, user: dict = Depends(get_current_user)):
    officer_username = user["username"]
    # Quản trị hệ thống không đi thu nhận can phạm → không mở phiên làm việc.
    # Admin vẫn xem/đóng/xoá phiên + tải báo cáo của cán bộ (vai giám sát).
    if user.get("role") == "admin":
        raise HTTPException(403, "Tài khoản quản trị hệ thống không mở phiên thu nhận. Phiên làm việc do cán bộ thu nhận mở.")
    existing = await get_open_session_or_none(officer_username)
    if existing:
        raise HTTPException(409, f"Bạn đang có 1 phiên đang mở ({existing.get('code','?')}). Đóng phiên đó trước khi mở phiên mới.")
    officer_doc = await database.db.users.find_one({"username": officer_username}) or {}
    default_full_name = officer_doc.get("full_name", "") or officer_username
    override = (body.officer_full_name or "").strip()
    # Kiểm tra nơi giam giữ TRƯỚC khi sinh mã phiên: _next_session_code() tăng
    # counter và không hoàn lại được, nên nếu để sau thì mỗi lần chọn buồng sai là
    # đốt một số thứ tự, và dãy mã phiên trong ngày bị khuyết lỗ.
    place = await _resolve_session_place(body)
    now = datetime.utcnow()
    doc = {
        "code": await next_session_code(),
        "status": "open",
        "officer": officer_username,
        "officer_full_name": override or default_full_name,
        "location": body.location.strip() or "Trung tâm thu thập dữ liệu",
        "note": body.note.strip(),
        "opened_at": now,
        "closed_at": None,
        "detainee_count": 0,
        "report_url": None,
        "report_filename": None,
        **place,
    }
    res = await database.db.work_sessions.insert_one(doc)
    doc["_id"] = res.inserted_id
    await audit_log(request, user, "create", "work_session", doc["code"], ref_id=str(res.inserted_id), session_id=res.inserted_id)
    return serialize_session(doc)


@router.get("/api/sessions/current")
async def get_current_session(user: dict = Depends(get_current_user)):
    # Admin không chạy phiên → luôn coi như không có phiên đang mở, kể cả khi
    # dữ liệu cũ còn phiên do admin mở từ trước.
    if user.get("role") == "admin":
        raise HTTPException(404, "Tài khoản quản trị hệ thống không có phiên làm việc.")
    doc = await get_open_session_or_none(user["username"])
    if not doc:
        raise HTTPException(404, "Bạn chưa có phiên làm việc nào đang mở.")
    return serialize_session(doc)


@router.get("/api/sessions/full")
async def list_sessions_full(
    status: Optional[str] = Query(None, pattern=r"^(open|closed)$"),
    mine_only: bool = Query(False),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    include_detainees: bool = Query(True),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    """Trả về đầy đủ thông tin các phiên làm việc (cả đang mở lẫn đã đóng)
    kèm danh sách hồ sơ can phạm bên trong mỗi phiên."""
    filt: dict = {}
    if status:
        filt["status"] = status
    if mine_only or user.get("role") != "admin":
        filt["officer"] = user["username"]
    dt_from = parse_dt(date_from)
    dt_to = parse_dt(date_to)
    if dt_from or dt_to:
        rng: dict = {}
        if dt_from:
            rng["$gte"] = dt_from
        if dt_to:
            rng["$lte"] = dt_to
        filt["opened_at"] = rng

    total = await database.db.work_sessions.count_documents(filt)
    open_count = await database.db.work_sessions.count_documents({**filt, "status": "open"})
    closed_count = await database.db.work_sessions.count_documents({**filt, "status": "closed"})

    items: list[dict] = []
    async for s in database.db.work_sessions.find(filt).sort("opened_at", -1).skip(skip).limit(limit):
        row = serialize_session(s)
        officer_doc = await database.db.users.find_one({"username": s.get("officer")}) or {}
        row["officer_info"] = {
            "username": s.get("officer", ""),
            "full_name": officer_doc.get("full_name") or s.get("officer_full_name") or s.get("officer", ""),
            "avatar_url": officer_doc.get("avatar_url", "") or "",
            "role": officer_doc.get("role", ""),
        }
        opened = s.get("opened_at")
        closed = s.get("closed_at")
        duration_seconds = None
        if isinstance(opened, datetime):
            end = closed if isinstance(closed, datetime) else datetime.utcnow()
            duration_seconds = int((end - opened).total_seconds())
        row["duration_seconds"] = duration_seconds

        if include_detainees:
            detainees = []
            async for d in database.db.detainees.find({"session_id": s["_id"]}).sort("created_at", 1):
                detainees.append({
                    "id": str(d["_id"]),
                    "personal_id": d.get("personal_id", "") or d.get("cccd_number", "") or "",
                    "full_name": d.get("full_name", ""),
                    "cccd_number": d.get("cccd_number", "") or "",
                    "gender": d.get("gender", "male"),
                    "dob": d.get("dob") or None,
                    "nationality": d.get("nationality", "") or "",
                    "ethnicity": d.get("ethnicity", "") or "",
                    "religion": d.get("religion", "") or "",
                    "hometown": d.get("hometown", "") or "",
                    "address": d.get("address", "") or "",
                    "temp_address": d.get("temp_address", "") or "",
                    "current_address": d.get("current_address", "") or "",
                    "occupation": d.get("occupation", "") or "",
                    "father_name": d.get("father_name", "") or "",
                    "mother_name": d.get("mother_name", "") or "",
                    "case_about": d.get("case_about", "") or "",
                    "issued_date": d["issued_date"].isoformat() if isinstance(d.get("issued_date"), datetime) else None,
                    "expiry_date": d.get("expiry_date") or None,
                    "height_cm": d.get("height_cm"),
                    "weight_kg": d.get("weight_kg"),
                    "cell_code": d.get("cell_code", "") or "",
                    "charge": d.get("charge", "") or "",
                    "date_in": d.get("date_in") or None,
                    "note": d.get("note", "") or "",
                    "photos": d.get("photos") or {},
                    "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else None,
                    "updated_at": d["updated_at"].isoformat() if isinstance(d.get("updated_at"), datetime) else None,
                    "created_by": d.get("created_by", ""),
                })
            row["detainees"] = detainees
            row["detainee_count"] = row.get("detainee_count", len(detainees))
        items.append(row)

    return {
        "total": total,
        "open_count": open_count,
        "closed_count": closed_count,
        "skip": skip,
        "limit": limit,
        "items": items,
    }


@router.get("/api/sessions")
async def list_sessions(
    status: Optional[str] = Query(None, pattern=r"^(open|closed)$"),
    mine_only: bool = Query(False),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    filt: dict = {}
    if status:
        filt["status"] = status
    if mine_only or user.get("role") != "admin":
        filt["officer"] = user["username"]
    dt_from = parse_dt(date_from)
    dt_to = parse_dt(date_to)
    if dt_from or dt_to:
        rng: dict = {}
        if dt_from:
            rng["$gte"] = dt_from
        if dt_to:
            rng["$lte"] = dt_to
        filt["opened_at"] = rng
    total = await database.db.work_sessions.count_documents(filt)
    items = [
        serialize_session(d)
        async for d in database.db.work_sessions.find(filt).sort("opened_at", -1).skip(skip).limit(limit)
    ]
    return {"total": total, "items": items, "skip": skip, "limit": limit}


@router.get("/api/sessions/{session_id}")
async def get_session_detail(session_id: str, user: dict = Depends(get_current_user)):
    doc = await database.db.work_sessions.find_one({"_id": parse_object_id(session_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy phiên làm việc.")
    if doc.get("officer") != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Bạn không có quyền xem phiên này.")
    detainees = []
    fp_keys = ["fp_l1", "fp_l2", "fp_l3", "fp_l4", "fp_l5", "fp_r1", "fp_r2", "fp_r3", "fp_r4", "fp_r5"]
    async for d in database.db.detainees.find({"session_id": doc["_id"]}).sort("created_at", 1):
        photos = d.get("photos") or {}
        has_portrait = bool(d.get("photo_url") or photos.get("portrait_front"))
        fp_missing = set(photos.get("fp_missing") or [])
        has_fingerprints = bool(
            any(photos.get(k) for k in fp_keys)
            or bool(photos.get("fp_templates"))
            or bool(photos.get("plain_left_four") and photos.get("plain_right_four"))
            or (len(fp_missing) == 10)
        )
        detainees.append({
            "id": str(d["_id"]),
            "code": d.get("code", ""),
            "personal_id": d.get("personal_id", "") or "",
            "full_name": d.get("full_name", ""),
            "cccd_number": d.get("cccd_number", "") or "",
            "gender": d.get("gender", "male"),
            "dob": (d["dob"].isoformat() if isinstance(d.get("dob"), datetime) else d.get("dob")) or None,
            "cell_code": d.get("cell_code", "") or "",
            "hometown": d.get("hometown", "") or "",
            "address": d.get("address", "") or "",
            "nationality": d.get("nationality", "") or "",
            "ethnicity": d.get("ethnicity", "") or "",
            "photo_url": d.get("photo_url", "") or "",
            "has_portrait": has_portrait,
            "has_fingerprints": has_fingerprints,
            "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else None,
        })
    out = serialize_session(doc)
    out["detainees"] = detainees
    return out


@router.get("/api/sessions/{session_id}/sheets")
async def get_session_sheets(session_id: str, user: dict = Depends(get_current_user)):
    """Toan bo can pham (du lieu day du + photos) cua mot phien — de in toan bo
    Chi ban / Danh ban khi phien da dong. Khac get_session_detail (chi tra field
    gon cho bang), endpoint nay tra nguyen doc de render hai to mau giay.

    Bo photos.face_embedding: vector nhan dang lon, khong can cho viec in, va
    khong nen phoi ra ngoai khi chi de in giay.
    """
    doc = await database.db.work_sessions.find_one({"_id": parse_object_id(session_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy phiên làm việc.")
    if doc.get("officer") != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Bạn không có quyền xem phiên này.")
    detainees = []
    async for d in database.db.detainees.find({"session_id": doc["_id"]}).sort("created_at", 1):
        row = serialize_doc(d)
        photos = row.get("photos")
        if isinstance(photos, dict):
            photos.pop("face_embedding", None)
        detainees.append(row)
    return {"session": serialize_session(doc), "detainees": detainees}


@router.post("/api/sessions/{session_id}/sync-log")
async def log_session_sync(
    session_id: str,
    body: SyncLogBody,
    request: Request,
    user: dict = Depends(get_current_user),
):
    doc = await database.db.work_sessions.find_one({"_id": parse_object_id(session_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy phiên làm việc")
    if doc.get("officer") != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Bạn không có quyền ghi log cho phiên này.")

    def _pack(items):
        return [
            {
                "code": it.code,
                "full_name": it.full_name,
                "cccd_number": it.cccd_number,
            }
            for it in items
        ]

    data = {
        "added": int(body.added or 0),
        "updated": int(body.updated or 0),
        "duplicated": int(body.duplicated or 0),
        "failed": int(body.failed or 0),
        "added_items": _pack(body.added_items),
        "updated_items": _pack(body.updated_items),
        "duplicate_items": _pack(body.duplicate_items),
        "failed_items": _pack(body.failed_items),
        "remote": body.remote or SYNC_REMOTE,
    }
    if body.error:
        data["error"] = body.error
    await audit_log(
        request,
        user,
        "sync",
        "work_session",
        doc.get("code", ""),
        data,
        ref_id=session_id,
        session_id=doc["_id"],
    )
    return {"ok": True}


@router.post("/api/sessions/{session_id}/close")
async def close_session(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    doc = await database.db.work_sessions.find_one({"_id": parse_object_id(session_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy phiên làm việc.")
    if doc.get("officer") != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Bạn không có quyền đóng phiên này.")
    if doc.get("status") != "open":
        raise HTTPException(409, "Phiên này đã đóng.")
    now = datetime.utcnow()
    await database.db.work_sessions.update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "status": "closed",
            "closed_at": now,
        }},
    )
    await audit_log(
        request, user, "update", "work_session", doc.get("code", ""),
        {"action": "close", "detainee_count": doc.get("detainee_count", 0)},
        ref_id=session_id, session_id=doc["_id"],
    )
    return {"ok": True, "closed_at": now.isoformat()}


@router.get("/api/sessions/{session_id}/report")
async def download_session_report(session_id: str, user: dict = Depends(get_current_user)):
    doc = await database.db.work_sessions.find_one({"_id": parse_object_id(session_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy phiên làm việc.")
    if doc.get("officer") != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Bạn không có quyền tải báo cáo phiên này.")
    _, filename = await _build_session_report_xlsx(doc)
    filepath = os.path.join(REPORTS_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(500, "Tạo báo cáo thất bại.")
    with open(filepath, "rb") as f:
        data = f.read()
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    doc = await database.db.work_sessions.find_one({"_id": parse_object_id(session_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy phiên làm việc.")
    if doc.get("officer") != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Bạn không có quyền xoá phiên này.")
    if doc.get("status") != "open" and user.get("role") != "admin":
        raise HTTPException(400, "Chỉ có thể xoá phiên đang mở, chưa đóng.")
    # Xoá toàn bộ hồ sơ can phạm thuộc phiên này
    cursor = database.db.detainees.find({"session_id": doc["_id"]}, {"personal_id": 1})
    deleted_count = 0
    async for d in cursor:
        await database.db.detainees.delete_one({"_id": d["_id"]})
        deleted_count += 1
        await audit_log(request, user, "delete", "detainee", d.get("personal_id", str(d["_id"])), ref_id=str(d["_id"]), session_id=doc["_id"])
    await database.db.work_sessions.delete_one({"_id": doc["_id"]})
    await audit_log(request, user, "delete", "work_session", doc.get("code", ""), ref_id=session_id, session_id=doc["_id"], data={"deleted_detainees": deleted_count})
    return {"ok": True, "deleted_detainees": deleted_count}
