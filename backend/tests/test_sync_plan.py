"""Test cho `_build_plan` — phần quyết định ghi gì khi nhận gói đồng bộ.

Không cần Mongo: `_build_plan` chỉ chạm DB qua `_find_session` / `_find_detainee`,
nên thay hai hàm đó là kiểm được toàn bộ logic phân loại new/update/skip mà không
phải dựng database.

Test đáng giá nhất ở đây là `test_moi_op_ghi_duoc_deu_co_prepared`: bản đầu của
`_build_plan` chỉ gắn `op["prepared"]` khi `mapping` khác rỗng, nên gói KHÔNG nhúng
file nào (hồ sơ không có ảnh — trường hợp bình thường) làm `apply_package` ném
KeyError('prepared') ngay khi gói đầu tiên thực sự cần ghi. Lỗi này lọt qua 30
assertion E2E vì gói dùng lúc đó tình cờ có ảnh.
"""
import asyncio

import pytest

import routers.sync as sync
from services.sync_package import ParsedPackage, SCHEMA_VERSION


def _plan(detainees, sessions=(), *, mapping, found=None):
    """Chạy _build_plan với DB gia: `found` là map khoá -> bản ghi đã có trên máy."""
    found = found or {}
    parsed = ParsedPackage(manifest={"schema_version": SCHEMA_VERSION}, sessions=list(sessions),
                           detainees=list(detainees))

    async def fake_find_session(doc):
        return found.get(("sessions", doc.get("id")))

    async def fake_find_detainee(doc):
        entry = found.get(("detainees", doc.get("id")))
        if isinstance(entry, tuple):
            return entry
        return entry, "personal_id"

    orig_s, orig_d = sync._find_session, sync._find_detainee
    sync._find_session, sync._find_detainee = fake_find_session, fake_find_detainee
    try:
        return asyncio.run(sync._build_plan(parsed, mapping))
    finally:
        sync._find_session, sync._find_detainee = orig_s, orig_d


def _det(pid, **kw):
    return {"id": pid, "personal_id": pid, "cccd_number": kw.pop("cccd_number", ""), **kw}


# ---------------------------------------------------------------------------
# prepared — bất biến mà apply_package dựa vào
# ---------------------------------------------------------------------------

def test_moi_op_ghi_duoc_deu_co_prepared():
    ops, _ = _plan([_det("HS001"), _det("HS002")], mapping={})
    assert ops, "phai co op"
    for op in ops:
        assert op["action"] != "skip"
        assert "prepared" in op, "apply_package doc op['prepared'] -> thieu la KeyError"
        assert op["prepared"]["personal_id"] == op["doc"]["personal_id"]


def test_mapping_rong_van_giu_nguyen_url_anh():
    doc = _det("HS001", photos={"portrait_front": "/uploads/tmp/a.jpg"})
    ops, _ = _plan([doc], mapping={})
    assert ops[0]["prepared"]["photos"] == {"portrait_front": "/uploads/tmp/a.jpg"}


def test_mapping_co_file_thi_doi_url_sang_duong_dan_that():
    doc = _det("HS001", photos={"portrait_front": "pkgfiles/HS001/a.jpg"})
    ops, _ = _plan([doc], mapping={"pkgfiles/HS001/a.jpg": "/uploads/detainees/HS001/a.jpg"})
    assert ops[0]["prepared"]["photos"]["portrait_front"] == "/uploads/detainees/HS001/a.jpg"


def test_validate_khong_dung_prepared():
    # mapping=None la loi goi cua validate: chi phan loai, khong dung gi de ghi.
    ops, _ = _plan([_det("HS001")], mapping=None)
    assert all("prepared" not in op for op in ops)


# ---------------------------------------------------------------------------
# Phân loại
# ---------------------------------------------------------------------------

def test_ho_so_chua_co_thi_them_moi():
    ops, summary = _plan([_det("HS001")], mapping={})
    assert ops[0]["action"] == "insert"
    assert summary["detainees"]["new"] == 1


def test_ho_so_khop_personal_id_va_ban_may_moi_hon_thi_bo_qua():
    existing = {"_id": "id-cu", "personal_id": "HS001", "updated_at": "2026-09-26T10:00:00"}
    doc = _det("HS001", updated_at="2026-09-20T10:00:00")
    ops, summary = _plan([doc], mapping={}, found={("detainees", "HS001"): existing})
    assert ops[0]["action"] == "skip"
    assert "mới hơn" in ops[0]["reason"]
    assert summary["detainees"]["skip"] == 1


def test_ho_so_khop_personal_id_va_goi_moi_hon_thi_cap_nhat():
    existing = {"_id": "id-cu", "personal_id": "HS001", "updated_at": "2026-09-01T10:00:00"}
    doc = _det("HS001", updated_at="2026-09-20T10:00:00")
    ops, summary = _plan([doc], mapping={}, found={("detainees", "HS001"): existing})
    assert ops[0]["action"] == "update"
    assert ops[0]["prepared"]["_id"] == "id-cu", "phai giu _id local, khong tao ban ghi thu hai"
    assert summary["detainees"]["update"] == 1


def test_khop_cccd_nhung_khac_ma_ho_so_thi_bo_qua_va_bao_xung_dot():
    existing = {"_id": "id-cu", "personal_id": "HS999", "cccd_number": "012345678901"}
    doc = _det("HS001", cccd_number="012345678901")
    ops, summary = _plan([doc], mapping={}, found={("detainees", "HS001"): (existing, "cccd_number")})
    assert ops[0]["action"] == "skip"
    assert "CCCD" in ops[0]["reason"]
    assert summary["detainees"]["skip"] == 1


def test_phien_da_co_thi_khong_ghi_de():
    existing = {"_id": "s-cu", "code": "S20260925-0001"}
    doc = {"id": "x", "code": "S20260925-0001", "officer": "admin"}
    ops, summary = _plan([], sessions=[doc], mapping={}, found={("sessions", "x"): existing})
    assert ops[0]["action"] == "skip"
    assert summary["sessions"]["skip"] == 1


def test_phien_chua_co_thi_them_moi():
    doc = {"id": "x", "code": "S20260925-0001", "officer": "admin"}
    ops, summary = _plan([], sessions=[doc], mapping={})
    assert ops[0]["action"] == "insert"
    assert summary["sessions"]["new"] == 1


def test_bo_qua_thi_khong_co_prepared():
    existing = {"_id": "id-cu", "personal_id": "HS001", "updated_at": "2026-09-26T10:00:00"}
    doc = _det("HS001", updated_at="2026-09-20T10:00:00")
    ops, _ = _plan([doc], mapping={}, found={("detainees", "HS001"): existing})
    assert "prepared" not in ops[0]


def test_truong_chi_co_tren_may_nguon_khong_duoc_mang_sang():
    doc = _det("HS001", _fake_seed=True, photos={})
    ops, _ = _plan([doc], mapping={})
    prepared = ops[0]["prepared"]
    assert "_fake_seed" not in prepared
    assert "id" not in prepared


# ---------------------------------------------------------------------------
# Tên collection — bất biến "đọc ở đâu thì ghi ở đó"
# ---------------------------------------------------------------------------

class _Recorder:
    """DB giả: ghi lại tên collection bị chạm tới, luôn trả None (chưa có bản ghi)."""

    def __init__(self):
        self.read: set[str] = set()

    def _coll(self, name):
        self.read.add(name)

        class _C:
            async def find_one(self, query):
                return None

        return _C()

    def __getattr__(self, name):
        return self._coll(name)

    def __getitem__(self, name):
        return self._coll(name)


def _plan_with_real_finders(detainees, sessions=()):
    """Chạy `_build_plan` với `_find_session`/`_find_detainee` THẬT, chỉ giả DB."""
    db = _Recorder()
    orig = sync.database.db
    sync.database.db = db
    try:
        parsed = ParsedPackage(manifest={"schema_version": SCHEMA_VERSION},
                               sessions=list(sessions), detainees=list(detainees))
        ops, _ = asyncio.run(sync._build_plan(parsed, {}))
    finally:
        sync.database.db = orig
    return ops, db.read


def test_op_ghi_dung_collection_ma_buoc_tim_da_doc():
    """Bất biến: op ghi vào đúng collection mà `_find_*` vừa đọc.

    Bản đầu của `_build_plan` ghi phiên vào `"sessions"` trong khi `_find_session`
    đọc `work_sessions`. Nhập vẫn báo thành công nhưng phiên rơi vào collection
    không ai đọc, và lần nhập sau lại insert -> trùng `_id`. Test này bắt được cả
    hai vế vì nó so tên ghi với tên đọc, không so với một hằng số chép tay.
    """
    ops, read = _plan_with_real_finders(
        [_det("HS001")],
        sessions=[{"id": "x", "code": "S20260925-0001", "officer": "admin"}],
    )
    assert read == {"work_sessions", "detainees"}
    assert {op["coll"] for op in ops} <= read


def test_ten_collection_phien_khop_voi_router_sessions():
    """Chốt tên collection theo router đang sửa dữ liệu thật, không theo trí nhớ."""
    import inspect

    import routers.sessions as sessions_router

    src = inspect.getsource(sessions_router)
    assert f"db.{sync.SESSIONS_COLL}" in src
    assert f"db.{sync.DETAINEES_COLL}" in src
