import io
import os

import numpy as np
import pytest
from PIL import Image

import backend.main as main
from backend import face_recognition_service as frs
from httpx import AsyncClient, ASGITransport
from mongomock_motor import AsyncMongoMockClient


def make_jpeg_bytes(w=120, h=160, color=(200, 200, 200)):
    img = Image.new("RGB", (w, h), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_not_ready_before_load():
    frs._app = None
    assert frs.is_ready() is False


def test_get_status_shape():
    frs._app = None
    st = frs.get_status()
    assert set(st.keys()) >= {"ready", "model", "device"}
    assert st["model"] == "buffalo_sc"
    assert st["ready"] is False


def test_get_embedding_not_ready_returns_none():
    """Khi model chưa ready → (None, 0, 'none')."""
    frs._app = None
    emb, n, method = frs.get_embedding(make_jpeg_bytes())
    assert emb is None
    assert n == 0
    assert method == "none"


def test_match_threshold_filter():
    """match lọc score < threshold, sort desc."""
    emb = np.array([1.0, 0.0], dtype=np.float32)
    candidates = [
        {"_id": "a", "face_embedding": [1.0, 0.0]},      # score ~1.0
        {"_id": "b", "face_embedding": [0.0, 1.0]},      # score ~0.0
        {"_id": "c", "face_embedding": [0.9, 0.1]},      # score ~0.9
    ]
    res = frs.match(emb, candidates, threshold=0.5)
    ids = [r["_id"] for r in res]
    assert ids == ["a", "c"]
    assert all(r["score"] >= 0.5 for r in res)


# ---------- Endpoint tests ----------
@pytest.fixture
async def app_client(monkeypatch):
    c = AsyncMongoMockClient()
    db = c["app_cccd_test"]
    monkeypatch.setattr(main, "client", c)
    monkeypatch.setattr(main, "db", db)
    await main._ensure_admin()
    await main._ensure_default_cells()
    await main._ensure_default_admin_units()
    await main._ensure_indexes()
    await main._load_deployment_config()
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def admin_token(app_client):
    r = await app_client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _write_test_upload(filename="test_face_portrait.jpg"):
    """Tạo 1 file ảnh thật trong uploads dir test, trả URL '/uploads/<filename>'."""
    uploads_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    path = os.path.join(uploads_dir, filename)
    with open(path, "wb") as f:
        f.write(make_jpeg_bytes())
    return f"/uploads/{filename}"


async def test_face_health_endpoint(app_client, admin_token):
    main.face_recognition_service._app = None
    r = await app_client.get("/api/face/health",
                             headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    body = r.json()
    assert body["model"] == "buffalo_sc"
    assert body["ready"] is False


async def test_face_recognize_not_ready_returns_empty(app_client, admin_token, monkeypatch):
    """Model chưa ready → ready=False, matches=[]."""
    monkeypatch.setattr(main.face_recognition_service, "is_ready", lambda: False)
    monkeypatch.setattr(main.face_recognition_service, "_app", None)
    files = {"file": ("p.jpg", make_jpeg_bytes(), "image/jpeg")}
    r = await app_client.post("/api/face/recognize", files=files,
                              headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ready"] is False
    assert body["matches"] == []


async def test_face_recognize_with_match(app_client, admin_token, monkeypatch):
    """Fake get_embedding trả vector + 1 candidate match → trả detainee gọn + score."""
    emb = np.ones(512, dtype=np.float32)
    monkeypatch.setattr(main.face_recognition_service, "is_ready", lambda: True)
    monkeypatch.setattr(main.face_recognition_service, "get_embedding",
                        lambda b: (emb, 1, "insightface"))
    await main.db.detainees.insert_one({
        "personal_id": "P001", "full_name": "Nguyễn Văn A", "cccd_number": "001203033844",
        "gender": "male", "photos": {"face_embedding": [1.0] * 512, "portrait_front": "/uploads/x.jpg"},
    })
    files = {"file": ("p.jpg", make_jpeg_bytes(), "image/jpeg")}
    r = await app_client.post("/api/face/recognize", files=files,
                              headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ready"] is True
    assert body["n_faces"] == 1
    assert len(body["matches"]) == 1
    m = body["matches"][0]
    assert m["score"] >= 0.4
    assert m["detainee"]["full_name"] == "Nguyễn Văn A"
    # projection: KHÔNG trả face_embedding nặng
    assert "face_embedding" not in (m["detainee"].get("photos") or {})


async def test_face_recognize_by_url(app_client, admin_token, monkeypatch):
    """Gửi JSON {url} thay vì file → resolve path local rồi get_embedding."""
    emb = np.ones(512, dtype=np.float32)
    monkeypatch.setattr(main.face_recognition_service, "is_ready", lambda: True)
    monkeypatch.setattr(main.face_recognition_service, "get_embedding",
                        lambda b: (emb, 1, "insightface"))
    url = _write_test_upload("test_recognize_url.jpg")
    await main.db.detainees.insert_one({
        "personal_id": "P002", "full_name": "Trần B", "cccd_number": "026204004933",
        "gender": "female", "photos": {"face_embedding": [1.0] * 512},
    })
    r = await app_client.post("/api/face/recognize",
                              json={"url": url},
                              headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    assert len(r.json()["matches"]) == 1


async def test_create_detainee_stores_face_embedding(app_client, officer_headers, monkeypatch):
    """Tạo detainee có portrait_front local + model ready → lưu photos.face_embedding."""
    emb = np.ones(512, dtype=np.float32)
    url = _write_test_upload("test_create_face.jpg")
    monkeypatch.setattr(main.face_recognition_service, "is_ready", lambda: True)
    monkeypatch.setattr(main.face_recognition_service, "get_embedding",
                        lambda b: (emb, 1, "insightface"))
    s = await app_client.post("/api/sessions", json={"case_name": "Vu an test", "commune_code": "01001", "location": "x", "note": ""},
                              headers=officer_headers)
    sid = s.json()["id"]
    body = {
        "full_name": "Test Face", "gender": "male", "dob": "1990-01-01",
        "cccd_number": "123456789012", "personal_id": "PF001",
        "session_id": sid,
        "photos": {"cccd_front": url, "portrait_front": url},
    }
    r = await app_client.post("/api/detainees", json=body, headers=officer_headers)
    assert r.status_code == 200, r.text
    doc = await main.db.detainees.find_one({"personal_id": "PF001"})
    fe = (doc.get("photos") or {}).get("face_embedding")
    assert fe is not None and len(fe) == 512


async def test_create_detainee_skips_embedding_when_not_ready(app_client, officer_headers, monkeypatch):
    """Model chưa ready → không crash, KHÔNG có face_embedding."""
    monkeypatch.setattr(main.face_recognition_service, "is_ready", lambda: False)
    url = _write_test_upload("test_create_face2.jpg")
    s = await app_client.post("/api/sessions", json={"case_name": "Vu an test", "commune_code": "01001", "location": "x", "note": ""},
                              headers=officer_headers)
    sid = s.json()["id"]
    body = {
        "full_name": "Test Face2", "gender": "male", "dob": "1990-01-01",
        "cccd_number": "987654321098", "personal_id": "PF002",
        "session_id": sid,
        "photos": {"cccd_front": url, "portrait_front": url},
    }
    r = await app_client.post("/api/detainees", json=body, headers=officer_headers)
    assert r.status_code == 200, r.text
    doc = await main.db.detainees.find_one({"personal_id": "PF002"})
    assert (doc.get("photos") or {}).get("face_embedding") is None


async def test_backfill_admin_only(app_client, admin_token):
    r = await app_client.post("/api/face/backfill",
                              headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body.keys()) >= {"updated", "skipped", "failed"}


async def test_backfill_updates_missing_embedding(app_client, admin_token, monkeypatch):
    """Detainee có portrait_front local + chưa có embedding → backfill tính + lưu."""
    emb = np.ones(512, dtype=np.float32)
    monkeypatch.setattr(main.face_recognition_service, "is_ready", lambda: True)
    monkeypatch.setattr(main.face_recognition_service, "get_embedding",
                        lambda b: (emb, 1, "insightface"))
    url = _write_test_upload("test_backfill.jpg")
    await main.db.detainees.insert_one({
        "personal_id": "PB001", "full_name": "Back Fill",
        "cccd_number": "111222333444", "gender": "male",
        "photos": {"portrait_front": url},
    })
    r = await app_client.post("/api/face/backfill",
                              headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["updated"] >= 1
    doc = await main.db.detainees.find_one({"personal_id": "PB001"})
    assert (doc.get("photos") or {}).get("face_embedding") is not None

