"""Client gọi HBIE BioService — engine đối sánh vân tay dùng cho dấu vết hiện trường.

HBIE là service HTTP ngoài (không phải SDK cắm máy như morfin_service). Chỉ cần
2 endpoint cho việc đối sánh:

    POST /api/extract  {image(b64), dpi, pos, type} -> {feature, landmark, quality}
    POST /api/match    {feature1, feature2}         -> {score}

Vì sao KHÔNG dùng /api/search: search chỉ chạy trên DB in-memory của HBIE, mất
sạch khi service restart, và phải đồng bộ 2 chiều giữa Mongo và HBIE. Một vụ án
chỉ có vài chục cặp (số dấu vết × số đối tượng × 10 ngón) nên match từng cặp là
đủ nhanh mà không phải giữ state ở 2 nơi.

Feature trích ra được CACHE lại (detainees.fp_features, scene_traces.feature) —
mỗi ảnh chỉ extract 1 lần trong đời.
"""

import asyncio
import base64
import os
from typing import Optional

import httpx


def _env(name: str, default: str = "") -> str:
    """Đọc env var, chưa có thì đọc Vali_hientruong/.env (giống _env_str_from_dotenv ở main).

    Copy nhỏ chứ không import từ main: main import module này, import ngược lại
    là circular.
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
    return default


HBIE_BASE = _env("HBIE_BASE", "http://1.119.159.9:59832").rstrip("/")
HBIE_TOKEN = _env("HBIE_TOKEN", "")
HBIE_TIMEOUT = float(_env("HBIE_TIMEOUT", "120") or 120)
HBIE_DPI = int(_env("HBIE_DPI", "500") or 500)

# Thang điểm HBIE cố định 0..1000 (engine trả về đúng thang này).
HBIE_SCORE_MAX = 1000

# HAI NGƯỠNG DƯỚI ĐÂY ADMIN CHỈNH ĐƯỢC trong Cài đặt, lưu ở db.settings
# (_id="hbie"). Giá trị đọc từ env/.env chỉ là SEED cho lần chạy đầu tiên; sau
# đó Mongo là nguồn thật — đúng kiểu height_image và ngưỡng chất lượng vân tay.
# Muốn đổi giá trị seed thì sửa .env RỒI XOÁ doc settings đó, không thì Mongo thắng.
#
# Ngưỡng kết luận trùng khớp. Score HBIE thang 0..1000, tài liệu HBIE gợi ý
# 600–700 cho vân tay; phải tinh chỉnh lại theo dữ liệu thật của đơn vị.
HBIE_MATCH_THRESHOLD_DEFAULT = int(_env("HBIE_MATCH_THRESHOLD", "600") or 600)

# Điểm sàn để LƯU 1 cặp vào kết quả. Thấp hơn ngưỡng kết luận để cán bộ còn thấy
# các cặp "cần xem lại"; dưới mức này là nhiễu, lưu chỉ phình bảng.
HBIE_KEEP_SCORE_DEFAULT = int(_env("HBIE_KEEP_SCORE", "250") or 250)

# Chặn cho ô nhập của admin. keep_score <= match_threshold là BẮT BUỘC: đảo
# ngược thì mọi cặp được lưu đều tự thành "trùng khớp", không còn cặp nào rơi
# vào "cần xem lại" và cột kết luận mất tác dụng.
HBIE_KEEP_SCORE_MIN = 0
HBIE_MATCH_THRESHOLD_MIN = 1

# Giá trị ĐANG CHẠY. verdict_of()/config() đọc qua hàm, không đọc thẳng hai biến
# này, để admin bấm Lưu là có tác dụng ngay không cần restart backend.
_match_threshold: int = HBIE_MATCH_THRESHOLD_DEFAULT
_keep_score: int = HBIE_KEEP_SCORE_DEFAULT


def match_threshold() -> int:
    """Ngưỡng kết luận đang có hiệu lực (RAM, đồng bộ với db.settings)."""
    return _match_threshold


def keep_score() -> int:
    """Điểm sàn lưu cặp đang có hiệu lực (RAM, đồng bộ với db.settings)."""
    return _keep_score


def set_thresholds(match: Optional[int] = None, keep: Optional[int] = None) -> dict:
    """Đổi ngưỡng lúc chạy. CHỈ cập nhật RAM — Mongo do main.py giữ.

    Tham số None = giữ nguyên giá trị hiện tại. Không tự validate: main.py đã
    chặn khoảng hợp lệ trước khi gọi (giống _sanitize_fp_map bên ngưỡng vân tay).
    """
    global _match_threshold, _keep_score
    if match is not None:
        _match_threshold = int(match)
    if keep is not None:
        _keep_score = int(keep)
    return {"threshold": _match_threshold, "keep_score": _keep_score}

FEATURE_HBIE_MATCH = _env("FEATURE_HBIE_MATCH", "1").lower() not in ("0", "false", "no", "off")

# Type (kiểu thu nhận) theo spec HBIE: 1 = vân lăn, 2 = dấu vết hiện trường
# (latent), 3 = vân phẳng. Ảnh nào gán sai type thì HBIE lọc mất cặp đối sánh.
TYPE_ROLL = 1
TYPE_LATENT = 2
TYPE_PLAIN = 3

# Mã ngón của app -> Pos của HBIE.
#
# CẢNH BÁO: HBIE đánh số tay PHẢI trước (1..5), tay TRÁI sau (6..10); app lại
# đánh trái trước (fp_l1 = cái trái). KHÔNG suy ra số từ tên key fp_l*/fp_r*.
HBIE_POS = {
    "right_thumb": 1, "right_index": 2, "right_middle": 3,
    "right_ring": 4, "right_little": 5,
    "left_thumb": 6, "left_index": 7, "left_middle": 8,
    "left_ring": 9, "left_little": 10,
}


class HbieError(RuntimeError):
    """Lỗi gọi HBIE — mọi lỗi mạng/HTTP/parse đều gói về đây kèm thông báo tiếng Việt."""


_client: Optional[httpx.AsyncClient] = None
_lock = asyncio.Lock()


async def _get_client() -> httpx.AsyncClient:
    """AsyncClient dùng chung, tạo lazy để import module không mở kết nối."""
    global _client
    if _client is None or _client.is_closed:
        async with _lock:
            if _client is None or _client.is_closed:
                _client = httpx.AsyncClient(
                    base_url=HBIE_BASE,
                    timeout=HBIE_TIMEOUT,
                    # HBIE nội bộ chạy cert tự ký; base mặc định là http nên
                    # verify chỉ có tác dụng khi đơn vị đổi sang https.
                    verify=False,
                )
    return _client


async def close() -> None:
    """Đóng client khi app shutdown."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


def _headers() -> dict:
    return {"Authorization": f"Bearer {HBIE_TOKEN}"} if HBIE_TOKEN else {}


async def _post(path: str, payload: dict) -> dict:
    cl = await _get_client()
    try:
        r = await cl.post(path, json=payload, headers=_headers())
    except httpx.ConnectError:
        raise HbieError(f"Không kết nối được HBIE tại {HBIE_BASE}")
    except httpx.TimeoutException:
        raise HbieError("HBIE phản hồi quá chậm (timeout)")
    except httpx.HTTPError as e:
        raise HbieError(f"Lỗi gọi HBIE: {e}")
    if r.status_code != 200:
        raise HbieError(f"HBIE trả {r.status_code}: {r.text[:200]}")
    try:
        return r.json()
    except ValueError:
        raise HbieError("HBIE trả về dữ liệu không phải JSON")


async def health() -> dict:
    """Kiểm tra HBIE sống hay không — dùng cho trang cấu hình / chẩn đoán."""
    cl = await _get_client()
    try:
        r = await cl.get("/api/info", headers=_headers())
        return {"ok": r.status_code == 200, "base": HBIE_BASE, "status": r.status_code}
    except httpx.HTTPError as e:
        return {"ok": False, "base": HBIE_BASE, "error": str(e)}


async def extract(
    image: bytes,
    *,
    finger_code: str = "",
    type_: int = TYPE_ROLL,
    dpi: Optional[int] = None,
) -> dict:
    """Trích đặc trưng 1 ảnh vân tay. Trả {feature, quality, landmark}.

    finger_code rỗng (dấu vết hiện trường thường chưa biết ngón nào) -> pos=0,
    HBIE hiểu là "không lọc theo vị trí ngón".
    """
    if not image:
        raise HbieError("Ảnh rỗng, không trích được đặc trưng")
    payload = {
        "image": base64.b64encode(image).decode(),
        "dpi": int(dpi if dpi is not None else HBIE_DPI),
        "pos": HBIE_POS.get(finger_code, 0),
        "type": int(type_),
    }
    d = await _post("/api/extract", payload)
    feature = d.get("feature")
    if not feature:
        raise HbieError("HBIE không trích được đặc trưng từ ảnh này")
    return {
        "feature": feature,
        "quality": d.get("quality"),
        "landmark": d.get("landmark") or {},
    }


async def match(feature1: str, feature2: str) -> int:
    """So khớp 2 đặc trưng. Trả score thang 0..1000 (càng cao càng giống)."""
    if not feature1 or not feature2:
        raise HbieError("Thiếu đặc trưng để so khớp")
    d = await _post("/api/match", {"feature1": feature1, "feature2": feature2})
    try:
        return int(round(float(d.get("score") or 0)))
    except (TypeError, ValueError):
        raise HbieError("HBIE trả score không hợp lệ")


def verdict_of(score: int) -> str:
    """Kết luận từ score: trùng khớp hay cần cán bộ xem lại."""
    return "match" if score >= match_threshold() else "review"


def config() -> dict:
    """Cấu hình đang dùng — trả cho UI để hiện ngưỡng, không lộ token.

    threshold/keep_score là giá trị SỐNG (admin sửa được), không phải seed .env.
    """
    return {
        "base": HBIE_BASE,
        "enabled": FEATURE_HBIE_MATCH,
        "dpi": HBIE_DPI,
        "threshold": match_threshold(),
        "keep_score": keep_score(),
        "score_max": HBIE_SCORE_MAX,
        "has_token": bool(HBIE_TOKEN),
    }
