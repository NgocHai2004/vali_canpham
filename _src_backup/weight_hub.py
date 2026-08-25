# -*- coding: utf-8 -*-
"""Pub/sub WebSocket hub cho cân nặng.

Máy cân bên ngoài POST /api/weight/push -> hub.broadcast(payload) ->
mọi WebSocket client (form đăng ký can phạm đang mở) nhận được ngay.
"""
from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import WebSocket


class WeightHub:
    def __init__(self) -> None:
        self._subs: set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self.last_value: Optional[dict] = None

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._subs.add(ws)
        if self.last_value is not None:
            try:
                await ws.send_json(self.last_value)
            except Exception:
                pass

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._subs.discard(ws)

    async def broadcast(self, payload: dict) -> int:
        self.last_value = payload
        async with self._lock:
            targets = list(self._subs)
        if not targets:
            return 0
        results = await asyncio.gather(
            *(ws.send_json(payload) for ws in targets),
            return_exceptions=True,
        )
        dead = [ws for ws, res in zip(targets, results) if isinstance(res, Exception)]
        if dead:
            async with self._lock:
                for ws in dead:
                    self._subs.discard(ws)
        return len(targets) - len(dead)


hub = WeightHub()
