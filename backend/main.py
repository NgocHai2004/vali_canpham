import os
import io
import re
from datetime import datetime, timedelta, date
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File, Form, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from jose import jwt, JWTError
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from openpyxl import Workbook, load_workbook

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "app_cccd")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production-please-abc123xyz")
JWT_ALGO = "HS256"
TOKEN_TTL_MINUTES = 60 * 8

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

client: Optional[AsyncIOMotorClient] = None
db = None


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _oid(s: str) -> ObjectId:
    try:
        return ObjectId(s)
    except Exception:
        raise HTTPException(400, "invalid id")


def _s(doc: dict) -> dict:
    if not doc:
        return doc
    doc["id"] = str(doc.pop("_id"))
    for k in ("created_at", "updated_at", "dob"):
        if k in doc and isinstance(doc[k], datetime):
            doc[k] = doc[k].isoformat()
    return doc


@asynccontextmanager
async def lifespan(app: FastAPI):
    global client, db
    client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=3000)
    db = client[DB_NAME]
    try:
        await client.admin.command("ping")
        await _ensure_admin()
        await _ensure_default_cells()
        await _ensure_indexes()
        print(f"[startup] MongoDB OK - db={DB_NAME}")
    except Exception as e:
        print(f"[startup] MongoDB chưa sẵn sàng: {e}")
    yield
    client.close()


async def _ensure_admin():
    if not await db.users.find_one({"username": ADMIN_USERNAME}):
        await db.users.insert_one({
            "username": ADMIN_USERNAME,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin",
            "created_at": datetime.utcnow(),
        })


async def _ensure_default_cells():
    if await db.cells.count_documents({}) == 0:
        now = datetime.utcnow()
        seeds = [
            {"code": "A01", "name": "Buồng A01", "capacity": 20, "note": "Khu A - tầng 1"},
            {"code": "A02", "name": "Buồng A02", "capacity": 20, "note": "Khu A - tầng 1"},
            {"code": "B01", "name": "Buồng B01", "capacity": 25, "note": "Khu B - tầng 1"},
            {"code": "B02", "name": "Buồng B02", "capacity": 25, "note": "Khu B - tầng 1"},
            {"code": "C01", "name": "Buồng C01 - Nữ", "capacity": 15, "note": "Khu C - dành cho nữ"},
        ]
        for s in seeds:
            s.update({"created_at": now, "updated_at": now})
        await db.cells.insert_many(seeds)


async def _ensure_indexes():
    await db.detainees.create_index("code", unique=True, sparse=True)
    await db.detainees.create_index([("full_name", 1), ("dob", 1)])
    await db.detainees.create_index("cccd_number", sparse=True)
    await db.cells.create_index("code", unique=True)


class LoginResp(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str = "admin"


class CellIn(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=100)
    capacity: int = Field(ge=0, le=500)
    note: str = ""


class DetaineeIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    dob: Optional[str] = None
    gender: str = "male"
    cccd_number: Optional[str] = None
    hometown: Optional[str] = None
    address: Optional[str] = None
    ethnicity: Optional[str] = None
    religion: Optional[str] = None
    cell_code: Optional[str] = None
    charge: Optional[str] = None
    date_in: Optional[str] = None
    note: Optional[str] = None
    photo_url: Optional[str] = None


def _make_token(username: str, role: str = "admin") -> str:
    payload = {
        "sub": username,
        "role": role,
        "exp": datetime.utcnow() + timedelta(minutes=TOKEN_TTL_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    err = HTTPException(401, "Không có quyền truy cập", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        username = payload.get("sub")
        if not username:
            raise err
    except JWTError:
        raise err
    user = await db.users.find_one({"username": username})
    if not user:
        raise err
    return {"username": username, "role": user.get("role", "admin")}


async def _log(request: Request, user: dict, action: str, resource: str, ref: str = "", data: dict = None):
    try:
        await db.audit_logs.insert_one({
            "at": datetime.utcnow(),
            "actor": user["username"],
            "action": action,
            "resource": resource,
            "ref": ref,
            "ip": (request.client.host if request and request.client else ""),
            "data": data or {},
        })
    except Exception as e:
        print(f"[audit] err: {e}")


app = FastAPI(title="Hệ thống Quản lý CCCD Can Phạm", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/api/health")
async def health():
    try:
        await client.admin.command("ping")
        return {"ok": True, "db": "up"}
    except Exception as e:
        return {"ok": False, "db": "down", "error": str(e)}


@app.post("/api/auth/login", response_model=LoginResp)
async def login(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    user = await db.users.find_one({"username": form.username})
    if not user or not verify_password(form.password, user["password_hash"]):
        raise HTTPException(401, "Sai tài khoản hoặc mật khẩu")
    role = user.get("role", "admin")
    await _log(request, {"username": form.username}, "login", "auth")
    return LoginResp(access_token=_make_token(form.username, role), username=form.username, role=role)


@app.get("/api/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ==================== CELLS ====================
@app.get("/api/cells")
async def list_cells(user: dict = Depends(get_current_user)):
    cells = [_s(c) async for c in db.cells.find({}).sort("code", 1)]
    counts = {}
    pipeline = [{"$group": {"_id": "$cell_code", "n": {"$sum": 1}}}]
    async for r in db.detainees.aggregate(pipeline):
        if r["_id"]:
            counts[r["_id"]] = r["n"]
    for c in cells:
        c["current"] = counts.get(c["code"], 0)
    return cells


@app.post("/api/cells")
async def create_cell(body: CellIn, request: Request, user: dict = Depends(get_current_user)):
    if await db.cells.find_one({"code": body.code}):
        raise HTTPException(400, "Mã buồng đã tồn tại")
    now = datetime.utcnow()
    doc = body.model_dump()
    doc.update({"created_at": now, "updated_at": now})
    res = await db.cells.insert_one(doc)
    doc["_id"] = res.inserted_id
    await _log(request, user, "create", "cell", body.code)
    return _s(doc)


@app.patch("/api/cells/{cell_id}")
async def update_cell(cell_id: str, body: CellIn, request: Request, user: dict = Depends(get_current_user)):
    upd = body.model_dump()
    upd["updated_at"] = datetime.utcnow()
    doc = await db.cells.find_one_and_update({"_id": _oid(cell_id)}, {"$set": upd}, return_document=True)
    if not doc:
        raise HTTPException(404, "Không tìm thấy buồng")
    await _log(request, user, "update", "cell", body.code)
    return _s(doc)


@app.delete("/api/cells/{cell_id}")
async def delete_cell(cell_id: str, request: Request, user: dict = Depends(get_current_user)):
    doc = await db.cells.find_one({"_id": _oid(cell_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy buồng")
    n = await db.detainees.count_documents({"cell_code": doc["code"]})
    if n > 0:
        raise HTTPException(400, f"Buồng đang có {n} can phạm, không thể xoá")
    await db.cells.delete_one({"_id": _oid(cell_id)})
    await _log(request, user, "delete", "cell", doc["code"])
    return {"ok": True}


# ==================== DETAINEES ====================
def _norm_name(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip()).lower()


def _parse_dob(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s.strip(), fmt)
        except Exception:
            continue
    return None


async def _next_code() -> str:
    doc = await db.counters.find_one_and_update(
        {"_id": "detainee_code"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = doc["seq"] if doc else 1
    year = datetime.utcnow().year
    return f"CP{year}{seq:05d}"


async def _find_duplicates(full_name: str, dob: Optional[datetime], gender: str, exclude_id: Optional[str] = None) -> List[dict]:
    if not full_name:
        return []
    q = {"full_name_norm": _norm_name(full_name), "gender": gender}
    if dob:
        q["dob"] = dob
    if exclude_id:
        q["_id"] = {"$ne": _oid(exclude_id)}
    return [_s(d) async for d in db.detainees.find(q).limit(5)]


@app.get("/api/detainees")
async def list_detainees(
    q: str = Query("", alias="q"),
    cell_code: str = Query(""),
    gender: str = Query(""),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    filt = {}
    if q:
        rx = re.escape(q.strip())
        filt["$or"] = [
            {"full_name": {"$regex": rx, "$options": "i"}},
            {"cccd_number": {"$regex": rx, "$options": "i"}},
            {"code": {"$regex": rx, "$options": "i"}},
        ]
    if cell_code:
        filt["cell_code"] = cell_code
    if gender:
        filt["gender"] = gender
    total = await db.detainees.count_documents(filt)
    items = [
        _s(d)
        async for d in db.detainees.find(filt).sort("created_at", -1).skip(skip).limit(limit)
    ]
    return {"total": total, "items": items, "skip": skip, "limit": limit}


@app.get("/api/detainees/{det_id}")
async def get_detainee(det_id: str, user: dict = Depends(get_current_user)):
    doc = await db.detainees.find_one({"_id": _oid(det_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    return _s(doc)


@app.post("/api/detainees/check-duplicate")
async def check_duplicate(body: DetaineeIn, user: dict = Depends(get_current_user)):
    dob = _parse_dob(body.dob)
    dups = await _find_duplicates(body.full_name, dob, body.gender)
    return {"count": len(dups), "duplicates": dups}


@app.post("/api/detainees")
async def create_detainee(body: DetaineeIn, request: Request, user: dict = Depends(get_current_user)):
    dob = _parse_dob(body.dob)
    now = datetime.utcnow()
    code = await _next_code()
    doc = body.model_dump()
    doc.update({
        "code": code,
        "full_name_norm": _norm_name(body.full_name),
        "dob": dob,
        "date_in": _parse_dob(body.date_in),
        "created_at": now,
        "updated_at": now,
        "created_by": user["username"],
    })
    res = await db.detainees.insert_one(doc)
    doc["_id"] = res.inserted_id
    await _log(request, user, "create", "detainee", code, {"full_name": body.full_name})
    return _s(doc)


@app.patch("/api/detainees/{det_id}")
async def update_detainee(det_id: str, body: DetaineeIn, request: Request, user: dict = Depends(get_current_user)):
    upd = body.model_dump()
    upd["full_name_norm"] = _norm_name(body.full_name)
    upd["dob"] = _parse_dob(body.dob)
    upd["date_in"] = _parse_dob(body.date_in)
    upd["updated_at"] = datetime.utcnow()
    doc = await db.detainees.find_one_and_update({"_id": _oid(det_id)}, {"$set": upd}, return_document=True)
    if not doc:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    await _log(request, user, "update", "detainee", doc.get("code", det_id), {"full_name": body.full_name})
    return _s(doc)


@app.delete("/api/detainees/{det_id}")
async def delete_detainee(det_id: str, request: Request, user: dict = Depends(get_current_user)):
    doc = await db.detainees.find_one({"_id": _oid(det_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    await db.detainees.delete_one({"_id": _oid(det_id)})
    await _log(request, user, "delete", "detainee", doc.get("code", det_id))
    return {"ok": True}


# ==================== PHOTO UPLOAD ====================
@app.post("/api/upload/photo")
async def upload_photo(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(400, "Chỉ hỗ trợ ảnh jpg/png/webp")
    name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{ObjectId()}{ext}"
    path = os.path.join(UPLOAD_DIR, name)
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Ảnh vượt quá 5MB")
    with open(path, "wb") as f:
        f.write(data)
    return {"url": f"/uploads/{name}", "size": len(data)}


# ==================== CCCD READER MOCK ====================
_MOCK_NAMES = [
    ("Nguyễn Văn An", "male"), ("Trần Thị Bích", "female"),
    ("Lê Hoàng Cường", "male"), ("Phạm Ngọc Dung", "female"),
    ("Hoàng Minh Đức", "male"), ("Vũ Thị Hà", "female"),
    ("Đặng Quốc Huy", "male"), ("Bùi Thanh Lan", "female"),
]
_MOCK_HOMETOWNS = ["Hà Nội", "Hải Phòng", "Đà Nẵng", "TP.HCM", "Cần Thơ", "Bắc Ninh", "Thái Bình", "Nam Định"]


@app.get("/api/mock/cccd-read")
async def mock_cccd_read(user: dict = Depends(get_current_user)):
    import random
    name, gender = random.choice(_MOCK_NAMES)
    year = random.randint(1970, 2005)
    return {
        "full_name": name,
        "gender": gender,
        "dob": f"{random.randint(1,28):02d}/{random.randint(1,12):02d}/{year}",
        "cccd_number": "".join(str(random.randint(0, 9)) for _ in range(12)),
        "hometown": random.choice(_MOCK_HOMETOWNS),
        "address": f"Số {random.randint(1, 200)}, {random.choice(_MOCK_HOMETOWNS)}",
        "ethnicity": "Kinh",
        "religion": "Không",
    }


# ==================== IMPORT / EXPORT ====================
EXCEL_COLS = [
    ("code", "Mã hồ sơ"),
    ("full_name", "Họ và tên"),
    ("gender", "Giới tính"),
    ("dob", "Ngày sinh"),
    ("cccd_number", "Số CCCD"),
    ("hometown", "Quê quán"),
    ("address", "Địa chỉ"),
    ("ethnicity", "Dân tộc"),
    ("religion", "Tôn giáo"),
    ("cell_code", "Mã buồng"),
    ("charge", "Tội danh"),
    ("date_in", "Ngày vào"),
    ("note", "Ghi chú"),
]


@app.get("/api/detainees/export/xlsx")
async def export_xlsx(user: dict = Depends(get_current_user)):
    wb = Workbook()
    ws = wb.active
    ws.title = "Can pham"
    ws.append([h for _, h in EXCEL_COLS])
    async for d in db.detainees.find({}).sort("code", 1):
        row = []
        for k, _ in EXCEL_COLS:
            v = d.get(k, "")
            if isinstance(v, datetime):
                v = v.strftime("%d/%m/%Y")
            row.append(v if v is not None else "")
        ws.append(row)
    for col in ws.columns:
        letter = col[0].column_letter
        ws.column_dimensions[letter].width = 18
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"can_pham_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@app.get("/api/detainees/template/xlsx")
async def template_xlsx(user: dict = Depends(get_current_user)):
    wb = Workbook()
    ws = wb.active
    ws.title = "Mau nhap"
    ws.append([h for _, h in EXCEL_COLS])
    ws.append(["", "Nguyễn Văn Mẫu", "male", "15/03/1990", "001090123456", "Hà Nội", "Số 1, Hà Nội", "Kinh", "Không", "A01", "Trộm cắp tài sản", "01/01/2026", ""])
    for col in ws.columns:
        letter = col[0].column_letter
        ws.column_dimensions[letter].width = 18
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="mau_import.xlsx"'},
    )


@app.post("/api/detainees/import/xlsx")
async def import_xlsx(file: UploadFile = File(...), request: Request = None, user: dict = Depends(get_current_user)):
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(400, "Chỉ nhận file .xlsx")
    data = await file.read()
    wb = load_workbook(io.BytesIO(data), read_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(400, "File rỗng")
    header = [str(x or "").strip() for x in rows[0]]
    header_map = {h: idx for idx, h in enumerate(header)}
    inserted, errors = 0, []
    now = datetime.utcnow()
    for i, r in enumerate(rows[1:], start=2):
        if not r or not any(r):
            continue
        try:
            def get(col_key):
                _, label = next((c for c in EXCEL_COLS if c[0] == col_key), (None, None))
                idx = header_map.get(label) if label else None
                if idx is None or idx >= len(r):
                    return None
                v = r[idx]
                return str(v).strip() if v is not None else None
            full_name = get("full_name")
            if not full_name:
                errors.append(f"Dòng {i}: thiếu Họ và tên")
                continue
            code = get("code") or await _next_code()
            dob = _parse_dob(get("dob"))
            date_in = _parse_dob(get("date_in"))
            doc = {
                "code": code,
                "full_name": full_name,
                "full_name_norm": _norm_name(full_name),
                "gender": (get("gender") or "male").lower(),
                "dob": dob,
                "cccd_number": get("cccd_number"),
                "hometown": get("hometown"),
                "address": get("address"),
                "ethnicity": get("ethnicity"),
                "religion": get("religion"),
                "cell_code": get("cell_code"),
                "charge": get("charge"),
                "date_in": date_in,
                "note": get("note"),
                "created_at": now,
                "updated_at": now,
                "created_by": user["username"],
            }
            try:
                await db.detainees.insert_one(doc)
                inserted += 1
            except Exception as e:
                if "duplicate key" in str(e):
                    errors.append(f"Dòng {i}: mã {code} đã tồn tại")
                else:
                    errors.append(f"Dòng {i}: {e}")
        except Exception as e:
            errors.append(f"Dòng {i}: {e}")
    await _log(request, user, "import", "detainee", "", {"inserted": inserted, "errors": len(errors)})
    return {"inserted": inserted, "errors": errors}


# ==================== STATS ====================
@app.get("/api/stats")
async def stats(user: dict = Depends(get_current_user)):
    total = await db.detainees.count_documents({})
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today = await db.detainees.count_documents({"created_at": {"$gte": today_start}})
    cells_count = await db.cells.count_documents({})
    male = await db.detainees.count_documents({"gender": "male"})
    female = await db.detainees.count_documents({"gender": "female"})
    by_cell = []
    async for c in db.cells.find({}).sort("code", 1):
        n = await db.detainees.count_documents({"cell_code": c["code"]})
        by_cell.append({
            "code": c["code"],
            "name": c["name"],
            "current": n,
            "capacity": c.get("capacity", 0),
        })
    recent = [_s(d) async for d in db.detainees.find({}).sort("created_at", -1).limit(5)]
    return {
        "total": total,
        "today": today,
        "cells_count": cells_count,
        "male": male,
        "female": female,
        "by_cell": by_cell,
        "recent": recent,
    }


# ==================== AUDIT LOG ====================
@app.get("/api/logs")
async def list_logs(limit: int = Query(50, ge=1, le=500), user: dict = Depends(get_current_user)):
    items = []
    async for l in db.audit_logs.find({}).sort("at", -1).limit(limit):
        l["id"] = str(l.pop("_id"))
        if isinstance(l.get("at"), datetime):
            l["at"] = l["at"].isoformat()
        items.append(l)
    return items
