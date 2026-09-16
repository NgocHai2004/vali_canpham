"""Fingerprint matching routes — tra cứu can phạm bằng vân tay."""

import httpx
from fastapi import APIRouter, Depends, HTTPException

from config import (
    FP_SERVICE_URL, FP_MATCH_FINGER, FP_LEFT_THUMB_THRESHOLD,
    FP_SINGLE_THRESHOLD, FP_REQUIRED_FINGER_COUNT, FP_MATCH_FINGER_CODES,
)
from models import MatchFingerprintReq, MatchFingerprintSingleReq
from auth import get_current_user
from helpers import serialize_doc
import database

router = APIRouter()


@router.post("/api/detainees/match_fingerprint")
async def match_fingerprint(body: MatchFingerprintReq, user: dict = Depends(get_current_user)):
    """Tra cứu can phạm bằng vân tay (logic moi).

    Yeu cau FE gui du FP_REQUIRED_FINGER_COUNT ngon (mac dinh 10). Backend chi
    so sanh ngon FP_MATCH_FINGER (left_thumb) cua nguoi tra cuu voi left_thumb
    cua tung can pham trong Mongo. Ket luan khop neu score > FP_LEFT_THUMB_THRESHOLD.
    Tra top 10 can pham khop.
    """
    fingers = body.fingers or {}
    # Dem so ngon co template khong trong
    present = [c for c in FP_MATCH_FINGER_CODES if (fingers.get(c) or "").strip()]
    if len(present) < FP_REQUIRED_FINGER_COUNT:
        raise HTTPException(
            400,
            f"Phai quet du {FP_REQUIRED_FINGER_COUNT} ngon moi tra cuu "
            f"(hien co {len(present)}).",
        )
    query_tmpl = (fingers.get(FP_MATCH_FINGER) or "").strip()
    if not query_tmpl:
        raise HTTPException(400, f"Thieu template cua ngon {FP_MATCH_FINGER}.")

    cursor = database.db.detainees.find(
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
                    "detainee": serialize_doc(det),
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


@router.post("/api/detainees/match_fingerprint_single")
async def match_fingerprint_single(body: MatchFingerprintSingleReq, user: dict = Depends(get_current_user)):
    """Tra cứu can phạm bằng 1 template vân tay (luong Search, quet 1 ngon).

    Khac voi match_fingerprint (can 10 ngon + chi so left_thumb): endpoint nay
    nhan 1 ngon bat ky, so voi TAT CA ngon cua moi can pham, lay best_score.
    Ket luan khop neu best_score > FP_SINGLE_THRESHOLD (mac dinh 95, rat chat)
    de giam doan nham khi chi co 1 ngon.
    """
    if not body.template_b64:
        raise HTTPException(400, "Thieu template van tay.")

    cursor = database.db.detainees.find(
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
                    "detainee": serialize_doc(det),
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
