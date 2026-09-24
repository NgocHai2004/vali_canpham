"""Stats route — dashboard statistics."""

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends

from auth import get_current_user
from helpers import serialize_doc, serialize_session, get_open_session_or_none
import database

router = APIRouter()


@router.get("/api/stats")
async def stats(user: dict = Depends(get_current_user)):
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    d14_start = today_start - timedelta(days=13)
    d7_start = today_start - timedelta(days=6)

    total = await database.db.detainees.count_documents({})
    today = await database.db.detainees.count_documents({"created_at": {"$gte": today_start}})
    yesterday = await database.db.detainees.count_documents(
        {"created_at": {"$gte": yesterday_start, "$lt": today_start}}
    )
    male = await database.db.detainees.count_documents({"gender": "male"})
    female = await database.db.detainees.count_documents({"gender": "female"})

    activity_map: dict = {}
    async for row in database.db.detainees.aggregate([
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
    async for row in database.db.detainees.aggregate([
        {"$match": {"charge": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$charge", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5},
    ]):
        top_charges.append({"charge": row["_id"], "count": row["count"]})

    officer_stats = []
    async for row in database.db.audit_logs.aggregate([
        {"$match": {
            "action": "create",
            "resource": "detainee",
            "at": {"$gte": d7_start},
        }},
        {"$group": {"_id": "$actor", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 6},
    ]):
        u = await database.db.users.find_one({"username": row["_id"]}) or {}
        officer_stats.append({
            "username": row["_id"],
            "full_name": u.get("full_name") or row["_id"],
            "avatar_url": u.get("avatar_url"),
            "count": row["count"],
        })

    open_session_doc = await get_open_session_or_none(user["username"])
    open_session = serialize_session(open_session_doc) if open_session_doc else None

    sess_filt: dict = {}
    if user.get("role") != "admin":
        sess_filt["officer"] = user["username"]
    recent_sessions = [
        serialize_session(d)
        async for d in database.db.work_sessions.find(sess_filt).sort("opened_at", -1).limit(5)
    ]

    missing_data_count = await database.db.detainees.count_documents({"$or": [
        {"photos.portrait_front": {"$in": [None, ""]}},
        {"photos.portrait_front": {"$exists": False}},
        {"cccd_number": {"$in": [None, ""]}},
    ]})

    recent_activity = []
    async for l in database.db.audit_logs.find({}).sort("at", -1).limit(8):
        u = await database.db.users.find_one({"username": l.get("actor", "")}) or {}
        recent_activity.append({
            "id": str(l.get("_id")),
            "at": l.get("at").isoformat() if isinstance(l.get("at"), datetime) else None,
            "actor": l.get("actor"),
            "actor_full_name": u.get("full_name") or l.get("actor"),
            "action": l.get("action"),
            "resource": l.get("resource"),
            "ref": l.get("ref"),
        })

    recent = [serialize_doc(d) async for d in database.db.detainees.find({}).sort("created_at", -1).limit(5)]

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
