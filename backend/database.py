"""Quản lý kết nối MongoDB — client, db instance, và dependency injection."""

from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGO_URL, DB_NAME

client: Optional[AsyncIOMotorClient] = None
db = None


async def connect_db() -> None:
    """Khởi tạo kết nối MongoDB. Gọi trong lifespan startup."""
    global client, db
    client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=3000)
    db = client[DB_NAME]


async def close_db() -> None:
    """Đóng kết nối MongoDB. Gọi trong lifespan shutdown."""
    if client:
        client.close()


async def ping_db() -> None:
    """Kiểm tra kết nối DB (dùng lúc startup và health check)."""
    await client.admin.command("ping")


async def ensure_indexes() -> None:
    """Tạo indexes cho các collections chính."""
    await db.detainees.create_index("personal_id", unique=True, sparse=True)
    await db.detainees.create_index([("full_name", 1), ("dob", 1)])
    await db.detainees.create_index("cccd_number", sparse=True)
    await db.cells.create_index("code", unique=True)
