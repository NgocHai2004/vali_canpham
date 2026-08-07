"""
FastAPI server: enroll 10 finger per user, then identify with any single finger.

Data model:
    users.json = {
        "1": {"name": "Nguyen Van A", "created_at": ..., "fingers": {
                 "left_thumb": "<base64 template>",
                 "left_index": "...", ...
              }},
        "2": {...}
    }
    FID trong SDK: user_id * 10 + finger_index (0..9)

Chay:
    .\.venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8765
"""
from __future__ import annotations

import base64
import io
import json
import os
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import zkfp


# ---------- Cau hinh 10 ngon tay ----------
FINGERS: list[dict[str, str]] = [
    {"code": "left_little",  "name_vi": "Ut trai",    "hand": "left"},
    {"code": "left_ring",    "name_vi": "Ap ut trai", "hand": "left"},
    {"code": "left_middle",  "name_vi": "Giua trai",  "hand": "left"},
    {"code": "left_index",   "name_vi": "Tro trai",   "hand": "left"},
    {"code": "left_thumb",   "name_vi": "Cai trai",   "hand": "left"},
    {"code": "right_thumb",  "name_vi": "Cai phai",   "hand": "right"},
    {"code": "right_index",  "name_vi": "Tro phai",   "hand": "right"},
    {"code": "right_middle", "name_vi": "Giua phai",  "hand": "right"},
    {"code": "right_ring",   "name_vi": "Ap ut phai", "hand": "right"},
    {"code": "right_little", "name_vi": "Ut phai",    "hand": "right"},
]
FINGER_CODES = [f["code"] for f in FINGERS]
FINGER_INDEX = {c: i for i, c in enumerate(FINGER_CODES)}
FINGER_NAME = {f["code"]: f["name_vi"] for f in FINGERS}


BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def load_users() -> dict[int, dict]:
    return {}


def save_users(users: dict[int, dict]) -> None:
    pass


# ---------- Session enroll ----------
@dataclass
class FingerRecord:
    code: str
    name_vi: str
    hand: str
    template_b64: Optional[str] = None
    image_b64: Optional[str] = None
    captured_at: Optional[float] = None

    def to_public(self, include_template: bool = False) -> dict:
        out = {
            "code": self.code, "name_vi": self.name_vi, "hand": self.hand,
            "done": self.template_b64 is not None,
            "captured_at": self.captured_at,
        }
        if include_template:
            out["template_b64"] = self.template_b64
        return out


@dataclass
class Session:
    id: str
    user_name: str
    fingers: list[FingerRecord] = field(default_factory=list)
    current_index: int = 0
    created_at: float = field(default_factory=time.time)
    finished: bool = False
    saved_user_id: Optional[int] = None

    def next_finger(self) -> Optional[FingerRecord]:
        while self.current_index < len(self.fingers):
            f = self.fingers[self.current_index]
            if f.template_b64 is None:
                return f
            self.current_index += 1
        return None


class DeviceManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._dev: Optional[zkfp.ZKFP] = None

    def ensure_open(self) -> zkfp.ZKFP:
        with self._lock:
            if self._dev is not None:
                return self._dev
            dev = zkfp.ZKFP()
            dev.init()
            if dev.device_count() < 1:
                dev.terminate()
                raise HTTPException(503, "Khong tim thay thiet bi van tay.")
            dev.open(0)
            dev.set_threshold_1n(50)
            dev.set_threshold_11(20)
            self._dev = dev
            return dev

    def capture_once(self, timeout_s: float = 15.0) -> tuple[bytes, bytes]:
        dev = self.ensure_open()
        deadline = time.time() + timeout_s
        bad_since: Optional[float] = None
        while time.time() < deadline:
            with self._lock:
                status, img, tmpl = dev.acquire_status()
            if status == "ok":
                return img, tmpl
            if status == "bad_quality":
                # Co ngon tay nhung anh kem. Cho phep nguoi dung dieu chinh
                # (lau kho/lam am, dat lai) trong vai giay truoc khi bao loi ro rang.
                if bad_since is None:
                    bad_since = time.time()
                if time.time() - bad_since > 3.0:
                    raise HTTPException(
                        422,
                        "Da nhan dien ngon tay nhung chat luong anh kem. "
                        "Hay lau kho/lam am ngon tay, dat lai va giu yên.",
                    )
            else:  # no_finger
                bad_since = None
            time.sleep(0.15)
        raise HTTPException(408, "Het thoi gian doi dat ngon tay.")

    def db_add(self, fid: int, template: bytes) -> None:
        dev = self.ensure_open()
        with self._lock:
            dev.db_add(fid, template)

    def db_del(self, fid: int) -> None:
        dev = self.ensure_open()
        with self._lock:
            try:
                dev.db_del(fid)
            except zkfp.ZKFPError:
                pass

    def identify(self, template: bytes) -> Optional[tuple[int, int]]:
        dev = self.ensure_open()
        with self._lock:
            return dev.identify(template)

    def shutdown(self) -> None:
        with self._lock:
            if self._dev:
                self._dev.terminate()
                self._dev = None


device = DeviceManager()
users: dict[int, dict] = {}
sessions: dict[str, Session] = {}
_lock = threading.Lock()
_sdk_loaded = False  # da nap users vao DB cache cua SDK chua


def _load_users_into_sdk() -> None:
    """Nap tat ca template cua users vao DB cache cua SDK (chi 1 lan)."""
    global _sdk_loaded
    if _sdk_loaded:
        return
    for uid, u in users.items():
        for code, b64 in u.get("fingers", {}).items():
            if code not in FINGER_INDEX:
                continue
            fid = uid * 10 + FINGER_INDEX[code]
            try:
                device.db_add(fid, base64.b64decode(b64))
            except zkfp.ZKFPError:
                pass
    _sdk_loaded = True


def _ensure_device_and_users() -> zkfp.ZKFP:
    """Mo thiet bi (neu chua) va nap users vao SDK (neu chua)."""
    dev = device.ensure_open()
    _load_users_into_sdk()
    return dev


def _next_user_id() -> int:
    return (max(users.keys()) + 1) if users else 1


# ---------- API models ----------
class StartReq(BaseModel):
    user_name: str


class RenameReq(BaseModel):
    name: str


# ---------- App ----------
app = FastAPI(title="ZKFinger 10-finger Enroll + Identify")


@app.on_event("startup")
def _startup() -> None:
    global users
    users = load_users()
    try:
        _ensure_device_and_users()
    except HTTPException:
        pass  # cho phep server chay ngay ca khi thiet bi tam thoi bi giu
    except zkfp.ZKFPError:
        pass


@app.on_event("shutdown")
def _shutdown() -> None:
    device.shutdown()


@app.get("/")
def index() -> FileResponse:
    return FileResponse(os.path.join(BASE_DIR, "index.html"))


@app.get("/api/health")
def health() -> dict:
    try:
        dev = device.ensure_open()
        return {"ok": True, "width": dev.width, "height": dev.height,
                "device_count": dev.device_count(), "users": len(users)}
    except HTTPException as e:
        return JSONResponse({"ok": False, "error": e.detail},
                            status_code=e.status_code)


@app.get("/api/fingers")
def list_fingers() -> list[dict]:
    return FINGERS


# ---------- Users ----------
@app.get("/api/users")
def list_users() -> list[dict]:
    return [
        {"id": uid, "name": u["name"], "created_at": u.get("created_at"),
         "finger_count": len(u.get("fingers", {}))}
        for uid, u in sorted(users.items())
    ]


@app.delete("/api/users/{uid}")
def delete_user(uid: int) -> dict:
    with _lock:
        if uid not in users:
            raise HTTPException(404, "User khong ton tai.")
        for code in users[uid].get("fingers", {}):
            fid = uid * 10 + FINGER_INDEX.get(code, -1)
            if fid >= 0:
                device.db_del(fid)
        users.pop(uid)
        save_users(users)
    return {"ok": True}


@app.patch("/api/users/{uid}")
def rename_user(uid: int, body: RenameReq) -> dict:
    with _lock:
        if uid not in users:
            raise HTTPException(404, "User khong ton tai.")
        users[uid]["name"] = body.name.strip() or users[uid]["name"]
        save_users(users)
    return {"ok": True, "name": users[uid]["name"]}


# ---------- Enroll session ----------
def _get_session(sid: str) -> Session:
    with _lock:
        s = sessions.get(sid)
    if not s:
        raise HTTPException(404, "Session khong ton tai.")
    return s


@app.post("/api/session/start")
def start_session(body: StartReq) -> dict:
    name = body.user_name.strip()
    if not name:
        raise HTTPException(400, "user_name khong duoc trong.")
    device.ensure_open()
    sid = uuid.uuid4().hex[:12]
    s = Session(id=sid, user_name=name,
                fingers=[FingerRecord(**f) for f in FINGERS])
    with _lock:
        sessions[sid] = s
    nf = s.next_finger()
    return {"session_id": sid, "user_name": name, "total": len(s.fingers),
            "next_finger": nf.to_public() if nf else None,
            "fingers": [f.to_public() for f in s.fingers]}


@app.get("/api/session/{sid}")
def session_status(sid: str) -> dict:
    s = _get_session(sid)
    nf = s.next_finger()
    done = sum(1 for f in s.fingers if f.template_b64)
    return {"session_id": s.id, "user_name": s.user_name, "finished": s.finished,
            "saved_user_id": s.saved_user_id,
            "progress": {"done": done, "total": len(s.fingers)},
            "next_finger": nf.to_public() if nf else None,
            "fingers": [f.to_public() for f in s.fingers]}


@app.post("/api/session/{sid}/capture")
def capture(sid: str) -> dict:
    s = _get_session(sid)
    if s.finished:
        raise HTTPException(400, "Session da hoan tat.")
    target = s.next_finger()
    if target is None:
        raise HTTPException(400, "Da xong tat ca 10 ngon.")

    img_bytes, tmpl = device.capture_once()
    dev = device.ensure_open()
    img = Image.frombytes("L", (dev.width, dev.height), img_bytes)
    buf = io.BytesIO(); img.save(buf, format="PNG")
    img_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    # Thumbnail nho (~200px) de frontend hien thi nhanh, tranh truyen ảnh full-res.
    thumb = img.copy()
    thumb.thumbnail((200, 200))
    tbuf = io.BytesIO(); thumb.save(tbuf, format="PNG")
    thumb_b64 = base64.b64encode(tbuf.getvalue()).decode("ascii")

    target.template_b64 = base64.b64encode(tmpl).decode("ascii")
    target.image_b64 = img_b64
    target.captured_at = time.time()
    s.current_index += 1

    nf = s.next_finger()
    if nf is None:
        s.finished = True

    done = sum(1 for f in s.fingers if f.template_b64)
    return {"ok": True,
            "finger": {
                **target.to_public(include_template=True),
                "image_b64": img_b64,
                "thumb_b64": thumb_b64,
            },
            "progress": {"done": done, "total": len(s.fingers)},
            "next_finger": nf.to_public() if nf else None,
            "finished": s.finished, "saved_user_id": None,
            "message": f"Da luu {target.name_vi}."}


@app.post("/api/session/{sid}/redo/{finger_code}")
def redo(sid: str, finger_code: str) -> dict:
    s = _get_session(sid)
    if s.finished:
        raise HTTPException(400, "Session da luu, khong redo duoc. Xoa user roi enroll lai.")
    for i, f in enumerate(s.fingers):
        if f.code == finger_code:
            f.template_b64 = None; f.image_b64 = None; f.captured_at = None
            s.current_index = i
            return {"ok": True, "next_finger": f.to_public()}
    raise HTTPException(404, "Ngon tay khong ton tai.")


@app.get("/api/session/{sid}/preview/{finger_code}.png")
def preview(sid: str, finger_code: str):
    s = _get_session(sid)
    for f in s.fingers:
        if f.code == finger_code and f.image_b64:
            return StreamingResponse(io.BytesIO(base64.b64decode(f.image_b64)),
                                     media_type="image/png")
    raise HTTPException(404, "Chua co anh cho ngon nay.")


@app.delete("/api/session/{sid}")
def del_session(sid: str) -> dict:
    with _lock:
        sessions.pop(sid, None)
    return {"ok": True}


# ---------- Identify ----------
@app.post("/api/identify")
def identify() -> dict:
    """Chup 1 ngon, tra ve user + ngon nao khop."""
    if not users:
        raise HTTPException(400, "Chua co user nao trong he thong.")
    device.ensure_open()
    img_bytes, tmpl = device.capture_once()
    dev = device.ensure_open()
    img = Image.frombytes("L", (dev.width, dev.height), img_bytes)
    buf = io.BytesIO(); img.save(buf, format="PNG")
    img_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    result = device.identify(tmpl)
    if result is None:
        return {"ok": False, "matched": False, "image_b64": img_b64,
                "message": "Khong tim thay trong he thong."}
    fid, score = result
    uid = fid // 10
    finger_idx = fid % 10
    code = FINGER_CODES[finger_idx] if 0 <= finger_idx < 10 else "?"
    u = users.get(uid)
    if not u:
        return {"ok": False, "matched": False, "image_b64": img_b64,
                "message": f"Match FID={fid} nhung khong tim thay user."}
    return {"ok": True, "matched": True, "user_id": uid, "user_name": u["name"],
            "finger_code": code, "finger_name": FINGER_NAME.get(code, code),
            "score": score, "image_b64": img_b64,
            "message": f"Khop: {u['name']} - {FINGER_NAME.get(code, code)} (score={score})"}


# ---------- Match pair (dung cho backend main.py tra cuu can pham) ----------
class MatchPairReq(BaseModel):
    t1_b64: str
    t2_b64: str


@app.post("/api/match_pair")
def match_pair(body: MatchPairReq) -> dict:
    """So khop 2 template. Tra score int (0 = khong khop, cao hon = khop tot hon).

    Dung boi backend/main.py de match query_template voi tung template
    da luu trong Mongo. Khong can capture live.
    """
    device.ensure_open()  # can device init de dung SDK match
    dev = device._dev
    if dev is None:
        raise HTTPException(503, "Thiet bi van tay chua san sang.")
    try:
        t1 = base64.b64decode(body.t1_b64)
        t2 = base64.b64decode(body.t2_b64)
    except Exception:
        raise HTTPException(400, "Template khong hop le (base64 sai).")
    try:
        with device._lock:
            score = dev.match(t1, t2)
    except zkfp.ZKFPError as e:
        raise HTTPException(500, f"Loi SDK: {e}")
    return {"score": int(score)}
