# -*- coding: utf-8 -*-
"""Watcher cho thư mục dữ liệu CCCD do HANEL eKYC (IDCheck.exe) sinh ra.

Cấu trúc:
    data_cccd/
        {identityNumber}_{fullName}/
            {DD.MM.YYYY.HH.MM.SS}/
                {identityNumber}.json

Cơ chế:
    - Khi frontend "startSession", chụp baseline = toàn bộ folder scan hiện có.
    - Long-poll: cứ 500ms so sánh snapshot mới với baseline. Folder scan mới
      xuất hiện + file .json bên trong đã `done && status == "ALL_STEP_DONE"`
      thì trả về dữ liệu đã chuẩn hoá.
"""
from __future__ import annotations

import asyncio
import json
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).resolve().parent / "data_cccd"

_POLL_INTERVAL = 0.5
_SESSION_TTL = 300.0


def _snapshot_scan_folders() -> set[Path]:
    if not DATA_DIR.is_dir():
        return set()
    out: set[Path] = set()
    for person_dir in DATA_DIR.iterdir():
        if not person_dir.is_dir():
            continue
        for scan_dir in person_dir.iterdir():
            if scan_dir.is_dir():
                out.add(scan_dir)
    return out


def _find_json_in(scan_dir: Path) -> Optional[Path]:
    try:
        for entry in scan_dir.iterdir():
            if entry.is_file() and entry.suffix.lower() == ".json":
                return entry
    except OSError:
        return None
    return None


def _sex_to_gender(sex: Optional[str]) -> Optional[str]:
    if not sex:
        return None
    s = sex.strip().lower()
    if s.startswith("n") and "ữ" in s:
        return "female"
    if "female" in s or s in ("nữ", "nu"):
        return "female"
    if "male" in s or s in ("nam",):
        return "male"
    return None


def _normalize(card: dict, scan_dir: Path) -> dict:
    return {
        "cccd_number": card.get("identityNumber") or "",
        "full_name": card.get("fullName") or "",
        "dob": card.get("dateOfBirth") or "",
        "gender": _sex_to_gender(card.get("sex")),
        "sex_vi": card.get("sex") or "",
        "nationality": card.get("nationality") or "",
        "hometown": card.get("placeOfOrigin") or "",
        "address": card.get("placeOfResidence") or "",
        "issued_date": card.get("dateOfIssue") or "",
        "expiry_date": card.get("dateOfExpiry") or "",
        "personal_identification": card.get("personalIdentification") or "",
        "ethnicity": card.get("ethnicity") or "",
        "religion": card.get("religion") or "",
        "facePhoto": card.get("facePhoto") or "",
        "_scan_folder": scan_dir.name,
    }


def _parse_scan_folder(scan_dir: Path) -> Optional[dict]:
    json_path = _find_json_in(scan_dir)
    if not json_path:
        return None
    try:
        raw = json_path.read_text(encoding="utf-8")
        payload = json.loads(raw)
    except (OSError, json.JSONDecodeError):
        return None
    if not payload.get("done"):
        return None
    if payload.get("status") != "ALL_STEP_DONE":
        return None
    card = payload.get("cardObj") or {}
    if not card.get("done"):
        return None
    if not card.get("identityNumber"):
        return None
    return _normalize(card, scan_dir)


class _Session:
    __slots__ = ("id", "baseline", "created_at")

    def __init__(self) -> None:
        self.id = uuid.uuid4().hex
        self.baseline = _snapshot_scan_folders()
        self.created_at = time.time()


_sessions: dict[str, _Session] = {}
_lock = threading.Lock()


def _gc_locked() -> None:
    now = time.time()
    dead = [sid for sid, s in _sessions.items() if now - s.created_at > _SESSION_TTL]
    for sid in dead:
        _sessions.pop(sid, None)


def cccd_health() -> dict:
    exists = DATA_DIR.is_dir()
    return {
        "ok": exists,
        "data_dir": str(DATA_DIR),
        "exists": exists,
        "sdk": "HANEL eKYC folder watcher",
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
        s.baseline = _snapshot_scan_folders()
        s.created_at = time.time()
        return True


def cccd_end_session(sid: str) -> None:
    with _lock:
        _sessions.pop(sid, None)


async def cccd_wait_session(sid: str, timeout: int) -> Optional[dict]:
    with _lock:
        s = _sessions.get(sid)
        if not s:
            return None
        baseline = set(s.baseline)

    deadline = time.time() + max(1, timeout)
    while True:
        current = _snapshot_scan_folders()
        new_folders = current - baseline
        if new_folders:
            newest = max(new_folders, key=lambda p: p.stat().st_mtime if p.exists() else 0)
            data = _parse_scan_folder(newest)
            if data is not None:
                with _lock:
                    s2 = _sessions.get(sid)
                    if s2:
                        s2.baseline = current
                        s2.created_at = time.time()
                return {"status": "ok", "data": data}
        if time.time() >= deadline:
            return {"status": "timeout"}
        with _lock:
            if sid not in _sessions:
                return None
        await asyncio.sleep(_POLL_INTERVAL)
