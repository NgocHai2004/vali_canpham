import pytest

from backend.cccd_watcher import (
    cccd_start_session,
    cccd_wait_session,
    cccd_inject,
    cccd_end_session,
    cccd_health,
)


@pytest.mark.asyncio
async def test_cccd_health_returns_ok():
    h = cccd_health()
    assert h["ok"] is True
    assert "sdk" in h


@pytest.mark.asyncio
async def test_push_inject_delivered_to_wait():
    sid = cccd_start_session()
    try:
        data = {"cccd_number": "079204012345", "full_name": "Nguyen Van A"}
        delivered = cccd_inject(data)
        assert delivered == 1
        result = await cccd_wait_session(sid, timeout=2)
        assert result is not None
        assert result["status"] == "ok"
        assert result["data"]["cccd_number"] == "079204012345"
    finally:
        cccd_end_session(sid)


@pytest.mark.asyncio
async def test_wait_timeout_returns_timeout():
    sid = cccd_start_session()
    try:
        result = await cccd_wait_session(sid, timeout=1)
        assert result == {"status": "timeout"}
    finally:
        cccd_end_session(sid)
