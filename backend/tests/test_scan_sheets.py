# -*- coding: utf-8 -*-
"""GET /api/sessions/{id}/sheets — toan bo can pham (du lieu day du + photos)
cua mot phien, dung de in toan bo Chi ban / Danh ban khi phien da dong."""
import os
import sys
from datetime import datetime, timedelta

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import main  # noqa: E402

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def _db_mock():
    """Thay db that bang mongomock — khong cham toi Mongo."""
    main.db = AsyncMongoMockClient()["test"]
    main.app.dependency_overrides[main.get_current_user] = lambda: {
        "username": "cb01", "role": "officer"}
    yield
    main.app.dependency_overrides.pop(main.get_current_user, None)


def _session(officer="cb01", status="closed", **kw):
    doc = {"_id": ObjectId(), "code": "S-001", "officer": officer,
           "status": status, "location": "Trại A", "detainee_count": 0,
           "opened_at": datetime.utcnow(),
           "closed_at": datetime.utcnow() if status == "closed" else None}
    doc.update(kw)
    return doc


def _detainee(session_id, full_name, photos=None, **kw):
    doc = {"_id": ObjectId(), "session_id": session_id,
           "personal_id": "MP-001", "full_name": full_name,
           "cccd_number": "074123456789", "gender": "male",
           "dob": datetime(1990, 3, 15),
           "created_at": datetime.utcnow(),
           "photos": photos or {"portrait_front": "/uploads/p1.jpg"}}
    doc.update(kw)
    return doc


def _them_session(**kw):
    import asyncio
    doc = _session(**kw)
    asyncio.run(main.db.work_sessions.insert_one(doc))
    return doc


def _them_detainee(session_id, full_name, **kw):
    import asyncio
    doc = _detainee(session_id, full_name, **kw)
    asyncio.run(main.db.detainees.insert_one(doc))
    return doc


# --- tra du lieu day du -----------------------------------------------------

def test_sheets_tra_du_can_pham_va_photos():
    s = _them_session()
    _them_detainee(s["_id"], "Nguyễn Văn A",
                   photos={"portrait_front": "/uploads/a.jpg",
                           "fp_plain_left": "/uploads/a_l.jpg"})
    _them_detainee(s["_id"], "Trần Thị B",
                   photos={"portrait_front": "/uploads/b.jpg"})

    r = client.get(f"/api/sessions/{s['_id']}/sheets")

    assert r.status_code == 200
    data = r.json()
    assert data["session"]["status"] == "closed"
    assert len(data["detainees"]) == 2
    ten = [d["full_name"] for d in data["detainees"]]
    assert ten == ["Nguyễn Văn A", "Trần Thị B"]     # theo created_at
    a = data["detainees"][0]
    assert a["photos"]["portrait_front"] == "/uploads/a.jpg"
    assert a["photos"]["fp_plain_left"] == "/uploads/a_l.jpg"
    assert a["cccd_number"] == "074123456789"


def test_sheets_xep_theo_thu_tu_tao():
    s = _them_session()
    cu = _detainee(s["_id"], "Người cũ", created_at=datetime.utcnow() - timedelta(hours=2))
    moi = _detainee(s["_id"], "Người mới", created_at=datetime.utcnow())
    import asyncio
    asyncio.run(main.db.detainees.insert_many([moi, cu]))  # chen nguoc thu tu

    data = client.get(f"/api/sessions/{s['_id']}/sheets").json()
    assert [d["full_name"] for d in data["detainees"]] == ["Người cũ", "Người mới"]


def test_sheets_khong_lo_face_embedding():
    """Photos.face_embedding (vector lon) khong can cho viec in — bo di de phan
    hoi nhe, khong lo nha ra du lieu nhan dang."""
    s = _them_session()
    _them_detainee(s["_id"], "A",
                   photos={"portrait_front": "/uploads/a.jpg",
                           "face_embedding": [0.1] * 512})
    data = client.get(f"/api/sessions/{s['_id']}/sheets").json()
    assert "face_embedding" not in data["detainees"][0]["photos"]


# --- phien mo / quyen / loi ------------------------------------------------

def test_sheets_phien_mo_van_tra_duoc():
    """UI chi hien nut in khi phien da dong, nhung backend khong chan phien mo
    (admin co the in giua chung de kiem tra)."""
    s = _them_session(status="open")
    _them_detainee(s["_id"], "A")
    assert client.get(f"/api/sessions/{s['_id']}/sheets").status_code == 200


def test_sheets_khong_co_phien_tra_404():
    r = client.get(f"/api/sessions/{ObjectId()}/sheets")
    assert r.status_code == 404


def test_sheets_nguoi_khac_khong_xem_duoc():
    s = _them_session(officer="cb02")   # phien cua nguoi khac
    r = client.get(f"/api/sessions/{s['_id']}/sheets")
    assert r.status_code == 403


def test_sheets_admin_xem_duoc_phien_nguoi_khac():
    main.app.dependency_overrides[main.get_current_user] = lambda: {
        "username": "admin", "role": "admin"}
    s = _them_session(officer="cb02")
    assert client.get(f"/api/sessions/{s['_id']}/sheets").status_code == 200


def test_sheets_phien_khong_co_can_pham_tra_rong():
    s = _them_session()
    data = client.get(f"/api/sessions/{s['_id']}/sheets").json()
    assert data["detainees"] == []