# Phân cấp Tỉnh → Phiên (chọn Xã) → Hồ sơ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gắn dữ liệu hành chính có cấu trúc (Tỉnh cố định theo thiết bị, Xã chọn khi mở phiên) vào phiên làm việc và hồ sơ can phạm, thay cho ô `location` free-text.

**Architecture:** Tỉnh là singleton doc trong `db.settings` (`_id="deployment"`), seed từ `.env` — dùng lại pattern `_load_measurement_config`. Xã là collection `db.admin_units` seed từ file JSON, có CRUD cho admin. Phiên snapshot đủ 4 trường tỉnh/xã lúc mở; hồ sơ denormalize 3 trường lúc insert (giống `cell_code` sẵn có). Xã của phiên khoá lại sau hồ sơ đầu tiên.

**Tech Stack:** FastAPI + Motor (MongoDB async), Pydantic v2, pytest + pytest-asyncio + mongomock_motor, React 18 + Vite, i18n tự viết (`useI18n`).

**Spec:** `docs/superpowers/specs/2026-08-23-province-commune-hierarchy-design.md`

## Global Constraints

- Tỉnh mặc định: `province_code = "01"`, `province_name = "Thành phố Hà Nội"`.
- Mọi message lỗi trả về người dùng viết bằng tiếng Việt có dấu, theo giọng các message sẵn có trong `main.py`.
- `commune_code` là **bắt buộc** khi mở phiên (Pydantic `min_length=1`), tối đa 20 ký tự.
- Xã chỉ đổi được khi `status == "open"` VÀ `detainee_count == 0`.
- Dữ liệu cũ (`commune_code = None`) phải không làm vỡ bất kỳ endpoint hay màn hình nào. **Không** viết script migration.
- Không thêm `province_code` / `commune_code` / `commune_name` vào `DetaineeIn` — đó chính là cơ chế chặn client sửa chúng.
- Mọi key i18n mới phải thêm vào **cả** `locales/vi.json` và `locales/en.json`.
- Chạy test từ thư mục `app_cccd`: `.venv/Scripts/python -m pytest backend/tests/ -v`
- Commit sau mỗi task. Message tiếng Việt không dấu, kết thúc bằng dòng
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## File Structure

**Tạo mới:**
- `backend/data/admin_units_vn.json` — danh mục xã/phường, có header ghi nguồn + ngày lấy. Tách khỏi `main.py` vì là dữ liệu, không phải logic.
- `backend/tests/test_admin_units.py` — test cho deployment config + CRUD danh mục xã.

**Sửa:**
- `backend/main.py` (2554 dòng) — mọi thay đổi backend. File này đã lớn, nhưng toàn bộ endpoint của dự án đều nằm ở đây; tách module riêng chỉ cho feature này sẽ phá vỡ pattern hiện có. Bám theo cách tổ chức sẵn có: config loader cạnh `_load_measurement_config`, seed cạnh `_ensure_default_cells`, endpoint nhóm theo comment banner.
- `backend/tests/test_sessions.py` — sửa test cũ bị vỡ + thêm test mới.
- `backend/tests/test_face_recognition.py:162,182` — sửa 2 lời gọi `POST /api/sessions`.
- `backend/tests/conftest.py` — fixture `mock_db` phải seed danh mục xã.
- `.env` + `.env.example` — 2 biến mới.
- `frontend/src/api.js` — 6 hàm API mới.
- `frontend/src/SessionOpenModal.jsx` — select Xã.
- `frontend/src/SessionListPage.jsx`, `SessionDetailPage.jsx`, `Dashboard.jsx` — hiển thị.
- `frontend/src/locales/vi.json` + `en.json` — key mới.

---

### Task 1: Cấu hình Tỉnh theo thiết bị

**Files:**
- Modify: `backend/main.py` — thêm const + `_load_deployment_config()` cạnh `_load_measurement_config` (`:217`); gọi trong `lifespan` (`:183`); endpoint mới cuối nhóm settings (sau `:1821`)
- Modify: `.env`, `.env.example`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_admin_units.py` (tạo mới)

**Interfaces:**
- Consumes: `require_admin` (`main.py:553`), `_log` helper, `db.settings` pattern.
- Produces:
  - `_province_cache: dict` — `{"province_code": str, "province_name": str}`, module-level global.
  - `_get_province() -> dict` — trả bản copy của cache, dùng bởi Task 2 và 3.
  - `async def _load_deployment_config() -> None`
  - `GET /api/deployment` → `{"province_code": "01", "province_name": "Thành phố Hà Nội"}`
  - `PATCH /api/deployment` (admin) body `{province_code, province_name}` → doc đã cập nhật.

- [ ] **Step 1: Thêm 2 biến vào `.env` và `.env.example`**

Nối vào cuối cả hai file:

```
# Tinh/thanh pho trien khai cua thiet bi nay. Chi dung de seed lan dau;
# sau do db.settings._id="deployment" moi la nguon that (admin sua trong app).
DEPLOY_PROVINCE_CODE=01
DEPLOY_PROVINCE_NAME=Thành phố Hà Nội
```

- [ ] **Step 2: Viết test thất bại**

Tạo `backend/tests/test_admin_units.py`:

```python
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
```

- [ ] **Step 3: Chạy test để xác nhận nó fail**

Run: `.venv/Scripts/python -m pytest backend/tests/test_admin_units.py -v`
Expected: FAIL — 404 Not Found (route chưa có) và `AttributeError: module 'backend.main' has no attribute '_province_cache'`.

- [ ] **Step 4: Thêm const + cache, đặt cạnh các const config sẵn có (gần `:217`)**

```python
PROVINCE_CODE_DEFAULT = os.getenv("DEPLOY_PROVINCE_CODE", "01").strip() or "01"
PROVINCE_NAME_DEFAULT = os.getenv("DEPLOY_PROVINCE_NAME", "Thành phố Hà Nội").strip() or "Thành phố Hà Nội"

# Tỉnh/thành triển khai của thiết bị. 1 thiết bị = 1 tỉnh nên dùng singleton doc
# trong db.settings, không tạo collection riêng cho 1 dòng dữ liệu.
_province_cache: dict = {
    "province_code": PROVINCE_CODE_DEFAULT,
    "province_name": PROVINCE_NAME_DEFAULT,
}
```

- [ ] **Step 5: Thêm loader ngay sau `_load_measurement_config` (sau `:241`)**

```python
async def _load_deployment_config():
    """Đọc tỉnh triển khai từ db.settings; seed từ .env nếu chưa có.

    Cùng cơ chế với _load_measurement_config: .env chỉ là giá trị mặc định lần
    đầu, sau đó DB là nguồn thật để admin đổi được trong app.
    """
    global _province_cache
    doc = await db.settings.find_one({"_id": "deployment"})
    if doc is None:
        await db.settings.insert_one({
            "_id": "deployment",
            "province_code": PROVINCE_CODE_DEFAULT,
            "province_name": PROVINCE_NAME_DEFAULT,
        })
        _province_cache = {
            "province_code": PROVINCE_CODE_DEFAULT,
            "province_name": PROVINCE_NAME_DEFAULT,
        }
    else:
        _province_cache = {
            "province_code": (doc.get("province_code") or PROVINCE_CODE_DEFAULT).strip(),
            "province_name": (doc.get("province_name") or PROVINCE_NAME_DEFAULT).strip(),
        }


def _get_province() -> dict:
    """Bản copy của cache tỉnh — tránh caller sửa trực tiếp vào global."""
    return dict(_province_cache)
```

- [ ] **Step 6: Gọi loader trong `lifespan`, ngay sau `_load_measurement_config()` (`:183`)**

```python
        await _load_measurement_config()
        await _load_deployment_config()
        await _load_fp_config()
```

- [ ] **Step 7: Thêm model + 2 endpoint, đặt sau `update_fingerprint_config` (sau `:1821`)**

```python
# ==================== DEPLOYMENT (TỈNH TRIỂN KHAI) ====================
class DeploymentIn(BaseModel):
    province_code: str = Field(min_length=1, max_length=10)
    province_name: str = Field(min_length=1, max_length=100)


@app.get("/api/deployment")
async def get_deployment(user: dict = Depends(get_current_user)):
    """Tỉnh/thành triển khai của thiết bị. Frontend hiển thị ở modal mở phiên."""
    return _get_province()


@app.patch("/api/deployment")
async def update_deployment(body: DeploymentIn, request: Request, admin: dict = Depends(require_admin)):
    """Đổi tỉnh triển khai. Chỉ admin, dùng khi mang thiết bị sang tỉnh khác.

    KHÔNG sửa lại phiên/hồ sơ cũ: chúng đã snapshot tỉnh tại thời điểm thu.
    """
    global _province_cache
    code = body.province_code.strip()
    name = body.province_name.strip()
    await db.settings.update_one(
        {"_id": "deployment"},
        {"$set": {"province_code": code, "province_name": name}},
        upsert=True,
    )
    _province_cache = {"province_code": code, "province_name": name}
    await _log(request, admin, "update", "deployment", code, {"province_name": name})
    return _get_province()
```

- [ ] **Step 8: Seed config trong fixture `mock_db` (`conftest.py:21`)**

`lifespan` không chạy dưới ASGITransport nên fixture phải tự gọi loader:

```python
    await main._ensure_admin()
    await main._ensure_default_cells()
    await main._ensure_indexes()
    await main._load_deployment_config()
    yield db
```

- [ ] **Step 9: Chạy test để xác nhận pass**

Run: `.venv/Scripts/python -m pytest backend/tests/test_admin_units.py -v`
Expected: 3 passed.

Lưu ý: `_province_cache` là global nên `test_patch_deployment_updates_cache` để lại `"48"`. Fixture gọi `_load_deployment_config()` mỗi test với DB mới → cache được nạp lại về `"01"`, không rò rỉ sang test khác.

- [ ] **Step 10: Chạy toàn bộ test để chắc chưa vỡ gì**

Run: `.venv/Scripts/python -m pytest backend/tests/ -v`
Expected: tất cả pass (Task 1 chưa đổi hành vi endpoint nào sẵn có).

- [ ] **Step 11: Commit**

```bash
git add backend/main.py backend/tests/conftest.py backend/tests/test_admin_units.py .env .env.example
git commit -m "$(cat <<'EOF'
feat: cau hinh tinh trien khai theo thiet bi

db.settings._id=deployment, seed tu .env roi DB la nguon that.
GET /api/deployment cho moi user, PATCH chi admin.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Danh mục Xã/Phường — seed + CRUD

**Files:**
- Create: `backend/data/admin_units_vn.json`
- Modify: `backend/main.py` — `_ensure_default_admin_units()` cạnh `_ensure_default_cells` (`:307`); gọi trong `lifespan` (`:181`); index trong `_ensure_indexes` (`:342`); nhóm endpoint mới sau nhóm `/api/cells` (sau `:765`)
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_admin_units.py`

**Interfaces:**
- Consumes: `_get_province()` (Task 1), `require_admin` (`:553`), `_s()` (`:161`), `_log`.
- Produces:
  - `async def _ensure_default_admin_units() -> None`
  - `async def _resolve_commune(code: str) -> dict` — tra 1 xã thuộc tỉnh thiết bị và `active=True`; **raise `HTTPException(400)`** nếu không thấy. Task 3 và 5 gọi hàm này.
  - `GET /api/admin-units` → `[{id, code, name, province_code, unit_type, active, ...}]`
  - `POST /api/admin-units` (admin) body `{code, name, unit_type}` → doc mới
  - `PATCH /api/admin-units/{unit_id}` (admin) body `{name?, unit_type?, active?}` → doc đã sửa
  - `DELETE /api/admin-units/{unit_id}` (admin) → `{"ok": true, "deactivated": "<code>"}`

- [ ] **Step 1: Tạo file dữ liệu danh mục**

Tạo `backend/data/admin_units_vn.json`. Lấy danh sách phường/xã Hà Nội sau sắp xếp 2025; nếu không truy cập được nguồn nào, dùng đúng nội dung dưới đây làm seed khởi điểm (admin bổ sung trong app sau). Cập nhật `source` và `fetched_at` cho khớp thực tế:

```json
{
  "source": "Chua xac nhan tu nguon chinh thuc — seed khoi diem, admin bo sung trong app qua /api/admin-units",
  "fetched_at": "2026-08-23",
  "note": "province_code 01 = Ha Noi. unit_type: phuong | xa | dac_khu",
  "units": [
    {"code": "01001", "name": "Phường Ba Đình", "province_code": "01", "unit_type": "phuong"},
    {"code": "01002", "name": "Phường Hoàn Kiếm", "province_code": "01", "unit_type": "phuong"},
    {"code": "01003", "name": "Phường Hai Bà Trưng", "province_code": "01", "unit_type": "phuong"},
    {"code": "01004", "name": "Phường Đống Đa", "province_code": "01", "unit_type": "phuong"},
    {"code": "01005", "name": "Phường Cầu Giấy", "province_code": "01", "unit_type": "phuong"},
    {"code": "01006", "name": "Phường Thanh Xuân", "province_code": "01", "unit_type": "phuong"},
    {"code": "01007", "name": "Phường Hoàng Mai", "province_code": "01", "unit_type": "phuong"},
    {"code": "01008", "name": "Phường Long Biên", "province_code": "01", "unit_type": "phuong"},
    {"code": "01009", "name": "Phường Tây Hồ", "province_code": "01", "unit_type": "phuong"},
    {"code": "01010", "name": "Phường Hà Đông", "province_code": "01", "unit_type": "phuong"},
    {"code": "01501", "name": "Xã Đông Anh", "province_code": "01", "unit_type": "xa"},
    {"code": "01502", "name": "Xã Gia Lâm", "province_code": "01", "unit_type": "xa"},
    {"code": "01503", "name": "Xã Sóc Sơn", "province_code": "01", "unit_type": "xa"},
    {"code": "01504", "name": "Xã Thanh Trì", "province_code": "01", "unit_type": "xa"},
    {"code": "01505", "name": "Xã Hoài Đức", "province_code": "01", "unit_type": "xa"},
    {"code": "01506", "name": "Xã Đan Phượng", "province_code": "01", "unit_type": "xa"},
    {"code": "01507", "name": "Xã Thường Tín", "province_code": "01", "unit_type": "xa"},
    {"code": "01508", "name": "Xã Ba Vì", "province_code": "01", "unit_type": "xa"},
    {"code": "01509", "name": "Xã Sơn Tây", "province_code": "01", "unit_type": "xa"},
    {"code": "01510", "name": "Xã Chương Mỹ", "province_code": "01", "unit_type": "xa"}
  ]
}
```

- [ ] **Step 2: Viết test thất bại**

Nối vào cuối `backend/tests/test_admin_units.py`:

```python
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
```

- [ ] **Step 3: Chạy test để xác nhận nó fail**

Run: `.venv/Scripts/python -m pytest backend/tests/test_admin_units.py -v`
Expected: 6 test mới FAIL với 404 / 405 (route chưa tồn tại). 3 test của Task 1 vẫn pass.

- [ ] **Step 4: Thêm seeder ngay sau `_ensure_default_cells` (sau `:335`)**

```python
ADMIN_UNITS_FILE = os.path.join(os.path.dirname(__file__), "data", "admin_units_vn.json")


async def _ensure_default_admin_units():
    """Seed danh mục xã/phường từ file JSON. Chỉ chạy khi collection rỗng.

    Cùng cơ chế _ensure_default_cells: seed 1 lần rồi để admin quản lý trong app.
    Sáp nhập/đổi tên về sau sửa qua /api/admin-units, KHÔNG sửa file này.
    """
    if await db.admin_units.count_documents({}) > 0:
        return
    try:
        with open(ADMIN_UNITS_FILE, encoding="utf-8") as f:
            payload = json.load(f)
    except (OSError, ValueError):
        # Thiếu/hỏng file danh mục không được làm chết app: admin vẫn thêm tay được.
        return
    units = payload.get("units") or []
    if not units:
        return
    now = datetime.utcnow()
    docs = []
    for u in units:
        code = (u.get("code") or "").strip()
        name = (u.get("name") or "").strip()
        if not code or not name:
            continue
        docs.append({
            "code": code,
            "name": name,
            "province_code": (u.get("province_code") or PROVINCE_CODE_DEFAULT).strip(),
            "unit_type": (u.get("unit_type") or "xa").strip(),
            "active": True,
            "created_at": now,
            "updated_at": now,
        })
    if docs:
        await db.admin_units.insert_many(docs)
```

Kiểm tra `import json` đã có ở đầu `main.py`; nếu chưa thì thêm.

- [ ] **Step 5: Gọi seeder trong `lifespan` (sau `:181`) và thêm index (sau `:342`)**

Trong `lifespan`:

```python
        await _ensure_default_cells()
        await _ensure_default_admin_units()
        await _ensure_indexes()
```

Trong `_ensure_indexes`:

```python
    await db.cells.create_index("code", unique=True)
    await db.admin_units.create_index("code", unique=True)
    await db.admin_units.create_index([("province_code", 1), ("name", 1)])
```

- [ ] **Step 6: Thêm helper + 4 endpoint, đặt sau `delete_cell` (sau `:765`)**

```python
# ==================== ĐƠN VỊ HÀNH CHÍNH (XÃ/PHƯỜNG) ====================
# Cây hành chính này ĐỘC LẬP với cây giam giữ (db.cells): xã là địa bàn thu
# thập, buồng/phân trại là nơi giam giữ. Không trộn hai trục vào nhau.
class AdminUnitIn(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=150)
    unit_type: str = Field(default="xa", pattern=r"^(phuong|xa|dac_khu)$")


class AdminUnitPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    unit_type: Optional[str] = Field(default=None, pattern=r"^(phuong|xa|dac_khu)$")
    active: Optional[bool] = None


async def _resolve_commune(code: str) -> dict:
    """Tra 1 xã/phường thuộc tỉnh triển khai và còn hiệu lực.

    Raise HTTPException(400) nếu không hợp lệ — caller không cần tự kiểm tra.
    """
    prov = _get_province()
    unit = await db.admin_units.find_one({
        "code": (code or "").strip(),
        "province_code": prov["province_code"],
        "active": True,
    })
    if not unit:
        raise HTTPException(400, "Xã/phường không hợp lệ hoặc không thuộc tỉnh triển khai.")
    return unit


@app.get("/api/admin-units")
async def list_admin_units(user: dict = Depends(get_current_user)):
    """Danh mục xã/phường của tỉnh triển khai, chỉ những đơn vị còn hiệu lực.

    Sort theo unit_type rồi name để frontend nhóm Phường/Xã bằng optgroup.
    """
    prov = _get_province()
    filt = {"province_code": prov["province_code"], "active": True}
    return [
        _s(u)
        async for u in db.admin_units.find(filt).sort([("unit_type", 1), ("name", 1)])
    ]


@app.post("/api/admin-units")
async def create_admin_unit(body: AdminUnitIn, request: Request, admin: dict = Depends(require_admin)):
    prov = _get_province()
    code = body.code.strip()
    if await db.admin_units.find_one({"code": code}):
        raise HTTPException(400, f"Mã đơn vị '{code}' đã có trong danh mục.")
    now = datetime.utcnow()
    doc = {
        "code": code,
        "name": body.name.strip(),
        "province_code": prov["province_code"],
        "unit_type": body.unit_type,
        "active": True,
        "created_at": now,
        "updated_at": now,
    }
    res = await db.admin_units.insert_one(doc)
    doc["_id"] = res.inserted_id
    await _log(request, admin, "create", "admin_unit", code, {"name": doc["name"]})
    return _s(doc)


@app.patch("/api/admin-units/{unit_id}")
async def update_admin_unit(unit_id: str, body: AdminUnitPatch, request: Request, admin: dict = Depends(require_admin)):
    """Sửa tên/loại/hiệu lực. KHÔNG cho đổi code: phiên và hồ sơ cũ trỏ vào code đó."""
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Không có thông tin nào để cập nhật.")
    if "name" in upd:
        upd["name"] = upd["name"].strip()
    upd["updated_at"] = datetime.utcnow()
    doc = await db.admin_units.find_one_and_update(
        {"_id": _oid(unit_id)}, {"$set": upd}, return_document=True
    )
    if not doc:
        raise HTTPException(404, "Không tìm thấy đơn vị hành chính.")
    await _log(request, admin, "update", "admin_unit", doc.get("code", ""), upd)
    return _s(doc)


@app.delete("/api/admin-units/{unit_id}")
async def delete_admin_unit(unit_id: str, request: Request, admin: dict = Depends(require_admin)):
    """Soft delete (active=False), KHÔNG xoá cứng.

    Phiên và hồ sơ đã thu vẫn tham chiếu code này; xoá cứng là mất tên xã của
    dữ liệu lịch sử.
    """
    doc = await db.admin_units.find_one({"_id": _oid(unit_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy đơn vị hành chính.")
    await db.admin_units.update_one(
        {"_id": doc["_id"]},
        {"$set": {"active": False, "updated_at": datetime.utcnow()}},
    )
    await _log(request, admin, "delete", "admin_unit", doc.get("code", ""))
    return {"ok": True, "deactivated": doc.get("code", "")}
```

- [ ] **Step 7: Seed danh mục trong fixture `mock_db` (`conftest.py`)**

```python
    await main._ensure_admin()
    await main._ensure_default_cells()
    await main._ensure_default_admin_units()
    await main._ensure_indexes()
    await main._load_deployment_config()
    yield db
```

- [ ] **Step 8: Chạy test để xác nhận pass**

Run: `.venv/Scripts/python -m pytest backend/tests/test_admin_units.py -v`
Expected: 9 passed.

- [ ] **Step 9: Chạy toàn bộ test**

Run: `.venv/Scripts/python -m pytest backend/tests/ -v`
Expected: tất cả pass — Task 2 chỉ thêm endpoint mới, chưa đổi hành vi phiên.

- [ ] **Step 10: Commit**

```bash
git add backend/main.py backend/data/admin_units_vn.json backend/tests/conftest.py backend/tests/test_admin_units.py
git commit -m "$(cat <<'EOF'
feat: danh muc xa/phuong theo tinh trien khai

db.admin_units seed tu backend/data/admin_units_vn.json, CRUD cho admin.
DELETE la soft delete (active=False) de ho so cu con tham chieu duoc code.
Helper _resolve_commune dung chung cho luong mo/sua phien.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Phiên làm việc bắt buộc chọn Xã

**Files:**
- Modify: `backend/main.py` — `WorkSessionIn` (`:458`), `open_session` (`:1244`)
- Modify: `backend/tests/test_sessions.py` — sửa **13 lời gọi** `POST /api/sessions` + thêm test mới
- Modify: `backend/tests/test_face_recognition.py:162,182`
- Test: `backend/tests/test_sessions.py`

**Interfaces:**
- Consumes: `_resolve_commune(code)` (Task 2), `_get_province()` (Task 1).
- Produces: `work_sessions` doc có thêm 4 trường `province_code`, `province_name`, `commune_code`, `commune_name`. Task 4 và 5 đọc từ đây.

- [ ] **Step 1: Thêm helper test + sửa test cũ trong `test_sessions.py`**

Đây là task phá vỡ test cũ nhiều nhất — làm trước để thấy rõ phạm vi. Thêm hằng và helper ngay sau `import`:

```python
COMMUNE_CODE = "01001"   # Phường Ba Đình — có trong seed admin_units_vn.json


def _session_body(**over) -> dict:
    """Body mở phiên hợp lệ. commune_code là bắt buộc từ Task 3 trở đi."""
    body = {"commune_code": COMMUNE_CODE, "location": "", "note": ""}
    body.update(over)
    return body
```

Thay **mọi** `json={}` và `json={...}` trong lời gọi `POST /api/sessions` bằng `json=_session_body(...)`. Danh sách đầy đủ, theo số dòng gốc:

| Dòng | Sửa thành |
|---|---|
| `:10` | `json=_session_body(location="Buồng 2", note="Ca sáng")` |
| `:25`, `:27` | `json=_session_body()` (cả hai lời gọi) |
| `:37` | `json=_session_body()` |
| `:48` | `json=_session_body(note="s1")` |
| `:61` | `json=_session_body()` |
| `:94` | `json=_session_body()` |
| `:108` | `json=_session_body(note="empty")` |
| `:127` | `json=_session_body()` |
| `:136` | `json=_session_body()` |
| `:147` | `json=_session_body()` |
| `:162` | `json=_session_body()` |
| `:170` | `json=_session_body()` |
| `:182` | `json=_session_body()` (test admin — vẫn phải 403) |
| `:196` | `json=_session_body()` |
| `:207` | `json=_session_body()` |
| `:216` | `json=_session_body()` |

- [ ] **Step 2: Sửa `test_face_recognition.py:162,182`**

Cả hai dòng hiện là `json={"location": "x", "note": ""}`. Đổi thành:

```python
        json={"commune_code": "01001", "location": "x", "note": ""},
```

- [ ] **Step 3: Viết test mới cho luồng xã, nối vào cuối `test_sessions.py`**

```python
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
        "/api/sessions", json={"location": "x", "note": ""}, headers=officer_headers
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
    """Bỏ default 'Trung tâm thu thập dữ liệu': xã đã là dữ liệu có cấu trúc,
    location chỉ còn là ghi chú vị trí cụ thể nên để trống là đúng."""
    r = await app_client.post(
        "/api/sessions", json=_session_body(), headers=officer_headers
    )
    assert r.json()["location"] == ""
```

- [ ] **Step 4: Chạy test để xác nhận fail đúng chỗ**

Run: `.venv/Scripts/python -m pytest backend/tests/test_sessions.py -v`
Expected: 6 test mới FAIL. `test_open_session_requires_commune` fail vì chưa có validate (trả 200 thay vì 422); 5 test còn lại fail vì thiếu key trong response / `location` vẫn có default. Các test cũ đã sửa thì PASS (backend còn bỏ qua field lạ `commune_code`).

- [ ] **Step 5: Thêm `commune_code` vào `WorkSessionIn` (`:458`)**

```python
class WorkSessionIn(BaseModel):
    commune_code: str = Field(min_length=1, max_length=20)
    location: str = Field(default="", max_length=200)
    note: str = Field(default="", max_length=500)
    officer_full_name: Optional[str] = Field(default=None, max_length=100)
```

- [ ] **Step 6: Snapshot tỉnh/xã trong `open_session` (`:1256-1269`)**

Chèn trước `now = datetime.utcnow()` rồi sửa dict `doc`:

```python
    unit = await _resolve_commune(body.commune_code)
    prov = _get_province()
    now = datetime.utcnow()
    doc = {
        "code": await _next_session_code(),
        "status": "open",
        "officer": officer_username,
        "officer_full_name": override or default_full_name,
        # Snapshot cả TÊN, không chỉ code: xã sáp nhập/đổi tên về sau thì phiếu
        # báo cáo in lại vẫn ra tên đúng thời điểm thu.
        "province_code": prov["province_code"],
        "province_name": prov["province_name"],
        "commune_code": unit["code"],
        "commune_name": unit["name"],
        "location": body.location.strip(),
        "note": body.note.strip(),
        "opened_at": now,
        "closed_at": None,
        "detainee_count": 0,
        "report_url": None,
        "report_filename": None,
    }
```

Chú ý: `body.location.strip() or "Trung tâm thu thập dữ liệu"` đổi thành `body.location.strip()` — bỏ default.

- [ ] **Step 7: Chạy test**

Run: `.venv/Scripts/python -m pytest backend/tests/test_sessions.py backend/tests/test_face_recognition.py -v`
Expected: tất cả pass.

- [ ] **Step 8: Chạy toàn bộ test**

Run: `.venv/Scripts/python -m pytest backend/tests/ -v`
Expected: tất cả pass. Nếu file test nào khác còn gọi `POST /api/sessions` mà chưa sửa, nó sẽ fail 422 — sửa theo cùng cách (thêm `"commune_code": "01001"`).

- [ ] **Step 9: Commit**

```bash
git add backend/main.py backend/tests/test_sessions.py backend/tests/test_face_recognition.py
git commit -m "$(cat <<'EOF'
feat: phien lam viec bat buoc chon xa/phuong

WorkSessionIn them commune_code bat buoc; open_session snapshot du 4 truong
province_code/name + commune_code/name. Bo default location.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Hồ sơ kế thừa Xã từ phiên

**Files:**
- Modify: `backend/main.py` — `create_detainee` (`:1113`), `_MATCH_PROJECTION` (`:856`), `_ensure_indexes` (`:342`), `list_detainees` (`:821`)
- Test: `backend/tests/test_sessions.py`

**Interfaces:**
- Consumes: `work_sessions` doc có 4 trường tỉnh/xã (Task 3).
- Produces: `detainees` doc có `province_code`, `commune_code`, `commune_name`. Task 6 (báo cáo) đọc từ đây.

- [ ] **Step 1: Viết test thất bại, nối vào cuối `test_sessions.py`**

```python
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
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `.venv/Scripts/python -m pytest backend/tests/test_sessions.py -k commune -v`
Expected: `test_detainee_inherits_commune_from_session` FAIL với `KeyError`/`None` (chưa copy xuống); `test_list_detainees_filters_by_commune` FAIL vì filter chưa có nên total=1 ở cả hai lần gọi. `test_detainee_patch_cannot_change_commune` có thể PASS sẵn — đó là bằng chứng cơ chế bảo vệ hoạt động, giữ test lại làm chốt chặn hồi quy.

- [ ] **Step 3: Copy 3 trường xuống hồ sơ trong `create_detainee` (`:1113`)**

Sửa dict `doc.update({...})`:

```python
    doc.update({
        "personal_id": personal_id,
        "cccd_number": body.cccd_number or "",
        "dob": dob,
        "date_in": _parse_dob(body.date_in),
        "issued_date": _parse_dob(body.issued_date),
        "expiry_date": _parse_dob(body.expiry_date),
        "created_at": now,
        "updated_at": now,
        "created_by": user["username"],
        "session_id": session_doc["_id"],
        # Denormalize địa bàn thu thập từ phiên (cùng pattern cell_code/facility_code).
        # Bắt buộc, không phải tối ưu: xã đổi tên thì hồ sơ cũ phải giữ giá trị
        # tại thời điểm thu, và lọc/thống kê theo xã không phải join.
        # Phiên cũ (trước tính năng này) không có 4 trường → .get() trả None.
        "province_code": session_doc.get("province_code"),
        "commune_code": session_doc.get("commune_code"),
        "commune_name": session_doc.get("commune_name"),
    })
```

- [ ] **Step 4: Thêm filter `commune_code` vào `list_detainees` (`:821` và `:835`)**

Thêm param cạnh `cell_code`:

```python
    cell_code: str = Query(""),
    commune_code: str = Query(""),
```

Thêm điều kiện cạnh chỗ xử lý `cell_code` (`:835`):

```python
    if cell_code:
        filt["cell_code"] = cell_code
    if commune_code:
        filt["commune_code"] = commune_code
```

- [ ] **Step 5: Thêm `commune_name` vào `_MATCH_PROJECTION` (`:856`) và index (`:342`)**

Projection:

```python
_MATCH_PROJECTION = {
    "personal_id": 1, "full_name": 1, "cccd_number": 1, "gender": 1, "dob": 1,
    "cell_code": 1, "custody_type": 1, "facility_code": 1, "sub_camp_code": 1,
    "commune_name": 1,
    "charge": 1, "hometown": 1, "address": 1,
    "photos.portrait_front": 1, "photos.cccd_front": 1,
    "created_at": 1, "created_by": 1,
}
```

Index trong `_ensure_indexes`:

```python
    await db.detainees.create_index([("commune_code", 1), ("created_at", -1)])
```

- [ ] **Step 6: Chạy test**

Run: `.venv/Scripts/python -m pytest backend/tests/test_sessions.py -v`
Expected: tất cả pass.

- [ ] **Step 7: Chạy toàn bộ test**

Run: `.venv/Scripts/python -m pytest backend/tests/ -v`
Expected: tất cả pass.

- [ ] **Step 8: Commit**

```bash
git add backend/main.py backend/tests/test_sessions.py
git commit -m "$(cat <<'EOF'
feat: ho so ke thua tinh/xa tu phien

Denormalize province_code + commune_code/name xuong detainees luc insert.
Them filter commune_code cho GET /api/detainees, index va projection.
DetaineeIn khong khai bao 3 truong nay nen PATCH khong ghi duoc chung.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: PATCH phiên — khoá xã sau hồ sơ đầu tiên

**Files:**
- Modify: `backend/main.py` — model + endpoint mới, đặt ngay trước `close_session` (`:1542`)
- Test: `backend/tests/test_sessions.py`

**Interfaces:**
- Consumes: `_resolve_commune()` (Task 2), `_ensure_session_editable()` (`:518`).
- Produces: `PATCH /api/sessions/{session_id}` → doc phiên đã cập nhật.

Endpoint này **chưa tồn tại** — hiện chỉ có POST / close / DELETE. Phải viết mới để thực hiện quyết định "khoá sau hồ sơ đầu tiên".

- [ ] **Step 1: Viết test thất bại, nối vào cuối `test_sessions.py`**

```python
@pytest.mark.asyncio
async def test_patch_session_changes_commune_when_empty(app_client, officer_headers):
    r1 = await app_client.post(
        "/api/sessions", json=_session_body(), headers=officer_headers
    )
    sid = r1.json()["id"]
    r2 = await app_client.patch(
        f"/api/sessions/{sid}", json={"commune_code": "01502"}, headers=officer_headers
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["commune_code"] == "01502"
    assert r2.json()["commune_name"] == "Xã Gia Lâm"


@pytest.mark.asyncio
async def test_patch_session_commune_locked_after_first_detainee(app_client, officer_headers):
    r1 = await app_client.post(
        "/api/sessions", json=_session_body(), headers=officer_headers
    )
    sid = r1.json()["id"]
    await app_client.post(
        "/api/detainees", json=_sample_detainee(sid), headers=officer_headers
    )
    r2 = await app_client.patch(
        f"/api/sessions/{sid}", json={"commune_code": "01502"}, headers=officer_headers
    )
    assert r2.status_code == 409
    assert "đã có hồ sơ" in r2.json()["detail"]

    doc = await main.db.work_sessions.find_one({"_id": main._oid(sid)})
    assert doc["commune_code"] == COMMUNE_CODE


@pytest.mark.asyncio
async def test_patch_session_location_allowed_after_detainee(app_client, officer_headers):
    """location/note không lan xuống hồ sơ nên sửa lúc nào cũng được (phiên còn mở)."""
    r1 = await app_client.post(
        "/api/sessions", json=_session_body(), headers=officer_headers
    )
    sid = r1.json()["id"]
    await app_client.post(
        "/api/detainees", json=_sample_detainee(sid), headers=officer_headers
    )
    r2 = await app_client.patch(
        f"/api/sessions/{sid}",
        json={"location": "Buồng tiếp nhận 3", "note": "Ca chiều"},
        headers=officer_headers,
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["location"] == "Buồng tiếp nhận 3"
    assert r2.json()["note"] == "Ca chiều"


@pytest.mark.asyncio
async def test_patch_session_rejects_closed(app_client, officer_headers):
    r1 = await app_client.post(
        "/api/sessions", json=_session_body(), headers=officer_headers
    )
    sid = r1.json()["id"]
    await app_client.post(f"/api/sessions/{sid}/close", headers=officer_headers)
    r2 = await app_client.patch(
        f"/api/sessions/{sid}", json={"location": "x"}, headers=officer_headers
    )
    assert r2.status_code == 403


@pytest.mark.asyncio
async def test_patch_session_rejects_unknown_commune(app_client, officer_headers):
    r1 = await app_client.post(
        "/api/sessions", json=_session_body(), headers=officer_headers
    )
    sid = r1.json()["id"]
    r2 = await app_client.patch(
        f"/api/sessions/{sid}", json={"commune_code": "99999"}, headers=officer_headers
    )
    assert r2.status_code == 400


@pytest.mark.asyncio
async def test_patch_session_empty_body_rejected(app_client, officer_headers):
    r1 = await app_client.post(
        "/api/sessions", json=_session_body(), headers=officer_headers
    )
    sid = r1.json()["id"]
    r2 = await app_client.patch(f"/api/sessions/{sid}", json={}, headers=officer_headers)
    assert r2.status_code == 400
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `.venv/Scripts/python -m pytest backend/tests/test_sessions.py -k patch_session -v`
Expected: cả 6 FAIL với 405 Method Not Allowed (route PATCH chưa có).

- [ ] **Step 3: Thêm model + endpoint, đặt ngay trước `@app.post("/api/sessions/{session_id}/close")` (`:1542`)**

```python
class WorkSessionPatch(BaseModel):
    commune_code: Optional[str] = Field(default=None, min_length=1, max_length=20)
    location: Optional[str] = Field(default=None, max_length=200)
    note: Optional[str] = Field(default=None, max_length=500)


@app.patch("/api/sessions/{session_id}")
async def update_session(session_id: str, body: WorkSessionPatch, request: Request, user: dict = Depends(get_current_user)):
    """Sửa xã/địa điểm/ghi chú của phiên đang mở.

    Xã chỉ đổi được khi phiên CHƯA có hồ sơ: hồ sơ đã lưu snapshot xã của phiên,
    đổi xã lúc đó sẽ khiến hồ sơ mâu thuẫn với phiên chứa nó.
    """
    doc = await db.work_sessions.find_one({"_id": _oid(session_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy phiên làm việc.")
    is_admin = user.get("role") == "admin"
    _ensure_session_editable(doc, user["username"], is_admin)

    upd: dict = {}
    if body.commune_code is not None:
        if doc.get("detainee_count", 0) > 0:
            raise HTTPException(
                409,
                "Phiên đã có hồ sơ, không thể đổi xã/phường. "
                "Đóng phiên và mở phiên mới cho xã khác.",
            )
        unit = await _resolve_commune(body.commune_code)
        upd["commune_code"] = unit["code"]
        upd["commune_name"] = unit["name"]
    if body.location is not None:
        upd["location"] = body.location.strip()
    if body.note is not None:
        upd["note"] = body.note.strip()
    if not upd:
        raise HTTPException(400, "Không có thông tin nào để cập nhật.")

    upd["updated_at"] = datetime.utcnow()
    doc = await db.work_sessions.find_one_and_update(
        {"_id": doc["_id"]}, {"$set": upd}, return_document=True
    )
    await _log(
        request, user, "update", "work_session", doc.get("code", ""),
        upd, ref_id=session_id, session_id=doc["_id"],
    )
    return _s_session(doc)
```

- [ ] **Step 4: Chạy test**

Run: `.venv/Scripts/python -m pytest backend/tests/test_sessions.py -v`
Expected: tất cả pass.

- [ ] **Step 5: Chạy toàn bộ test**

Run: `.venv/Scripts/python -m pytest backend/tests/ -v`
Expected: tất cả pass.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/tests/test_sessions.py
git commit -m "$(cat <<'EOF'
feat: PATCH /api/sessions doi xa/dia diem/ghi chu

Xa chi doi duoc khi detainee_count == 0 (409 neu da co ho so).
location/note sua duoc bat cu luc nao khi phien con mo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Báo cáo Excel + filter phiên theo xã

**Files:**
- Modify: `backend/main.py` — `_build_session_report_xlsx` (`:1422`), `list_sessions_full` (`:1288`), `list_sessions` (`:1380`)
- Test: `backend/tests/test_sessions.py`

**Interfaces:**
- Consumes: `work_sessions` doc có 4 trường tỉnh/xã (Task 3).
- Produces: query param `commune_code` trên `GET /api/sessions` và `/api/sessions/full`.

- [ ] **Step 1: Viết test thất bại, nối vào cuối `test_sessions.py`**

```python
@pytest.mark.asyncio
async def test_list_sessions_filters_by_commune(app_client, officer_headers):
    r1 = await app_client.post(
        "/api/sessions", json=_session_body(), headers=officer_headers
    )
    sid = r1.json()["id"]
    await app_client.post(f"/api/sessions/{sid}/close", headers=officer_headers)

    r2 = await app_client.get(
        f"/api/sessions?commune_code={COMMUNE_CODE}", headers=officer_headers
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["total"] == 1

    r3 = await app_client.get(
        "/api/sessions?commune_code=01502", headers=officer_headers
    )
    assert r3.json()["total"] == 0


@pytest.mark.asyncio
async def test_sessions_full_filters_by_commune(app_client, officer_headers):
    await app_client.post("/api/sessions", json=_session_body(), headers=officer_headers)
    r = await app_client.get(
        f"/api/sessions/full?commune_code={COMMUNE_CODE}", headers=officer_headers
    )
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["commune_code"] == COMMUNE_CODE


@pytest.mark.asyncio
async def test_report_sheet_contains_commune(app_client, officer_headers):
    """Phiếu báo cáo phải in tên xã đã snapshot, không tra lại danh mục."""
    from io import BytesIO
    from openpyxl import load_workbook

    r1 = await app_client.post(
        "/api/sessions", json=_session_body(), headers=officer_headers
    )
    sid = r1.json()["id"]
    await app_client.post(f"/api/sessions/{sid}/close", headers=officer_headers)
    r2 = await app_client.get(f"/api/sessions/{sid}/report", headers=officer_headers)
    assert r2.status_code == 200

    wb = load_workbook(BytesIO(r2.content))
    ws = wb["Thông tin phiên"]
    text = "\n".join(
        str(c.value) for row in ws.iter_rows() for c in row if c.value is not None
    )
    assert "Phường Ba Đình" in text
    assert "Hà Nội" in text
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `.venv/Scripts/python -m pytest backend/tests/test_sessions.py -k "commune and (list_sessions or full or report)" -v`
Expected: 2 test filter FAIL (total=1 ở cả hai lần gọi vì filter chưa có); `test_report_sheet_contains_commune` FAIL với `AssertionError` (sheet chưa có 2 dòng mới).

- [ ] **Step 3: Thêm 2 dòng vào phiếu báo cáo (`:1422`)**

```python
    rows = [
        ["PHIẾU BÁO CÁO PHIÊN LÀM VIỆC"],
        [],
        ["Mã phiên:", session_doc.get("code", "")],
        ["Cán bộ:", session_doc.get("officer_full_name", "") or session_doc.get("officer", "")],
        # Tỉnh/xã lấy từ snapshot trên phiên, KHÔNG tra lại db.admin_units: xã có
        # thể đã đổi tên sau khi phiên đóng.
        ["Tỉnh/Thành phố:", session_doc.get("province_name", "") or ""],
        ["Xã/Phường:", session_doc.get("commune_name", "") or ""],
        ["Địa điểm:", session_doc.get("location", "") or ""],
        ["Ghi chú:", session_doc.get("note", "") or ""],
        ["Mở lúc:", _fmt_dt(opened)],
        ["Đóng lúc:", _fmt_dt(closed)],
        ["Tổng hồ sơ:", session_doc.get("detainee_count", 0)],
    ]
```

- [ ] **Step 4: Thêm filter vào `list_sessions_full` (`:1288`) và `list_sessions` (`:1380`)**

Trong **cả hai** hàm, thêm param sau `mine_only`:

```python
    commune_code: Optional[str] = Query(None),
```

Và trong **cả hai**, thêm điều kiện ngay sau khối `if mine_only or user.get("role") != "admin":`:

```python
    if commune_code:
        filt["commune_code"] = commune_code
```

- [ ] **Step 5: Chạy test**

Run: `.venv/Scripts/python -m pytest backend/tests/test_sessions.py -v`
Expected: tất cả pass.

- [ ] **Step 6: Chạy toàn bộ test backend**

Run: `.venv/Scripts/python -m pytest backend/tests/ -v`
Expected: tất cả pass. Đây là mốc backend hoàn chỉnh.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/tests/test_sessions.py
git commit -m "$(cat <<'EOF'
feat: phieu bao cao va filter phien theo xa

Sheet "Thong tin phien" them 2 dong Tinh/Xa (doc tu snapshot tren phien).
GET /api/sessions va /api/sessions/full nhan param commune_code.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Frontend — chọn Xã khi mở phiên + hiển thị

**Files:**
- Modify: `frontend/src/api.js` — thêm hàm vào object `api` (`:194`, cạnh `listCells`)
- Modify: `frontend/src/SessionOpenModal.jsx` (88 dòng — sửa toàn bộ luồng submit)
- Modify: `frontend/src/SessionListPage.jsx:264,290`
- Modify: `frontend/src/SessionDetailPage.jsx:176`
- Modify: `frontend/src/Dashboard.jsx:1518,1785,1808`
- Modify: `frontend/src/locales/vi.json`, `frontend/src/locales/en.json`

**Interfaces:**
- Consumes: `GET /api/deployment` (Task 1), `GET /api/admin-units` (Task 2), `POST /api/sessions` với `commune_code` (Task 3).
- Produces: không có — đây là task cuối.

- [ ] **Step 1: Thêm hàm API vào `api.js`, ngay sau `deleteCell` (`:197`)**

```javascript
  getDeployment: () => request("/api/deployment"),
  updateDeployment: (body) => request("/api/deployment", { method: "PATCH", body: JSON.stringify(body) }),

  listAdminUnits: () => request("/api/admin-units"),
  createAdminUnit: (body) => request("/api/admin-units", { method: "POST", body: JSON.stringify(body) }),
  updateAdminUnit: (id, body) => request(`/api/admin-units/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteAdminUnit: (id) => request(`/api/admin-units/${id}`, { method: "DELETE" }),
```

Thêm `updateSession` cạnh các hàm session sẵn có (gần `:272`):

```javascript
  updateSession: (id, body) => request(`/api/sessions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
```

- [ ] **Step 2: Thêm key i18n vào `locales/vi.json`**

```json
  "session.open.province": "Tỉnh/Thành phố",
  "session.open.commune": "Xã/Phường",
  "session.open.commune_ph": "— Chọn xã/phường —",
  "session.open.commune_group_phuong": "Phường",
  "session.open.commune_group_xa": "Xã",
  "session.open.commune_group_dac_khu": "Đặc khu",
  "session.open.err.commune_required": "Bạn phải chọn xã/phường trước khi mở phiên.",
  "session.open.err.units_failed": "Không tải được danh mục xã/phường.",
  "session.open.location_ph": "VD: Buồng tiếp nhận 2",
  "session.col.commune": "Xã/Phường",
  "session.detail.province": "Tỉnh/Thành phố",
  "session.detail.commune": "Xã/Phường",
  "sync.col.commune": "Xã/Phường",
```

Đồng thời **sửa** key sẵn có `session.open.location_default` thành chuỗi rỗng: `"session.open.location_default": "",`

- [ ] **Step 3: Thêm cùng bộ key vào `locales/en.json`**

```json
  "session.open.province": "Province/City",
  "session.open.commune": "Commune/Ward",
  "session.open.commune_ph": "— Select commune/ward —",
  "session.open.commune_group_phuong": "Wards",
  "session.open.commune_group_xa": "Communes",
  "session.open.commune_group_dac_khu": "Special zones",
  "session.open.err.commune_required": "Select a commune/ward before opening the session.",
  "session.open.err.units_failed": "Could not load the commune/ward list.",
  "session.open.location_ph": "e.g. Intake room 2",
  "session.col.commune": "Commune/Ward",
  "session.detail.province": "Province/City",
  "session.detail.commune": "Commune/Ward",
  "sync.col.commune": "Commune/Ward",
```

Và `"session.open.location_default": "",`

- [ ] **Step 4: Sửa `SessionOpenModal.jsx` — thêm state + load danh mục**

Thay phần import và khai báo state (`:1-17`):

```javascript
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n";

function fmtNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const UNIT_GROUP_KEY = {
  phuong: "session.open.commune_group_phuong",
  xa: "session.open.commune_group_xa",
  dac_khu: "session.open.commune_group_dac_khu",
};

export default function SessionOpenModal({ officerName, officerFullName, onCreated, onCancel }) {
  const { t } = useI18n();
  const [officer, setOfficer] = useState(officerFullName || officerName || "");
  const [location, setLocation] = useState(t("session.open.location_default"));
  const [note, setNote] = useState("");
  const [province, setProvince] = useState(null);
  const [units, setUnits] = useState([]);
  const [communeCode, setCommuneCode] = useState("");
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [dep, list] = await Promise.all([
          api.getDeployment(),
          api.listAdminUnits(),
        ]);
        if (!alive) return;
        setProvince(dep);
        setUnits(list || []);
      } catch (ex) {
        if (alive) setErr(ex.message || t("session.open.err.units_failed"));
      } finally {
        if (alive) setLoadingUnits(false);
      }
    })();
    return () => { alive = false; };
  }, [t]);

  // Nhóm theo unit_type để render optgroup. Backend đã sort sẵn theo
  // (unit_type, name) nên chỉ cần gom lại theo thứ tự gặp.
  const grouped = useMemo(() => {
    const out = [];
    for (const u of units) {
      const key = UNIT_GROUP_KEY[u.unit_type] || UNIT_GROUP_KEY.xa;
      let g = out.find((x) => x.key === key);
      if (!g) { g = { key, items: [] }; out.push(g); }
      g.items.push(u);
    }
    return out;
  }, [units]);
```

- [ ] **Step 5: Sửa hàm `submit` trong `SessionOpenModal.jsx` (`:19-38`)**

```javascript
  const submit = async (e) => {
    e.preventDefault();
    const name = officer.trim();
    if (!name) { setErr(t("session.open.err.officer_required")); return; }
    if (!communeCode) { setErr(t("session.open.err.commune_required")); return; }
    setBusy(true);
    setErr("");
    try {
      const body = {
        commune_code: communeCode,
        location: location.trim(),
        note: note.trim(),
        officer_full_name: name,
      };
      const s = await api.createSession(body);
      if (onCreated) onCreated(s);
    } catch (ex) {
      setErr(ex.message || t("session.open.err.failed"));
    } finally {
      setBusy(false);
    }
  };
```

- [ ] **Step 6: Thêm 2 dòng UI vào `SessionOpenModal.jsx`, ngay trước dòng `sm-location` (`:65`)**

```jsx
          <div className="session-modal-row">
            <label>{t("session.open.province")}</label>
            <div className="session-modal-static">{province ? province.province_name : "—"}</div>
          </div>
          <div className="session-modal-row">
            <label htmlFor="sm-commune">{t("session.open.commune")}</label>
            <select
              id="sm-commune"
              className="control"
              value={communeCode}
              onChange={(e) => setCommuneCode(e.target.value)}
              disabled={busy || loadingUnits}
              required
            >
              <option value="">{t("session.open.commune_ph")}</option>
              {grouped.map((g) => (
                <optgroup key={g.key} label={t(g.key)}>
                  {g.items.map((u) => (
                    <option key={u.code} value={u.code}>{u.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
```

- [ ] **Step 7: Thêm cột Xã vào `SessionListPage.jsx`**

Ở `:264`, thêm `<th>` ngay trước cột Địa điểm:

```jsx
              <th>{t("session.col.commune")}</th>
              <th>{t("session.col.location")}</th>
```

Ở `:290`, thêm `<td>` tương ứng, cùng vị trí:

```jsx
                  <td>{s.commune_name || "—"}</td>
                  <td>{s.location || "—"}</td>
```

- [ ] **Step 8: Hiện Tỉnh/Xã trong `SessionDetailPage.jsx` (`:176`)**

Thêm 2 span ngay trước span `location` sẵn có:

```jsx
          {session.province_name && <span>{t("session.detail.province")}: <strong>{session.province_name}</strong></span>}
          {session.commune_name && <span>{t("session.detail.commune")}: <strong>{session.commune_name}</strong></span>}
          {session.location && <span>{t("session.detail.location")}: <strong>{session.location}</strong></span>}
```

- [ ] **Step 9: Sửa `Dashboard.jsx` — tìm kiếm + cột bảng sync**

Ở `:1518`, thêm `commune_name` vào biểu thức lọc:

```javascript
      (s.location || "").toLowerCase().includes(kw) ||
      (s.commune_name || "").toLowerCase().includes(kw)
```

Ở `:1785`, thêm `<th>` trước cột location:

```jsx
              <th>{t("sync.col.commune")}</th>
              <th>{t("sync.col.location")}</th>
```

Ở `:1808`, thêm `<td>` cùng vị trí:

```jsx
                  <td>{s.commune_name || "—"}</td>
                  <td>{s.location || "—"}</td>
```

Ở `:1684`, thêm `commune_name` vào payload sync cạnh `location`:

```javascript
          location: session.location || null,
          commune_code: session.commune_code || null,
          commune_name: session.commune_name || null,
```

- [ ] **Step 10: Build frontend để bắt lỗi cú pháp**

Run: `cd frontend && npm run build`
Expected: build thành công, không lỗi. Nếu `Dashboard.jsx` báo lệch số cột `<th>`/`<td>`, kiểm tra lại Step 9 đã thêm đúng cặp.

- [ ] **Step 11: Kiểm tra thủ công trên app thật**

Khởi động backend + frontend theo `start-services.ps1`, rồi kiểm 5 điểm:
1. Đăng nhập bằng tài khoản cán bộ → mở phiên → thấy dòng Tỉnh "Thành phố Hà Nội" (chỉ đọc) và select Xã có optgroup Phường/Xã.
2. Không chọn xã → bấm mở phiên → hiện lỗi tiếng Việt, không gọi API.
3. Chọn xã → mở phiên thành công → danh sách phiên hiện cột Xã/Phường đúng tên.
4. Tạo 1 hồ sơ trong phiên → mở lại chi tiết hồ sơ, xác nhận nó thuộc xã đó.
5. Đóng phiên → tải phiếu Excel → sheet "Thông tin phiên" có 2 dòng Tỉnh/Xã.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/api.js frontend/src/SessionOpenModal.jsx frontend/src/SessionListPage.jsx frontend/src/SessionDetailPage.jsx frontend/src/Dashboard.jsx frontend/src/locales/vi.json frontend/src/locales/en.json
git commit -m "$(cat <<'EOF'
feat: chon xa/phuong khi mo phien tren UI

SessionOpenModal hien tinh (chi doc) + select xa bat buoc, nhom optgroup
theo phuong/xa. Danh sach phien, chi tiet phien va bang sync hien cot xa.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Ghi chú cho người triển khai

**Thứ tự task là bắt buộc.** Task 3 phá vỡ test cũ và chỉ chạy được khi Task 1-2 đã có `_get_province()` và `_resolve_commune()`.

**Task 3 là task rủi ro nhất** — nó sửa 16 lời gọi rải rác trong 2 file test. Nếu sau Step 8 vẫn còn test fail 422, tìm thêm bằng
`grep -rn 'POST.*api/sessions\|post("/api/sessions"' backend/tests/` và sửa theo cùng cách.

**Chưa có UI quản lý danh mục xã.** Task 2 tạo đủ 4 endpoint CRUD nhưng không có màn hình admin. Đó là lựa chọn có ý thức: admin sửa qua API là đủ cho đợt này, làm UI quản lý danh mục là việc riêng. Nếu muốn, đề xuất làm sau theo mẫu màn hình quản lý buồng giam sẵn có.

**Dữ liệu danh mục.** Nếu tại thời điểm triển khai lấy được danh sách đầy đủ và chính xác 126 phường/xã Hà Nội, thay toàn bộ mảng `units` trong Step 1 của Task 2 và cập nhật `source` + `fetched_at`. Danh sách 20 dòng trong plan chỉ là seed khởi điểm, không phải dữ liệu thật đã xác nhận.

