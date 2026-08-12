import base64
import io
import os
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


BOXED_MARKER = b"BOXED-FAKE-BYTES"


@pytest.fixture
def fake_model_ready(monkeypatch):
    """Bật is_ready=True; draw_person_boxes trả (ảnh CÓ vạch, n_persons, head_ratio).

    Trả bytes khác hẳn ảnh gốc để test khẳng định được: bản có vạch chỉ đi vào
    preview_url, KHÔNG bao giờ được ghi xuống đĩa.
    """
    def fake_draw(b):
        return BOXED_MARKER, 1, 0.25
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
    assert body["head_ratio"] == 0.25
    assert body["url"].startswith("/uploads/")
    # Ảnh CÓ vạch đỏ trả về dạng data URI để frontend xem tạm.
    assert body["preview_url"].startswith("data:image/jpeg;base64,")
    assert base64.b64decode(body["preview_url"].split(",", 1)[1]) == BOXED_MARKER


async def test_upload_portrait_saves_clean_image(client, token, fake_model_ready):
    """File ghi xuống đĩa (và URL vào DB) phải là ẢNH GỐC SẠCH, không có vạch đỏ."""
    original = _jpg_bytes()
    files = {"file": ("p.jpg", original, "image/jpeg")}
    r = await client.post(
        "/api/upload/photo?type=portrait",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    saved = os.path.join(main.UPLOAD_DIR, os.path.basename(body["url"]))
    with open(saved, "rb") as f:
        on_disk = f.read()
    assert on_disk == original
    assert BOXED_MARKER not in on_disk
    assert body["size"] == len(original)
    os.remove(saved)


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
