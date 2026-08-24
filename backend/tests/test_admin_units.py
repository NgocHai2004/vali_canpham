import pytest

import backend.main as main


@pytest.mark.asyncio
async def test_get_deployment_returns_seeded_province(app_client, officer_headers):
    r = await app_client.get("/api/deployment", headers=officer_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["province_code"] == "01"
    assert "Hà Nội" in body["province_name"]


@pytest.mark.asyncio
async def test_patch_deployment_admin_only(app_client, officer_headers):
    r = await app_client.patch(
        "/api/deployment",
        json={"province_code": "48", "province_name": "Thành phố Đà Nẵng"},
        headers=officer_headers,
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_patch_deployment_updates_cache(app_client, admin_headers):
    r = await app_client.patch(
        "/api/deployment",
        json={"province_code": "48", "province_name": "Thành phố Đà Nẵng"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["province_code"] == "48"
    assert main._province_cache["province_code"] == "48"
    r2 = await app_client.get("/api/deployment", headers=admin_headers)
    assert r2.json()["province_name"] == "Thành phố Đà Nẵng"


@pytest.mark.asyncio
async def test_list_admin_units_seeded_for_device_province(app_client, officer_headers):
    r = await app_client.get("/api/admin-units", headers=officer_headers)
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) > 0
    assert all(u["province_code"] == "01" for u in items)
    assert all(u["active"] is True for u in items)
    assert all("id" in u and "code" in u and "name" in u for u in items)


@pytest.mark.asyncio
async def test_create_admin_unit_admin_only(app_client, officer_headers):
    r = await app_client.post(
        "/api/admin-units",
        json={"code": "01999", "name": "Xã Thử Nghiệm", "unit_type": "xa"},
        headers=officer_headers,
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_create_admin_unit_rejects_duplicate_code(app_client, admin_headers):
    body = {"code": "01888", "name": "Xã Mới", "unit_type": "xa"}
    r1 = await app_client.post("/api/admin-units", json=body, headers=admin_headers)
    assert r1.status_code == 200, r1.text
    assert r1.json()["province_code"] == "01"
    r2 = await app_client.post("/api/admin-units", json=body, headers=admin_headers)
    assert r2.status_code == 400
    assert "đã có" in r2.json()["detail"]


@pytest.mark.asyncio
async def test_patch_admin_unit_renames(app_client, admin_headers, officer_headers):
    r0 = await app_client.get("/api/admin-units", headers=officer_headers)
    uid = r0.json()[0]["id"]
    r1 = await app_client.patch(
        f"/api/admin-units/{uid}", json={"name": "Phường Đổi Tên"}, headers=admin_headers
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["name"] == "Phường Đổi Tên"


@pytest.mark.asyncio
async def test_delete_admin_unit_is_soft(app_client, admin_headers, officer_headers):
    r0 = await app_client.get("/api/admin-units", headers=officer_headers)
    before = len(r0.json())
    target = r0.json()[0]
    r1 = await app_client.delete(f"/api/admin-units/{target['id']}", headers=admin_headers)
    assert r1.status_code == 200, r1.text
    assert r1.json()["deactivated"] == target["code"]

    r2 = await app_client.get("/api/admin-units", headers=officer_headers)
    assert len(r2.json()) == before - 1
    doc = await main.db.admin_units.find_one({"code": target["code"]})
    assert doc is not None, "soft delete phải giữ doc để hồ sơ cũ còn tham chiếu được"
    assert doc["active"] is False


@pytest.mark.asyncio
async def test_list_admin_units_hides_other_province(app_client, admin_headers, officer_headers):
    await main.db.admin_units.insert_one({
        "code": "48001", "name": "Phường Hải Châu", "province_code": "48",
        "unit_type": "phuong", "active": True,
    })
    r = await app_client.get("/api/admin-units", headers=officer_headers)
    assert all(u["province_code"] == "01" for u in r.json())
