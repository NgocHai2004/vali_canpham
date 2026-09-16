"""Thiết bị thu thập & quản lý căn cước can phạm — FastAPI application entry point.

File này chỉ chịu trách nhiệm:
  1. Tạo FastAPI app instance
  2. Cấu hình middleware (CORS)
  3. Mount static files
  4. Đăng ký routers
  5. Lifespan (startup/shutdown)

Toàn bộ business logic nằm trong các module riêng:
  - config.py      : cấu hình, env parsing, constants
  - database.py    : kết nối MongoDB
  - models.py      : Pydantic DTOs
  - auth.py        : JWT, password, OAuth2
  - helpers.py     : serialization, date parsing, audit log
  - seed.py        : dữ liệu mẫu, fingerprint config
  - routers/       : API endpoints
"""

import asyncio
import sys
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import face_recognition_service
import config
from config import UPLOAD_DIR
from auth import get_current_user
import database
from seed import (
    ensure_admin, ensure_default_cells, load_fp_config, push_fp_quality_safe,
)

# Import all routers
from routers import (
    health, auth_routes, cells, detainees, fingerprint, face,
    sessions, upload, scan, import_export, stats, logs, users,
    proxy, config_routes,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await database.connect_db()
    try:
        await database.ping_db()
        await ensure_admin()
        await ensure_default_cells()
        await database.ensure_indexes()
        await load_fp_config()
    except Exception:
        pass
    # Đẩy ngưỡng vân tay sang service Morfin (8765) ở background: service đó có
    # thể chưa kịp bật, và nó tự respawn nên phải đồng bộ lại mỗi lần backend
    # start. Không await để không block app ready.
    asyncio.create_task(push_fp_quality_safe())
    # Load InsightFace (buffalo_sc) o background cho nhan dien khuon mat
    threading.Thread(target=face_recognition_service.load_blocking, daemon=True, name="face-load").start()
    yield
    # Shutdown
    await database.close_db()


app = FastAPI(title="Thiết bị thu thập & quản lý căn cước can phạm", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Register routers — thứ tự quan trọng:
# - import_export và fingerprint trước detainees (static routes trước dynamic {det_id})
app.include_router(health.router)
app.include_router(auth_routes.router)
app.include_router(cells.router)
app.include_router(import_export.router)
app.include_router(fingerprint.router)
app.include_router(detainees.router)
app.include_router(face.router)
app.include_router(sessions.router)
app.include_router(upload.router)
app.include_router(scan.router)
app.include_router(stats.router)
app.include_router(logs.router)
app.include_router(users.router)
app.include_router(proxy.router)
app.include_router(config_routes.router)


# Backward-compatibility bridge for tests and external scripts
class _MainModule(sys.modules[__name__].__class__):
    @property
    def db(self):
        return database.db

    @db.setter
    def db(self, val):
        database.db = val

    @property
    def FEATURE_SCAN_OCR(self):
        return config.FEATURE_SCAN_OCR

    @FEATURE_SCAN_OCR.setter
    def FEATURE_SCAN_OCR(self, val):
        config.FEATURE_SCAN_OCR = val

    @property
    def SCAN_API_KEY(self):
        return config.SCAN_API_KEY

    @SCAN_API_KEY.setter
    def SCAN_API_KEY(self, val):
        config.SCAN_API_KEY = val


sys.modules[__name__].__class__ = _MainModule

