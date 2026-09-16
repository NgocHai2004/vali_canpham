"""Health check endpoint."""

from fastapi import APIRouter

import database

router = APIRouter()


@router.get("/api/health")
async def health():
    try:
        await database.ping_db()
        return {"ok": True, "db": "up"}
    except Exception as e:
        return {"ok": False, "db": "down", "error": str(e)}
