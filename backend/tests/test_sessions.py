import pytest


@pytest.mark.asyncio
async def test_open_session_success(app_client, admin_headers):
    r = await app_client.post(
        "/api/sessions",
        json={"location": "Buồng 2", "note": "Ca sáng"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "open"
    assert data["officer"] == "admin"
    assert data["location"] == "Buồng 2"
    assert data["detainee_count"] == 0
    assert data["closed_at"] is None
    assert data["code"].startswith("S")


@pytest.mark.asyncio
async def test_open_session_conflict_when_already_open(app_client, admin_headers):
    r1 = await app_client.post("/api/sessions", json={}, headers=admin_headers)
    assert r1.status_code == 200
    r2 = await app_client.post("/api/sessions", json={}, headers=admin_headers)
    assert r2.status_code == 409
    assert "đang mở" in r2.json()["detail"]


@pytest.mark.asyncio
async def test_get_current_session_returns_open_one(app_client, admin_headers):
    r0 = await app_client.get("/api/sessions/current", headers=admin_headers)
    assert r0.status_code == 404

    r1 = await app_client.post("/api/sessions", json={}, headers=admin_headers)
    code = r1.json()["code"]

    r2 = await app_client.get("/api/sessions/current", headers=admin_headers)
    assert r2.status_code == 200
    assert r2.json()["code"] == code


@pytest.mark.asyncio
async def test_list_sessions_filters_mine_only(app_client, admin_headers):
    await app_client.post(
        "/api/sessions", json={"note": "s1"}, headers=admin_headers
    )
    r = await app_client.get(
        "/api/sessions?mine_only=true", headers=admin_headers
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["officer"] == "admin"


@pytest.mark.asyncio
async def test_get_session_detail_empty(app_client, admin_headers):
    r1 = await app_client.post("/api/sessions", json={}, headers=admin_headers)
    sid = r1.json()["id"]
    r2 = await app_client.get(f"/api/sessions/{sid}", headers=admin_headers)
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
        "photos": {"cccd_front": "/uploads/x.jpg", "cccd_back": "/uploads/y.jpg"},
    }


@pytest.mark.asyncio
async def test_create_detainee_requires_session_id(app_client, admin_headers):
    body = _sample_detainee(session_id="")
    body.pop("session_id")
    r = await app_client.post("/api/detainees", json=body, headers=admin_headers)
    assert r.status_code == 400
    assert "phiên" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_detainee_success_increments_count(app_client, admin_headers):
    r1 = await app_client.post("/api/sessions", json={}, headers=admin_headers)
    sid = r1.json()["id"]
    r2 = await app_client.post(
        "/api/detainees", json=_sample_detainee(sid), headers=admin_headers
    )
    assert r2.status_code == 200, r2.text
    r3 = await app_client.get(f"/api/sessions/{sid}", headers=admin_headers)
    assert r3.json()["detainee_count"] == 1
    assert len(r3.json()["detainees"]) == 1


@pytest.mark.asyncio
async def test_close_empty_session(app_client, admin_headers):
    r1 = await app_client.post(
        "/api/sessions", json={"note": "empty"}, headers=admin_headers
    )
    sid = r1.json()["id"]
    r2 = await app_client.post(f"/api/sessions/{sid}/close", headers=admin_headers)
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["ok"] is True
    assert body["closed_at"]
    assert body["report_url"].startswith("/uploads/reports/")
    assert body["report_filename"].endswith(".xlsx")

    r3 = await app_client.get(f"/api/sessions/{sid}", headers=admin_headers)
    detail = r3.json()
    assert detail["status"] == "closed"
    assert detail["report_url"] == body["report_url"]


@pytest.mark.asyncio
async def test_close_session_twice_conflict(app_client, admin_headers):
    r1 = await app_client.post("/api/sessions", json={}, headers=admin_headers)
    sid = r1.json()["id"]
    await app_client.post(f"/api/sessions/{sid}/close", headers=admin_headers)
    r2 = await app_client.post(f"/api/sessions/{sid}/close", headers=admin_headers)
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_create_detainee_rejects_closed_session(app_client, admin_headers):
    r1 = await app_client.post("/api/sessions", json={}, headers=admin_headers)
    sid = r1.json()["id"]
    await app_client.post(f"/api/sessions/{sid}/close", headers=admin_headers)
    r3 = await app_client.post(
        "/api/detainees", json=_sample_detainee(sid), headers=admin_headers
    )
    assert r3.status_code in (400, 403)


@pytest.mark.asyncio
async def test_report_contains_detainee(app_client, admin_headers):
    r1 = await app_client.post("/api/sessions", json={}, headers=admin_headers)
    sid = r1.json()["id"]
    await app_client.post(
        "/api/detainees", json=_sample_detainee(sid), headers=admin_headers
    )
    r2 = await app_client.post(f"/api/sessions/{sid}/close", headers=admin_headers)
    assert r2.status_code == 200
    r3 = await app_client.get(f"/api/sessions/{sid}/report", headers=admin_headers)
    assert r3.status_code == 200
    assert r3.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument")
    assert len(r3.content) > 200


@pytest.mark.asyncio
async def test_delete_empty_open_session(app_client, admin_headers):
    r1 = await app_client.post("/api/sessions", json={}, headers=admin_headers)
    sid = r1.json()["id"]
    r2 = await app_client.delete(f"/api/sessions/{sid}", headers=admin_headers)
    assert r2.status_code == 200


@pytest.mark.asyncio
async def test_delete_session_with_detainee_rejected(app_client, admin_headers):
    r1 = await app_client.post("/api/sessions", json={}, headers=admin_headers)
    sid = r1.json()["id"]
    await app_client.post(
        "/api/detainees", json=_sample_detainee(sid), headers=admin_headers
    )
    r2 = await app_client.delete(f"/api/sessions/{sid}", headers=admin_headers)
    assert r2.status_code == 400
