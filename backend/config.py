"""Cấu hình ứng dụng — tập trung mọi env vars, constants, và config parsing.

Nguồn sự thật duy nhất cho tất cả giá trị cấu hình. Các module khác import
từ đây thay vì tự đọc env.
"""

import os
from db_target import resolve_db_name


# ---------------------------------------------------------------------------
# Env helpers
# ---------------------------------------------------------------------------

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


def _env_bool(name: str, default: bool = True) -> bool:
    """Doc co bat/tat tinh nang tu env var, roi den .env (App_CCCD/.env).

    Thieu co hoan toan -> default (True = bat), nen may nao chua cau hinh gi
    van chay y nhu truoc. Chi "0"/"false"/"no"/"off" moi tat.
    """
    raw = _env_str_from_dotenv(name).strip().lower()
    if not raw:
        return default
    return raw not in ("0", "false", "no", "off")


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


# ---------------------------------------------------------------------------
# Feature flags
# ---------------------------------------------------------------------------

FEATURE_CCCD_READER = _env_bool("FEATURE_CCCD_READER")
FEATURE_WEIGHT_SCALE = _env_bool("FEATURE_WEIGHT_SCALE")
FEATURE_HEIGHT_YOLO = _env_bool("FEATURE_HEIGHT_YOLO")
FEATURE_SCAN_OCR = _env_bool("FEATURE_SCAN_OCR")

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

MONGO_URL = _env_str_from_dotenv("MONGO_URL") or "mongodb://127.0.0.1:27017"
# DB tach theo nhanh git: Hai_dev giu DB that `app_cccd`, nhanh khac dung DB
# rieng. Hai nhanh KHONG cung schema (cases/case_id vs work_sessions/session_id)
# nen dung chung mot DB la doc khong ra du lieu cua nhau. Xem backend/db_target.py.
DB_NAME = resolve_db_name()

# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

JWT_SECRET = _env_str_from_dotenv("JWT_SECRET") or "change-me-in-production-please-abc123xyz"
JWT_ALGO = "HS256"
TOKEN_TTL_MINUTES = 60 * 8

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

# ---------------------------------------------------------------------------
# File paths
# ---------------------------------------------------------------------------

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
TMP_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "tmp")
os.makedirs(TMP_UPLOAD_DIR, exist_ok=True)
DETAINEES_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "detainees")
os.makedirs(DETAINEES_UPLOAD_DIR, exist_ok=True)
AVATARS_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "avatars")
os.makedirs(AVATARS_UPLOAD_DIR, exist_ok=True)
REPORTS_DIR = os.path.join(UPLOAD_DIR, "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Fingerprint config
# ---------------------------------------------------------------------------

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


def sanitize_fp_map(raw) -> dict:
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


def update_fp_cache(values: dict) -> None:
    """Cập nhật cache ngưỡng vân tay in-memory."""
    _fp_min_quality_cache.update(values)


# ---------------------------------------------------------------------------
# Fingerprint matching
# ---------------------------------------------------------------------------

_raw_fp_url = _env_str_from_dotenv("FP_SERVICE_URL") or os.getenv("FP_SERVICE_URL", "http://127.0.0.1:8765")
FP_SERVICE_URL = "http://127.0.0.1:8765" if "8767" in _raw_fp_url else _raw_fp_url
FP_MATCH_THRESHOLD = int(os.getenv("FP_MATCH_THRESHOLD", "85"))  # luu cho cac luong khac (neu co)
FP_MATCH_FINGER = os.getenv("FP_MATCH_FINGER", "left_thumb")     # ngon dung de ket luan
FP_LEFT_THUMB_THRESHOLD = int(os.getenv("FP_LEFT_THUMB_THRESHOLD", "80"))  # score > N (dung >)
FP_SINGLE_THRESHOLD = int(os.getenv("FP_SINGLE_THRESHOLD", "80"))  # luong 1-ngon (Search), giong Enroll
FP_REQUIRED_FINGER_COUNT = int(os.getenv("FP_REQUIRED_FINGER_COUNT", "10"))  # phai du bao nhieu ngon
# Thứ tự ngón cho route match (khác thứ tự hiển thị UI ở FP_FINGER_CODES)
FP_MATCH_FINGER_CODES = [
    "left_little", "left_ring", "left_middle", "left_index", "left_thumb",
    "right_thumb", "right_index", "right_middle", "right_ring", "right_little",
]

# ---------------------------------------------------------------------------
# Face recognition
# ---------------------------------------------------------------------------

FACE_MATCH_THRESHOLD = float(os.getenv("FACE_MATCH_THRESHOLD", "0.4"))

# ---------------------------------------------------------------------------
# USB dongle
# ---------------------------------------------------------------------------

_raw_usb_url = _env_str_from_dotenv("USB_SERVICE_URL") or os.getenv("USB_SERVICE_URL", "http://127.0.0.1:8766")
USB_SERVICE_URL = "http://127.0.0.1:8766" if "8768" in _raw_usb_url else _raw_usb_url

# ---------------------------------------------------------------------------
# Scan OCR
# ---------------------------------------------------------------------------

SCAN_API_KEY = os.getenv("SCAN_API_KEY", "")

# ---------------------------------------------------------------------------
# Sync proxy
# ---------------------------------------------------------------------------

SYNC_REMOTE = os.getenv("SYNC_REMOTE_URL", "http://192.168.22.65:3000")

# ---------------------------------------------------------------------------
# Import / Export
# ---------------------------------------------------------------------------

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
