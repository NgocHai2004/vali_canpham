import pytest

import backend.main as main

COMMUNE_CODE = "01001"   # Phường Ba Đình — có trong seed admin_units_vn.json


def _session_body(**over) -> dict:
    """Body mở phiên hợp lệ. commune_code là bắt buộc từ Task 3 trở đi."""
    body = {"case_name": "Vu an thu nghiem", "commune_code": COMMUNE_CODE, "location": "", "note": ""}
    body.update(over)
    return body


@pytest.mark.asyncio
async def test_open_session_success(app_client, officer_headers):
    r = await app_client.post(
        "/api/sessions",
        json=_session_body(location="Buồng 2", note="Ca sáng"),
        headers=officer_headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "open"
    assert data["officer"] == "canbo1"
    assert data["location"] == "Buồng 2"
    assert data["detainee_count"] == 0
    assert data["closed_at"] is None
    assert data["code"].startswith("S")


@pytest.mark.asyncio
async def test_open_session_conflict_when_already_open(app_client, officer_headers):
    r1 = await app_client.post("/api/sessions", json=_session_body(), headers=officer_headers)
    assert r1.status_code == 200
    r2 = await app_client.post("/api/sessions", json=_session_body(), headers=officer_headers)
    assert r2.status_code == 409
    assert "đang mở" in r2.json()["detail"]


@pytest.mark.asyncio
async def test_get_current_session_returns_open_one(app_client, officer_headers):
    r0 = await app_client.get("/api/sessions/current", headers=officer_headers)
    assert r0.status_code == 404

    r1 = await app_client.post("/api/sessions", json=_session_body(), headers=officer_headers)
    code = r1.json()["code"]

    r2 = await app_client.get("/api/sessions/current", headers=officer_headers)
    assert r2.status_code == 200
    assert r2.json()["code"] == code


@pytest.mark.asyncio
async def test_list_sessions_filters_mine_only(app_client, officer_headers):
    await app_client.post(
        "/api/sessions", json=_session_body(note="s1"), headers=officer_headers
    )
    r = await app_client.get(
        "/api/sessions?mine_only=true", headers=officer_headers
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["officer"] == "canbo1"


@pytest.mark.asyncio
async def test_get_session_detail_empty(app_client, officer_headers):
    r1 = await app_client.post("/api/sessions", json=_session_body(), headers=officer_headers)
    sid = r1.json()["id"]
    r2 = await app_client.get(f"/api/sessions/{sid}", headers=officer_headers)
    assert r2.status_code == 200
    body = r2.json()
    assert body["id"] == sid
    assert body["status"] == "open"
    assert body["detainees"] == []


def _sample_detainee(session_id: str) -> dict:
    return {
        "session_id": session_id,
        "full_name": "Nguyễn Văn A",
        "gender": "male",
        "dob": "01/01/1990",
        "cccd_number": "079204012345",
        "personal_id": "CP-TEST-001",
        "photos": {"cccd_front": "/uploads/x.jpg", "cccd_back": "/uploads/y.jpg"},
    }


@pytest.mark.asyncio
async def test_create_detainee_requires_session_id(app_client, officer_headers):
    body = _sample_detainee(session_id="")
    body.pop("session_id")
    r = await app_client.post("/api/detainees", json=body, headers=officer_headers)
    assert r.status_code == 400
    assert "phiên" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_detainee_success_increments_count(app_client, officer_headers):
    r1 = await app_client.post("/api/sessions", json=_session_body(), headers=officer_headers)
    sid = r1.json()["id"]
    r2 = await app_client.post(
        "/api/detainees", json=_sample_detainee(sid), headers=officer_headers
    )
    assert r2.status_code == 200, r2.text
    r3 = await app_client.get(f"/api/sessions/{sid}", headers=officer_headers)
    assert r3.json()["detainee_count"] == 1
    assert len(r3.json()["detainees"]) == 1


@pytest.mark.asyncio
async def test_close_empty_session(app_client, officer_headers):
    r1 = await app_client.post(
        "/api/sessions", json=_session_body(note="empty"), headers=officer_headers
    )
    sid = r1.json()["id"]
    r2 = await app_client.post(f"/api/sessions/{sid}/close", headers=officer_headers)
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["ok"] is True
    assert body["closed_at"]
    assert body["report_url"].startswith("/uploads/reports/")
    assert body["report_filename"].endswith(".xlsx")

    r3 = await app_client.get(f"/api/sessions/{sid}", headers=officer_headers)
    detail = r3.json()
    assert detail["status"] == "closed"
    assert detail["report_url"] == body["report_url"]


@pytest.mark.asyncio
async def test_close_session_twice_conflict(app_client, officer_headers):
    r1 = await app_client.post("/api/sessions", json=_session_body(), headers=officer_headers)
    sid = r1.json()["id"]
    await app_client.post(f"/api/sessions/{sid}/close", headers=officer_headers)
    r2 = await app_client.post(f"/api/sessions/{sid}/close", headers=officer_headers)
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_create_detainee_rejects_closed_session(app_client, officer_headers):
    r1 = await app_client.post("/api/sessions", json=_session_body(), headers=officer_headers)
    sid = r1.json()["id"]
    await app_client.post(f"/api/sessions/{sid}/close", headers=officer_headers)
    r3 = await app_client.post(
        "/api/detainees", json=_sample_detainee(sid), headers=officer_headers
    )
    assert r3.status_code in (400, 403)


@pytest.mark.asyncio
async def test_report_contains_detainee(app_client, officer_headers):
    r1 = await app_client.post("/api/sessions", json=_session_body(), headers=officer_headers)
    sid = r1.json()["id"]
    await app_client.post(
        "/api/detainees", json=_sample_detainee(sid), headers=officer_headers
    )
    r2 = await app_client.post(f"/api/sessions/{sid}/close", headers=officer_headers)
    assert r2.status_code == 200
    r3 = await app_client.get(f"/api/sessions/{sid}/report", headers=officer_headers)
    assert r3.status_code == 200
    assert r3.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument")
    assert len(r3.content) > 200


@pytest.mark.asyncio
async def test_delete_empty_open_session(app_client, officer_headers):
    r1 = await app_client.post("/api/sessions", json=_session_body(), headers=officer_headers)
    sid = r1.json()["id"]
    r2 = await app_client.delete(f"/api/sessions/{sid}", headers=officer_headers)
    assert r2.status_code == 200


@pytest.mark.asyncio
async def test_delete_session_with_detainee_rejected(app_client, officer_headers):
    r1 = await app_client.post("/api/sessions", json=_session_body(), headers=officer_headers)
    sid = r1.json()["id"]
    await app_client.post(
        "/api/detainees", json=_sample_detainee(sid), headers=officer_headers
    )
    r2 = await app_client.delete(f"/api/sessions/{sid}", headers=officer_headers)
    assert r2.status_code == 400


@pytest.mark.asyncio
async def test_admin_cannot_open_session(app_client, admin_headers):
    """Quản trị hệ thống không đi thu nhận can phạm → không được mở phiên."""
    r = await app_client.post("/api/sessions", json=_session_body(), headers=admin_headers)
    assert r.status_code == 403
    assert "quản trị" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_admin_has_no_current_session(app_client, admin_headers):
    r = await app_client.get("/api/sessions/current", headers=admin_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_admin_cannot_create_detainee(app_client, admin_headers, officer_headers):
    """Admin không thu nhận hồ sơ, kể cả vào phiên đang mở của cán bộ."""
    r1 = await app_client.post("/api/sessions", json=_session_body(), headers=officer_headers)
    sid = r1.json()["id"]
    r2 = await app_client.post(
        "/api/detainees", json=_sample_detainee(sid), headers=admin_headers
    )
    assert r2.status_code == 403


@pytest.mark.asyncio
async def test_admin_stats_has_no_open_session(app_client, admin_headers, officer_headers):
    """Cán bộ có phiên mở, nhưng trang chủ của admin không hiện phiên nào."""
    await app_client.post("/api/sessions", json=_session_body(), headers=officer_headers)
    r = await app_client.get("/api/stats", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["open_session"] is None


@pytest.mark.asyncio
async def test_admin_can_still_edit_detainee(app_client, admin_headers, officer_headers):
    """Admin vẫn SỬA được hồ sơ do cán bộ nhập (để chữa dữ liệu sai)."""
    r1 = await app_client.post("/api/sessions", json=_session_body(), headers=officer_headers)
    sid = r1.json()["id"]
    r2 = await app_client.post(
        "/api/detainees", json=_sample_detainee(sid), headers=officer_headers
    )
    assert r2.status_code == 200, r2.text
    det_id = r2.json()["id"]
    body = _sample_detainee(sid)
    body["full_name"] = "Nguyễn Văn B"
    r3 = await app_client.patch(
        f"/api/detainees/{det_id}", json=body, headers=admin_headers
    )
    assert r3.status_code == 200, r3.text
    doc = await main.db.detainees.find_one({"_id": main._oid(det_id)})
    assert doc["full_name"] == "Nguyễn Văn B"


@pytest.mark.asyncio
async def test_open_session_snapshots_province_and_commune(app_client, officer_headers):
    r = await app_client.post(
        "/api/sessions", json=_session_body(), headers=officer_headers
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["province_code"] == "01"
    assert "Hà Nội" in data["province_name"]
    assert data["commune_code"] == COMMUNE_CODE
    assert data["commune_name"] == "Phường Ba Đình"


@pytest.mark.asyncio
async def test_open_session_requires_commune(app_client, officer_headers):
    r = await app_client.post(
        "/api/sessions",
        json={"case_name": "Vu an thu nghiem", "location": "x", "note": ""},
        headers=officer_headers,
    )
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_open_session_rejects_unknown_commune(app_client, officer_headers):
    r = await app_client.post(
        "/api/sessions", json=_session_body(commune_code="99999"), headers=officer_headers
    )
    assert r.status_code == 400
    assert "Xã/phường" in r.json()["detail"]


@pytest.mark.asyncio
async def test_open_session_rejects_inactive_commune(app_client, officer_headers):
    await main.db.admin_units.update_one(
        {"code": COMMUNE_CODE}, {"$set": {"active": False}}
    )
    r = await app_client.post(
        "/api/sessions", json=_session_body(), headers=officer_headers
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_open_session_rejects_commune_of_other_province(app_client, officer_headers):
    await main.db.admin_units.insert_one({
        "code": "48001", "name": "Phường Hải Châu", "province_code": "48",
        "unit_type": "phuong", "active": True,
    })
    r = await app_client.post(
        "/api/sessions", json=_session_body(commune_code="48001"), headers=officer_headers
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_open_session_location_empty_by_default(app_client, officer_headers):
    """Bỏ default 'Trung tâm thu thập dự liệu': xã đã là dự liệu có cấu trúc,
    location chỉ còn là ghi chú vị trí cụ thể nên để trống là đúng."""
    r = await app_client.post(
        "/api/sessions", json=_session_body(), headers=officer_headers
    )
    assert r.json()["location"] == ""


@pytest.mark.asyncio
async def test_detainee_inherits_commune_from_session(app_client, officer_headers):
    r1 = await app_client.post(
        "/api/sessions", json=_session_body(), headers=officer_headers
    )
    sid = r1.json()["id"]
    r2 = await app_client.post(
        "/api/detainees", json=_sample_detainee(sid), headers=officer_headers
    )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["province_code"] == "01"
    assert body["commune_code"] == COMMUNE_CODE
    assert body["commune_name"] == "Phường Ba Đình"


@pytest.mark.asyncio
async def test_detainee_patch_cannot_change_commune(app_client, officer_headers):
    """3 trường tỉnh/xã thuộc PHIÊN, không thuộc hồ sơ. DetaineeIn không khai báo
    chúng nên Pydantic bỏ qua — client gửi kèm cũng không ghi được."""
    r1 = await app_client.post(
        "/api/sessions", json=_session_body(), headers=officer_headers
    )
    sid = r1.json()["id"]
    r2 = await app_client.post(
        "/api/detainees", json=_sample_detainee(sid), headers=officer_headers
    )
    det_id = r2.json()["id"]

    body = _sample_detainee(sid)
    body["commune_code"] = "01502"
    body["commune_name"] = "Xã Gia Lâm"
    r3 = await app_client.patch(
        f"/api/detainees/{det_id}", json=body, headers=officer_headers
    )
    assert r3.status_code == 200, r3.text
    doc = await main.db.detainees.find_one({"_id": main._oid(det_id)})
    assert doc["commune_code"] == COMMUNE_CODE
    assert doc["commune_name"] == "Phường Ba Đình"


@pytest.mark.asyncio
async def test_list_detainees_filters_by_commune(app_client, officer_headers):
    r1 = await app_client.post(
        "/api/sessions", json=_session_body(), headers=officer_headers
    )
    sid = r1.json()["id"]
    await app_client.post(
        "/api/detainees", json=_sample_detainee(sid), headers=officer_headers
    )
    r2 = await app_client.get(
        f"/api/detainees?commune_code={COMMUNE_CODE}", headers=officer_headers
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["total"] == 1

    r3 = await app_client.get(
        "/api/detainees?commune_code=01502", headers=officer_headers
    )
    assert r3.json()["total"] == 0
