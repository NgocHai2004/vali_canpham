import os
import io
import re
import asyncio
import base64
import threading
import anyio
import httpx
from datetime import datetime, timedelta, date

import person_detect
import face_recognition_service
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File, Form, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import StreamingResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from jose import jwt, JWTError
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from openpyxl import Workbook, load_workbook

def _env_str_from_dotenv(name: str) -> str:
    """Doc gia tri tu .env (App_CCCD/.env) khi env var chua set.
    Nguon su that duy nhat la .env — tranh lech secret giua cac cach start khac nhau
    (run-electron load .env vs start-all khong load .env) gay 2 backend lech secret
    -> token 401 -> logout hang loat khi quet CCCD.
    """
    val = os.getenv(name, "").strip()
    if val:
        return val
    root_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
    try:
        with open(root_env, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                if k.strip() == name:
                    return v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return ""


MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "app_cccd")
JWT_SECRET = _env_str_from_dotenv("JWT_SECRET") or "change-me-in-production-please-abc123xyz"
JWT_ALGO = "HS256"
TOKEN_TTL_MINUTES = 60 * 8


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        root_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
        try:
            with open(root_env, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    if k.strip() == name:
                        raw = v.strip().strip('"').strip("'")
                        break
        except FileNotFoundError:
            raw = None
    try:
        return float(raw) if raw not in (None, "") else default
    except ValueError:
        return default


HEIGHT_IMAGE_DEFAULT = _env_float("height_image", 100)
HEIGHT_IMAGE_MAX = 1000.0
_height_image_cache: float = HEIGHT_IMAGE_DEFAULT

HEIGHT_OFFSET_DEFAULT = _env_float("height_offset", 103)
HEIGHT_OFFSET_MAX = 1000.0
_height_offset_cache: float = HEIGHT_OFFSET_DEFAULT


def get_height_image() -> float:
    """Giá trị height_image hiện hành (cache in-memory, đồng bộ với DB)."""
    return _height_image_cache


def get_height_offset() -> float:
    """Giá trị height_offset hiện hành (cache in-memory, đồng bộ với DB)."""
    return _height_offset_cache


# Ngưỡng chất lượng vân tay tối thiểu cho TỪNG ngón (0-100). Khác
# height_image/height_offset ở một điểm quan trọng: giá trị này KHÔNG được
# backend này dùng để tính toán, mà do service Morfin (port 8765) dùng để CHẶN
# khi thu vân tay. Nên sau khi lưu vào db.settings phải đẩy sang service đó,
# xem _push_fp_quality().
#
# Thứ tự trong list là thứ tự hiển thị trên UI (trái ngón cái → út, rồi phải).
FP_FINGER_CODES = [
    "left_thumb", "left_index", "left_middle", "left_ring", "left_little",
    "right_thumb", "right_index", "right_middle", "right_ring", "right_little",
]
FP_MIN_QUALITY_DEFAULT = int(_env_float("morfin_min_quality", 50))
FP_MIN_QUALITY_MAX = 100
_fp_min_quality_cache: dict = {c: FP_MIN_QUALITY_DEFAULT for c in FP_FINGER_CODES}


def get_fp_min_quality() -> dict:
    """Ngưỡng chất lượng từng ngón hiện hành (cache in-memory, đồng bộ với DB)."""
    return dict(_fp_min_quality_cache)

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
REPORTS_DIR = os.path.join(UPLOAD_DIR, "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)


def _resolve_upload_path(url: str) -> str | None:
    """Map URL '/uploads/...' → đường dẫn file local. Trả None nếu không phải URL local."""
    if not url or not url.startswith("/uploads/"):
        return None
    rel = url[len("/uploads/"):]
    path = os.path.join(UPLOAD_DIR, rel.replace("/", os.sep))
    return path if os.path.isfile(path) else None

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
        await _load_measurement_config()
        await _load_fp_config()
    except Exception:
        pass
    # Đẩy ngưỡng vân tay sang service Morfin (8765) ở background: service đó có
    # thể chưa kịp bật, và nó tự respawn nên phải đồng bộ lại mỗi lần backend
    # start. Không await để không block app ready.
    asyncio.create_task(_push_fp_quality_safe())
    # Load YOLO person-detect model o background (khong block app ready)
    threading.Thread(target=person_detect.load_blocking, daemon=True, name="yolo-load").start()
    # Load InsightFace (buffalo_sc) o background cho nhan dien khuon mat
    threading.Thread(target=face_recognition_service.load_blocking, daemon=True, name="face-load").start()
    yield
    client.close()


async def _ensure_admin():
    existing = await db.users.find_one({"username": ADMIN_USERNAME})
    if not existing:
        await db.users.insert_one({
            "username": ADMIN_USERNAME,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin",
            "full_name": "Nguyễn Tuấn Anh",
            "created_at": datetime.utcnow(),
        })
    else:
        if not existing.get("full_name"):
            await db.users.update_one(
                {"_id": existing["_id"]},
                {"$set": {"full_name": "Nguyễn Tuấn Anh"}},
            )


async def _load_measurement_config():
    """Đọc height_image + height_offset từ db.settings; seed từ .env nếu chưa có. Cập nhật cache in-memory."""
    global _height_image_cache, _height_offset_cache
    doc = await db.settings.find_one({"_id": "measurement"})
    if doc is None:
        _height_image_cache = HEIGHT_IMAGE_DEFAULT
        _height_offset_cache = HEIGHT_OFFSET_DEFAULT
        await db.settings.insert_one({
            "_id": "measurement",
            "height_image": HEIGHT_IMAGE_DEFAULT,
            "height_offset": HEIGHT_OFFSET_DEFAULT,
        })
    else:
        try:
            val = float(doc.get("height_image"))
            if val > 0:
                _height_image_cache = val
        except (TypeError, ValueError):
            pass
        try:
            val = float(doc.get("height_offset"))
            if val > 0:
                _height_offset_cache = val
        except (TypeError, ValueError):
            pass


def _sanitize_fp_map(raw) -> dict:
    """Lọc lấy các mã ngón hợp lệ, giá trị 0-100. Bỏ qua key lạ.

    Bỏ qua thay vì báo lỗi: config trong Mongo có thể còn key cũ từ phiên bản
    trước, và một key rác không được làm cả cấu hình ngưỡng không đọc được.
    """
    out: dict = {}
    if isinstance(raw, dict):
        for code, val in raw.items():
            if code in _fp_min_quality_cache:
                try:
                    n = int(val)
                except (TypeError, ValueError):
                    continue
                if 0 <= n <= FP_MIN_QUALITY_MAX:
                    out[code] = n
    return out


async def _load_fp_config():
    """Đọc ngưỡng chất lượng từng ngón từ db.settings; seed mặc định nếu chưa có."""
    doc = await db.settings.find_one({"_id": "fingerprint"})
    if doc is None:
        await db.settings.insert_one({
            "_id": "fingerprint",
            "by_finger": dict(_fp_min_quality_cache),
        })
        return
    got = _sanitize_fp_map(doc.get("by_finger"))
    # Tương thích bản trước: khi còn là một ngưỡng chung, áp cho cả 10 ngón.
    if not got and doc.get("min_quality") is not None:
        one = _sanitize_fp_map({c: doc.get("min_quality") for c in _fp_min_quality_cache})
        got = one
    if got:
        _fp_min_quality_cache.update(got)


async def _push_fp_quality(by_finger: dict) -> bool:
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


async def _push_fp_quality_safe():
    """Đồng bộ ngưỡng lúc backend startup. Service Morfin tự respawn nên giá trị
    trong RAM của nó có thể cũ hơn Mongo; push lại để hai bên khớp nhau."""
    try:
        await _push_fp_quality(get_fp_min_quality())
    except Exception:  # noqa: BLE001 - task background, không được làm sập app
        pass


async def _ensure_default_cells():
    if await db.cells.count_documents({}) == 0:
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
        await db.cells.insert_many(seeds)


async def _ensure_indexes():
    await db.detainees.create_index("personal_id", unique=True, sparse=True)
    await db.detainees.create_index([("full_name", 1), ("dob", 1)])
    await db.detainees.create_index("cccd_number", sparse=True)
    await db.cells.create_index("code", unique=True)
    # Dau vet hien truong: liet ke theo phien (vu an), sap theo so thu tu anh.
    await db.scene_traces.create_index([("session_id", 1), ("seq", 1)])


class LoginResp(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str = "admin"
    full_name: str = ""


class UserIn(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_.\-]+$")
    password: str = Field(min_length=6, max_length=100)
    role: str = Field(default="user", pattern=r"^(admin|user)$")
    full_name: str = Field(min_length=1, max_length=100)


class UserPatch(BaseModel):
    password: Optional[str] = Field(None, min_length=6, max_length=100)
    role: Optional[str] = Field(None, pattern=r"^(admin|user)$")
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)


class MePatch(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)
    password: Optional[str] = Field(None, min_length=6, max_length=100)
    current_password: Optional[str] = Field(None, min_length=1, max_length=100)


class SyncLogEntry(BaseModel):
    code: str = ""
    full_name: str = ""
    cccd_number: str = ""


class SyncLogBody(BaseModel):
    added: int = 0
    updated: int = 0
    duplicated: int = 0
    failed: int = 0
    added_items: List[SyncLogEntry] = Field(default_factory=list)
    updated_items: List[SyncLogEntry] = Field(default_factory=list)
    duplicate_items: List[SyncLogEntry] = Field(default_factory=list)
    failed_items: List[SyncLogEntry] = Field(default_factory=list)
    error: Optional[str] = None
    remote: Optional[str] = None


class CellIn(BaseModel):
    code: str = Field(default="", max_length=20)
    name: str = Field(min_length=1, max_length=100)
    capacity: int = Field(ge=0, le=500)
    note: str = ""
    # ---- Phân cấp cơ sở giam giữ (cây) ----
    # level: facility (Trại tạm giam / Nhà tạm giữ)
    #      | sub_camp (Phân trại — con của Trại tạm giam)
    #      | cell (Buồng — con của sub_camp hoặc facility)
    level: str = Field(default="cell", pattern=r"^(facility|sub_camp|cell)$")
    parent: Optional[str] = None        # code của node cha
    custody_type: Optional[str] = None  # tam_giam | tam_giu — chỉ đặt ở cấp facility


class DetaineeIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    dob: Optional[str] = None
    gender: str = "male"
    cccd_number: Optional[str] = Field(None, pattern=r"^\d{12}$")
    personal_id: Optional[str] = Field(None, min_length=1, max_length=50)
    cmnd_old: Optional[str] = Field(None, max_length=20)
    nationality: Optional[str] = "Việt Nam"
    hometown: Optional[str] = None
    address: Optional[str] = None
    ethnicity: Optional[str] = None
    religion: Optional[str] = None
    issued_date: Optional[str] = None
    expiry_date: Optional[str] = None
    issued_place: Optional[str] = None              # cơ quan cấp
    distinguishing_features: Optional[str] = None    # đặc điểm nhận dạng
    mrz: Optional[str] = None                       # MRZ 2-3 dòng
    # ---- Thông tin can phạm (nghiệp vụ, 21 trường string) ----
    cell_block: Optional[str] = None                 # 1. Buồng giam
    status_detainee: Optional[str] = None            # 2. Tình trạng
    squad: Optional[str] = None                      # 3. Phân đội
    health_intake: Optional[str] = None              # 4. Sức khỏe khi vào
    disease_current: Optional[str] = None            # 5. Bệnh hiện tại
    disease_intake: Optional[str] = None             # 6. Bệnh tật khi vào
    alcohol_use: Optional[str] = None                # 7. Sử dụng chất có cồn
    address_before_arrest: Optional[str] = None      # 8. Địa chỉ trước khi bị bắt
    release_residence: Optional[str] = None          # 9. Nơi thả về cư trú
    occupation: Optional[str] = None                 # 10. Nghề nghiệp
    occupation_detail: Optional[str] = None          # 11. Nghề cụ thể
    file_number: Optional[str] = None                # 12. Số HSĐ
    file_number_sub: Optional[str] = None            # 13. Số HS phụ
    search_index: Optional[str] = None               # 14. Chỉ mục tìm kiếm
    disease_current_detail: Optional[str] = None     # 15. Chi tiết bệnh hiện tại
    disease_intake_detail: Optional[str] = None      # 16. Chi tiết bệnh khi vào
    education_level: Optional[str] = None            # 17. Trình độ học vấn
    professional_level: Optional[str] = None         # 18. Trình độ chuyên môn
    study_status: Optional[str] = None               # 19. Tình trạng học tập
    literacy: Optional[str] = None                   # 20. Biết đọc viết
    alias: Optional[str] = None                      # 21. Tên khác (bí danh)
    height_cm: Optional[float] = Field(None, ge=50, le=250)
    weight_kg: Optional[float] = Field(None, ge=20, le=200)
    cell_code: Optional[str] = None
    custody_type: Optional[str] = None     # tam_giu | tam_giam — Diện giam giữ
    facility_code: Optional[str] = None    # Nơi giam giữ (Trại tạm giam / Nhà tạm giữ)
    sub_camp_code: Optional[str] = None    # Phân trại (chỉ khi custody_type = tam_giam)
    charge: Optional[str] = None
    date_in: Optional[str] = None
    note: Optional[str] = None
    photo_url: Optional[str] = None
    photos: Optional[dict] = None
    session_id: Optional[str] = None


class WorkSessionIn(BaseModel):
    case_name: str = Field(default="", max_length=200)
    commune_code: str = Field(default="", max_length=40)
    location: str = Field(default="", max_length=200)
    note: str = Field(default="", max_length=500)
    officer_full_name: Optional[str] = Field(default=None, max_length=100)


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


async def _next_cell_code() -> str:
    doc = await db.counters.find_one_and_update(
        {"_id": "cell_code"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = doc["seq"] if doc else 1
    return f"BG{seq:03d}"


async def _next_cell_code_by_level(level: str, parent: Optional[str]) -> str:
    """Sinh mã tự động theo cấp, đảm bảo duy nhất trong collection cells."""
    prefix_map = {"facility": "CS", "sub_camp": "PT", "cell": "BG"}
    counter_id = f"cell_code_{prefix_map.get(level, 'X')}"
    doc = await db.counters.find_one_and_update(
        {"_id": counter_id},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = doc["seq"] if doc else 1
    return f"{prefix_map.get(level, 'X')}{seq:03d}"


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
    return {
        "username": username,
        "role": user.get("role", "admin"),
        "full_name": user.get("full_name", "") or "",
    }


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
    except Exception:
        pass


app = FastAPI(title="Thiết bị thu thập & quản lý căn cước can phạm", lifespan=lifespan)
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
    full_name = user.get("full_name", "") or ""
    await _log(request, {"username": form.username}, "login", "auth")
    return LoginResp(
        access_token=_make_token(form.username, role),
        username=form.username,
        role=role,
        full_name=full_name,
    )


@app.get("/api/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@app.patch("/api/auth/me")
async def update_me(body: MePatch, request: Request, user: dict = Depends(get_current_user)):
    target = await db.users.find_one({"username": user["username"]})
    if not target:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    upd: dict = {}
    wants_name = body.full_name is not None
    wants_pw = bool(body.password)
    if not wants_name and not wants_pw:
        return {
            "username": user["username"],
            "role": user["role"],
            "full_name": target.get("full_name", "") or "",
        }
    if not body.current_password or not verify_password(body.current_password, target["password_hash"]):
        raise HTTPException(400, "Mật khẩu hiện tại không đúng")
    if wants_name:
        upd["full_name"] = body.full_name.strip()
    if wants_pw:
        upd["password_hash"] = hash_password(body.password)
    doc = await db.users.find_one_and_update(
        {"username": user["username"]},
        {"$set": upd},
        return_document=True,
    )
    if not doc:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    await _log(request, user, "update", "user", user["username"], {"fields": list(upd.keys()), "self": True})
    return {
        "username": doc["username"],
        "role": doc.get("role", "user"),
        "full_name": doc.get("full_name", "") or "",
    }


# ==================== USB DONGLE ====================
USB_SERVICE_URL = os.getenv("USB_SERVICE_URL", "http://127.0.0.1:8766")
DONGLE_BYPASS = os.getenv("DONGLE_BYPASS", "") == "1"


@app.get("/api/auth/dongle-verify")
async def dongle_verify(user: dict = Depends(get_current_user)):
    """Layer bảo mật thứ 2: kiểm USB dongle đang cắm không.
    Frontend poll endpoint này mỗi 5s sau khi login. 401 → auto logout.

    - 200 OK: {ok: true, drive} — có dongle hợp lệ
    - 401  : không phát hiện USB dongle
    - 503  : usb_service không phản hồi (không đủ căn cứ logout)
    """
    # ponytail: dev-only bypass cho may khong co dongle/usb_service. Chi bat bang
    # env DONGLE_BYPASS=1 khi chay local; production khong set thi hanh vi giu nguyen.
    if DONGLE_BYPASS:
        return {"ok": True, "drive": "BYPASS", "user": user["username"]}
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{USB_SERVICE_URL}/api/usb/verify")
    except httpx.RequestError as e:
        raise HTTPException(503, f"Không kết nối được USB service: {e}")
    if resp.status_code != 200:
        raise HTTPException(503, f"USB service lỗi ({resp.status_code}).")
    data = resp.json()
    if not data.get("ok"):
        raise HTTPException(401, "Không phát hiện USB dongle. Vui lòng cắm USB.")
    return {"ok": True, "drive": data.get("drive"), "user": user["username"]}


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
        pdoc = await db.cells.find_one({"code": parent})
        if not pdoc:
            raise HTTPException(400, f"Node cha '{parent}' không tồn tại")
        if level == "sub_camp" and pdoc.get("level") != "facility":
            raise HTTPException(400, "Phân trại phải thuộc một cơ sở giam giữ (facility)")
        if level == "cell" and pdoc.get("level") not in ("sub_camp", "facility"):
            raise HTTPException(400, "Buồng phải thuộc phân trại hoặc cơ sở giam giữ")
        custody = None  # custody chỉ đặt ở cấp facility
    now = datetime.utcnow()
    # Sinh code tự động theo cấp (người dùng không nhập mã)
    code = await _next_cell_code_by_level(level, parent)
    doc = body.model_dump()
    doc["code"] = code
    doc["level"] = level
    doc["parent"] = parent
    doc["custody_type"] = custody
    doc.update({"created_at": now, "updated_at": now})
    res = await db.cells.insert_one(doc)
    doc["_id"] = res.inserted_id
    await _log(request, user, "create", "cell", code)
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
        raise HTTPException(404, "Không tìm thấy node")
    code = doc.get("code")
    # Không xoá nếu còn node con
    n_child = await db.cells.count_documents({"parent": code})
    if n_child > 0:
        raise HTTPException(400, f"Node đang có {n_child} node con, không thể xoá. Xoá con trước.")
    # Không xoá buồng nếu còn can phạm
    n = await db.detainees.count_documents({"cell_code": code})
    if n > 0:
        raise HTTPException(400, f"Buồng đang có {n} can phạm, không thể xoá")
    await db.cells.delete_one({"_id": _oid(cell_id)})
    await _log(request, user, "delete", "cell", code)
    return {"ok": True}


# ==================== DETAINEES ====================
def _parse_dob(s: Optional[str]) -> Optional[str]:
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


async def _find_duplicates(full_name: str, dob: Optional[str], gender: str, exclude_id: Optional[str] = None) -> List[dict]:
    if not full_name:
        return []
    q = {"full_name": full_name.strip(), "gender": gender}
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
            {"personal_id": {"$regex": rx, "$options": "i"}},
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


# ---------- CCCD duplicate check (tra cứu đối tượng đã đăng ký bằng số CCCD) ----------
# Fields trả về đủ để hiển thị modal cảnh báo, KHÔNG kèm template/ảnh nặng.
_MATCH_PROJECTION = {
    "personal_id": 1, "full_name": 1, "cccd_number": 1, "gender": 1, "dob": 1,
    "cell_code": 1, "custody_type": 1, "facility_code": 1, "sub_camp_code": 1,
    "charge": 1, "hometown": 1, "address": 1,
    "photos.portrait_front": 1, "photos.cccd_front": 1,
    "created_at": 1, "created_by": 1,
}


# CHÚ Ý thứ tự route: các route TĨNH (check-cccd, check-duplicate) phải khai báo
# TRƯỚC route động "/api/detainees/{det_id}", nếu không FastAPI sẽ coi "check-cccd"
# là det_id và ném "invalid id" (route match theo thứ tự khai báo).
@app.get("/api/detainees/check-cccd")
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
    doc = await db.detainees.find_one(
        {"cccd_number": cccd},
        _MATCH_PROJECTION,
    )
    return {"matched": doc is not None, "detainee": _s(doc) if doc else None}


@app.post("/api/detainees/check-duplicate")
async def check_duplicate(body: DetaineeIn, user: dict = Depends(get_current_user)):
    dob = _parse_dob(body.dob)
    dups = await _find_duplicates(body.full_name, dob, body.gender)
    return {"count": len(dups), "duplicates": dups}


@app.get("/api/detainees/{det_id}")
async def get_detainee(det_id: str, user: dict = Depends(get_current_user)):
    doc = await db.detainees.find_one({"_id": _oid(det_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    _ensure_can_touch(doc, user)
    return _s(doc)


# ---------- Fingerprint match (tra cứu can phạm bằng vân tay) ----------
FP_SERVICE_URL = os.getenv("FP_SERVICE_URL", "http://127.0.0.1:8765")
FP_MATCH_THRESHOLD = int(os.getenv("FP_MATCH_THRESHOLD", "85"))  # luu cho cac luong khac (neu co)
FP_MATCH_FINGER = os.getenv("FP_MATCH_FINGER", "left_thumb")     # ngon dung de ket luan
FP_LEFT_THUMB_THRESHOLD = int(os.getenv("FP_LEFT_THUMB_THRESHOLD", "80"))  # score > N (dung >)
FP_SINGLE_THRESHOLD = int(os.getenv("FP_SINGLE_THRESHOLD", "80"))  # luong 1-ngon (Search), giong Enroll
FP_REQUIRED_FINGER_COUNT = int(os.getenv("FP_REQUIRED_FINGER_COUNT", "10"))  # phai du bao nhieu ngon
FP_FINGER_CODES = [
    "left_little", "left_ring", "left_middle", "left_index", "left_thumb",
    "right_thumb", "right_index", "right_middle", "right_ring", "right_little",
]

# ---------- Face recognition (nhận diện khuôn mặt bằng InsightFace buffalo_sc) ----------
FACE_MATCH_THRESHOLD = float(os.getenv("FACE_MATCH_THRESHOLD", "0.4"))


class MatchFingerprintReq(BaseModel):
    # FE gom du N ngon (theo FP_FINGER_CODES) roi gui len. Backend chi dung
    # FP_MATCH_FINGER (left_thumb) de so sanh va ket luan.
    fingers: dict[str, str]   # {"left_thumb": "<b64>", "left_index": "<b64>", ...}


@app.post("/api/detainees/match_fingerprint")
async def match_fingerprint(body: MatchFingerprintReq, user: dict = Depends(get_current_user)):
    """Tra cứu can phạm bằng vân tay (logic moi).

    Yeu cau FE gui du FP_REQUIRED_FINGER_COUNT ngon (mac dinh 10). Backend chi
    so sanh ngon FP_MATCH_FINGER (left_thumb) cua nguoi tra cuu voi left_thumb
    cua tung can pham trong Mongo. Ket luan khop neu score > FP_LEFT_THUMB_THRESHOLD.
    Tra top 10 can pham khop.
    """
    fingers = body.fingers or {}
    # Dem so ngon co template khong trong
    present = [c for c in FP_FINGER_CODES if (fingers.get(c) or "").strip()]
    if len(present) < FP_REQUIRED_FINGER_COUNT:
        raise HTTPException(
            400,
            f"Phai quet du {FP_REQUIRED_FINGER_COUNT} ngon moi tra cuu "
            f"(hien co {len(present)}).",
        )
    query_tmpl = (fingers.get(FP_MATCH_FINGER) or "").strip()
    if not query_tmpl:
        raise HTTPException(400, f"Thieu template cua ngon {FP_MATCH_FINGER}.")

    cursor = db.detainees.find(
        {"photos.fp_templates": {"$exists": True, "$ne": {}}},
        {
            "personal_id": 1, "full_name": 1, "cccd_number": 1, "gender": 1, "dob": 1,
            "cell_code": 1, "charge": 1, "hometown": 1, "address": 1,
            "photos.fp_templates": 1, "photos.portrait_front": 1, "photos.cccd_front": 1,
            "created_at": 1,
        },
    )

    matches: list[dict] = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        async for det in cursor:
            fp_templates = (det.get("photos") or {}).get("fp_templates") or {}
            stored_tmpl = fp_templates.get(FP_MATCH_FINGER)
            if not stored_tmpl:
                continue  # can pham khong co left_thumb -> khong the so
            try:
                resp = await client.post(
                    f"{FP_SERVICE_URL}/api/match_pair",
                    json={"t1_b64": query_tmpl, "t2_b64": stored_tmpl},
                )
                if resp.status_code != 200:
                    continue
                score = int(resp.json().get("score", 0))
            except Exception:
                continue
            if score > FP_LEFT_THUMB_THRESHOLD:
                matches.append({
                    "detainee": _s(det),
                    "score": score,
                    "finger_code": FP_MATCH_FINGER,
                })

    matches.sort(key=lambda m: -m["score"])
    top = matches[:10]

    return {
        "matched": len(top) > 0,
        "total": len(top),
        "items": [
            {**m["detainee"], "match_score": m["score"], "match_finger": m["finger_code"]}
            for m in top
        ],
        "score": top[0]["score"] / 100.0 if top else 0.0,
    }


class MatchFingerprintSingleReq(BaseModel):
    template_b64: str


@app.post("/api/detainees/match_fingerprint_single")
async def match_fingerprint_single(body: MatchFingerprintSingleReq, user: dict = Depends(get_current_user)):
    """Tra cứu can phạm bằng 1 template vân tay (luong Search, quet 1 ngon).

    Khac voi match_fingerprint (can 10 ngon + chi so left_thumb): endpoint nay
    nhan 1 ngon bat ky, so voi TAT CA ngon cua moi can pham, lay best_score.
    Ket luan khop neu best_score > FP_SINGLE_THRESHOLD (mac dinh 95, rat chat)
    de giam doan nham khi chi co 1 ngon.
    """
    if not body.template_b64:
        raise HTTPException(400, "Thieu template van tay.")

    cursor = db.detainees.find(
        {"photos.fp_templates": {"$exists": True, "$ne": {}}},
        {
            "personal_id": 1, "full_name": 1, "cccd_number": 1, "gender": 1, "dob": 1,
            "cell_code": 1, "charge": 1, "hometown": 1, "address": 1,
            "photos.fp_templates": 1, "photos.portrait_front": 1, "photos.cccd_front": 1,
            "created_at": 1,
        },
    )

    matches: list[dict] = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        async for det in cursor:
            fp_templates = (det.get("photos") or {}).get("fp_templates") or {}
            best_score = 0
            best_finger = None
            for code, tmpl_b64 in fp_templates.items():
                if not tmpl_b64:
                    continue
                try:
                    resp = await client.post(
                        f"{FP_SERVICE_URL}/api/match_pair",
                        json={"t1_b64": body.template_b64, "t2_b64": tmpl_b64},
                    )
                    if resp.status_code != 200:
                        continue
                    score = int(resp.json().get("score", 0))
                except Exception:
                    continue
                if score > best_score:
                    best_score = score
                    best_finger = code
            if best_score > FP_SINGLE_THRESHOLD:
                matches.append({
                    "detainee": _s(det),
                    "score": best_score,
                    "finger_code": best_finger,
                })

    matches.sort(key=lambda m: -m["score"])
    top = matches[:10]

    return {
        "matched": len(top) > 0,
        "total": len(top),
        "items": [
            {**m["detainee"], "match_score": m["score"], "match_finger": m["finger_code"]}
            for m in top
        ],
        "score": top[0]["score"] / 100.0 if top else 0.0,
    }


async def _compute_face_embedding(portrait_url: str) -> list[float] | None:
    """Tính embedding 512d từ ảnh portrait_front (URL local /uploads/...).

    Trả None nếu model chưa ready / không detect mặt / URL ngoài. Không raise.
    """
    if not portrait_url or not face_recognition_service.is_ready():
        return None
    path = _resolve_upload_path(portrait_url)
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


@app.post("/api/detainees")
async def create_detainee(body: DetaineeIn, request: Request, user: dict = Depends(get_current_user)):
    # Quản trị hệ thống không đi thu nhận can phạm → không TẠO hồ sơ mới.
    # Vẫn giữ quyền SỬA/XOÁ hồ sơ để chữa dữ liệu cán bộ nhập sai.
    if user.get("role") == "admin":
        raise HTTPException(403, "Tài khoản quản trị hệ thống không thu nhận hồ sơ. Việc này do cán bộ thu nhận thực hiện.")
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

    personal_id = (body.personal_id or "").strip()
    if not personal_id:
        raise HTTPException(400, "Thiếu mã can phạm (personal_id).")
    if await db.detainees.find_one({"personal_id": personal_id}):
        raise HTTPException(400, f"Mã can phạm '{personal_id}' đã có trong hệ thống.")

    doc = body.model_dump()
    doc.pop("session_id", None)
    doc.update({
        "personal_id": personal_id,
        "cccd_number": body.cccd_number or "",
        "dob": dob,
        "date_in": _parse_dob(body.date_in),
        "issued_date": _parse_dob(body.issued_date),
        "expiry_date": _parse_dob(body.expiry_date),
        "created_at": now,
        "updated_at": now,
        "created_by": user["username"],
        "session_id": session_doc["_id"],
    })
    try:
        res = await db.detainees.insert_one(doc)
    except Exception as e:
        if "duplicate key" in str(e):
            raise HTTPException(400, f"Số định danh '{personal_id}' đã tồn tại (đồng thời), vui lòng thử lại.")
        raise
    doc["_id"] = res.inserted_id
    await db.work_sessions.update_one(
        {"_id": session_doc["_id"]},
        {"$inc": {"detainee_count": 1}, "$set": {"updated_at": now}},
    )
    # Face embedding từ portrait_front (nếu có ảnh local + model ready)
    portrait_url = (doc.get("photos") or {}).get("portrait_front") or ""
    fe = await _compute_face_embedding(portrait_url)
    if fe:
        await db.detainees.update_one({"_id": doc["_id"]}, {"$set": {"photos.face_embedding": fe}})
        doc.setdefault("photos", {})["face_embedding"] = fe
    await _log(request, user, "create", "detainee", personal_id, {"full_name": body.full_name, "session": session_doc.get("code")}, ref_id=str(res.inserted_id), session_id=session_doc["_id"])
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
    upd["dob"] = _parse_dob(body.dob)
    upd["date_in"] = _parse_dob(body.date_in)
    upd["issued_date"] = _parse_dob(body.issued_date)
    upd["expiry_date"] = _parse_dob(body.expiry_date)
    new_pid = (body.personal_id or "").strip()
    if new_pid:
        conflict = await db.detainees.find_one({"personal_id": new_pid, "_id": {"$ne": _oid(det_id)}})
        if conflict:
            raise HTTPException(400, f"Mã can phạm '{new_pid}' đã có trong hồ sơ khác.")
        upd["personal_id"] = new_pid
        upd["cccd_number"] = body.cccd_number or upd.get("cccd_number", "")
    upd["updated_at"] = datetime.utcnow()
    doc = await db.detainees.find_one_and_update({"_id": _oid(det_id)}, {"$set": upd}, return_document=True)
    # Cập nhật face_embedding nếu portrait_front thay đổi
    portrait_url = (doc.get("photos") or {}).get("portrait_front") or ""
    fe = await _compute_face_embedding(portrait_url)
    if fe:
        await db.detainees.update_one({"_id": _oid(det_id)}, {"$set": {"photos.face_embedding": fe}})
        doc.setdefault("photos", {})["face_embedding"] = fe
    elif not portrait_url:
        # Portrait bị xoá → xoá embedding cũ
        await db.detainees.update_one({"_id": _oid(det_id)}, {"$unset": {"photos.face_embedding": ""}})
    await _log(request, user, "update", "detainee", doc.get("personal_id", det_id), {"full_name": body.full_name}, ref_id=det_id, session_id=doc.get("session_id"))
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
    await _log(request, user, "delete", "detainee", doc.get("personal_id", det_id), ref_id=det_id, session_id=sid)
    return {"ok": True}


@app.get("/api/detainees/by-personal-id/{personal_id}")
async def get_detainee_by_personal_id(personal_id: str, user: dict = Depends(get_current_user)):
    doc = await db.detainees.find_one({"personal_id": personal_id})
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
        request, user, "update", "detainee", doc.get("personal_id", det_id),
        {"transfer": {"from": old_code, "to": new_code}}, ref_id=det_id,
    )
    return {"ok": True, "from": old_code, "to": new_code}


# ==================== WORK SESSIONS ====================
@app.post("/api/sessions")
async def open_session(body: WorkSessionIn, request: Request, user: dict = Depends(get_current_user)):
    officer_username = user["username"]
    # Quản trị hệ thống không đi thu nhận can phạm → không mở phiên làm việc.
    # Admin vẫn xem/đóng/xoá phiên + tải báo cáo của cán bộ (vai giám sát).
    if user.get("role") == "admin":
        raise HTTPException(403, "Tài khoản quản trị hệ thống không mở phiên thu nhận. Phiên làm việc do cán bộ thu nhận mở.")
    existing = await _get_open_session_or_none(officer_username)
    if existing:
        raise HTTPException(409, f"Bạn đang có 1 phiên đang mở ({existing.get('code','?')}). Đóng phiên đó trước khi mở phiên mới.")
    officer_doc = await db.users.find_one({"username": officer_username}) or {}
    default_full_name = officer_doc.get("full_name", "") or officer_username
    override = (body.officer_full_name or "").strip()
    now = datetime.utcnow()
    doc = {
        "code": await _next_session_code(),
        "status": "open",
        "case_name": body.case_name.strip(),
        "commune_code": body.commune_code.strip(),
        "officer": officer_username,
        "officer_full_name": override or default_full_name,
        "location": body.location.strip() or "Trung tâm thu thập dữ liệu",
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
    # Admin không chạy phiên → luôn coi như không có phiên đang mở, kể cả khi
    # dữ liệu cũ còn phiên do admin mở từ trước.
    if user.get("role") == "admin":
        raise HTTPException(404, "Tài khoản quản trị hệ thống không có phiên làm việc.")
    doc = await _get_open_session_or_none(user["username"])
    if not doc:
        raise HTTPException(404, "Bạn chưa có phiên làm việc nào đang mở.")
    return _s_session(doc)


@app.get("/api/sessions/full")
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
    open_count = await db.work_sessions.count_documents({**filt, "status": "open"})
    closed_count = await db.work_sessions.count_documents({**filt, "status": "closed"})

    items: list[dict] = []
    async for s in db.work_sessions.find(filt).sort("opened_at", -1).skip(skip).limit(limit):
        row = _s_session(s)
        officer_doc = await db.users.find_one({"username": s.get("officer")}) or {}
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
            async for d in db.detainees.find({"session_id": s["_id"]}).sort("created_at", 1):
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
    # So dau vet hien truong moi phien -> cot "So dau vet" tren bang chon vu an.
    # ponytail: 1 aggregate cho ca trang; doi cach neu limit len hang nghin.
    if items:
        oids = [_oid(i["id"]) for i in items]
        counts = {}
        async for r in db.scene_traces.aggregate([
            {"$match": {"session_id": {"$in": oids}}},
            {"$group": {"_id": "$session_id", "n": {"$sum": 1}}},
        ]):
            counts[str(r["_id"])] = r["n"]
        for i in items:
            i["scene_count"] = counts.get(i["id"], 0)
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
    async for d in db.detainees.find({"session_id": session_doc["_id"]}).sort("created_at", 1):
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
            "personal_id": d.get("personal_id", "") or "",
            "full_name": d.get("full_name", ""),
            "cccd_number": d.get("cccd_number", "") or "",
            "gender": d.get("gender", "male"),
            "dob": (d["dob"].isoformat() if isinstance(d.get("dob"), datetime) else d.get("dob")) or None,
            "cell_code": d.get("cell_code", "") or "",
            "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else None,
        })
    out = _s_session(doc)
    out["detainees"] = detainees
    return out


@app.post("/api/sessions/{session_id}/sync-log")
async def log_session_sync(
    session_id: str,
    body: SyncLogBody,
    request: Request,
    user: dict = Depends(get_current_user),
):
    doc = await db.work_sessions.find_one({"_id": _oid(session_id)})
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
    await _log(
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
    await db.work_sessions.update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "status": "closed",
            "closed_at": now,
        }},
    )
    await _log(
        request, user, "update", "work_session", doc.get("code", ""),
        {"action": "close", "detainee_count": doc.get("detainee_count", 0)},
        ref_id=session_id, session_id=doc["_id"],
    )
    return {"ok": True, "closed_at": now.isoformat()}


@app.get("/api/sessions/{session_id}/report")
async def download_session_report(session_id: str, user: dict = Depends(get_current_user)):
    doc = await db.work_sessions.find_one({"_id": _oid(session_id)})
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


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    doc = await db.work_sessions.find_one({"_id": _oid(session_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy phiên làm việc.")
    if doc.get("officer") != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Bạn không có quyền xoá phiên này.")
    if doc.get("status") != "open" and user.get("role") != "admin":
        raise HTTPException(400, "Chỉ có thể xoá phiên đang mở, chưa đóng.")
    # Xoá toàn bộ hồ sơ can phạm thuộc phiên này
    cursor = db.detainees.find({"session_id": doc["_id"]}, {"personal_id": 1})
    deleted_count = 0
    async for d in cursor:
        await db.detainees.delete_one({"_id": d["_id"]})
        deleted_count += 1
        await _log(request, user, "delete", "detainee", d.get("personal_id", str(d["_id"])), ref_id=str(d["_id"]), session_id=doc["_id"])
    await db.work_sessions.delete_one({"_id": doc["_id"]})
    await _log(request, user, "delete", "work_session", doc.get("code", ""), ref_id=session_id, session_id=doc["_id"], data={"deleted_detainees": deleted_count})
    return {"ok": True, "deleted_detainees": deleted_count}


# ==================== PHOTO UPLOAD ====================
@app.post("/api/upload/photo")
async def upload_photo(
    file: UploadFile = File(...),
    type: str = Query(default=""),
    user: dict = Depends(get_current_user),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(400, "Chỉ hỗ trợ ảnh jpg/png/webp")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Ảnh vượt quá 5MB")

    boxed = False
    n_persons = None
    head_ratio = None
    # Ảnh có vạch đỏ CHỈ để frontend xem tạm ngay sau khi chụp (data URI, không ghi đĩa).
    # File lưu xuống đĩa + URL vào DB luôn là ẢNH GỐC SẠCH, không có vạch.
    preview_b64 = None
    if type == "portrait" and person_detect.is_ready():
        try:
            boxed_bytes, n_persons, head_ratio = await anyio.to_thread.run_sync(
                person_detect.draw_person_boxes, data
            )
            preview_b64 = base64.b64encode(boxed_bytes).decode("ascii")
            boxed = True
        except Exception:  # noqa: BLE001 — không hỏng flow chụp
            boxed = False
            n_persons = None
            head_ratio = None
            preview_b64 = None

    name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{ObjectId()}{ext}"
    path = os.path.join(UPLOAD_DIR, name)
    with open(path, "wb") as f:
        f.write(data)
    return {
        "url": f"/uploads/{name}",
        "size": len(data),
        "boxed": boxed,
        "n_persons": n_persons,
        "head_ratio": head_ratio,
        "preview_url": f"data:image/jpeg;base64,{preview_b64}" if preview_b64 else None,
    }


@app.get("/api/detect/health")
async def detect_health(user: dict = Depends(get_current_user)):
    return person_detect.get_status()


@app.get("/api/face/health")
async def face_health(user: dict = Depends(get_current_user)):
    return face_recognition_service.get_status()


@app.post("/api/face/recognize")
async def face_recognize(
    request: Request,
    file: UploadFile | None = File(None),
    user: dict = Depends(get_current_user),
):
    """Nhận diện khuôn mặt + match toàn hệ thống.

    Nhận multipart 'file' HOẶC JSON body {url: '/uploads/...'}.
    Trả {ready, method, n_faces, matches:[{detainee(gọn), score}]} —
    cosine >= FACE_MATCH_THRESHOLD, sort desc, limit 5.
    """
    # Lấy bytes ảnh: từ file upload hoặc từ URL local
    img_bytes = None
    if file is not None:
        img_bytes = await file.read()
    else:
        try:
            body = await request.json()
        except Exception:
            body = {}
        url = (body or {}).get("url", "")
        path = _resolve_upload_path(url)
        if not path:
            raise HTTPException(400, "Cần gửi file ảnh hoặc url '/uploads/...'.")
        with open(path, "rb") as f:
            img_bytes = f.read()

    if not img_bytes:
        raise HTTPException(400, "Ảnh trống.")

    if not face_recognition_service.is_ready():
        return {"ready": False, "method": "none", "n_faces": 0, "matches": []}

    embedding, n_faces, method = await anyio.to_thread.run_sync(
        face_recognition_service.get_embedding, img_bytes
    )
    if embedding is None:
        return {"ready": True, "method": method, "n_faces": 0, "matches": []}

    # Scan toàn hệ thống các doc có face_embedding
    candidates = []
    cursor = db.detainees.find(
        {"photos.face_embedding": {"$exists": True, "$ne": []}},
        {"_id": 1, "photos.face_embedding": 1},
    )
    async for d in cursor:
        fe = (d.get("photos") or {}).get("face_embedding")
        if fe:
            candidates.append({"_id": d["_id"], "face_embedding": fe})

    hits = await anyio.to_thread.run_sync(
        lambda: face_recognition_service.match(embedding, candidates, FACE_MATCH_THRESHOLD)
    )
    hits = hits[:5]
    # Lấy doc gọn cho top hits
    matches = []
    if hits:
        ids = [_oid(h["_id"]) for h in hits]
        score_by_id = {str(_oid(h["_id"])): h["score"] for h in hits}
        async for d in db.detainees.find({"_id": {"$in": ids}}, _MATCH_PROJECTION):
            det_id = str(d["_id"])
            matches.append({
                "detainee": _s(d),
                "score": score_by_id.get(det_id, 0.0),
            })
    # Giữ thứ tự sort desc
    matches.sort(key=lambda m: -m["score"])
    return {"ready": True, "method": method, "n_faces": n_faces, "matches": matches}


@app.post("/api/face/backfill")
async def face_backfill(user: dict = Depends(get_current_user)):
    """Tính lại face_embedding cho mọi detainee có portrait_front + chưa có embedding.

    Admin only. Chạy batch, không block. Trả {updated, skipped, failed}.
    """
    if user.get("role") != "admin":
        raise HTTPException(403, "Chỉ admin mới được backfill.")
    updated = skipped = failed = 0
    cursor = db.detainees.find(
        {"photos.portrait_front": {"$exists": True, "$ne": ""}},
        {"_id": 1, "photos.portrait_front": 1, "photos.face_embedding": 1},
    )
    async for d in cursor:
        photos = d.get("photos") or {}
        if photos.get("face_embedding"):
            skipped += 1
            continue
        url = photos.get("portrait_front") or ""
        fe = await _compute_face_embedding(url)
        if fe:
            await db.detainees.update_one({"_id": d["_id"]}, {"$set": {"photos.face_embedding": fe}})
            updated += 1
        else:
            failed += 1
    return {"updated": updated, "skipped": skipped, "failed": failed}


@app.get("/api/config/measurement")
async def measurement_config(user: dict = Depends(get_current_user)):
    return {"height_image": get_height_image(), "height_offset": get_height_offset()}


class MeasurementConfigIn(BaseModel):
    height_image: float = Field(..., gt=0, le=HEIGHT_IMAGE_MAX)
    height_offset: float = Field(..., gt=0, le=HEIGHT_OFFSET_MAX)


@app.put("/api/config/measurement")
async def update_measurement_config(body: MeasurementConfigIn, request: Request, admin: dict = Depends(require_admin)):
    global _height_image_cache, _height_offset_cache
    value = float(body.height_image)
    offset = float(body.height_offset)
    await db.settings.update_one(
        {"_id": "measurement"},
        {"$set": {"height_image": value, "height_offset": offset}},
        upsert=True,
    )
    _height_image_cache = value
    _height_offset_cache = offset
    await _log(request, admin, "update", "setting", "measurement", {"height_image": value, "height_offset": offset})
    return {"height_image": value, "height_offset": offset}


@app.get("/api/config/fingerprint")
async def fingerprint_config(user: dict = Depends(get_current_user)):
    return {
        "by_finger": get_fp_min_quality(),
        "default": FP_MIN_QUALITY_DEFAULT,
        "codes": FP_FINGER_CODES,
    }


class FingerprintConfigIn(BaseModel):
    by_finger: dict


@app.put("/api/config/fingerprint")
async def update_fingerprint_config(body: FingerprintConfigIn, request: Request, admin: dict = Depends(require_admin)):
    """Đổi ngưỡng chất lượng cho từng ngón vân tay. Chỉ admin.

    Ngưỡng này quyết định vân tay nào được LƯU vào hệ thống: hạ ngưỡng nghĩa là
    chấp nhận template kém hơn, làm sai kết quả tra cứu về sau. Vì vậy phải ghi
    audit log, và giá trị cũ được lưu kèm để truy được ai hạ và hạ từ mức nào.
    """
    got = _sanitize_fp_map(body.by_finger)
    if not got:
        raise HTTPException(
            400,
            "Cần ít nhất 1 mã ngón hợp lệ, giá trị nguyên 0-"
            f"{FP_MIN_QUALITY_MAX}.",
        )
    previous = {c: _fp_min_quality_cache[c] for c in got}
    merged = dict(_fp_min_quality_cache)
    merged.update(got)
    await db.settings.update_one(
        {"_id": "fingerprint"},
        {"$set": {"by_finger": merged}},
        upsert=True,
    )
    _fp_min_quality_cache.update(got)
    # Mongo đã lưu (nguồn thật) nên đẩy sang service Morfin thất bại KHÔNG làm
    # request fail - service có thể đang tắt. Trả applied để UI nói rõ là đã lưu
    # nhưng chưa áp dụng, thay vì để admin tưởng ngưỡng mới đang có tác dụng.
    applied = await _push_fp_quality(merged)
    # Chỉ log ngón THỰC SỰ đổi giá trị: log cả 10 ngón mỗi lần bấm Lưu sẽ làm
    # audit trail không còn đọc được ai đã hạ ngưỡng ngón nào.
    changed = {c: v for c, v in got.items() if previous.get(c) != v}
    await _log(request, admin, "update", "setting", "fingerprint",
               {"changed": changed, "previous": {c: previous[c] for c in changed},
                "applied": applied})
    return {
        "by_finger": merged,
        "default": FP_MIN_QUALITY_DEFAULT,
        "codes": FP_FINGER_CODES,
        "applied": applied,
    }


# ==================== CCCD READER (watch folder data_cccd) ====================
from cccd_watcher import (
    cccd_health as _cccd_health,
    cccd_start_session as _cccd_start_session,
    cccd_wait_session as _cccd_wait_session,
    cccd_read_again as _cccd_read_again,
    cccd_end_session as _cccd_end_session,
    cccd_session_count as _cccd_session_count,
    cccd_inject as _cccd_inject,
)


@app.get("/api/cccd/health")
async def cccd_health(user: dict = Depends(get_current_user)):
    return _cccd_health()


@app.post("/api/cccd/session/start")
async def cccd_session_start(user: dict = Depends(get_current_user)):
    sid = _cccd_start_session()
    return {"session_id": sid}


@app.get("/api/cccd/session/{sid}/wait")
async def cccd_session_wait(sid: str, timeout: int = Query(25, ge=1, le=60), user: dict = Depends(get_current_user)):
    result = await _cccd_wait_session(sid, timeout)
    if result is None:
        raise HTTPException(404, "Phiên không tồn tại hoặc đã hết hạn.")
    if result.get("status") == "timeout":
        return Response(status_code=204)
    return result


@app.post("/api/cccd/session/{sid}/read_again")
async def cccd_session_read_again(sid: str, user: dict = Depends(get_current_user)):
    ok = _cccd_read_again(sid)
    if not ok:
        raise HTTPException(404, "Phiên không tồn tại.")
    return {"ok": True}


@app.delete("/api/cccd/session/{sid}")
async def cccd_session_delete(sid: str, user: dict = Depends(get_current_user)):
    _cccd_end_session(sid)
    return {"ok": True}


# ---------- CCCD PUSH (máy ngoài bắn dữ liệu quét CCCD lên) ----------
CCCD_API_KEY = os.getenv("CCCD_API_KEY", "")
CCCD_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "cccd_push")
os.makedirs(CCCD_UPLOAD_DIR, exist_ok=True)


def _require_cccd_key(request: Request) -> None:
    if CCCD_API_KEY and request.headers.get("X-CCCD-Key", "") != CCCD_API_KEY:
        raise HTTPException(401, "Sai X-CCCD-Key")


def _norm_sex_vi(gender: Optional[str]) -> str:
    if not gender:
        return ""
    g = gender.strip().lower()
    if g in ("male", "nam", "m"):
        return "Nam"
    if g in ("female", "nữ", "nu", "f"):
        return "Nữ"
    return gender.strip()


def _safe_name_segment(s: str) -> str:
    s = (s or "").strip() or "unknown"
    return re.sub(r"[^\w\-. ]+", "_", s, flags=re.UNICODE)[:80] or "unknown"


class CCCDPushBody(BaseModel):
    cccd_number: str = Field(..., pattern=r"^\d{12}$")
    full_name: str = Field(..., min_length=1, max_length=100)
    dob: Optional[str] = None
    gender: Optional[str] = None
    nationality: Optional[str] = None
    hometown: Optional[str] = None
    address: Optional[str] = None
    issued_date: Optional[str] = None
    expiry_date: Optional[str] = None
    issued_place: Optional[str] = None            # cơ quan cấp (nhập tay / OCR)
    cmnd_old: Optional[str] = Field(None, max_length=20)
    ethnicity: Optional[str] = None
    religion: Optional[str] = None
    personal_identification: Optional[str] = None  # đặc điểm nhận dạng
    mrz: Optional[str] = None                     # MRZ 2-3 dòng (text, máy ngoài decode sẵn)
    face_photo: Optional[str] = Field(None, max_length=500)
    source: Optional[str] = Field(None, max_length=64)


def _gender_to_en(gender: Optional[str]) -> Optional[str]:
    if not gender:
        return None
    g = gender.strip().lower()
    if g in ("male", "nam", "m"):
        return "male"
    if g in ("female", "nữ", "nu", "f"):
        return "female"
    return None


@app.post("/api/cccd/push")
async def cccd_push(body: CCCDPushBody, request: Request):
    """Máy ngoài bắn dữ liệu CCCD vừa quét lên. Backend đẩy thẳng dữ liệu
    vào hàng đợi của mọi session đang long-poll /api/cccd/session/{sid}/wait
    — không phụ thuộc file watcher, không ghi ra data_cccd/."""
    _require_cccd_key(request)

    now = datetime.utcnow()
    pid = body.personal_identification or ""
    data = {
        "cccd_number": body.cccd_number,
        "full_name": body.full_name,
        "dob": body.dob or "",
        "gender": _gender_to_en(body.gender),
        "sex_vi": _norm_sex_vi(body.gender),
        "nationality": body.nationality or "",
        "hometown": body.hometown or "",
        "address": body.address or "",
        "issued_date": body.issued_date or "",
        "expiry_date": body.expiry_date or "",
        "issued_place": "CỤC CẢNH SÁT QLHC VỀ TTXH",            # cơ quan cấp — hardcode cứng, bỏ qua body
        "cmnd_old": body.cmnd_old or "",
        "personal_identification": pid,
        "distinguishing_features": pid,                          # song song — FE dùng key này
        "mrz": body.mrz or "",
        "ethnicity": body.ethnicity or "",
        "religion": body.religion or "",
        "facePhoto": body.face_photo or "",
        "_scan_folder": f"push_{now.strftime('%d.%m.%Y.%H.%M.%S')}",
        "_source": body.source or "",
    }

    delivered = _cccd_inject(data)
    return {
        "ok": True,
        "cccd_number": body.cccd_number,
        "delivered": delivered,
        "ts": now.isoformat(),
    }


@app.post("/api/cccd/upload_image")
async def cccd_upload_image(request: Request, file: UploadFile = File(...)):
    """Máy ngoài upload ảnh CCCD/khuôn mặt trước khi gọi /api/cccd/push.
    Trả URL để đưa vào field face_photo của POST /api/cccd/push."""
    _require_cccd_key(request)
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(400, "Chỉ hỗ trợ ảnh jpg/png/webp")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Ảnh vượt quá 5MB")
    name = f"cccd_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{ObjectId()}{ext}"
    path = os.path.join(CCCD_UPLOAD_DIR, name)
    with open(path, "wb") as f:
        f.write(data)
    return {"url": f"/uploads/cccd_push/{name}", "size": len(data)}


# ==================== DẤU VẾT HIỆN TRƯỜNG (ảnh vụ án) ====================
# Vụ án = work_session (không tách collection riêng). Mỗi ảnh là 1 doc trong
# scene_traces, seq tự tăng trong phiên => hiển thị "Ảnh 001", "Ảnh 002"...
# Nguồn ảnh: máy ngoài bắn sang (/api/scene/push, xác thực bằng header) hoặc
# cán bộ tự chụp/chọn file trên UI (/api/scene/traces, xác thực bằng JWT).
SCENE_API_KEY = os.getenv("SCENE_API_KEY", "")
SCENE_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "scene")
os.makedirs(SCENE_UPLOAD_DIR, exist_ok=True)

SCENE_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}
SCENE_MAX_BYTES = 10 * 1024 * 1024          # ảnh hiện trường thường to hơn ảnh chân dung


def _require_scene_key(request: Request) -> None:
    if SCENE_API_KEY and request.headers.get("X-Scene-Key", "") != SCENE_API_KEY:
        raise HTTPException(401, "Sai X-Scene-Key")


def _s_scene(doc: dict) -> dict:
    if not doc:
        return doc
    out = dict(doc)
    out["id"] = str(out.pop("_id"))
    out["session_id"] = str(out.get("session_id") or "")
    for k in ("created_at", "captured_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    # embedding là vector 512 số, không cần trả về UI cho nhẹ payload.
    out.pop("face_embedding", None)
    return out


async def _next_scene_seq(session_oid) -> int:
    """Số thứ tự ảnh trong phiên. Dùng counters như _next_session_code để 2 máy
    bắn ảnh cùng lúc không nhận trùng seq."""
    doc = await db.counters.find_one_and_update(
        {"_id": f"scene_seq_{session_oid}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return int(doc.get("seq", 1))


async def _save_scene_image(data: bytes, ext: str) -> tuple[str, str]:
    ext = (ext or "").lower()
    if ext not in SCENE_ALLOWED_EXT:
        raise HTTPException(400, "Chỉ hỗ trợ ảnh jpg/png/webp")
    if not data:
        raise HTTPException(400, "Ảnh rỗng")
    if len(data) > SCENE_MAX_BYTES:
        raise HTTPException(400, "Ảnh vượt quá 10MB")
    name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{ObjectId()}{ext}"
    path = os.path.join(SCENE_UPLOAD_DIR, name)
    with open(path, "wb") as f:
        f.write(data)
    return f"/uploads/scene/{name}", name


async def _insert_scene_trace(
    session_doc: dict,
    url: str,
    size: int,
    ext: str,
    *,
    source: str,
    note: str = "",
    trace_type: str = "",
    collection_source: str = "",
    device_id: str = "",
    captured_at: Optional[datetime] = None,
    created_by: str = "",
) -> dict:
    now = datetime.utcnow()
    doc = {
        "session_id": session_doc["_id"],
        "seq": await _next_scene_seq(session_doc["_id"]),
        "url": url,
        "size": size,
        "mime": f"image/{'jpeg' if ext in ('.jpg', '.jpeg') else ext.lstrip('.')}",
        "note": (note or "").strip(),
        "trace_type": (trace_type or "").strip(),
        "collection_source": (collection_source or "").strip(),
        "source": source,
        "device_id": (device_id or "").strip(),
        "captured_at": captured_at or now,
        "created_at": now,
        "created_by": created_by,
        # Để sẵn cho tính năng matching sau này, chưa tính lúc upload.
        "face_embedding": None,
        "face_count": None,
    }
    res = await db.scene_traces.insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc


async def _scene_session_or_400(session_id: Optional[str], username: str) -> dict:
    """Ảnh hiện trường BẮT BUỘC thuộc 1 phiên. Có session_id thì dùng, không có
    thì lấy phiên đang mở; không có phiên nào mở thì báo cần khởi tạo phiên."""
    if session_id:
        doc = await db.work_sessions.find_one({"_id": _oid(session_id)})
        if not doc:
            raise HTTPException(400, "Phiên làm việc không tồn tại.")
        return doc
    doc = await _get_open_session_or_none(username) if username else None
    if not doc:
        doc = await db.work_sessions.find_one({"status": "open"})
    if not doc:
        raise HTTPException(409, "Chưa có phiên làm việc nào đang mở. Cần khởi tạo phiên trước khi thêm dấu vết hiện trường.")
    return doc


@app.get("/api/scene/health")
async def scene_health(request: Request):
    """Máy ngoài tự kiểm tra kết nối + xem có phiên nào đang mở để bắn ảnh vào."""
    _require_scene_key(request)
    sess = await db.work_sessions.find_one({"status": "open"})
    return {
        "ok": True,
        "has_open_session": bool(sess),
        "session_id": str(sess["_id"]) if sess else None,
        "session_code": (sess or {}).get("code"),
        "case_name": (sess or {}).get("case_name", ""),
        "max_bytes": SCENE_MAX_BYTES,
        "allowed_ext": sorted(SCENE_ALLOWED_EXT),
    }


@app.post("/api/scene/push")
async def scene_push(
    request: Request,
    file: Optional[UploadFile] = File(default=None),
    session_id: Optional[str] = Form(default=None),
    note: str = Form(default=""),
    device_id: str = Form(default=""),
):
    """Máy ngoài bắn ảnh hiện trường lên. Nhận cả 2 kiểu để không phụ thuộc
    thiết bị: multipart (field `file`) hoặc JSON {image_b64, filename, ...}."""
    _require_scene_key(request)

    if file is not None:
        data = await file.read()
        ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
        sid, note_in, dev = session_id, note, device_id
    else:
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(400, "Thiếu ảnh: gửi multipart field 'file' hoặc JSON 'image_b64'.")
        b64 = (body.get("image_b64") or "").strip()
        if not b64:
            raise HTTPException(400, "Thiếu ảnh: gửi multipart field 'file' hoặc JSON 'image_b64'.")
        if "," in b64[:64] and b64.lstrip().startswith("data:"):
            b64 = b64.split(",", 1)[1]                       # bỏ tiền tố data:image/...;base64,
        try:
            data = base64.b64decode(b64, validate=False)
        except Exception:
            raise HTTPException(400, "image_b64 không phải base64 hợp lệ")
        ext = os.path.splitext(body.get("filename") or "")[1].lower() or ".jpg"
        sid = body.get("session_id") or session_id
        note_in = body.get("note") or ""
        dev = body.get("device_id") or ""

    session_doc = await _scene_session_or_400(sid, "")
    url, _ = await _save_scene_image(data, ext)
    doc = await _insert_scene_trace(
        session_doc, url, len(data), ext,
        source="push", note=note_in, device_id=dev, created_by="",
    )
    return _s_scene(doc)


@app.get("/api/scene/traces")
async def list_scene_traces(
    session_id: Optional[str] = Query(default=None),
    user: dict = Depends(get_current_user),
):
    session_doc = await _scene_session_or_400(session_id, user["username"])
    items = [
        _s_scene(d)
        async for d in db.scene_traces.find({"session_id": session_doc["_id"]}).sort([("seq", 1)])
    ]
    return {
        "session": {
            "id": str(session_doc["_id"]),
            "code": session_doc.get("code", ""),
            "case_name": session_doc.get("case_name", ""),
            "status": session_doc.get("status", ""),
            "opened_at": (session_doc.get("opened_at").isoformat()
                          if isinstance(session_doc.get("opened_at"), datetime) else None),
        },
        "items": items,
        "total": len(items),
    }


@app.post("/api/scene/traces")
async def create_scene_trace(
    request: Request,
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(default=None),
    note: str = Form(default=""),
    source: str = Form(default="upload"),
    user: dict = Depends(get_current_user),
):
    """Cán bộ chụp camera hoặc chọn file trên UI."""
    session_doc = await _scene_session_or_400(session_id, user["username"])
    data = await file.read()
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    url, _ = await _save_scene_image(data, ext)
    doc = await _insert_scene_trace(
        session_doc, url, len(data), ext,
        source="camera" if source == "camera" else "upload",
        note=note, created_by=user["username"],
    )
    await _log(request, user, "create", "scene_trace", f"#{doc['seq']}",
               ref_id=str(doc["_id"]), session_id=session_doc["_id"])
    return _s_scene(doc)


class SceneTracePatch(BaseModel):
    """PATCH thật: field nào None là không gửi -> giữ nguyên giá trị cũ.
    Không dùng default="" vì caller chỉ sửa ghi chú sẽ xoá trắng 2 field kia."""
    note: Optional[str] = Field(default=None, max_length=500)
    trace_type: Optional[str] = Field(default=None, max_length=100)
    collection_source: Optional[str] = Field(default=None, max_length=200)


@app.patch("/api/scene/traces/{trace_id}")
async def update_scene_trace(
    trace_id: str,
    body: SceneTracePatch,
    request: Request,
    user: dict = Depends(get_current_user),
):
    doc = await db.scene_traces.find_one({"_id": _oid(trace_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy dấu vết hiện trường.")
    patch = {
        k: v.strip()
        for k, v in (
            ("note", body.note),
            ("trace_type", body.trace_type),
            ("collection_source", body.collection_source),
        )
        if v is not None
    }
    if patch:
        await db.scene_traces.update_one({"_id": doc["_id"]}, {"$set": patch})
        doc.update(patch)
    await _log(request, user, "update", "scene_trace", f"#{doc.get('seq')}",
               ref_id=trace_id, session_id=doc.get("session_id"))
    return _s_scene(doc)


@app.delete("/api/scene/traces/{trace_id}")
async def delete_scene_trace(
    trace_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    doc = await db.scene_traces.find_one({"_id": _oid(trace_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy dấu vết hiện trường.")
    await db.scene_traces.delete_one({"_id": doc["_id"]})
    # Xoá luôn file trên đĩa; lỗi xoá file không được làm hỏng API.
    url = doc.get("url") or ""
    if url.startswith("/uploads/scene/"):
        try:
            os.remove(os.path.join(SCENE_UPLOAD_DIR, os.path.basename(url)))
        except OSError:
            pass
    await _log(request, user, "delete", "scene_trace", f"#{doc.get('seq')}",
               ref_id=trace_id, session_id=doc.get("session_id"))
    return {"ok": True}

# ==================== WEIGHT SCALE (push từ máy cân ngoài + WS broadcast) ====================
from weight_hub import hub as _weight_hub

WEIGHT_API_KEY = os.getenv("WEIGHT_API_KEY", "")


class WeightPushBody(BaseModel):
    weight_kg: float = Field(..., ge=0, le=500)
    source: Optional[str] = Field(None, max_length=64)


@app.post("/api/weight/push")
async def weight_push(body: WeightPushBody, request: Request):
    if WEIGHT_API_KEY:
        if request.headers.get("X-Weight-Key", "") != WEIGHT_API_KEY:
            raise HTTPException(401, "Sai X-Weight-Key")
    payload = {
        "weight_kg": round(body.weight_kg, 1),
        "source": body.source or "",
        "ts": datetime.utcnow().isoformat(),
    }
    delivered = await _weight_hub.broadcast(payload)
    return {"ok": True, "delivered": delivered, **payload}


@app.get("/api/weight/last")
async def weight_last(user: dict = Depends(get_current_user)):
    return _weight_hub.last_value or {"weight_kg": None}


@app.websocket("/api/weight/ws")
async def weight_ws(ws: WebSocket):
    await _weight_hub.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await _weight_hub.disconnect(ws)


# ==================== IMPORT / EXPORT ====================
EXCEL_COLS = [
    ("personal_id", "Số định danh"),
    ("full_name", "Họ và tên"),
    ("gender", "Giới tính"),
    ("dob", "Ngày sinh"),
    ("cccd_number", "Số CCCD"),
    ("hometown", "Quê quán"),
    ("address", "Địa chỉ"),
    ("ethnicity", "Dân tộc"),
    ("religion", "Tôn giáo"),
    ("facility_code", "Nơi giam giữ"),
    ("sub_camp_code", "Phân trại"),
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
    async for d in db.detainees.find({}).sort("personal_id", 1):
        row = []
        for k, _ in EXCEL_COLS:
            v = d.get(k, "")
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
            dob = _parse_dob(get("dob"))
            date_in = _parse_dob(get("date_in"))
            personal_id = (get("personal_id") or "").strip()
            if not personal_id:
                errors.append(f"Dòng {i}: thiếu mã can phạm (personal_id)")
                continue
            doc = {
                "personal_id": personal_id,
                "full_name": full_name,
                "gender": (get("gender") or "male").lower(),
                "dob": dob,
                "cccd_number": get("cccd_number") or "",
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
                    errors.append(f"Dòng {i}: số định danh {personal_id} đã tồn tại")
                else:
                    errors.append(f"Dòng {i}: {e}")
        except Exception as e:
            errors.append(f"Dòng {i}: {e}")
    await _log(request, user, "import", "detainee", "", {"inserted": inserted, "errors": len(errors)})
    return {"inserted": inserted, "errors": errors}


# ==================== STATS ====================
@app.get("/api/stats")
async def stats(user: dict = Depends(get_current_user)):
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    d14_start = today_start - timedelta(days=13)
    d7_start = today_start - timedelta(days=6)

    total = await db.detainees.count_documents({})
    today = await db.detainees.count_documents({"created_at": {"$gte": today_start}})
    yesterday = await db.detainees.count_documents(
        {"created_at": {"$gte": yesterday_start, "$lt": today_start}}
    )
    male = await db.detainees.count_documents({"gender": "male"})
    female = await db.detainees.count_documents({"gender": "female"})

    activity_map: dict = {}
    async for row in db.detainees.aggregate([
        {"$match": {"created_at": {"$gte": d14_start}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "count": {"$sum": 1},
        }},
    ]):
        activity_map[row["_id"]] = row["count"]
    activity_14d = []
    for i in range(14):
        d = d14_start + timedelta(days=i)
        key = d.strftime("%Y-%m-%d")
        activity_14d.append({"date": key, "count": activity_map.get(key, 0)})

    top_charges = []
    async for row in db.detainees.aggregate([
        {"$match": {"charge": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$charge", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5},
    ]):
        top_charges.append({"charge": row["_id"], "count": row["count"]})

    officer_stats = []
    async for row in db.audit_logs.aggregate([
        {"$match": {
            "action": "create",
            "resource": "detainee",
            "at": {"$gte": d7_start},
        }},
        {"$group": {"_id": "$actor", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 6},
    ]):
        u = await db.users.find_one({"username": row["_id"]}) or {}
        officer_stats.append({
            "username": row["_id"],
            "full_name": u.get("full_name") or row["_id"],
            "avatar_url": u.get("avatar_url"),
            "count": row["count"],
        })

    # Admin quản lý phiên chứ không chạy phiên → không có "phiên đang mở" của riêng mình.
    open_session_doc = None
    if user.get("role") != "admin":
        open_session_doc = await _get_open_session_or_none(user["username"])
    open_session = _s_session(open_session_doc) if open_session_doc else None

    sess_filt: dict = {}
    if user.get("role") != "admin":
        sess_filt["officer"] = user["username"]
    recent_sessions = [
        _s_session(d)
        async for d in db.work_sessions.find(sess_filt).sort("opened_at", -1).limit(5)
    ]

    missing_data_count = await db.detainees.count_documents({"$or": [
        {"photos.portrait_front": {"$in": [None, ""]}},
        {"photos.portrait_front": {"$exists": False}},
        {"cccd_number": {"$in": [None, ""]}},
    ]})

    recent_activity = []
    async for l in db.audit_logs.find({}).sort("at", -1).limit(8):
        u = await db.users.find_one({"username": l.get("actor", "")}) or {}
        recent_activity.append({
            "id": str(l.get("_id")),
            "at": l.get("at").isoformat() if isinstance(l.get("at"), datetime) else None,
            "actor": l.get("actor"),
            "actor_full_name": u.get("full_name") or l.get("actor"),
            "action": l.get("action"),
            "resource": l.get("resource"),
            "ref": l.get("ref"),
        })

    recent = [_s(d) async for d in db.detainees.find({}).sort("created_at", -1).limit(5)]

    return {
        "total": total,
        "today": today,
        "yesterday": yesterday,
        "male": male,
        "female": female,
        "activity_14d": activity_14d,
        "top_charges": top_charges,
        "today_by_officer": officer_stats,
        "open_session": open_session,
        "recent_sessions": recent_sessions,
        "missing_data_count": missing_data_count,
        "recent_activity": recent_activity,
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
    actor: Optional[str] = Query(None),
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
    elif actor:
        filt["actor"] = actor
    if session_code:
        sess = await db.work_sessions.find_one({"code": session_code})
        if sess:
            filt["session_id"] = sess["_id"]
        else:
            filt["session_id"] = None
            filt["_impossible"] = True

    session_cache: dict = {}
    user_cache: dict = {}
    detainee_cache: dict = {}

    async def _resolve_detainee(ref_id, ref):
        # Trả về tên + số căn cước can phạm cho cột báo cáo.
        if not ref_id and not ref:
            return None
        key = ref_id or ("ref:" + ref)
        if key not in detainee_cache:
            d = None
            if ref_id:
                try:
                    d = await db.detainees.find_one({"_id": _oid(ref_id)})
                except Exception:
                    d = None
            if d is None and ref:
                d = await db.detainees.find_one({"personal_id": ref})
            detainee_cache[key] = {
                "full_name": (d or {}).get("full_name", "") or "",
                "cccd_number": (d or {}).get("cccd_number", "") or "",
            } if d else None
        return detainee_cache[key]

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
        l["detainee"] = await _resolve_detainee(l.get("ref_id"), l.get("ref"))
        items.append(l)

    counts = {"create": 0, "update": 0, "delete": 0, "login": 0, "import": 0, "sync": 0}
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


# ==================== SYNC PROXY (tránh CORS khi gọi hệ thống bên ngoài) ====================
import httpx

SYNC_REMOTE = os.getenv("SYNC_REMOTE_URL", "http://192.168.22.65:3000")

@app.post("/api/proxy/upload-image")
async def proxy_upload_image(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    data = await file.read()
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{SYNC_REMOTE}/api/upload-image",
            files={"image": (file.filename, data, file.content_type)},
        )
    if not res.is_success:
        raise HTTPException(res.status_code, res.text)
    return res.json()


@app.post("/api/proxy/sync-detainee")
async def proxy_sync_detainee(request: Request, user: dict = Depends(get_current_user)):
    body = await request.body()
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            f"{SYNC_REMOTE}/api/sync-detainee",
            content=body,
            headers={"Content-Type": "application/json"},
        )
    if not res.is_success:
        raise HTTPException(res.status_code, res.text)
    return res.json()


@app.get("/api/proxy/pham-nhan")
async def proxy_pham_nhan(user: dict = Depends(get_current_user)):
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.get(f"{SYNC_REMOTE}/api/pham-nhan", params={"limit": 1000})
    if not res.is_success:
        raise HTTPException(res.status_code, res.text)
    return res.json()
