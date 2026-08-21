import pytest
from httpx import AsyncClient, ASGITransport
from mongomock_motor import AsyncMongoMockClient

import backend.main as main


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def mock_db(monkeypatch):
    client = AsyncMongoMockClient()
    db = client["app_cccd_test"]
    monkeypatch.setattr(main, "client", client)
    monkeypatch.setattr(main, "db", db)
    await main._ensure_admin()
    await main._ensure_default_cells()
    await main._ensure_indexes()
    yield db


@pytest.fixture
async def app_client(mock_db):
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def admin_token(app_client):
    r = await app_client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "admin123"},
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


OFFICER_USERNAME = "canbo1"
OFFICER_PASSWORD = "canbo123456"


@pytest.fixture
async def officer_headers(app_client, admin_headers):
    """Tài khoản cán bộ thu nhận (role=user) — vai duy nhất được mở phiên làm việc.

    Admin là quản trị hệ thống, không đi thu nhận can phạm nên bị chặn mở phiên
    và tạo hồ sơ; mọi test về luồng phiên/hồ sơ phải dùng fixture này.
    """
    r = await app_client.post(
        "/api/users",
        json={
            "username": OFFICER_USERNAME,
            "password": OFFICER_PASSWORD,
            "role": "user",
            "full_name": "Cán bộ Một",
        },
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    r2 = await app_client.post(
        "/api/auth/login",
        data={"username": OFFICER_USERNAME, "password": OFFICER_PASSWORD},
    )
    assert r2.status_code == 200, r2.text
    return {"Authorization": f"Bearer {r2.json()['access_token']}"}
