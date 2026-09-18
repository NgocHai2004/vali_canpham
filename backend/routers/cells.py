"""Cells routes — CRUD cho cơ sở giam giữ / phân trại / buồng."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request

from models import CellIn
from auth import get_current_user
from helpers import (
    parse_object_id, serialize_doc, audit_log,
    next_cell_code_by_level,
)
import database

router = APIRouter()


@router.get("/api/cells")
async def list_cells(user: dict = Depends(get_current_user)):
    cells = [serialize_doc(c) async for c in database.db.cells.find({}).sort("code", 1)]
    counts = {}
    pipeline = [{"$group": {"_id": "$cell_code", "n": {"$sum": 1}}}]
    async for r in database.db.detainees.aggregate(pipeline):
        if r["_id"]:
            counts[r["_id"]] = r["n"]

    # 1. Gán số lượng can phạm trực tiếp cho từng buồng (level == 'cell')
    for c in cells:
        c["current"] = counts.get(c["code"], 0)

    # 2. Rollup cho cấp phân trại (sub_camp): tổng buồng con
    for s in cells:
        if s.get("level") == "sub_camp":
            child_cells = [c for c in cells if c.get("level") == "cell" and c.get("parent") == s.get("code")]
            s["current"] = sum(c.get("current", 0) for c in child_cells)
            caps = [int(c["capacity"]) for c in child_cells if c.get("capacity") is not None and str(c.get("capacity")).isdigit()]
            s["capacity"] = sum(caps) if caps else None

    # 3. Rollup cho cấp cơ sở giam giữ (facility): tổng buồng trực tiếp + buồng trong các phân trại
    for f in cells:
        if f.get("level") == "facility":
            direct_cells = [c for c in cells if c.get("level") == "cell" and c.get("parent") == f.get("code")]
            sub_camps = [s for s in cells if s.get("level") == "sub_camp" and s.get("parent") == f.get("code")]
            sub_camp_codes = {s.get("code") for s in sub_camps}
            sub_cells = [c for c in cells if c.get("level") == "cell" and c.get("parent") in sub_camp_codes]
            all_cells = direct_cells + sub_cells
            f["current"] = sum(c.get("current", 0) for c in all_cells)
            caps = [int(c["capacity"]) for c in all_cells if c.get("capacity") is not None and str(c.get("capacity")).isdigit()]
            f["capacity"] = sum(caps) if caps else None

    return cells


@router.post("/api/cells")
async def create_cell(body: CellIn, request: Request, user: dict = Depends(get_current_user)):
    # Validate quan hệ cha-con theo cây phân cấp
    level = body.level
    parent = (body.parent or "").strip() or None
    custody = (body.custody_type or "").strip() or None
    if level == "facility":
        # Cơ sở phải có custody_type (tam_giam | tam_giu), không có cha
        if custody not in ("tam_giam", "tam_giu"):
            raise HTTPException(400, "Cơ sở giam giữ cần diện (tam_giam/tam_giu)")
        parent = None
    else:
        # sub_camp / cell phải có cha hợp lệ
        if not parent:
            raise HTTPException(400, f"{level} cần chỉ định node cha (parent)")
        pdoc = await database.db.cells.find_one({"code": parent})
        if not pdoc:
            raise HTTPException(400, f"Node cha '{parent}' không tồn tại")
        if level == "sub_camp" and pdoc.get("level") != "facility":
            raise HTTPException(400, "Phân trại phải thuộc một cơ sở giam giữ (facility)")
        if level == "cell" and pdoc.get("level") not in ("sub_camp", "facility"):
            raise HTTPException(400, "Buồng phải thuộc phân trại hoặc cơ sở giam giữ")
        custody = None  # custody chỉ đặt ở cấp facility
    now = datetime.utcnow()
    # Sinh code tự động theo cấp (người dùng không nhập mã)
    code = await next_cell_code_by_level(level, parent)
    doc = body.model_dump()
    doc["code"] = code
    doc["level"] = level
    doc["parent"] = parent
    doc["custody_type"] = custody
    doc.update({"created_at": now, "updated_at": now})
    res = await database.db.cells.insert_one(doc)
    doc["_id"] = res.inserted_id
    await audit_log(request, user, "create", "cell", code)
    return serialize_doc(doc)


@router.patch("/api/cells/{cell_id}")
async def update_cell(cell_id: str, body: CellIn, request: Request, user: dict = Depends(get_current_user)):
    upd = body.model_dump()
    upd["updated_at"] = datetime.utcnow()
    doc = await database.db.cells.find_one_and_update({"_id": parse_object_id(cell_id)}, {"$set": upd}, return_document=True)
    if not doc:
        raise HTTPException(404, "Không tìm thấy buồng")
    await audit_log(request, user, "update", "cell", body.code)
    return serialize_doc(doc)


@router.delete("/api/cells/{cell_id}")
async def delete_cell(cell_id: str, request: Request, user: dict = Depends(get_current_user)):
    doc = await database.db.cells.find_one({"_id": parse_object_id(cell_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy node")
    code = doc.get("code")
    # Không xoá nếu còn node con
    n_child = await database.db.cells.count_documents({"parent": code})
    if n_child > 0:
        raise HTTPException(400, f"Node đang có {n_child} node con, không thể xoá. Xoá con trước.")
    # Không xoá buồng nếu còn can phạm
    n = await database.db.detainees.count_documents({"cell_code": code})
    if n > 0:
        raise HTTPException(400, f"Buồng đang có {n} can phạm, không thể xoá")
    await database.db.cells.delete_one({"_id": parse_object_id(cell_id)})
    await audit_log(request, user, "delete", "cell", code)
    return {"ok": True}
