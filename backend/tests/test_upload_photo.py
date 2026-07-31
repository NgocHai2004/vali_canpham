import io
import pytest
from PIL import Image
from httpx import AsyncClient, ASGITransport
from mongomock_motor import AsyncMongoMockClient
import backend.main as main


def _jpg_bytes(w=120, h=160, color=(180, 180, 180)):
    img = Image.new("RGB", (w, h), color)
    buf = io.BytesIO(); img.save(buf, format="JPEG"); return buf.getvalue()


@pytest.fixture
async def client(monkeypatch):
    c = AsyncMongoMockClient()
    db = c["app_cccd_test"]
    monkeypatch.setattr(main, "client", c)
    monkeypatch.setattr(main, "db", db)
    await main._ensure_admin(); await main._ensure_default_cells(); await main._ensure_indexes()
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def token(client):
    r = await client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    return r.json()["access_token"]


@pytest.fixture
def fake_model_ready(monkeypatch):
    """Bật is_ready=True, draw_person_boxes trả (ảnh gốc, 1)."""
    def fake_draw(b):
        return b, 1
    monkeypatch.setattr(main.person_detect, "is_ready", lambda: True)
    monkeypatch.setattr(main.person_detect, "draw_person_boxes", fake_draw)


async def test_upload_portrait_returns_boxed(client, token, fake_model_ready):
    files = {"file": ("p.jpg", _jpg_bytes(), "image/jpeg")}
    r = await client.post(
        "/api/upload/photo?type=portrait",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["boxed"] is True
    assert body["n_persons"] == 1
    assert body["url"].startswith("/uploads/")


async def test_upload_no_type_skips_detect(client, token, monkeypatch):
    # Đảm bảo detect KHÔNG được gọi khi không có type
    called = {"n": 0}
    def spy(b):
        called["n"] += 1
        return b, 1
    monkeypatch.setattr(main.person_detect, "is_ready", lambda: True)
    monkeypatch.setattr(main.person_detect, "draw_person_boxes", spy)
    files = {"file": ("p.jpg", _jpg_bytes(), "image/jpeg")}
    r = await client.post("/api/upload/photo", files=files,
                          headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["boxed"] is False
    assert called["n"] == 0


async def test_upload_portrait_model_not_ready_fallback(client, token, monkeypatch):
    monkeypatch.setattr(main.person_detect, "is_ready", lambda: False)
    files = {"file": ("p.jpg", _jpg_bytes(), "image/jpeg")}
    r = await client.post("/api/upload/photo?type=portrait", files=files,
                          headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["boxed"] is False
    assert r.json()["n_persons"] is None
