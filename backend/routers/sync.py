"""Sync routes — xuất gói dữ liệu ra USB và nhận gói từ USB vào DB.

Luồng nghiệp vụ (máy kiosk không nối mạng):
    máy A: tick phiên -> "Xuất dữ liệu" -> ghi file .vcpkg ra USB
    rút USB, cắm sang máy B
    máy B: "Thêm dữ liệu" -> chọn gói trên USB -> kiểm hợp lệ -> ghi DB

GHI DB KHÔNG DÙNG TRANSACTION
-----------------------------
MongoDB ở đây chạy standalone (không phải replica set) nên `start_transaction` không
gọi được. Bù lại, mỗi lần nhập ghi kèm một doc vào collection `sync_imports` chứa
BẢN GỐC ĐẦY ĐỦ của từng bản ghi trước khi sửa. Nhờ vậy:
  - hỏng giữa chừng vẫn hoàn tác được (POST /import-package/rollback)
  - mọi lần nhập đều còn dấu vết, thứ mà transaction thuần không để lại
Đánh đổi: hoàn tác là thao tác riêng phải gọi, không tự động như transaction thật.

QUY TẮC KHỚP BẢN GHI (quan trọng — đọc trước khi sửa)
-----------------------------------------------------
`code` của cả phiên lẫn hồ sơ đều do `next_*` sinh TẠI MÁY, dạng S20260925-0001 /
CP00001. Hai máy chưa đồng bộ bao giờ cũng sinh ra cùng dãy này cho những người
KHÁC NHAU. Khớp theo `code` sẽ âm thầm ghi đè người này bằng người kia — nên KHÔNG
dùng `code` làm khoá khớp.

Hồ sơ: khớp theo `personal_id` (mã hồ sơ, có unique index, do người dùng nhập nên
       là danh tính thật) -> cập nhật. Khớp tiếp theo `cccd_number` (cùng một con
       người nhưng khác mã hồ sơ) -> BỎ QUA và báo xung đột, vì gộp hai hồ sơ của
       cùng một người là việc của con người, không phải của hàm import.
       Không khớp gì -> thêm mới.
Phiên: khớp theo `_id` của máy nguồn -> bỏ qua (đã có). Nếu không, khớp theo cặp
       (`code`, `officer`) -> bỏ qua. Cặp này an toàn hơn `code` đơn vì hai máy
       khác cán bộ thì không gộp nhầm. Không khớp -> thêm mới.
Phiên đã có thì KHÔNG ghi đè: bản ghi phiên gần như không chứa dữ liệu cần trộn,
mà ghi đè thì có nguy cơ mở lại một phiên đã đóng. Giá trị của gói nằm ở hồ sơ.
"""
from __future__ import annotations

import io
import os
import socket
import uuid
from datetime import datetime
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

import database
from auth import get_current_user
from config import DETAINEES_UPLOAD_DIR, DB_NAME, SYNC_PACKAGE_SECRET
from helpers import (
    audit_log,
    make_json_safe,
    resolve_upload_path,
    sanitize_folder_name,
)
from services import sync_package as sp

router = APIRouter(prefix="/api/sync", tags=["sync"])

# Tên collection THẬT trong MongoDB. Bản ghi phiên nằm ở `work_sessions`, không
# phải `sessions` (xem routers/sessions.py). Ghi nhầm tên thì bản ghi rơi vào một
# collection không ai đọc: nhập báo thành công mà phiên không hề xuất hiện trong
# ứng dụng, và lần nhập sau `_find_session` không thấy nó nên lại insert — lúc đó
# `_id` đã tồn tại (ở collection sai) nên insert ném lỗi trùng khoá.
SESSIONS_COLL = "work_sessions"
DETAINEES_COLL = "detainees"

# Các trường trong DB lưu kiểu datetime thật. Khi đi qua JSON chúng thành chuỗi ISO,
# nên lúc ghi lại phải đổi ngược — để nguyên chuỗi thì hồ sơ nhập về có `created_at`
# là string, và mọi chỗ sắp xếp / lọc theo ngày sẽ sai một cách im lặng.
# Danh sách này lấy từ việc quét kiểu dữ liệu thật của collection app_cccd.
_DT_FIELDS = ("created_at", "updated_at", "opened_at", "closed_at", "dob", "date_in")

# Trần kích thước gói nhận vào. Gói có ảnh nên phải rộng rãi, nhưng vẫn cần một
# trần: đọc cả file vào bộ nhớ nên không có trần là tự bắn vào chân.
_MAX_PACKAGE_BYTES = 512 * 1024 * 1024


# ---------------------------------------------------------------------------
# Tiện ích
# ---------------------------------------------------------------------------

def _maybe_oid(value) -> Optional[ObjectId]:
    try:
        return ObjectId(str(value))
    except (InvalidId, TypeError):
        return None


def _as_dt(value):
    """Chuỗi ISO / datetime -> datetime. Trả nguyên giá trị nếu không đọc được."""
    if value is None or isinstance(value, datetime):
        return value
    if not isinstance(value, str) or not value.strip():
        return value
    s = value.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f",
                "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return value


def _local_timestamp(doc: dict):
    for key in ("updated_at", "created_at", "opened_at"):
        val = _as_dt(doc.get(key))
        if isinstance(val, datetime):
            return val
    return None


def _local_newer(existing: dict, incoming: dict) -> bool:
    """Bản trên máy này có mới hơn bản trong gói không (để không ghi đè mất)."""
    a, b = _local_timestamp(existing), _local_timestamp(incoming)
    return bool(a and b and a > b)


async def _read_upload(file: UploadFile) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(4 * 1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > _MAX_PACKAGE_BYTES:
            raise HTTPException(413, "Gói dữ liệu lớn hơn 512 MB.")
        chunks.append(chunk)
    data = b"".join(chunks)
    if not data:
        raise HTTPException(400, "File rỗng.")
    return data


def _parse_or_error(raw: bytes):
    """Trả (ParsedPackage, None) hoặc (None, JSONResponse 400) mô tả đúng bước hỏng.

    Không dùng HTTPException vì `detail` của nó bị tầng gọi chung biến thành một
    chuỗi lỗi — frontend cần đọc được `step` để tô đúng bước trong modal tiến trình.
    """
    try:
        return sp.parse_package(raw, SYNC_PACKAGE_SECRET), None
    except sp.PackageError as e:
        return None, JSONResponse(
            status_code=400,
            content={"ok": False, "step": e.step, "message": e.message},
        )


def _strip_local_only(doc: dict) -> dict:
    """Bỏ trường nội bộ của máy nguồn trước khi ghi sang máy đích.

    Mọi khoá bắt đầu bằng "_" (ví dụ `_fake_seed` đánh dấu dữ liệu seed) là chuyện
    riêng của máy đã sinh ra bản ghi; mang sang máy khác là gán nhãn sai.
    """
    out = {k: v for k, v in doc.items() if k != "id" and not k.startswith("_")}
    oid = _maybe_oid(doc.get("id"))
    if oid:
        out["_id"] = oid
    for field in _DT_FIELDS:
        if field in out:
            out[field] = _as_dt(out[field])
    return out


# ---------------------------------------------------------------------------
# Xuất gói
# ---------------------------------------------------------------------------

@router.get("/export-package")
async def export_package(
    request: Request,
    session_ids: str = Query(..., description="Id các phiên, cách nhau dấu phẩy"),
    user: dict = Depends(get_current_user),
):
    """Đóng gói các phiên được chọn + hồ sơ thuộc các phiên đó, trả về file .vcpkg."""
    wanted = [oid for oid in (_maybe_oid(s) for s in session_ids.split(",") if s.strip()) if oid]
    if not wanted:
        raise HTTPException(400, "Không có phiên hợp lệ nào được chọn.")

    sess_filter: dict = {"_id": {"$in": wanted}}
    if user.get("role") != "admin":
        # Phiên không có trường created_by (xem scope_filter) — chủ sở hữu là `officer`.
        sess_filter["officer"] = user["username"]

    sessions = [doc async for doc in database.db.work_sessions.find(sess_filter)]
    if not sessions:
        raise HTTPException(404, "Không tìm thấy phiên nào (hoặc bạn không có quyền với phiên đó).")

    found_ids = [doc["_id"] for doc in sessions]
    det_filter: dict = {"session_id": {"$in": found_ids}}
    if user.get("role") != "admin":
        det_filter["created_by"] = user["username"]
    detainees = [doc async for doc in database.db.detainees.find(det_filter)]

    def read_upload(url: str) -> Optional[bytes]:
        path = resolve_upload_path(url)
        if not path:
            return None
        try:
            with open(path, "rb") as f:
                return f.read()
        except OSError:
            return None

    def to_json(doc: dict) -> dict:
        # make_json_safe đổi _id -> id, datetime -> chuỗi ISO. Làm ở đây (không dùng
        # serialize_doc) để giữ nguyên mọi trường, kể cả trường lạ của bản ghi cũ.
        return {k: make_json_safe(v) for k, v in doc.items() if k != "_id"} | {
            "id": str(doc["_id"])
        }

    raw, filename = sp.build_package(
        secret=SYNC_PACKAGE_SECRET,
        sessions=[to_json(d) for d in sessions],
        detainees=[to_json(d) for d in detainees],
        read_upload=read_upload,
        source={"db": DB_NAME, "device": socket.gethostname()},
    )

    await audit_log(
        request, user, "sync_export", "sync_package", ref=filename,
        data={
            "sessions": len(sessions),
            "detainees": len(detainees),
            "bytes": len(raw),
            "session_codes": [d.get("code", "") for d in sessions],
        },
    )

    return StreamingResponse(
        io.BytesIO(raw),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Khớp bản ghi
# ---------------------------------------------------------------------------

async def _find_session(doc: dict) -> Optional[dict]:
    oid = _maybe_oid(doc.get("id"))
    if oid:
        found = await database.db.work_sessions.find_one({"_id": oid})
        if found:
            return found
    code = (doc.get("code") or "").strip()
    officer = (doc.get("officer") or "").strip()
    if code and officer:
        # Cặp (code, officer) chứ không phải code đơn: xem ghi chú đầu file.
        return await database.db.work_sessions.find_one({"code": code, "officer": officer})
    return None


async def _find_detainee(doc: dict) -> tuple[Optional[dict], str]:
    """Trả (bản ghi local, lý do khớp). Lý do để báo cho người dùng biết vì sao bỏ qua."""
    pid = (doc.get("personal_id") or "").strip()
    if pid:
        found = await database.db.detainees.find_one({"personal_id": pid})
        if found:
            return found, "personal_id"
    cccd = str(doc.get("cccd_number") or "").strip()
    if cccd:
        found = await database.db.detainees.find_one({"cccd_number": cccd})
        if found:
            return found, "cccd_number"
    return None, ""


async def _build_plan(parsed: sp.ParsedPackage, mapping: Optional[dict]):
    """Quyết định từng bản ghi sẽ thêm / cập nhật / bỏ qua. KHÔNG ghi gì."""
    ops: list[dict] = []
    summary = {
        "sessions": {"new": 0, "update": 0, "skip": 0},
        "detainees": {"new": 0, "update": 0, "skip": 0},
        "items": [],
    }

    def note(kind: str, action: str, label: str, reason: str = ""):
        summary["items"].append({"kind": kind, "action": action, "label": label, "reason": reason})

    for doc in parsed.sessions:
        existing = await _find_session(doc)
        label = doc.get("code") or doc.get("id") or "?"
        if existing is None:
            summary["sessions"]["new"] += 1
            note("session", "new", label)
        else:
            # Không ghi đè phiên đã có — xem ghi chú đầu file.
            summary["sessions"]["skip"] += 1
            note("session", "skip", label, "phiên đã có trên máy này")
        ops.append({"coll": SESSIONS_COLL, "doc": doc, "existing": existing,
                    "action": "insert" if existing is None else "skip"})

    for doc in parsed.detainees:
        existing, matched_by = await _find_detainee(doc)
        label = doc.get("personal_id") or doc.get("full_name") or doc.get("id") or "?"
        if existing is None:
            action, reason = "insert", ""
            summary["detainees"]["new"] += 1
        elif matched_by == "cccd_number":
            # Cùng số CCCD nhưng khác mã hồ sơ: hai hồ sơ của cùng một người. Gộp
            # hay không là quyết định của con người, không tự làm.
            action, reason = "skip", "trùng số CCCD với hồ sơ khác trên máy này"
            summary["detainees"]["skip"] += 1
        elif _local_newer(existing, doc):
            action, reason = "skip", "bản trên máy này mới hơn gói"
            summary["detainees"]["skip"] += 1
        else:
            action, reason = "update", ""
            summary["detainees"]["update"] += 1
        note("detainee", "new" if action == "insert" else action, label, reason)
        ops.append({"coll": DETAINEES_COLL, "doc": doc, "existing": existing,
                    "action": action, "reason": reason})

    # `mapping is not None` (không phải `if mapping`): gói KHÔNG nhúng file nào là
    # trường hợp bình thường — hồ sơ không có ảnh thì `_extract_files` trả {} — mà
    # apply_package đọc `op["prepared"]` cho mọi op không "skip". Thiếu khoá đó là
    # KeyError('prepared') ngay khi gói đầu tiên thực sự cần ghi. Validate truyền
    # mapping=None nên vẫn không dựng prepared (đỡ làm việc vô ích).
    if mapping is not None:
        for op in ops:
            if op["action"] != "skip":
                op["prepared"] = _prepare_doc(op["doc"], mapping, op["existing"])
    return ops, summary


def _prepare_doc(doc: dict, mapping: dict, existing: Optional[dict]) -> dict:
    out = _strip_local_only(doc)
    photos = out.get("photos")
    if mapping and photos:
        out["photos"] = sp.remap_urls(photos, mapping)
    if existing is not None:
        # Khớp bằng personal_id/cccd nghĩa là _id của gói KHÁC _id bản local. Giữ
        # _id local, nếu không replace_one sẽ tạo bản ghi thứ hai.
        out["_id"] = existing["_id"]
    return out


def _extract_files(parsed: sp.ParsedPackage) -> dict[str, str]:
    """Giải nén file nhúng ra uploads/detainees/. Trả bảng pkgfiles/... -> URL thật."""
    mapping: dict[str, str] = {}
    root = os.path.realpath(DETAINEES_UPLOAD_DIR)
    for inner, data in parsed.files.items():
        rel = inner[len(sp.PKG_URL_PREFIX):]
        parts = [p for p in rel.split("/") if p]
        if len(parts) != 2:
            raise HTTPException(400, f"Đường dẫn file trong gói không hợp lệ: {inner}")
        folder = sanitize_folder_name(parts[0])
        name = sp.safe_filename(parts[1])
        target_dir = os.path.join(root, folder)
        target = os.path.join(target_dir, name)
        # Chốt chặn cuối: sau khi đã chuẩn hoá, đường dẫn thật vẫn phải nằm trong
        # thư mục uploads. Thiếu bước này thì một gói dựng tay ghi đè được file bất
        # kỳ trên máy — kể cả file hệ thống.
        if os.path.commonpath([os.path.realpath(os.path.dirname(target)), root]) != root:
            raise HTTPException(400, f"Đường dẫn trong gói thoát khỏi thư mục uploads: {inner}")
        os.makedirs(target_dir, exist_ok=True)
        with open(target, "wb") as f:
            f.write(data)
        mapping[inner] = f"/uploads/detainees/{folder}/{name}"
    return mapping


async def _replay_back(changes: list[dict]) -> tuple[int, list[str]]:
    """Replay ngược nhật ký bù trừ. Trả (số bản ghi đã trả lại, danh sách lỗi).

    Duyệt NGƯỢC: bản ghi bị sửa sau phải được trả lại trước, nếu không thì hai thay
    đổi liên tiếp trên cùng một doc sẽ hồi phục sai thứ tự.
    """
    undone = 0
    failed: list[str] = []
    for entry in reversed(changes):
        coll = database.db[entry["coll"]]
        oid = _maybe_oid(entry["id"])
        if oid is None:
            failed.append(str(entry.get("id")))
            continue
        try:
            if entry["op"] == "insert":
                await coll.delete_one({"_id": oid})
            else:
                before = dict(entry.get("before") or {})
                for field in _DT_FIELDS:
                    if field in before:
                        before[field] = _as_dt(before[field])
                before["_id"] = oid
                await coll.replace_one({"_id": oid}, before)
            undone += 1
        except Exception as e:                 # noqa: BLE001 - báo lại chứ không nuốt
            failed.append(f"{entry['coll']}/{entry['id']}: {e}")
    return undone, failed


# ---------------------------------------------------------------------------
# Nhận gói
# ---------------------------------------------------------------------------

@router.post("/import-package/validate")
async def validate_package(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Kiểm tra gói và cho biết sẽ làm gì — KHÔNG ghi gì vào DB."""
    parsed, err = _parse_or_error(await _read_upload(file))
    if err:
        return err
    _, summary = await _build_plan(parsed, None)
    return {
        "ok": True,
        "manifest": parsed.manifest,
        "counts": parsed.counts,
        "plan": summary,
    }


@router.post("/import-package/apply")
async def apply_package(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Ghi gói vào DB, kèm nhật ký bù trừ để hoàn tác được."""
    parsed, err = _parse_or_error(await _read_upload(file))
    if err:
        return err

    mapping = _extract_files(parsed)
    ops, summary = await _build_plan(parsed, mapping)

    batch_id = uuid.uuid4().hex
    changes: list[dict] = []
    written = {"sessions": 0, "detainees": 0}
    error: Optional[str] = None

    # Ghi doc nhật ký TRƯỚC khi sửa dữ liệu: hỏng giữa chừng vẫn còn bản ghi để
    # biết đã làm gì. `changes` lớn dần bằng $push sau mỗi bản ghi.
    await database.db.sync_imports.insert_one({
        "batch_id": batch_id,
        "at": datetime.utcnow(),
        "actor": user["username"],
        "status": "applying",
        "source": parsed.manifest.get("source", {}),
        "session_codes": parsed.manifest.get("session_codes", []),
        "counts": parsed.counts,
        "summary": {k: v for k, v in summary.items() if k != "items"},
        "changes": [],
    })

    try:
        for op in ops:
            if op["action"] == "skip":
                continue
            coll = database.db[op["coll"]]
            prepared = op["prepared"]
            if op["existing"] is None:
                try:
                    await coll.insert_one(prepared)
                except Exception as e:
                    # Hay gặp nhất là DuplicateKeyError: personal_id đã tồn tại
                    # nhưng không khớp ở bước tìm (dữ liệu đổi giữa 2 bước).
                    label = prepared.get("personal_id") or prepared.get("code")
                    raise RuntimeError(f"Không thêm được {op['coll']} {label}: {e}") from e
                entry = {"coll": op["coll"], "op": "insert", "id": str(prepared["_id"])}
            else:
                before = {k: make_json_safe(v) for k, v in op["existing"].items() if k != "_id"}
                await coll.replace_one({"_id": op["existing"]["_id"]}, prepared)
                entry = {"coll": op["coll"], "op": "update",
                         "id": str(op["existing"]["_id"]), "before": before}
            changes.append(entry)
            await database.db.sync_imports.update_one(
                {"batch_id": batch_id}, {"$push": {"changes": entry}}
            )
            written["sessions" if op["coll"] == SESSIONS_COLL else "detainees"] += 1
    except Exception as e:                     # noqa: BLE001 - phải nuốt để còn hoàn tác
        error = str(e)

    if error is None:
        await database.db.sync_imports.update_one(
            {"batch_id": batch_id},
            {"$set": {"status": "applied", "written": written,
                      "finished_at": datetime.utcnow()}},
        )
    else:
        # Hỏng giữa chừng -> TỰ ĐỘNG trả lại mọi thay đổi đã làm, để kết quả vẫn là
        # "hoặc tất cả hoặc không gì", đúng như mong đợi của người dùng. Không dựa
        # vào việc người dùng có nhớ bấm hoàn tác hay không.
        undone, failed = await _replay_back(changes)
        written = {"sessions": 0, "detainees": 0}
        await database.db.sync_imports.update_one(
            {"batch_id": batch_id},
            {"$set": {"status": "rolled_back" if not failed else "partial_failed",
                      "error": error, "auto_rolled_back": undone,
                      "rollback_failed": failed, "written": written,
                      "finished_at": datetime.utcnow()}},
        )

    await audit_log(
        request, user, "sync_import", "sync_package", ref=batch_id,
        data={"counts": parsed.counts, "written": written,
              "skipped": {k: v["skip"] for k, v in summary.items() if k != "items"},
              "error": error},
    )

    return {
        "ok": error is None,
        "batch_id": batch_id,
        "written": written,
        "skipped": {k: v["skip"] for k, v in summary.items() if k != "items"},
        "plan": summary,
        "error": error,
    }


@router.post("/import-package/rollback")
async def rollback_package(
    request: Request,
    batch_id: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """Hoàn tác một lần nhập đã thành công (người dùng đổi ý)."""
    if user.get("role") != "admin":
        raise HTTPException(403, "Chỉ tài khoản quản trị mới được hoàn tác lần nhập dữ liệu.")

    batch = await database.db.sync_imports.find_one({"batch_id": batch_id})
    if not batch:
        raise HTTPException(404, "Không tìm thấy lần nhập này.")
    if batch.get("status") == "rolled_back":
        raise HTTPException(400, "Lần nhập này đã được hoàn tác rồi.")

    undone, failed = await _replay_back(batch.get("changes", []))
    await database.db.sync_imports.update_one(
        {"batch_id": batch_id},
        {"$set": {"status": "rolled_back" if not failed else "partial_failed",
                  "rolled_back_at": datetime.utcnow(),
                  "rolled_back_by": user["username"], "rollback_failed": failed}},
    )
    await audit_log(
        request, user, "sync_rollback", "sync_package", ref=batch_id,
        data={"undone": undone, "failed": failed},
    )
    return {"ok": not failed, "undone": undone, "failed": failed}


@router.get("/imports")
async def list_imports(
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    """Lịch sử các lần nhập gói, mới nhất trước."""
    cursor = database.db.sync_imports.find({}).sort("at", -1).limit(limit)
    out = []
    async for doc in cursor:
        out.append({
            "batch_id": doc.get("batch_id"),
            "at": make_json_safe(doc.get("at")),
            "actor": doc.get("actor"),
            "status": doc.get("status"),
            "session_codes": doc.get("session_codes", []),
            "counts": doc.get("counts", {}),
            "written": doc.get("written", {}),
            "error": doc.get("error"),
        })
    return {"ok": True, "items": out}
