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
