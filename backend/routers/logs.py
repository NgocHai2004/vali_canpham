"""Audit log routes."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query

from auth import get_current_user
from helpers import parse_object_id, parse_dt, make_json_safe
import database

router = APIRouter()


@router.get("/api/logs")
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
    dt_from = parse_dt(date_from)
    dt_to = parse_dt(date_to)
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
        sess = await database.db.work_sessions.find_one({"code": session_code})
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
                    d = await database.db.detainees.find_one({"_id": parse_object_id(ref_id)})
                except Exception:
                    d = None
            if d is None and ref:
                d = await database.db.detainees.find_one({"personal_id": ref})
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
            s = await database.db.work_sessions.find_one({"_id": sid})
            session_cache[key] = {
                "code": s.get("code", ""),
                "status": s.get("status", ""),
            } if s else None
        return session_cache[key]

    async def _resolve_user(uname):
        if not uname:
            return None
        if uname not in user_cache:
            u = await database.db.users.find_one({"username": uname})
            user_cache[uname] = {
                "username": uname,
                "full_name": (u or {}).get("full_name", "") or "",
                "avatar_url": (u or {}).get("avatar_url", "") or "",
            }
        return user_cache[uname]

    items = []
    async for l in database.db.audit_logs.find(filt).sort("at", -1).limit(limit):
        l["id"] = str(l.pop("_id"))
        if isinstance(l.get("at"), datetime):
            l["at"] = l["at"].isoformat()
        sid = l.get("session_id")
        l["session"] = await _resolve_session(sid) if sid is not None else None
        if sid is not None:
            l["session_id"] = str(sid)
        l["officer"] = await _resolve_user(l.get("actor"))
        l["detainee"] = await _resolve_detainee(l.get("ref_id"), l.get("ref"))
        items.append(make_json_safe(l))

    counts = {"create": 0, "update": 0, "delete": 0, "login": 0, "import": 0, "sync": 0}
    count_filt = dict(filt)
    count_filt.pop("_impossible", None)
    pipeline = [{"$match": count_filt}, {"$group": {"_id": "$action", "n": {"$sum": 1}}}]
    async for r in database.db.audit_logs.aggregate(pipeline):
        counts[r["_id"]] = r["n"]

    return {"items": items, "counts": counts, "total": len(items)}
