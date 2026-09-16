"""Fingerprint + feature config routes."""

from fastapi import APIRouter, Depends, HTTPException, Request

import config
from config import (
    FP_FINGER_CODES, FP_MIN_QUALITY_DEFAULT, FP_MIN_QUALITY_MAX,
    get_fp_min_quality, sanitize_fp_map, update_fp_cache,
    _fp_min_quality_cache,
)
from models import FingerprintConfigIn
from auth import require_admin, get_current_user
from helpers import audit_log
from seed import push_fp_quality
import database

router = APIRouter()


@router.get("/api/config/features")
async def features_config(user: dict = Depends(get_current_user)):
    return {
        "cccd_reader": config.FEATURE_CCCD_READER,
        "weight_scale": config.FEATURE_WEIGHT_SCALE,
        "height_yolo": config.FEATURE_HEIGHT_YOLO,
        "scan_ocr": config.FEATURE_SCAN_OCR,
    }


@router.get("/api/config/fingerprint")
async def fingerprint_config(user: dict = Depends(get_current_user)):
    return {
        "by_finger": get_fp_min_quality(),
        "default": FP_MIN_QUALITY_DEFAULT,
        "codes": FP_FINGER_CODES,
    }


@router.put("/api/config/fingerprint")
async def update_fingerprint_config(body: FingerprintConfigIn, request: Request, admin: dict = Depends(require_admin)):
    """Đổi ngưỡng chất lượng cho từng ngón vân tay. Chỉ admin.

    Ngưỡng này quyết định vân tay nào được LƯU vào hệ thống: hạ ngưỡng nghĩa là
    chấp nhận template kém hơn, làm sai kết quả tra cứu về sau. Vì vậy phải ghi
    audit log, và giá trị cũ được lưu kèm để truy được ai hạ và hạ từ mức nào.
    """
    got = sanitize_fp_map(body.by_finger)
    if not got:
        raise HTTPException(
            400,
            "Cần ít nhất 1 mã ngón hợp lệ, giá trị nguyên 0-"
            f"{FP_MIN_QUALITY_MAX}.",
        )
    previous = {c: _fp_min_quality_cache[c] for c in got}
    merged = dict(_fp_min_quality_cache)
    merged.update(got)
    await database.db.settings.update_one(
        {"_id": "fingerprint"},
        {"$set": {"by_finger": merged}},
        upsert=True,
    )
    update_fp_cache(got)
    # Mongo đã lưu (nguồn thật) nên đẩy sang service Morfin thất bại KHÔNG làm
    # request fail - service có thể đang tắt. Trả applied để UI nói rõ là đã lưu
    # nhưng chưa áp dụng, thay vì để admin tưởng ngưỡng mới đang có tác dụng.
    applied = await push_fp_quality(merged)
    # Chỉ log ngón THỰC SỰ đổi giá trị: log cả 10 ngón mỗi lần bấm Lưu sẽ làm
    # audit trail không còn đọc được ai đã hạ ngưỡng ngón nào.
    changed = {c: v for c, v in got.items() if previous.get(c) != v}
    await audit_log(request, admin, "update", "setting", "fingerprint",
               {"changed": changed, "previous": {c: previous[c] for c in changed},
                "applied": applied})
    return {
        "by_finger": merged,
        "default": FP_MIN_QUALITY_DEFAULT,
        "codes": FP_FINGER_CODES,
        "applied": applied,
    }
