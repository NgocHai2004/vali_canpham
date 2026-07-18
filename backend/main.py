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
REPORTS_DIR = os.path.join(UPLOAD_DIR, "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)

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
    if "session_id" in doc and doc["session_id"] is not None:
        doc["session_id"] = str(doc["session_id"])
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


class UserIn(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_.\-]+$")
    password: str = Field(min_length=6, max_length=100)
    role: str = Field(default="user", pattern=r"^(admin|user)$")
    full_name: Optional[str] = None


class UserPatch(BaseModel):
    password: Optional[str] = Field(None, min_length=6, max_length=100)
    role: Optional[str] = Field(None, pattern=r"^(admin|user)$")
    full_name: Optional[str] = None


class CellIn(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=100)
    capacity: int = Field(ge=0, le=500)
    note: str = ""


class DetaineeIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    dob: Optional[str] = None
    gender: str = "male"
    cccd_number: Optional[str] = Field(None, pattern=r"^\d{12}$")
    personal_id: Optional[str] = Field(None, pattern=r"^\d{12}$")
    nationality: Optional[str] = "Việt Nam"
    hometown: Optional[str] = None
    address: Optional[str] = None
    ethnicity: Optional[str] = None
    religion: Optional[str] = None
    issued_date: Optional[str] = None
    expiry_date: Optional[str] = None
    issued_place: Optional[str] = None
    height_cm: Optional[int] = Field(None, ge=50, le=250)
    weight_kg: Optional[int] = Field(None, ge=20, le=200)
    cell_code: Optional[str] = None
    charge: Optional[str] = None
    date_in: Optional[str] = None
    note: Optional[str] = None
    photo_url: Optional[str] = None
    photos: Optional[dict] = None
    session_id: Optional[str] = None


class WorkSessionIn(BaseModel):
    location: str = Field(default="", max_length=200)
    note: str = Field(default="", max_length=500)


async def _next_session_code() -> str:
    today = datetime.utcnow().strftime("%Y%m%d")
    counter_id = f"session_code_{today}"
    doc = await db.counters.find_one_and_update(
        {"_id": counter_id},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = doc["seq"] if doc else 1
    return f"S{today}-{seq:04d}"


async def _get_open_session_or_none(username: str) -> Optional[dict]:
    return await db.work_sessions.find_one({"officer": username, "status": "open"})


def _s_session(doc: dict) -> dict:
    if not doc:
        return doc
    out = dict(doc)
    out["id"] = str(out.pop("_id"))
    for k in ("opened_at", "closed_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


def _ensure_session_editable(session_doc: dict, username: str, is_admin: bool) -> None:
    if session_doc.get("status") != "open":
        raise HTTPException(403, "Hồ sơ này thuộc phiên đã đóng, không thể chỉnh sửa.")
    if session_doc.get("officer") != username and not is_admin:
        raise HTTPException(403, "Bạn không có quyền thao tác trên phiên này.")


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


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(403, "Chỉ tài khoản quản trị mới được thực hiện thao tác này")
    return user


def _scope_filter(user: dict, base: dict = None) -> dict:
    """Non-admin users only see records they created."""
    filt = dict(base or {})
    if user.get("role") != "admin":
        filt["created_by"] = user["username"]
    return filt


async def _log(request: Request, user: dict, action: str, resource: str, ref: str = "", data: dict = None, ref_id: str = "", session_id=None):
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
        await db.audit_logs.insert_one(entry)
    except Exception as e:
        print(f"[audit] err: {e}")


app = FastAPI(title="Phần mềm Đăng ký Can phạm", lifespan=lifespan)
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


def _require_capture_fields(body: "DetaineeIn") -> None:
    """Enforce mandatory fields for the "Thu nhận dữ liệu" flow.

    Client is free to send partial data via the legacy short form (edit modal),
    but a create request must carry CCCD number + both CCCD photos.
    """
    missing = []
    if not body.full_name or not body.full_name.strip():
        missing.append("Họ và tên")
    if not body.cccd_number:
        missing.append("Số CCCD (12 chữ số)")
    if not body.dob:
        missing.append("Ngày sinh")
    if body.gender not in ("male", "female"):
        missing.append("Giới tính")
    photos = body.photos or {}
    if not photos.get("cccd_front"):
        missing.append("Ảnh CCCD mặt trước")
    if missing:
        raise HTTPException(400, "Thiếu thông tin bắt buộc: " + ", ".join(missing))


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
    filt = _scope_filter(user)
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


def _ensure_can_touch(doc: dict, user: dict) -> None:
    if user.get("role") == "admin":
        return
    if doc.get("created_by") != user["username"]:
        raise HTTPException(403, "Bạn chỉ được thao tác trên hồ sơ do chính mình đăng ký")


@app.get("/api/detainees/{det_id}")
async def get_detainee(det_id: str, user: dict = Depends(get_current_user)):
    doc = await db.detainees.find_one({"_id": _oid(det_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    _ensure_can_touch(doc, user)
    return _s(doc)


@app.post("/api/detainees/check-duplicate")
async def check_duplicate(body: DetaineeIn, user: dict = Depends(get_current_user)):
    dob = _parse_dob(body.dob)
    dups = await _find_duplicates(body.full_name, dob, body.gender)
    return {"count": len(dups), "duplicates": dups}


@app.post("/api/detainees")
async def create_detainee(body: DetaineeIn, request: Request, user: dict = Depends(get_current_user)):
    if not body.session_id:
        raise HTTPException(400, "Bạn phải mở 1 phiên làm việc trước khi tạo hồ sơ.")
    session_doc = await db.work_sessions.find_one({"_id": _oid(body.session_id)})
    if not session_doc:
        raise HTTPException(400, "Phiên làm việc không tồn tại.")
    is_admin = user.get("role") == "admin"
    _ensure_session_editable(session_doc, user["username"], is_admin)
    _require_capture_fields(body)
    dob = _parse_dob(body.dob)
    now = datetime.utcnow()
    code = await _next_code()
    doc = body.model_dump()
    doc.pop("session_id", None)
    doc.update({
        "code": code,
        "full_name_norm": _norm_name(body.full_name),
        "dob": dob,
        "date_in": _parse_dob(body.date_in),
        "issued_date": _parse_dob(body.issued_date),
        "expiry_date": _parse_dob(body.expiry_date),
        "created_at": now,
        "updated_at": now,
        "created_by": user["username"],
        "session_id": session_doc["_id"],
    })
    res = await db.detainees.insert_one(doc)
    doc["_id"] = res.inserted_id
    await db.work_sessions.update_one(
        {"_id": session_doc["_id"]},
        {"$inc": {"detainee_count": 1}, "$set": {"updated_at": now}},
    )
    await _log(request, user, "create", "detainee", code, {"full_name": body.full_name, "session": session_doc.get("code")}, ref_id=str(res.inserted_id), session_id=session_doc["_id"])
    return _s(doc)


@app.patch("/api/detainees/{det_id}")
async def update_detainee(det_id: str, body: DetaineeIn, request: Request, user: dict = Depends(get_current_user)):
    existing = await db.detainees.find_one({"_id": _oid(det_id)})
    if not existing:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    _ensure_can_touch(existing, user)
    sid = existing.get("session_id")
    if sid is not None:
        session_doc = await db.work_sessions.find_one({"_id": sid})
        if session_doc and session_doc.get("status") != "open":
            raise HTTPException(403, "Hồ sơ này thuộc phiên đã đóng, không thể chỉnh sửa.")
    upd = body.model_dump()
    upd.pop("session_id", None)
    upd["full_name_norm"] = _norm_name(body.full_name)
    upd["dob"] = _parse_dob(body.dob)
    upd["date_in"] = _parse_dob(body.date_in)
    upd["updated_at"] = datetime.utcnow()
    doc = await db.detainees.find_one_and_update({"_id": _oid(det_id)}, {"$set": upd}, return_document=True)
    await _log(request, user, "update", "detainee", doc.get("code", det_id), {"full_name": body.full_name}, ref_id=det_id, session_id=doc.get("session_id"))
    return _s(doc)


@app.delete("/api/detainees/{det_id}")
async def delete_detainee(det_id: str, request: Request, user: dict = Depends(get_current_user)):
    doc = await db.detainees.find_one({"_id": _oid(det_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    _ensure_can_touch(doc, user)
    sid = doc.get("session_id")
    if sid is not None:
        session_doc = await db.work_sessions.find_one({"_id": sid})
        if session_doc and session_doc.get("status") != "open":
            raise HTTPException(403, "Hồ sơ này thuộc phiên đã đóng, không thể xoá.")
    await db.detainees.delete_one({"_id": _oid(det_id)})
    if sid is not None:
        await db.work_sessions.update_one(
            {"_id": sid},
            {"$inc": {"detainee_count": -1}, "$set": {"updated_at": datetime.utcnow()}},
        )
    await _log(request, user, "delete", "detainee", doc.get("code", det_id), ref_id=det_id, session_id=sid)
    return {"ok": True}


@app.get("/api/detainees/by-code/{code}")
async def get_detainee_by_code(code: str, user: dict = Depends(get_current_user)):
    doc = await db.detainees.find_one({"code": code})
    if not doc:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    _ensure_can_touch(doc, user)
    return _s(doc)


class TransferBody(BaseModel):
    cell_code: str


@app.post("/api/detainees/{det_id}/transfer")
async def transfer_detainee(det_id: str, body: TransferBody, request: Request, user: dict = Depends(get_current_user)):
    doc = await db.detainees.find_one({"_id": _oid(det_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    _ensure_can_touch(doc, user)
    new_code = (body.cell_code or "").strip()
    if new_code and not await db.cells.find_one({"code": new_code}):
        raise HTTPException(400, f"Buồng {new_code} không tồn tại")
    old_code = doc.get("cell_code") or ""
    if old_code == new_code:
        raise HTTPException(400, "Can phạm đã ở buồng này")
    await db.detainees.update_one(
        {"_id": _oid(det_id)},
        {"$set": {"cell_code": new_code or None, "updated_at": datetime.utcnow()}},
    )
    await _log(
        request, user, "update", "detainee", doc.get("code", det_id),
        {"transfer": {"from": old_code, "to": new_code}}, ref_id=det_id,
    )
    return {"ok": True, "from": old_code, "to": new_code}


# ==================== WORK SESSIONS ====================
@app.post("/api/sessions")
async def open_session(body: WorkSessionIn, request: Request, user: dict = Depends(get_current_user)):
    existing = await _get_open_session_or_none(user["username"])
    if existing:
        raise HTTPException(409, f"Bạn đang có 1 phiên đang mở ({existing.get('code','?')}). Đóng phiên đó trước khi mở phiên mới.")
    officer_doc = await db.users.find_one({"username": user["username"]})
    now = datetime.utcnow()
    doc = {
        "code": await _next_session_code(),
        "status": "open",
        "officer": user["username"],
        "officer_full_name": (officer_doc or {}).get("full_name", "") or user["username"],
        "location": body.location.strip(),
        "note": body.note.strip(),
        "opened_at": now,
        "closed_at": None,
        "detainee_count": 0,
        "report_url": None,
        "report_filename": None,
    }
    res = await db.work_sessions.insert_one(doc)
    doc["_id"] = res.inserted_id
    await _log(request, user, "create", "work_session", doc["code"], ref_id=str(res.inserted_id), session_id=res.inserted_id)
    return _s_session(doc)


@app.get("/api/sessions/current")
async def get_current_session(user: dict = Depends(get_current_user)):
    doc = await _get_open_session_or_none(user["username"])
    if not doc:
        raise HTTPException(404, "Bạn chưa có phiên làm việc nào đang mở.")
    return _s_session(doc)


@app.get("/api/sessions")
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
    dt_from = _parse_dt(date_from)
    dt_to = _parse_dt(date_to)
    if dt_from or dt_to:
        rng: dict = {}
        if dt_from:
            rng["$gte"] = dt_from
        if dt_to:
            rng["$lte"] = dt_to
        filt["opened_at"] = rng
    total = await db.work_sessions.count_documents(filt)
    items = [
        _s_session(d)
        async for d in db.work_sessions.find(filt).sort("opened_at", -1).skip(skip).limit(limit)
    ]
    return {"total": total, "items": items, "skip": skip, "limit": limit}


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
        ["Cán bộ:", f"{session_doc.get('officer','')} ({session_doc.get('officer_full_name','')})"],
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
    headers = ["STT", "Mã HS", "Họ và tên", "Giới tính", "Ngày sinh", "Số CCCD", "Quê quán", "Buồng", "Ghi chú"]
    ws2.append(headers)
    i = 0
    async for d in db.detainees.find({"session_id": session_doc["_id"]}).sort("created_at", 1):
        i += 1
        dob = d.get("dob")
        dob_str = dob.strftime("%d/%m/%Y") if isinstance(dob, datetime) else ""
        gender = "Nam" if d.get("gender") == "male" else "Nữ"
        ws2.append([
            i,
            d.get("code", ""),
            d.get("full_name", ""),
            gender,
            dob_str,
            d.get("cccd_number", "") or "",
            d.get("hometown", "") or "",
            d.get("cell_code", "") or "",
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


@app.get("/api/sessions/{session_id}")
async def get_session_detail(session_id: str, user: dict = Depends(get_current_user)):
    doc = await db.work_sessions.find_one({"_id": _oid(session_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy phiên làm việc.")
    if doc.get("officer") != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Bạn không có quyền xem phiên này.")
    detainees = []
    async for d in db.detainees.find({"session_id": doc["_id"]}).sort("created_at", 1):
        detainees.append({
            "id": str(d["_id"]),
            "code": d.get("code", ""),
            "full_name": d.get("full_name", ""),
            "cccd_number": d.get("cccd_number", "") or "",
            "gender": d.get("gender", "male"),
            "dob": d["dob"].isoformat() if isinstance(d.get("dob"), datetime) else None,
            "cell_code": d.get("cell_code", "") or "",
            "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else None,
        })
    out = _s_session(doc)
    out["detainees"] = detainees
    return out


@app.post("/api/sessions/{session_id}/close")
async def close_session(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    doc = await db.work_sessions.find_one({"_id": _oid(session_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy phiên làm việc.")
    if doc.get("officer") != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Bạn không có quyền đóng phiên này.")
    if doc.get("status") != "open":
        raise HTTPException(409, "Phiên này đã đóng.")
    now = datetime.utcnow()
    doc["closed_at"] = now
    doc["status"] = "closed"
    filepath, filename = await _build_session_report_xlsx(doc)
    report_url = f"/uploads/reports/{filename}"
    await db.work_sessions.update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "status": "closed",
            "closed_at": now,
            "report_url": report_url,
            "report_filename": filename,
        }},
    )
    await _log(
        request, user, "update", "work_session", doc.get("code", ""),
        {"action": "close", "detainee_count": doc.get("detainee_count", 0)},
        ref_id=session_id, session_id=doc["_id"],
    )
    return {"ok": True, "closed_at": now.isoformat(), "report_url": report_url, "report_filename": filename}


@app.get("/api/sessions/{session_id}/report")
async def download_session_report(session_id: str, user: dict = Depends(get_current_user)):
    doc = await db.work_sessions.find_one({"_id": _oid(session_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy phiên làm việc.")
    if doc.get("officer") != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Bạn không có quyền tải báo cáo phiên này.")
    if doc.get("status") != "closed" or not doc.get("report_filename"):
        raise HTTPException(404, "Phiên chưa được đóng hoặc chưa có báo cáo.")
    filepath = os.path.join(REPORTS_DIR, doc["report_filename"])
    if not os.path.exists(filepath):
        raise HTTPException(404, "File báo cáo không còn tồn tại trên máy chủ.")
    with open(filepath, "rb") as f:
        data = f.read()
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{doc["report_filename"]}"'},
    )


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    doc = await db.work_sessions.find_one({"_id": _oid(session_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy phiên làm việc.")
    if doc.get("officer") != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Bạn không có quyền xoá phiên này.")
    if doc.get("status") != "open":
        raise HTTPException(400, "Chỉ có thể xoá phiên đang mở, chưa đóng.")
    if doc.get("detainee_count", 0) > 0:
        raise HTTPException(400, "Chỉ có thể xoá phiên rỗng (0 hồ sơ).")
    await db.work_sessions.delete_one({"_id": doc["_id"]})
    await _log(request, user, "delete", "work_session", doc.get("code", ""), ref_id=session_id, session_id=doc["_id"])
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


# ==================== AUDIT LOG / REPORT ====================
def _parse_dt(s: Optional[str]) -> Optional[datetime]:
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


@app.get("/api/logs")
async def list_logs(
    limit: int = Query(500, ge=1, le=5000),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    resource: Optional[str] = Query(None),
    session_code: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    filt: dict = {}
    dt_from = _parse_dt(date_from)
    dt_to = _parse_dt(date_to)
    if dt_from or dt_to:
        rng: dict = {}
        if dt_from:
            rng["$gte"] = dt_from
        if dt_to:
            rng["$lte"] = dt_to
        filt["at"] = rng
    if action:
        filt["action"] = action
    if resource:
        filt["resource"] = resource
    if user.get("role") != "admin":
        filt["actor"] = user["username"]
    if session_code:
        sess = await db.work_sessions.find_one({"code": session_code})
        if sess:
            filt["session_id"] = sess["_id"]
        else:
            filt["session_id"] = None
            filt["_impossible"] = True

    session_cache: dict = {}
    user_cache: dict = {}

    async def _resolve_session(sid):
        if sid is None:
            return None
        key = str(sid)
        if key not in session_cache:
            s = await db.work_sessions.find_one({"_id": sid})
            session_cache[key] = {
                "code": s.get("code", ""),
                "status": s.get("status", ""),
            } if s else None
        return session_cache[key]

    async def _resolve_user(uname):
        if not uname:
            return None
        if uname not in user_cache:
            u = await db.users.find_one({"username": uname})
            user_cache[uname] = {
                "username": uname,
                "full_name": (u or {}).get("full_name", "") or "",
                "avatar_url": (u or {}).get("avatar_url", "") or "",
            }
        return user_cache[uname]

    items = []
    async for l in db.audit_logs.find(filt).sort("at", -1).limit(limit):
        l["id"] = str(l.pop("_id"))
        if isinstance(l.get("at"), datetime):
            l["at"] = l["at"].isoformat()
        sid = l.get("session_id")
        l["session"] = await _resolve_session(sid) if sid is not None else None
        if sid is not None:
            l["session_id"] = str(sid)
        l["officer"] = await _resolve_user(l.get("actor"))
        items.append(l)

    counts = {"create": 0, "update": 0, "delete": 0, "login": 0, "import": 0}
    count_filt = dict(filt)
    count_filt.pop("_impossible", None)
    pipeline = [{"$match": count_filt}, {"$group": {"_id": "$action", "n": {"$sum": 1}}}]
    async for r in db.audit_logs.aggregate(pipeline):
        counts[r["_id"]] = r["n"]

    return {"items": items, "counts": counts, "total": len(items)}


# ==================== USER AVATAR ====================
@app.post("/api/users/{user_id}/avatar")
async def upload_user_avatar(user_id: str, file: UploadFile = File(...), request: Request = None, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"_id": _oid(user_id)})
    if not target:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(400, "Chỉ hỗ trợ ảnh jpg/png/webp")
    data = await file.read()
    if len(data) > 3 * 1024 * 1024:
        raise HTTPException(400, "Ảnh vượt quá 3MB")
    avatars_dir = os.path.join(UPLOAD_DIR, "avatars")
    os.makedirs(avatars_dir, exist_ok=True)
    name = f"avatar_{target['username']}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}{ext}"
    path = os.path.join(avatars_dir, name)
    with open(path, "wb") as f:
        f.write(data)
    avatar_url = f"/uploads/avatars/{name}"
    await db.users.update_one({"_id": _oid(user_id)}, {"$set": {"avatar_url": avatar_url}})
    await _log(request, admin, "update", "user", target["username"], {"action": "avatar"})
    return {"ok": True, "avatar_url": avatar_url}


# ==================== USER MANAGEMENT (admin only) ====================
def _serialize_user(u: dict) -> dict:
    return {
        "id": str(u["_id"]),
        "username": u["username"],
        "role": u.get("role", "user"),
        "full_name": u.get("full_name", ""),
        "avatar_url": u.get("avatar_url", "") or "",
        "created_at": u["created_at"].isoformat() if isinstance(u.get("created_at"), datetime) else None,
    }


@app.get("/api/users")
async def list_users(user: dict = Depends(require_admin)):
    return [_serialize_user(u) async for u in db.users.find({}).sort("username", 1)]


@app.post("/api/users")
async def create_user(body: UserIn, request: Request, admin: dict = Depends(require_admin)):
    if await db.users.find_one({"username": body.username}):
        raise HTTPException(400, "Tên tài khoản đã tồn tại")
    doc = {
        "username": body.username,
        "password_hash": hash_password(body.password),
        "role": body.role,
        "full_name": body.full_name or "",
        "created_at": datetime.utcnow(),
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    await _log(request, admin, "create", "user", body.username, {"role": body.role})
    return _serialize_user(doc)


@app.patch("/api/users/{user_id}")
async def update_user(user_id: str, body: UserPatch, request: Request, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"_id": _oid(user_id)})
    if not target:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    upd: dict = {}
    if body.password:
        upd["password_hash"] = hash_password(body.password)
    if body.role:
        if target["username"] == ADMIN_USERNAME and body.role != "admin":
            raise HTTPException(400, "Không thể hạ quyền tài khoản admin gốc")
        upd["role"] = body.role
    if body.full_name is not None:
        upd["full_name"] = body.full_name
    if not upd:
        return _serialize_user(target)
    doc = await db.users.find_one_and_update({"_id": _oid(user_id)}, {"$set": upd}, return_document=True)
    await _log(request, admin, "update", "user", doc["username"], {"fields": list(upd.keys())})
    return _serialize_user(doc)


@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str, request: Request, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"_id": _oid(user_id)})
    if not target:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    if target["username"] == ADMIN_USERNAME:
        raise HTTPException(400, "Không thể xoá tài khoản admin gốc")
    if target["username"] == admin["username"]:
        raise HTTPException(400, "Không thể xoá tài khoản của chính bạn")
    await db.users.delete_one({"_id": _oid(user_id)})
    await _log(request, admin, "delete", "user", target["username"])
    return {"ok": True}
