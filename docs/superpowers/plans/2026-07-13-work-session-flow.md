# Work Session Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm khái niệm "Phiên làm việc" (work session) làm container bọc ngoài luồng tạo hồ sơ can phạm — cán bộ mở phiên → tạo nhiều hồ sơ trong phiên → đóng phiên → sinh Excel báo cáo.

**Architecture:** Backend thêm collection `work_sessions` + endpoints `/api/sessions/*`; sửa `POST /api/detainees` bắt buộc `session_id`; hồ sơ trong phiên đã đóng thành read-only. Frontend thêm 3 màn (SessionListPage, SessionOpenModal, SessionDetailPage) qua tab "Phiên làm việc" ở sidebar Dashboard; sửa DataCapturePage nhận `sessionId` prop.

**Tech Stack:** FastAPI, motor (async MongoDB), pydantic, openpyxl, bcrypt (backend); React 18, Vite, plain CSS (frontend).

## Global Constraints

- Spec nguồn: `docs/superpowers/specs/2026-07-13-work-session-flow-design.md` — mọi quyết định lấy từ đó (Q1-Q8).
- Message lỗi trả về **tiếng Việt** cho tất cả 4xx.
- Code phiên format: `S<yyyymmdd>-<seq_trong_ngày>` (vd `S20260713-0001`), sinh qua `db.counters` doc `_id="session_code_YYYYMMDD"`.
- 1 user chỉ có 1 phiên `open` tại 1 thời điểm.
- Hồ sơ trong phiên `closed`: read-only tuyệt đối kể cả admin.
- Detainee cũ (`session_id = null`, tạo trước feature này): vẫn CRUD được (backward compat).
- Report Excel lưu tại `backend/uploads/reports/`, mount qua `/uploads`.
- Frontend messages tiếng Việt, không thêm i18n framework.
- Không thêm dependency mới cho backend (openpyxl đã có).
- Không thêm dependency mới cho frontend (không cần react-router — dùng pattern `page` state của Dashboard hiện tại).

---

## File Structure

**Backend (`backend/main.py`):**
- Sửa file duy nhất `backend/main.py`. Thêm: pydantic models `WorkSessionIn` / `WorkSessionOut`; hàm helpers `_next_session_code`, `_build_session_report_xlsx`, `_get_open_session_or_none`, `_ensure_session_editable`; routes `/api/sessions/*`; sửa `create_detainee`, `update_detainee`, `delete_detainee`.
- Tạo mới `backend/tests/__init__.py` và `backend/tests/test_sessions.py` (pytest + httpx AsyncClient).
- Thư mục runtime: `backend/uploads/reports/` (tạo qua `os.makedirs`).

**Frontend:**
- Sửa `frontend/src/api.js` — thêm session methods
- Sửa `frontend/src/Dashboard.jsx` — thêm nav item + wire page routing cho session views
- Sửa `frontend/src/DataCapturePage.jsx` — nhận `sessionId` prop, banner phiên, hành vi sau lưu
- Tạo mới `frontend/src/SessionListPage.jsx`
- Tạo mới `frontend/src/SessionOpenModal.jsx`
- Tạo mới `frontend/src/SessionDetailPage.jsx`
- Sửa `frontend/src/styles.css` — thêm styles session pages (session-*, session-modal-*)

**Dev dependencies (test only, backend):**
- `pytest`, `pytest-asyncio`, `httpx`, `mongomock-motor` — thêm vào `backend/requirements-dev.txt` mới.

---

## Task 1: Backend — Model `work_sessions` + endpoint mở phiên

**Files:**
- Modify: `backend/main.py` (thêm pydantic models, helpers, endpoints POST/GET)
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_sessions.py`
- Create: `backend/requirements-dev.txt`

**Interfaces:**
- Produces:
  - `WorkSessionIn` pydantic model — `{location: str = "", note: str = ""}`
  - Helper `async def _next_session_code() -> str` — sinh code `S20260713-0001`
  - Helper `async def _get_open_session_or_none(username: str) -> Optional[dict]` — trả doc raw hoặc None
  - Route `POST /api/sessions` — body `WorkSessionIn`, response session dict (đã serialize qua `_s`), lỗi 409 nếu user đang có open
  - Route `GET /api/sessions` — query `status?`, `mine_only?` (bool), `date_from?`, `date_to?`, `skip=0`, `limit=50` → `{total, items}`
  - Route `GET /api/sessions/current` — trả session open của user hoặc 404
  - Serialize format: `{id, code, status, officer, officer_full_name, location, note, opened_at, closed_at, detainee_count, report_url, report_filename}`

- [ ] **Step 1: Tạo `backend/requirements-dev.txt`**

```
pytest>=8.0
pytest-asyncio>=0.23
httpx>=0.27
mongomock-motor>=0.0.29
```

- [ ] **Step 2: Cài dev deps**

Run: `.venv/bin/pip install -r backend/requirements-dev.txt`
Expected: install thành công, không lỗi.

- [ ] **Step 3: Tạo `backend/tests/__init__.py`** (empty file)

```
```

- [ ] **Step 4: Tạo `backend/tests/conftest.py`**

```python
import asyncio
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
```

- [ ] **Step 5: Tạo `backend/tests/test_sessions.py` với các test đầu tiên**

```python
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
    await app_client.post("/api/sessions", json={"note": "s1"}, headers=admin_headers)
    r = await app_client.get(
        "/api/sessions?mine_only=true", headers=admin_headers
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["officer"] == "admin"
```

- [ ] **Step 6: Chạy test để xác nhận FAIL**

Run: `.venv/bin/pytest backend/tests/test_sessions.py -v`
Expected: FAIL — endpoints chưa tồn tại (404 hoặc AttributeError).

- [ ] **Step 7: Thêm models và helpers vào `backend/main.py`**

Insert sau block `class DetaineeIn` (khoảng dòng 164, trước hàm `_make_token`):

```python
class WorkSessionIn(BaseModel):
    location: str = Field(default="", max_length=200)
    note: str = Field(default="", max_length=500)


async def _next_session_code() -> str:
    today = datetime.utcnow().strftime("%Y%m%d")
    counter_id = f"session_code_{today}"
    doc = await db.counters.find_one_and_update(
        {"_id": counter_id},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = doc["seq"] if doc else 1
    return f"S{today}-{seq:04d}"


async def _get_open_session_or_none(username: str) -> Optional[dict]:
    return await db.work_sessions.find_one({"officer": username, "status": "open"})


def _s_session(doc: dict) -> dict:
    if not doc:
        return doc
    out = dict(doc)
    out["id"] = str(out.pop("_id"))
    for k in ("opened_at", "closed_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out
```

- [ ] **Step 8: Thêm endpoints POST/GET /api/sessions vào `backend/main.py`**

Insert sau block DETAINEES (khoảng dòng 505, trước comment `# ==================== PHOTO UPLOAD ====================`):

```python
# ==================== WORK SESSIONS ====================
@app.post("/api/sessions")
async def open_session(body: WorkSessionIn, request: Request, user: dict = Depends(get_current_user)):
    existing = await _get_open_session_or_none(user["username"])
    if existing:
        raise HTTPException(409, f"Bạn đang có 1 phiên đang mở ({existing.get('code','?')}). Đóng phiên đó trước khi mở phiên mới.")
    officer_doc = await db.users.find_one({"username": user["username"]})
    now = datetime.utcnow()
    doc = {
        "code": await _next_session_code(),
        "status": "open",
        "officer": user["username"],
        "officer_full_name": (officer_doc or {}).get("full_name", "") or user["username"],
        "location": body.location.strip(),
        "note": body.note.strip(),
        "opened_at": now,
        "closed_at": None,
        "detainee_count": 0,
        "report_url": None,
        "report_filename": None,
    }
    res = await db.work_sessions.insert_one(doc)
    doc["_id"] = res.inserted_id
    await _log(request, user, "create", "work_session", doc["code"], ref_id=str(res.inserted_id))
    return _s_session(doc)


@app.get("/api/sessions/current")
async def get_current_session(user: dict = Depends(get_current_user)):
    doc = await _get_open_session_or_none(user["username"])
    if not doc:
        raise HTTPException(404, "Bạn chưa có phiên làm việc nào đang mở.")
    return _s_session(doc)


@app.get("/api/sessions")
async def list_sessions(
    status: Optional[str] = Query(None, pattern=r"^(open|closed)$"),
    mine_only: bool = Query(False),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    filt: dict = {}
    if status:
        filt["status"] = status
    if mine_only or user.get("role") != "admin":
        filt["officer"] = user["username"]
    dt_from = _parse_dt(date_from)
    dt_to = _parse_dt(date_to)
    if dt_from or dt_to:
        rng: dict = {}
        if dt_from:
            rng["$gte"] = dt_from
        if dt_to:
            rng["$lte"] = dt_to
        filt["opened_at"] = rng
    total = await db.work_sessions.count_documents(filt)
    items = [
        _s_session(d)
        async for d in db.work_sessions.find(filt).sort("opened_at", -1).skip(skip).limit(limit)
    ]
    return {"total": total, "items": items, "skip": skip, "limit": limit}
```

- [ ] **Step 9: Chạy lại tests — verify PASS**

Run: `.venv/bin/pytest backend/tests/test_sessions.py -v`
Expected: 4 test PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/main.py backend/tests/ backend/requirements-dev.txt
git commit -m "$(cat <<'EOF'
feat(backend): thêm work_sessions model + open/list/current endpoints

- Model WorkSessionIn, collection work_sessions với code S<yyyymmdd>-<seq>
- POST /api/sessions: mở phiên, 409 nếu user đã có phiên open
- GET /api/sessions/current: phiên open của user, 404 nếu không có
- GET /api/sessions: list + filter status/mine_only/date range
- Test setup với mongomock-motor + httpx AsyncClient

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Backend — Chi tiết phiên + gắn session_id vào detainee

**Files:**
- Modify: `backend/main.py` (thêm route `GET /api/sessions/{id}`, sửa `create_detainee`, `update_detainee`, `delete_detainee`)
- Modify: `backend/tests/test_sessions.py` (thêm tests)

**Interfaces:**
- Consumes: `WorkSessionIn`, `_get_open_session_or_none`, `_s_session` từ Task 1.
- Produces:
  - Route `GET /api/sessions/{id}` → `{...session fields, detainees: [{id, code, full_name, cccd_number, gender, dob, cell_code, created_at}]}`; 403 nếu phiên không thuộc user và user không phải admin
  - Helper `async def _ensure_session_editable(session_doc: dict, username: str, is_admin: bool) -> None` — raise 403 nếu closed hoặc không thuộc user (admin bypass ownership nhưng không bypass closed)
  - `POST /api/detainees` yêu cầu body có `session_id: str` (12-char ObjectId hex)
  - Detainee doc mới có field `session_id: ObjectId`
  - Sau khi tạo detainee: `db.work_sessions.update_one({_id: session_oid}, {"$inc": {"detainee_count": 1}})`
  - Sau khi xoá detainee (có session_id): `$inc: -1`

- [ ] **Step 1: Thêm test cho `GET /api/sessions/{id}` (chưa có detainee)**

Thêm vào `backend/tests/test_sessions.py`:

```python
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
```

- [ ] **Step 2: Chạy test — verify FAIL**

Run: `.venv/bin/pytest backend/tests/test_sessions.py::test_get_session_detail_empty -v`
Expected: FAIL — endpoint chưa có (404 route).

- [ ] **Step 3: Thêm route `GET /api/sessions/{id}` và helper**

Insert vào `backend/main.py` sau route `list_sessions` (trong block WORK SESSIONS):

```python
def _ensure_session_editable(session_doc: dict, username: str, is_admin: bool) -> None:
    if session_doc.get("status") != "open":
        raise HTTPException(403, "Hồ sơ này thuộc phiên đã đóng, không thể chỉnh sửa.")
    if session_doc.get("officer") != username and not is_admin:
        raise HTTPException(403, "Bạn không có quyền thao tác trên phiên này.")


@app.get("/api/sessions/{session_id}")
async def get_session_detail(session_id: str, user: dict = Depends(get_current_user)):
    doc = await db.work_sessions.find_one({"_id": _oid(session_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy phiên làm việc.")
    if doc.get("officer") != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Bạn không có quyền xem phiên này.")
    detainees = []
    async for d in db.detainees.find({"session_id": doc["_id"]}).sort("created_at", 1):
        detainees.append({
            "id": str(d["_id"]),
            "code": d.get("code", ""),
            "full_name": d.get("full_name", ""),
            "cccd_number": d.get("cccd_number", ""),
            "gender": d.get("gender", "male"),
            "dob": d["dob"].isoformat() if isinstance(d.get("dob"), datetime) else None,
            "cell_code": d.get("cell_code", ""),
            "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else None,
        })
    out = _s_session(doc)
    out["detainees"] = detainees
    return out
```

- [ ] **Step 4: Chạy test — verify PASS**

Run: `.venv/bin/pytest backend/tests/test_sessions.py::test_get_session_detail_empty -v`
Expected: PASS.

- [ ] **Step 5: Thêm tests bắt buộc session_id trong create_detainee**

Thêm vào `backend/tests/test_sessions.py`:

```python
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
async def test_create_detainee_rejects_closed_session(app_client, admin_headers):
    r1 = await app_client.post("/api/sessions", json={}, headers=admin_headers)
    sid = r1.json()["id"]
    r2 = await app_client.post(f"/api/sessions/{sid}/close", headers=admin_headers)
    assert r2.status_code == 200
    r3 = await app_client.post("/api/detainees", json=_sample_detainee(sid), headers=admin_headers)
    assert r3.status_code in (400, 403)


@pytest.mark.asyncio
async def test_create_detainee_success_increments_count(app_client, admin_headers):
    r1 = await app_client.post("/api/sessions", json={}, headers=admin_headers)
    sid = r1.json()["id"]
    r2 = await app_client.post("/api/detainees", json=_sample_detainee(sid), headers=admin_headers)
    assert r2.status_code == 200, r2.text
    r3 = await app_client.get(f"/api/sessions/{sid}", headers=admin_headers)
    assert r3.json()["detainee_count"] == 1
    assert len(r3.json()["detainees"]) == 1
```

- [ ] **Step 6: Chạy tests — verify FAIL (2 test đầu fail vì chưa validate; test success cũng fail vì chưa gắn session_id)**

Run: `.venv/bin/pytest backend/tests/test_sessions.py -v -k "create_detainee or closed_session"`
Expected: các test mới FAIL.

- [ ] **Step 7: Sửa `DetaineeIn` model để thêm `session_id`**

Trong `backend/main.py`, tìm class `DetaineeIn` (khoảng dòng 142) và thêm field ở cuối:

```python
    session_id: Optional[str] = None
```

- [ ] **Step 8: Sửa `create_detainee` để bắt buộc và validate session_id**

Trong `backend/main.py`, thay thế body của `@app.post("/api/detainees")` route:

```python
@app.post("/api/detainees")
async def create_detainee(body: DetaineeIn, request: Request, user: dict = Depends(get_current_user)):
    if not body.session_id:
        raise HTTPException(400, "Bạn phải mở 1 phiên làm việc trước khi tạo hồ sơ.")
    session_doc = await db.work_sessions.find_one({"_id": _oid(body.session_id)})
    if not session_doc:
        raise HTTPException(400, "Phiên làm việc không tồn tại.")
    is_admin = user.get("role") == "admin"
    _ensure_session_editable(session_doc, user["username"], is_admin)
    _require_capture_fields(body)
    dob = _parse_dob(body.dob)
    now = datetime.utcnow()
    code = await _next_code()
    doc = body.model_dump()
    doc.pop("session_id", None)
    doc.update({
        "code": code,
        "full_name_norm": _norm_name(body.full_name),
        "dob": dob,
        "date_in": _parse_dob(body.date_in),
        "issued_date": _parse_dob(body.issued_date),
        "expiry_date": _parse_dob(body.expiry_date),
        "created_at": now,
        "updated_at": now,
        "created_by": user["username"],
        "session_id": session_doc["_id"],
    })
    res = await db.detainees.insert_one(doc)
    doc["_id"] = res.inserted_id
    await db.work_sessions.update_one(
        {"_id": session_doc["_id"]},
        {"$inc": {"detainee_count": 1}, "$set": {"updated_at": now}},
    )
    await _log(request, user, "create", "detainee", code, {"full_name": body.full_name, "session": session_doc.get("code")}, ref_id=str(res.inserted_id))
    return _s(doc)
```

- [ ] **Step 9: Sửa `_s` serializer để expose session_id**

Trong `backend/main.py`, tìm hàm `_s(doc)` (khoảng dòng 56) và cập nhật:

```python
def _s(doc: dict) -> dict:
    if not doc:
        return doc
    doc["id"] = str(doc.pop("_id"))
    if "session_id" in doc and doc["session_id"] is not None:
        doc["session_id"] = str(doc["session_id"])
    for k in ("created_at", "updated_at", "dob"):
        if k in doc and isinstance(doc[k], datetime):
            doc[k] = doc[k].isoformat()
    return doc
```

- [ ] **Step 10: Chạy lại tests — 2/3 test mới PASS, close test vẫn FAIL vì chưa có endpoint close**

Run: `.venv/bin/pytest backend/tests/test_sessions.py -v`
Expected: `test_create_detainee_requires_session_id` PASS, `test_create_detainee_success_increments_count` PASS, `test_create_detainee_rejects_closed_session` FAIL (không có route close — sẽ làm ở Task 3).

- [ ] **Step 11: Sửa `update_detainee` và `delete_detainee` để chặn phiên closed**

Trong `backend/main.py`, thay thế route `PATCH /api/detainees/{det_id}`:

```python
@app.patch("/api/detainees/{det_id}")
async def update_detainee(det_id: str, body: DetaineeIn, request: Request, user: dict = Depends(get_current_user)):
    existing = await db.detainees.find_one({"_id": _oid(det_id)})
    if not existing:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    _ensure_can_touch(existing, user)
    sid = existing.get("session_id")
    if sid is not None:
        session_doc = await db.work_sessions.find_one({"_id": sid})
        if session_doc and session_doc.get("status") != "open":
            raise HTTPException(403, "Hồ sơ này thuộc phiên đã đóng, không thể chỉnh sửa.")
    upd = body.model_dump()
    upd.pop("session_id", None)
    upd["full_name_norm"] = _norm_name(body.full_name)
    upd["dob"] = _parse_dob(body.dob)
    upd["date_in"] = _parse_dob(body.date_in)
    upd["updated_at"] = datetime.utcnow()
    doc = await db.detainees.find_one_and_update({"_id": _oid(det_id)}, {"$set": upd}, return_document=True)
    await _log(request, user, "update", "detainee", doc.get("code", det_id), {"full_name": body.full_name}, ref_id=det_id)
    return _s(doc)
```

Và thay `DELETE /api/detainees/{det_id}`:

```python
@app.delete("/api/detainees/{det_id}")
async def delete_detainee(det_id: str, request: Request, user: dict = Depends(get_current_user)):
    doc = await db.detainees.find_one({"_id": _oid(det_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    _ensure_can_touch(doc, user)
    sid = doc.get("session_id")
    if sid is not None:
        session_doc = await db.work_sessions.find_one({"_id": sid})
        if session_doc and session_doc.get("status") != "open":
            raise HTTPException(403, "Hồ sơ này thuộc phiên đã đóng, không thể xoá.")
    await db.detainees.delete_one({"_id": _oid(det_id)})
    if sid is not None:
        await db.work_sessions.update_one(
            {"_id": sid},
            {"$inc": {"detainee_count": -1}, "$set": {"updated_at": datetime.utcnow()}},
        )
    await _log(request, user, "delete", "detainee", doc.get("code", det_id), ref_id=det_id)
    return {"ok": True}
```

- [ ] **Step 12: Commit**

```bash
git add backend/main.py backend/tests/test_sessions.py
git commit -m "$(cat <<'EOF'
feat(backend): gắn session_id vào detainee + GET /api/sessions/{id}

- POST /api/detainees bắt buộc session_id, validate phiên open + thuộc user
- Sau tạo/xoá detainee: $inc detainee_count trên phiên
- PATCH/DELETE detainee chặn nếu phiên đã đóng (403)
- GET /api/sessions/{id}: chi tiết phiên + danh sách hồ sơ tóm tắt
- _s serializer serialize session_id ObjectId sang string

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Backend — Đóng phiên + sinh Excel + download report

**Files:**
- Modify: `backend/main.py` (thêm route close, helper build Excel, route download report, route DELETE session, mount reports directory)
- Modify: `backend/tests/test_sessions.py` (thêm tests)

**Interfaces:**
- Consumes: Tasks 1-2 (session models, helpers, `_ensure_session_editable`).
- Produces:
  - Route `POST /api/sessions/{id}/close` → `{ok, closed_at, report_url, report_filename}`; 409 nếu đã closed
  - Route `GET /api/sessions/{id}/report` → StreamingResponse .xlsx; 404 nếu chưa closed hoặc file mất
  - Route `DELETE /api/sessions/{id}` → 400 nếu đã có detainee hoặc đã closed
  - Helper `async def _build_session_report_xlsx(session_doc: dict) -> tuple[str, str]` — returns `(filepath_absolute, filename)`
  - Directory `backend/uploads/reports/` được tạo lúc startup, mount qua `/uploads`

- [ ] **Step 1: Thêm test đóng phiên**

Thêm vào `backend/tests/test_sessions.py`:

```python
@pytest.mark.asyncio
async def test_close_empty_session(app_client, admin_headers):
    r1 = await app_client.post("/api/sessions", json={"note": "empty"}, headers=admin_headers)
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
async def test_report_contains_detainee(app_client, admin_headers):
    r1 = await app_client.post("/api/sessions", json={}, headers=admin_headers)
    sid = r1.json()["id"]
    await app_client.post("/api/detainees", json=_sample_detainee(sid), headers=admin_headers)
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
    await app_client.post("/api/detainees", json=_sample_detainee(sid), headers=admin_headers)
    r2 = await app_client.delete(f"/api/sessions/{sid}", headers=admin_headers)
    assert r2.status_code == 400
```

- [ ] **Step 2: Chạy tests — verify FAIL**

Run: `.venv/bin/pytest backend/tests/test_sessions.py -v -k "close or delete_empty or delete_session or report_contains"`
Expected: FAIL — routes chưa tồn tại.

- [ ] **Step 3: Thêm khai báo REPORTS_DIR ở đầu `backend/main.py`**

Tìm dòng `UPLOAD_DIR = os.path.join(...)` (khoảng dòng 29) và thêm ngay sau:

```python
REPORTS_DIR = os.path.join(UPLOAD_DIR, "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)
```

- [ ] **Step 4: Thêm helper `_build_session_report_xlsx`**

Insert vào `backend/main.py` trong block WORK SESSIONS (sau `_ensure_session_editable`):

```python
async def _build_session_report_xlsx(session_doc: dict) -> tuple[str, str]:
    wb = Workbook()
    ws1 = wb.active
    ws1.title = "Thông tin phiên"
    opened = session_doc.get("opened_at")
    closed = session_doc.get("closed_at")

    def _fmt_dt(dt):
        return dt.strftime("%d/%m/%Y %H:%M") if isinstance(dt, datetime) else ""

    rows = [
        ["PHIẾU BÁO CÁO PHIÊN LÀM VIỆC"],
        [],
        ["Mã phiên:", session_doc.get("code", "")],
        ["Cán bộ:", f"{session_doc.get('officer','')} ({session_doc.get('officer_full_name','')})"],
        ["Địa điểm:", session_doc.get("location", "") or ""],
        ["Ghi chú:", session_doc.get("note", "") or ""],
        ["Mở lúc:", _fmt_dt(opened)],
        ["Đóng lúc:", _fmt_dt(closed)],
        ["Tổng hồ sơ:", session_doc.get("detainee_count", 0)],
    ]
    for r in rows:
        ws1.append(r)
    ws1.column_dimensions["A"].width = 18
    ws1.column_dimensions["B"].width = 42

    ws2 = wb.create_sheet("Danh sách hồ sơ")
    headers = ["STT", "Mã HS", "Họ và tên", "Giới tính", "Ngày sinh", "Số CCCD", "Quê quán", "Buồng", "Ghi chú"]
    ws2.append(headers)
    i = 0
    async for d in db.detainees.find({"session_id": session_doc["_id"]}).sort("created_at", 1):
        i += 1
        dob = d.get("dob")
        dob_str = dob.strftime("%d/%m/%Y") if isinstance(dob, datetime) else ""
        gender = "Nam" if d.get("gender") == "male" else "Nữ"
        ws2.append([
            i,
            d.get("code", ""),
            d.get("full_name", ""),
            gender,
            dob_str,
            d.get("cccd_number", "") or "",
            d.get("hometown", "") or "",
            d.get("cell_code", "") or "",
            d.get("note", "") or "",
        ])
    for col in ws2.columns:
        letter = col[0].column_letter
        ws2.column_dimensions[letter].width = 18

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"session_{session_doc.get('code','')}_{ts}.xlsx"
    filepath = os.path.join(REPORTS_DIR, filename)
    wb.save(filepath)
    return filepath, filename
```

- [ ] **Step 5: Thêm routes close/report/delete session**

Insert vào `backend/main.py` cuối block WORK SESSIONS (sau `get_session_detail`):

```python
@app.post("/api/sessions/{session_id}/close")
async def close_session(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    doc = await db.work_sessions.find_one({"_id": _oid(session_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy phiên làm việc.")
    if doc.get("officer") != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Bạn không có quyền đóng phiên này.")
    if doc.get("status") != "open":
        raise HTTPException(409, "Phiên này đã đóng.")
    now = datetime.utcnow()
    doc["closed_at"] = now
    doc["status"] = "closed"
    filepath, filename = await _build_session_report_xlsx(doc)
    report_url = f"/uploads/reports/{filename}"
    await db.work_sessions.update_one(
        {"_id": doc["_id"]},
        {"$set": {
            "status": "closed",
            "closed_at": now,
            "report_url": report_url,
            "report_filename": filename,
        }},
    )
    await _log(request, user, "update", "work_session", doc.get("code", ""), {"action": "close", "detainee_count": doc.get("detainee_count", 0)}, ref_id=session_id)
    return {"ok": True, "closed_at": now.isoformat(), "report_url": report_url, "report_filename": filename}


@app.get("/api/sessions/{session_id}/report")
async def download_session_report(session_id: str, user: dict = Depends(get_current_user)):
    doc = await db.work_sessions.find_one({"_id": _oid(session_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy phiên làm việc.")
    if doc.get("officer") != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Bạn không có quyền tải báo cáo phiên này.")
    if doc.get("status") != "closed" or not doc.get("report_filename"):
        raise HTTPException(404, "Phiên chưa được đóng hoặc chưa có báo cáo.")
    filepath = os.path.join(REPORTS_DIR, doc["report_filename"])
    if not os.path.exists(filepath):
        raise HTTPException(404, "File báo cáo không còn tồn tại trên máy chủ.")
    with open(filepath, "rb") as f:
        data = f.read()
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{doc["report_filename"]}"'},
    )


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    doc = await db.work_sessions.find_one({"_id": _oid(session_id)})
    if not doc:
        raise HTTPException(404, "Không tìm thấy phiên làm việc.")
    if doc.get("officer") != user["username"] and user.get("role") != "admin":
        raise HTTPException(403, "Bạn không có quyền xoá phiên này.")
    if doc.get("status") != "open":
        raise HTTPException(400, "Chỉ có thể xoá phiên đang mở, chưa đóng.")
    if doc.get("detainee_count", 0) > 0:
        raise HTTPException(400, "Chỉ có thể xoá phiên rỗng (0 hồ sơ).")
    await db.work_sessions.delete_one({"_id": doc["_id"]})
    await _log(request, user, "delete", "work_session", doc.get("code", ""), ref_id=session_id)
    return {"ok": True}
```

- [ ] **Step 6: Chạy tests — verify PASS toàn bộ**

Run: `.venv/bin/pytest backend/tests/test_sessions.py -v`
Expected: tất cả PASS.

- [ ] **Step 7: Smoke test API thủ công**

Start MongoDB (nếu chưa chạy), chạy server và curl:

```bash
.venv/bin/uvicorn --app-dir backend main:app --host 127.0.0.1 --port 8000 &
sleep 2
TOKEN=$(curl -s -X POST -d 'username=admin&password=admin123' \
  http://127.0.0.1:8000/api/auth/login | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s -X POST http://127.0.0.1:8000/api/sessions \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"location":"Buồng thử","note":"smoke"}' | python -m json.tool
kill %1
```

Expected: JSON có `code: "S...-0001"`, `status: "open"`. Nếu chạy lại → 409.

- [ ] **Step 8: Commit**

```bash
git add backend/main.py backend/tests/test_sessions.py
git commit -m "$(cat <<'EOF'
feat(backend): đóng phiên + sinh Excel báo cáo + download + delete

- POST /api/sessions/{id}/close: chốt phiên, sinh xlsx vào uploads/reports/
- GET /api/sessions/{id}/report: stream Excel về client
- DELETE /api/sessions/{id}: xoá phiên rỗng đang mở (chống rác)
- Helper _build_session_report_xlsx: sheet "Thông tin phiên" + "Danh sách hồ sơ"

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Frontend — API client methods

**Files:**
- Modify: `frontend/src/api.js` (thêm session methods)

**Interfaces:**
- Consumes: backend endpoints từ Tasks 1-3.
- Produces (mở rộng `api` object):
  - `listSessions(params = {})` → `{total, items}`
  - `getCurrentSession()` → session object (throw nếu 404)
  - `createSession({location, note})` → session object
  - `getSession(id)` → session object có `detainees[]`
  - `closeSession(id)` → `{ok, closed_at, report_url, report_filename}`
  - `deleteSession(id)` → `{ok}`
  - `downloadSessionReport(id, filename)` → download file

- [ ] **Step 1: Thêm methods vào `frontend/src/api.js`**

Tìm dòng cuối trong `export const api = { ... }` (khoảng dòng 133-136, sau `deleteUser`) và thêm ngay trước dấu `};`:

```javascript
  listSessions: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.set(k, v);
    });
    const s = qs.toString();
    return request(`/api/sessions${s ? `?${s}` : ""}`);
  },
  getCurrentSession: () => request("/api/sessions/current"),
  createSession: (body) => request("/api/sessions", { method: "POST", body: JSON.stringify(body || {}) }),
  getSession: (id) => request(`/api/sessions/${id}`),
  closeSession: (id) => request(`/api/sessions/${id}/close`, { method: "POST" }),
  deleteSession: (id) => request(`/api/sessions/${id}`, { method: "DELETE" }),
  downloadSessionReport: (id, filename) => downloadFile(`/api/sessions/${id}/report`, filename || `session_report.xlsx`),
```

- [ ] **Step 2: Verify không lỗi syntax bằng cách build frontend**

Run: `cd frontend && npm run build 2>&1 | tail -20`
Expected: build succeeds hoặc chỉ có warning không liên quan.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js
git commit -m "$(cat <<'EOF'
feat(frontend): thêm session API client methods

- listSessions, getCurrentSession, createSession, getSession
- closeSession, deleteSession, downloadSessionReport
- Reuse downloadFile helper cho báo cáo Excel

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Frontend — SessionOpenModal component

**Files:**
- Create: `frontend/src/SessionOpenModal.jsx`
- Modify: `frontend/src/styles.css` (thêm styles session-modal-*)

**Interfaces:**
- Consumes: `api.createSession` from Task 4.
- Produces:
  - Component `SessionOpenModal({ officerName, officerFullName, onCreated, onCancel })`
  - onCreated(session) fired sau khi POST /api/sessions thành công, session là object đầy đủ
  - Component hiển thị 2 field (location, note), 2 nút (Huỷ, Mở phiên)

- [ ] **Step 1: Tạo `frontend/src/SessionOpenModal.jsx`**

```jsx
import { useState } from "react";
import { api } from "./api";

function fmtNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SessionOpenModal({ officerName, officerFullName, onCreated, onCancel }) {
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const s = await api.createSession({ location: location.trim(), note: note.trim() });
      if (onCreated) onCreated(s);
    } catch (ex) {
      setErr(ex.message || "Không thể mở phiên");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="session-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel && onCancel()}>
      <form className="session-modal" onSubmit={submit}>
        <div className="session-modal-head">
          <h3>MỞ PHIÊN LÀM VIỆC MỚI</h3>
          <button type="button" className="session-modal-close" onClick={onCancel} aria-label="Đóng">×</button>
        </div>
        <div className="session-modal-body">
          <div className="session-modal-row">
            <label>Cán bộ</label>
            <div className="session-modal-static">{officerName}{officerFullName ? ` (${officerFullName})` : ""}</div>
          </div>
          <div className="session-modal-row">
            <label>Thời điểm mở</label>
            <div className="session-modal-static">{fmtNow()}</div>
          </div>
          <div className="session-modal-row">
            <label htmlFor="sm-location">Địa điểm</label>
            <input id="sm-location" className="control" value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="VD: Buồng tiếp nhận 2" maxLength={200} />
          </div>
          <div className="session-modal-row">
            <label htmlFor="sm-note">Ghi chú</label>
            <textarea id="sm-note" className="control" value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="(tuỳ chọn)" rows={3} maxLength={500} />
          </div>
          {err && <div className="error-box">{err}</div>}
        </div>
        <div className="session-modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Huỷ</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Đang mở..." : "Mở phiên"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Thêm styles vào `frontend/src/styles.css`**

Append vào cuối file:

```css
/* ============ Session Modal ============ */
.session-modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.session-modal {
  background: #fff;
  border-radius: 12px;
  width: 480px; max-width: calc(100vw - 32px);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
  display: flex; flex-direction: column;
}
.session-modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid #e5e7eb;
}
.session-modal-head h3 { margin: 0; font-size: 15px; letter-spacing: 0.5px; color: #b91c1c; }
.session-modal-close {
  background: transparent; border: none; font-size: 24px; line-height: 1;
  color: #6b7280; cursor: pointer;
}
.session-modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
.session-modal-row { display: flex; flex-direction: column; gap: 6px; }
.session-modal-row label { font-size: 12px; color: #6b7280; font-weight: 600; }
.session-modal-static { padding: 8px 10px; background: #f3f4f6; border-radius: 6px; font-size: 14px; color: #111827; }
.session-modal-actions {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 12px 20px; border-top: 1px solid #e5e7eb;
}
.session-modal-actions .btn-primary {
  background: #b91c1c; color: #fff; border: none;
  padding: 8px 18px; border-radius: 6px; font-weight: 600; cursor: pointer;
}
.session-modal-actions .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.session-modal-actions .btn-secondary {
  background: #fff; color: #374151; border: 1px solid #d1d5db;
  padding: 8px 18px; border-radius: 6px; font-weight: 600; cursor: pointer;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/SessionOpenModal.jsx frontend/src/styles.css
git commit -m "$(cat <<'EOF'
feat(frontend): thêm SessionOpenModal component + styles

Modal 2 field (địa điểm, ghi chú), gọi api.createSession,
callback onCreated(session) khi POST thành công.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Frontend — SessionListPage component

**Files:**
- Create: `frontend/src/SessionListPage.jsx`
- Modify: `frontend/src/styles.css` (thêm styles session-list-*)

**Interfaces:**
- Consumes: `api.listSessions`, `api.downloadSessionReport`, `api.getCurrentSession` from Task 4; `SessionOpenModal` from Task 5.
- Produces:
  - Component `SessionListPage({ role, username, fullName, onOpenSession })`
  - `onOpenSession(sessionId)` — được gọi khi user click vào row của phiên hoặc sau khi tạo phiên mới; parent chịu trách nhiệm nav sang SessionDetailPage
  - Component tự load list qua `api.listSessions` với filter state

- [ ] **Step 1: Tạo `frontend/src/SessionListPage.jsx`**

```jsx
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import SessionOpenModal from "./SessionOpenModal";

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SessionListPage({ role, username, fullName, onOpenSession }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [mineOnly, setMineOnly] = useState(role !== "admin");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [current, setCurrent] = useState(null);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const [resp, cur] = await Promise.all([
        api.listSessions({
          status: statusFilter,
          mine_only: mineOnly ? "true" : "",
          date_from: dateFrom,
          date_to: dateTo,
        }),
        api.getCurrentSession().catch(() => null),
      ]);
      setItems(resp.items || []);
      setTotal(resp.total || 0);
      setCurrent(cur);
    } catch (ex) {
      setErr(ex.message || "Không tải được danh sách phiên");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter, mineOnly, dateFrom, dateTo]);

  const hasOpenSession = Boolean(current);

  const openNew = () => {
    if (hasOpenSession) return;
    setModalOpen(true);
  };

  const handleCreated = (s) => {
    setModalOpen(false);
    setCurrent(s);
    if (onOpenSession) onOpenSession(s.id);
  };

  const downloadReport = async (s) => {
    try {
      await api.downloadSessionReport(s.id, s.report_filename || `session_${s.code}.xlsx`);
    } catch (ex) {
      alert(ex.message || "Không tải được báo cáo");
    }
  };

  return (
    <div className="session-list-page">
      <div className="session-list-head">
        <h2>PHIÊN LÀM VIỆC</h2>
        <div
          className="session-list-newwrap"
          title={hasOpenSession ? `Bạn đang có phiên ${current.code} đang mở` : ""}
        >
          <button
            type="button"
            className="btn-primary"
            onClick={openNew}
            disabled={hasOpenSession}
          >
            + Mở phiên mới
          </button>
        </div>
      </div>

      <div className="session-list-filters">
        <label>
          Trạng thái
          <select className="control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="open">Đang mở</option>
            <option value="closed">Đã đóng</option>
          </select>
        </label>
        <label className="chk">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            disabled={role !== "admin"}
          />
          Của tôi
        </label>
        <label>
          Từ
          <input type="date" className="control" value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label>
          Đến
          <input type="date" className="control" value={dateTo}
            onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <button type="button" className="btn-secondary" onClick={load}>Làm mới</button>
      </div>

      {err && <div className="error-box">{err}</div>}

      <div className="session-list-table-wrap">
        <table className="session-list-table">
          <thead>
            <tr>
              <th>Trạng thái</th>
              <th>Mã phiên</th>
              <th>Cán bộ</th>
              <th>Mở lúc</th>
              <th>Đóng lúc</th>
              <th>Địa điểm</th>
              <th style={{ textAlign: "right" }}>Hồ sơ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="session-list-empty">Đang tải...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={8} className="session-list-empty">Chưa có phiên nào.</td></tr>
            )}
            {!loading && items.map((s) => (
              <tr key={s.id} onClick={() => onOpenSession && onOpenSession(s.id)} className="session-list-row">
                <td>
                  {s.status === "open"
                    ? <span className="badge badge-open">● Đang mở</span>
                    : <span className="badge badge-closed">✓ Đã đóng</span>}
                </td>
                <td className="mono">{s.code}</td>
                <td>{s.officer}{s.officer_full_name ? ` (${s.officer_full_name})` : ""}</td>
                <td>{fmtDateTime(s.opened_at)}</td>
                <td>{fmtDateTime(s.closed_at)}</td>
                <td>{s.location || "—"}</td>
                <td style={{ textAlign: "right" }}>{s.detainee_count || 0}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {s.status === "closed" && s.report_url ? (
                    <button type="button" className="btn-link" onClick={() => downloadReport(s)}>
                      ⬇ Tải Excel
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="session-list-footer">Tổng: {total}</div>
      </div>

      {modalOpen && (
        <SessionOpenModal
          officerName={username}
          officerFullName={fullName}
          onCancel={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Thêm styles vào `frontend/src/styles.css`**

Append cuối file:

```css
/* ============ Session List Page ============ */
.session-list-page { padding: 20px 24px; max-width: 1280px; margin: 0 auto; }
.session-list-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px;
}
.session-list-head h2 { margin: 0; color: #b91c1c; letter-spacing: 0.5px; font-size: 18px; }
.session-list-newwrap { display: inline-block; }
.session-list-filters {
  display: flex; gap: 12px; align-items: flex-end;
  padding: 12px 16px; background: #f9fafb; border-radius: 8px; margin-bottom: 12px;
}
.session-list-filters label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 12px; color: #6b7280; font-weight: 600;
}
.session-list-filters label.chk {
  flex-direction: row; align-items: center; gap: 6px; padding-bottom: 8px;
}
.session-list-filters .control { min-width: 140px; }
.session-list-table-wrap { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
.session-list-table { width: 100%; border-collapse: collapse; }
.session-list-table th {
  background: #f3f4f6; padding: 10px 12px; text-align: left;
  font-size: 12px; text-transform: uppercase; color: #6b7280; font-weight: 600;
}
.session-list-table td { padding: 10px 12px; border-top: 1px solid #f1f5f9; font-size: 14px; }
.session-list-row { cursor: pointer; transition: background 0.1s; }
.session-list-row:hover { background: #fef2f2; }
.session-list-empty { text-align: center; color: #9ca3af; padding: 24px !important; }
.session-list-footer { padding: 8px 12px; font-size: 12px; color: #6b7280; background: #f9fafb; }
.badge {
  display: inline-block; padding: 2px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 700;
}
.badge-open { background: #dcfce7; color: #15803d; }
.badge-closed { background: #e5e7eb; color: #4b5563; }
.mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.btn-link {
  background: transparent; border: none; color: #b91c1c;
  cursor: pointer; font-weight: 600; padding: 0;
}
.btn-link:hover { text-decoration: underline; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/SessionListPage.jsx frontend/src/styles.css
git commit -m "$(cat <<'EOF'
feat(frontend): SessionListPage + styles

Danh sách phiên với filter status/mine_only/date range, badge trạng thái,
tải Excel báo cáo cho phiên đã đóng, disable "Mở phiên mới" nếu user đã
có phiên open, mở SessionOpenModal khi tạo mới.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Frontend — SessionDetailPage component

**Files:**
- Create: `frontend/src/SessionDetailPage.jsx`
- Modify: `frontend/src/styles.css` (thêm styles session-detail-*)

**Interfaces:**
- Consumes: `api.getSession`, `api.closeSession`, `api.downloadSessionReport`, `api.deleteDetainee` from Task 4.
- Produces:
  - Component `SessionDetailPage({ sessionId, onBack, onAddDetainee, onEditDetainee, onSessionClosed })`
  - `onAddDetainee(sessionId)` — mở DataCapturePage ở chế độ tạo mới với sessionId
  - `onEditDetainee(detainee, session)` — mở DataCapturePage ở chế độ edit; parent chuyển page
  - `onSessionClosed(session)` — parent có thể clear "current session" state

- [ ] **Step 1: Tạo `frontend/src/SessionDetailPage.jsx`**

```jsx
import { useEffect, useState } from "react";
import { api } from "./api";

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SessionDetailPage({ sessionId, onBack, onAddDetainee, onEditDetainee, onSessionClosed }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [closing, setClosing] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const s = await api.getSession(sessionId);
      setSession(s);
    } catch (ex) {
      setErr(ex.message || "Không tải được phiên");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [sessionId]);

  const doClose = async () => {
    if (!session) return;
    const n = session.detainee_count || 0;
    const msg = `Đóng phiên ${session.code} với ${n} hồ sơ? Sau khi đóng, không thể chỉnh sửa hồ sơ trong phiên nữa.`;
    if (!window.confirm(msg)) return;
    setClosing(true);
    setErr("");
    try {
      const res = await api.closeSession(sessionId);
      try {
        await api.downloadSessionReport(sessionId, res.report_filename);
      } catch (dlErr) {
        console.warn("Auto-download report failed:", dlErr);
      }
      if (onSessionClosed) onSessionClosed(session);
      await load();
    } catch (ex) {
      setErr(ex.message || "Không đóng được phiên");
    } finally {
      setClosing(false);
    }
  };

  const doDownload = async () => {
    if (!session) return;
    try {
      await api.downloadSessionReport(sessionId, session.report_filename);
    } catch (ex) {
      alert(ex.message || "Không tải được báo cáo");
    }
  };

  const removeDetainee = async (d) => {
    if (!window.confirm(`Xoá hồ sơ ${d.code} — ${d.full_name}?`)) return;
    try {
      await api.deleteDetainee(d.id);
      await load();
    } catch (ex) {
      alert(ex.message || "Không xoá được hồ sơ");
    }
  };

  if (loading) return <div className="session-detail-page"><div>Đang tải...</div></div>;
  if (err && !session) return (
    <div className="session-detail-page">
      <button className="btn-link" onClick={onBack}>← Quay lại</button>
      <div className="error-box">{err}</div>
    </div>
  );
  if (!session) return null;

  const isOpen = session.status === "open";

  return (
    <div className="session-detail-page">
      <button className="btn-link session-detail-back" onClick={onBack}>← Quay lại danh sách</button>

      <div className={"session-detail-head " + (isOpen ? "open" : "closed")}>
        <div className="session-detail-title">
          {isOpen ? <span className="badge badge-open">● Đang mở</span> : <span className="badge badge-closed">✓ Đã đóng</span>}
          <span className="session-detail-code mono">{session.code}</span>
        </div>
        <div className="session-detail-meta">
          <span>Cán bộ: <strong>{session.officer}{session.officer_full_name ? ` (${session.officer_full_name})` : ""}</strong></span>
          <span>Mở: <strong>{fmtDateTime(session.opened_at)}</strong></span>
          {!isOpen && <span>Đóng: <strong>{fmtDateTime(session.closed_at)}</strong></span>}
          {session.location && <span>Địa điểm: <strong>{session.location}</strong></span>}
        </div>
        {session.note && <div className="session-detail-note">Ghi chú: {session.note}</div>}
      </div>

      {err && <div className="error-box">{err}</div>}

      <div className="session-detail-toolbar">
        <div className="session-detail-toolbar-title">Hồ sơ trong phiên ({session.detainee_count || 0})</div>
        <div className="session-detail-toolbar-actions">
          {isOpen ? (
            <>
              <button className="btn-primary" onClick={() => onAddDetainee && onAddDetainee(session.id)}>+ Thêm hồ sơ mới</button>
              <button className="btn-danger-outline" onClick={doClose} disabled={closing}>
                {closing ? "Đang đóng..." : "Đóng phiên"}
              </button>
            </>
          ) : (
            <button className="btn-primary" onClick={doDownload}>⬇ Tải báo cáo Excel</button>
          )}
        </div>
      </div>

      <div className="session-list-table-wrap">
        <table className="session-list-table">
          <thead>
            <tr>
              <th>Mã HS</th>
              <th>Họ tên</th>
              <th>Giới tính</th>
              <th>Ngày sinh</th>
              <th>CCCD</th>
              <th>Buồng</th>
              <th>Thời điểm</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(session.detainees || []).length === 0 && (
              <tr>
                <td colSpan={8} className="session-list-empty">
                  {isOpen ? "Chưa có hồ sơ nào. Bấm '+ Thêm hồ sơ mới' để bắt đầu." : "Phiên không có hồ sơ."}
                </td>
              </tr>
            )}
            {(session.detainees || []).map((d) => (
              <tr key={d.id} className="session-list-row" onClick={() => onEditDetainee && onEditDetainee(d, session)}>
                <td className="mono">{d.code}</td>
                <td>{d.full_name}</td>
                <td>{d.gender === "female" ? "Nữ" : "Nam"}</td>
                <td>{d.dob ? new Date(d.dob).toLocaleDateString("vi-VN") : "—"}</td>
                <td className="mono">{d.cccd_number || "—"}</td>
                <td>{d.cell_code || "—"}</td>
                <td>{fmtTime(d.created_at)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {isOpen && (
                    <button type="button" className="btn-link btn-link-danger" onClick={() => removeDetainee(d)}>Xoá</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Thêm styles vào `frontend/src/styles.css`**

Append cuối file:

```css
/* ============ Session Detail Page ============ */
.session-detail-page { padding: 20px 24px; max-width: 1280px; margin: 0 auto; }
.session-detail-back { margin-bottom: 12px; display: inline-block; }
.session-detail-head {
  padding: 14px 18px; border-radius: 10px; margin-bottom: 14px;
  border-left: 4px solid #b91c1c;
  background: linear-gradient(180deg, #fff, #fef8f8);
}
.session-detail-head.closed { border-left-color: #6b7280; background: #f9fafb; }
.session-detail-title { display: flex; gap: 10px; align-items: center; margin-bottom: 6px; }
.session-detail-code { font-size: 18px; font-weight: 700; }
.session-detail-meta { display: flex; gap: 18px; flex-wrap: wrap; font-size: 13px; color: #4b5563; }
.session-detail-meta strong { color: #111827; font-weight: 600; }
.session-detail-note { margin-top: 8px; font-size: 13px; color: #6b7280; font-style: italic; }
.session-detail-toolbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 0; margin-bottom: 8px;
}
.session-detail-toolbar-title { font-weight: 600; color: #111827; }
.session-detail-toolbar-actions { display: flex; gap: 10px; }
.btn-danger-outline {
  background: #fff; color: #b91c1c; border: 1px solid #b91c1c;
  padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer;
}
.btn-danger-outline:hover { background: #fef2f2; }
.btn-danger-outline:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-link-danger { color: #b91c1c; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/SessionDetailPage.jsx frontend/src/styles.css
git commit -m "$(cat <<'EOF'
feat(frontend): SessionDetailPage + styles

Header thay đổi màu theo trạng thái, list detainee trong phiên với action
edit (row click) và xoá (nút inline), close phiên có confirm dialog +
auto-download Excel, phiên đã đóng chỉ hiển thị nút tải báo cáo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Frontend — Sửa DataCapturePage nhận sessionId

**Files:**
- Modify: `frontend/src/DataCapturePage.jsx`
- Modify: `frontend/src/styles.css` (thêm styles capture-session-banner)

**Interfaces:**
- Consumes: `api.createDetainee`, `api.updateDetainee` từ api.js hiện có (POST /api/detainees giờ đã yêu cầu session_id ở Task 2).
- Produces:
  - Component thêm props: `sessionId?: string`, `sessionCode?: string`, `sessionReadOnly?: boolean`, `onSavedInSession?: () => void`
  - Khi `sessionId` truyền vào: gắn `session_id` vào body khi POST/PATCH detainee
  - Khi `sessionReadOnly === true`: mọi input disabled, ẩn action buttons
  - Sau khi lưu thành công trong phiên: gọi `onSavedInSession()` (không reset form kiểu cũ)

- [ ] **Step 1: Sửa signature component**

Trong `frontend/src/DataCapturePage.jsx` dòng 166, thay:

```jsx
export default function DataCapturePage({ go, initial, onDone }) {
```

Thành:

```jsx
export default function DataCapturePage({ go, initial, onDone, sessionId, sessionCode, sessionReadOnly = false, onSavedInSession }) {
```

- [ ] **Step 2: Thêm banner phiên ngay đầu return**

Trong `frontend/src/DataCapturePage.jsx`, ngay sau `return (` và `<div className="page capture-page">` (khoảng dòng 313), chèn banner:

```jsx
      {sessionId && (
        <div className={"capture-session-banner " + (sessionReadOnly ? "closed" : "open")}>
          {sessionReadOnly ? (
            <>
              <span className="dot" />
              Đang xem hồ sơ trong phiên <strong>{sessionCode || sessionId}</strong> (đã đóng — chỉ đọc)
            </>
          ) : (
            <>
              <span className="dot" />
              Đang trong phiên <strong>{sessionCode || sessionId}</strong>
            </>
          )}
        </div>
      )}
```

- [ ] **Step 3: Sửa hàm `submit` gắn session_id và call onSavedInSession**

Trong hàm `submit` (khoảng dòng 244-296), tìm dòng `const body = { ... }` và thêm `session_id: sessionId || null,` vào đầu object. Nếu isEdit đã tồn tại, body cho update KHÔNG cần session_id (backend chặn tự động). Nhưng để đơn giản, gửi luôn — backend bỏ qua field này trong PATCH.

Thay đoạn build body và call API (khoảng dòng 258-290):

```jsx
      const body = {
        session_id: sessionId || null,
        full_name: form.full_name.trim(),
        gender: form.gender === "female" ? "female" : "male",
        dob: strOrNull(form.dob),
        cccd_number: digitsOrNull(form.cccd_number),
        personal_id: digitsOrNull(form.personal_id),
        nationality: strOrNull(form.nationality),
        hometown: strOrNull(form.hometown),
        address: strOrNull(form.address),
        ethnicity: strOrNull(form.ethnicity),
        religion: strOrNull(form.religion),
        issued_date: strOrNull(form.issued_date),
        expiry_date: strOrNull(form.expiry_date),
        issued_place: strOrNull(form.issued_place),
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        charge: strOrNull(form.charge),
        cell_code: strOrNull(form.cell_code),
        note: strOrNull(form.note),
        photo_url: photos.portrait_front || null,
        photos,
      };
      if (isEdit) {
        const updated = await api.updateDetainee(initial.id, body);
        setOk(`Đã cập nhật hồ sơ ${updated.code} — ${updated.full_name}`);
        if (onDone) onDone();
        if (sessionId && onSavedInSession) {
          setTimeout(() => onSavedInSession(), 600);
        } else if (go) {
          setTimeout(() => go("detainees"), 800);
        }
      } else {
        const created = await api.createDetainee(body);
        setOk(`Đã lưu hồ sơ ${created.code} — ${created.full_name}`);
        if (sessionId && onSavedInSession) {
          setForm(EMPTY_FORM);
          setPhotos({});
          setTimeout(() => onSavedInSession(), 800);
        } else {
          setForm(EMPTY_FORM);
          setPhotos({});
        }
      }
```

- [ ] **Step 4: Disable submit button khi read-only**

Tìm dòng `disabled={!allRequiredValid || saving}` trên `save-primary` (khoảng dòng 561) và đổi thành:

```jsx
disabled={!allRequiredValid || saving || sessionReadOnly}
```

Và disable tất cả input trong read-only mode. Đơn giản nhất: bọc toàn bộ nội dung form trong một `<fieldset>` với `disabled={sessionReadOnly}`. Nhưng đó là thay đổi lớn — thay vì đó, ẩn hoàn toàn `save-block` section khi read-only:

Tìm `{/* ================ Block 4: Actions ================ */}` (khoảng dòng 554) và bọc:

```jsx
      {!sessionReadOnly && (
        <section className="cap-block save-block">
          {/* ... nội dung save-block cũ giữ nguyên ... */}
        </section>
      )}
```

- [ ] **Step 5: Thêm styles vào `frontend/src/styles.css`**

Append cuối file:

```css
/* ============ Capture Session Banner ============ */
.capture-session-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; margin-bottom: 12px;
  border-radius: 8px; font-size: 13px; font-weight: 600;
}
.capture-session-banner.open {
  background: #dcfce7; color: #15803d; border: 1px solid #86efac;
}
.capture-session-banner.closed {
  background: #f3f4f6; color: #4b5563; border: 1px solid #d1d5db;
}
.capture-session-banner .dot {
  width: 8px; height: 8px; border-radius: 50%; background: currentColor;
}
.capture-session-banner strong { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/DataCapturePage.jsx frontend/src/styles.css
git commit -m "$(cat <<'EOF'
feat(frontend): DataCapturePage nhận sessionId + banner + hành vi sau lưu

- Thêm props sessionId/sessionCode/sessionReadOnly/onSavedInSession
- Banner phiên ở đầu page, đổi màu theo trạng thái open/closed
- Gắn session_id vào body khi tạo/sửa detainee
- Sau lưu trong phiên: gọi onSavedInSession thay vì reset+ở lại page
- Read-only: ẩn save-block, disable submit

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Frontend — Wire Dashboard: nav item, routing, session context

**Files:**
- Modify: `frontend/src/Dashboard.jsx`

**Interfaces:**
- Consumes: `SessionListPage` (Task 6), `SessionDetailPage` (Task 7), `DataCapturePage` sửa (Task 8), `api.getCurrentSession` (Task 4).
- Produces:
  - Sidebar nav thêm mục "Phiên làm việc" (key `sessions`) đứng ngay sau "Tổng quan"
  - State mới: `activeSessionId`, `sessionContext` `{sessionId, sessionCode, sessionReadOnly}`
  - Khi click "Thu nhận dữ liệu": gọi `api.getCurrentSession` → có phiên open → nav vào SessionDetailPage của phiên đó; không có → nav sang SessionListPage + alert

- [ ] **Step 1: Thêm import và icon session**

Trong `frontend/src/Dashboard.jsx`, tìm block import (dòng 2-5) và thêm:

```jsx
import SessionListPage from "./SessionListPage";
import SessionDetailPage from "./SessionDetailPage";
```

Tìm object `Icon = { ... }` (khoảng dòng 7-59) và thêm 1 entry (chèn trước `logout`):

```jsx
  clipboard: (
    <svg viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M6 7h12v14H6z" /><path d="M9 12h6M9 16h4" /></svg>
  ),
```

- [ ] **Step 2: Thêm nav item "Phiên làm việc"**

Tìm `const NAV_BASE = [...]` (khoảng dòng 61-68) và thay bằng:

```jsx
const NAV_BASE = [
  { key: "dashboard", label: "Tổng quan", icon: Icon.dashboard },
  { key: "sessions", label: "Phiên làm việc", icon: Icon.clipboard },
  { key: "import", label: "Thu nhận dữ liệu", icon: Icon.cloudUpload },
  { key: "detainees", label: "Hồ sơ can phạm", icon: Icon.folder },
  { key: "cells", label: "Đồng bộ dữ liệu", icon: Icon.sync },
  { key: "search", label: "Tra cứu", icon: Icon.search },
  { key: "logs", label: "Báo cáo", icon: Icon.chart },
];
```

- [ ] **Step 3: Thêm state cho session context**

Trong hàm `Dashboard`, ngay sau state `editingDetainee` (khoảng dòng 74), thêm:

```jsx
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionCtx, setSessionCtx] = useState(null); // {sessionId, sessionCode, sessionReadOnly}
```

- [ ] **Step 4: Sửa `goPage` để xử lý guard "import" khi chưa có phiên**

Thay hàm `goPage` (khoảng dòng 82-85):

```jsx
  const goPage = async (key) => {
    if (key !== "import") {
      setEditingDetainee(null);
      setSessionCtx(null);
    }
    if (key === "import") {
      try {
        const cur = await api.getCurrentSession();
        setSessionCtx({ sessionId: cur.id, sessionCode: cur.code, sessionReadOnly: false });
        setActiveSessionId(cur.id);
        setPage("sessions_detail");
        return;
      } catch (ex) {
        alert("Bạn cần mở một phiên làm việc trước khi thu nhận dữ liệu.");
        setPage("sessions");
        return;
      }
    }
    if (key === "sessions") {
      setActiveSessionId(null);
      setSessionCtx(null);
    }
    setPage(key);
  };
```

- [ ] **Step 5: Sửa `editDetainee` giữ context**

Thay hàm `editDetainee` (khoảng dòng 87-90):

```jsx
  const editDetainee = (detainee) => {
    setEditingDetainee(detainee);
    setSessionCtx(null);
    setPage("import");
  };
```

- [ ] **Step 6: Thêm callback handlers cho session flow**

Trong hàm `Dashboard`, sau `editDetainee`, thêm:

```jsx
  const openSession = (sessionId) => {
    setActiveSessionId(sessionId);
    setPage("sessions_detail");
  };
  const backToSessionList = () => {
    setActiveSessionId(null);
    setSessionCtx(null);
    setPage("sessions");
  };
  const addDetaineeToSession = (sessionId) => {
    setEditingDetainee(null);
    setSessionCtx({ sessionId, sessionCode: null, sessionReadOnly: false });
    setPage("session_capture");
  };
  const editDetaineeInSession = (detainee, session) => {
    setEditingDetainee(detainee);
    setSessionCtx({
      sessionId: session.id,
      sessionCode: session.code,
      sessionReadOnly: session.status !== "open",
    });
    setPage("session_capture");
  };
  const doneSessionCapture = () => {
    setEditingDetainee(null);
    if (activeSessionId) {
      setPage("sessions_detail");
    } else {
      setPage("sessions");
    }
  };
  const handleSessionClosed = () => {
    setSessionCtx(null);
  };
```

- [ ] **Step 7: Sửa main content rendering để thêm 2 route mới**

Tìm phần render main content trong Dashboard (nơi có `{page === "import" && ...}` pattern). Ví dụ đoạn hiện tại (bạn cần tìm và xác định trong Dashboard.jsx đang có):

```jsx
{page === "import" && (
  <DataCapturePage
    go={setPage}
    initial={editingDetainee}
    onDone={() => setEditingDetainee(null)}
  />
)}
```

Thay bằng:

```jsx
{page === "import" && (
  <DataCapturePage
    go={setPage}
    initial={editingDetainee}
    onDone={() => setEditingDetainee(null)}
  />
)}
{page === "sessions" && (
  <SessionListPage
    role={role}
    username={username}
    fullName=""
    onOpenSession={openSession}
  />
)}
{page === "sessions_detail" && activeSessionId && (
  <SessionDetailPage
    sessionId={activeSessionId}
    onBack={backToSessionList}
    onAddDetainee={addDetaineeToSession}
    onEditDetainee={editDetaineeInSession}
    onSessionClosed={handleSessionClosed}
  />
)}
{page === "session_capture" && sessionCtx && (
  <DataCapturePage
    go={setPage}
    initial={editingDetainee}
    onDone={() => setEditingDetainee(null)}
    sessionId={sessionCtx.sessionId}
    sessionCode={sessionCtx.sessionCode}
    sessionReadOnly={sessionCtx.sessionReadOnly}
    onSavedInSession={doneSessionCapture}
  />
)}
```

Lưu ý: nếu Dashboard hiện dùng object map hoặc switch để render, adapt tương ứng — thêm 3 case: `sessions`, `sessions_detail`, `session_capture`.

- [ ] **Step 8: Kiểm tra build frontend**

Run: `cd frontend && npm run build 2>&1 | tail -30`
Expected: build succeeds.

- [ ] **Step 9: Smoke test manual end-to-end**

```bash
# Terminal 1
.venv/bin/uvicorn --app-dir backend main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2
cd frontend && npm run dev
```

Mở http://localhost:5173 và làm theo:
1. Login admin/admin123
2. Click sidebar "Phiên làm việc" → thấy trang trống với "+ Mở phiên mới"
3. Click "+ Mở phiên mới" → điền địa điểm "Test" → "Mở phiên"
4. Nhảy sang trang chi tiết phiên có mã S...-0001
5. Click "+ Thêm hồ sơ mới" → điền form + upload ảnh CCCD → "Lưu"
6. Quay về trang phiên có 1 hồ sơ
7. Click "Đóng phiên" → xác nhận → Excel tự động tải về
8. Trang tự reload, phiên có badge "✓ Đã đóng", nút "⬇ Tải báo cáo Excel"
9. Click sidebar "Thu nhận dữ liệu" → alert "Cần mở phiên..." → nhảy về SessionListPage
10. Mở phiên mới, sang tab khác, quay lại "Thu nhận dữ liệu" → phải vào detail của phiên đang mở

Expected: 10/10 bước OK.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/Dashboard.jsx
git commit -m "$(cat <<'EOF'
feat(frontend): wire Dashboard cho session flow

- Sidebar thêm nav "Phiên làm việc" (icon clipboard)
- Route mới: sessions (list), sessions_detail (một phiên), session_capture (form gắn session)
- Guard "Thu nhận dữ liệu": redirect sang SessionListPage nếu chưa có phiên open
- Sau khi lưu detainee trong phiên: quay về SessionDetailPage
- Đóng phiên → auto download Excel → reload UI

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Q1-Q8 (spec section 2): tất cả có task tương ứng. ✓
- Data model `work_sessions` (spec 3.1): Task 1. ✓
- `detainees.session_id` (spec 3.2): Task 2. ✓
- Counter (spec 3.3): Task 1 (`_next_session_code`). ✓
- Index (spec 3.4): **NOT covered** — spec đề cập `work_sessions.status`, `officer`, `code (unique)`, `opened_at`, `detainees.session_id`. Bổ sung ở Task 1 nếu muốn tối ưu (không critical cho MVP với dataset nhỏ). Note vào plan để implementer biết.
- State machine (spec 4): Task 1 (open) + Task 3 (closed). ✓
- Ràng buộc (spec 5): Task 2 (ensure_session_editable, create/update/delete detainee), Task 3 (close, delete session). ✓
- API surface (spec 6): 8/8 endpoints — Task 1 (open/list/current), Task 2 (detail + POST detainee), Task 3 (close/report/DELETE). ✓
- Excel format (spec 6.3): Task 3 (`_build_session_report_xlsx`). ✓
- UX màn hình (spec 7): Task 5 (modal), 6 (list), 7 (detail), 8 (data capture), 9 (dashboard wiring). ✓
- Edge cases F5/logout (spec 7.6): Task 9 xử lý qua `api.getCurrentSession`. ✓
- Out of scope (spec 9): dongle, PDF, auto-close, chữ ký số — không đụng. ✓

**Placeholder scan:** không có TBD/TODO. Mọi step đều có code block hoặc command cụ thể. ✓

**Type consistency:**
- `WorkSessionIn` → dùng nhất quán ở Task 1, 2, 3 ✓
- `_ensure_session_editable(session_doc, username, is_admin)` — signature đồng nhất Task 2 và Task 3 ✓
- Props DataCapturePage: `sessionId/sessionCode/sessionReadOnly/onSavedInSession` — Task 8 định nghĩa, Task 9 truyền ✓
- api methods: `listSessions/getCurrentSession/createSession/getSession/closeSession/deleteSession/downloadSessionReport` — nhất quán Task 4-9 ✓

**Note bổ sung (không blocking):**
- Indexes cho `work_sessions` (spec 3.4) chưa có step riêng — có thể thêm 1-2 dòng vào `_ensure_indexes` trong `backend/main.py`, hoặc bỏ qua cho MVP. Nếu implementer muốn thêm, chèn vào Task 1 Step 8 sau khi thêm route:
  ```python
  await db.work_sessions.create_index("status")
  await db.work_sessions.create_index("officer")
  await db.work_sessions.create_index("code", unique=True)
  await db.work_sessions.create_index([("opened_at", -1)])
  await db.detainees.create_index("session_id")
  ```
  Nên thêm vì query list sessions filter theo status + officer + sort opened_at là hot path.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-13-work-session-flow.md`.**

Có 2 lựa chọn cách thực thi:

1. **Subagent-Driven (khuyến nghị)** — mỗi task 1 subagent tươi, review giữa các task, iterate nhanh. Dùng superpowers:subagent-driven-development.

2. **Inline Execution** — chạy các task trong session hiện tại, batch với checkpoint review. Dùng superpowers:executing-plans.

Bạn muốn cách nào?
