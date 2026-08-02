# -*- coding: utf-8 -*-
"""Session-queue cho CCCD reader.

CccdService (.NET) push du lieu CCCD len POST /api/cccd/push, backend goi
cccd_inject() de day vao hang doi cua moi session dang mo. Frontend long-poll
GET /api/cccd/session/{sid}/wait de nhan.

Co che HANEL eKYC folder-scan (data_cccd/) da BO - chi dung CccdService push.
"""
from __future__ import annotations

import asyncio
import threading
import time
import uuid
from typing import Optional

_POLL_INTERVAL = 0.5
_SESSION_TTL = 300.0


class _Session:
    __slots__ = ("id", "baseline", "created_at", "pending")

    def __init__(self) -> None:
        self.id = uuid.uuid4().hex
        self.baseline = None  # giu field de cap nhat created_at khi poll
        self.created_at = time.time()
        self.pending: list[dict] = []


_sessions: dict[str, _Session] = {}
_lock = threading.Lock()


def _gc_locked() -> None:
    now = time.time()
    dead = [sid for sid, s in _sessions.items() if now - s.created_at > _SESSION_TTL]
    for sid in dead:
        _sessions.pop(sid, None)


def cccd_health() -> dict:
    return {
        "ok": True,
        "data_dir": "",
        "exists": False,
        "sdk": "CccdService push (no folder watcher)",
    }


def cccd_start_session() -> str:
    with _lock:
        _gc_locked()
        s = _Session()
        _sessions[s.id] = s
        return s.id


def cccd_read_again(sid: str) -> bool:
    with _lock:
        s = _sessions.get(sid)
        if not s:
            return False
        s.created_at = time.time()
        # Xoa pending cu khi "read again" - nguoi dung muon ban moi
        s.pending.clear()
        return True


def cccd_end_session(sid: str) -> None:
    with _lock:
        _sessions.pop(sid, None)


def cccd_session_count() -> int:
    with _lock:
        _gc_locked()
        return len(_sessions)


def cccd_inject(data: dict) -> int:
    """Day du lieu CCCD thang vao hang doi cua moi session dang mo.
    Tra so session da nhan."""
    with _lock:
        _gc_locked()
        n = 0
        for s in _sessions.values():
            s.pending.append(data)
            s.created_at = time.time()
            n += 1
        return n


async def cccd_wait_session(sid: str, timeout: int) -> Optional[dict]:
    with _lock:
        s = _sessions.get(sid)
        if not s:
            return None
        if s.pending:
            data = s.pending.pop(0)
            s.created_at = time.time()
            return {"status": "ok", "data": data}

    deadline = time.time() + max(1, timeout)
    while True:
        with _lock:
            s = _sessions.get(sid)
            if s is None:
                return None
            if s.pending:
                data = s.pending.pop(0)
                s.created_at = time.time()
                return {"status": "ok", "data": data}
        if time.time() >= deadline:
            return {"status": "timeout"}
        await asyncio.sleep(_POLL_INTERVAL)
