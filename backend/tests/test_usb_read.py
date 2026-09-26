"""Test cho 2 endpoint ĐỌC USB mới thêm ở services/usb_service/api.py.

Máy chạy test không có USB thật, nên `_list_usb_drives` được thay bằng một thư mục
tạm. Nhờ vậy vẫn kiểm được đúng phần dễ sai: lọc theo đuôi file, chặn tên file
thoát thư mục, và chặn drive không nằm trong danh sách USB hiện có.
"""
import hashlib
import hmac
import importlib
import os
import time

import pytest

# usb_service/api.py raise SystemExit ngay lúc import nếu thiếu DONGLE_SECRET,
# nên phải đặt trước khi import.
os.environ.setdefault("DONGLE_SECRET", "secret-dung-cho-test")

usb = importlib.import_module("services.usb_service.api")

SECRET = usb.DONGLE_SECRET


@pytest.fixture
def usb_dir(tmp_path, monkeypatch):
    """Một 'USB' rỗng + trỏ _list_usb_drives về đó."""
    monkeypatch.setattr(usb, "_list_usb_drives", lambda: [str(tmp_path)])
    return tmp_path


def _client():
    from fastapi.testclient import TestClient
    return TestClient(usb.app)


def _touch(path, data=b"noi dung"):
    path.write_bytes(data)
    return path


# ---------------------------------------------------------------------------
# list-files
# ---------------------------------------------------------------------------

def test_list_files_chi_tra_file_dung_duoi(usb_dir):
    _touch(usb_dir / "goi-a.vcpkg", b"a")
    _touch(usb_dir / "goi-b.vcpkg", b"bb")
    _touch(usb_dir / "bang-kem.xlsx", b"x")
    _touch(usb_dir / "ghi-chu.txt", b"t")

    r = _client().get("/api/usb/list-files", params={"drive": str(usb_dir)})
    assert r.status_code == 200
    names = [f["name"] for f in r.json()["files"]]
    assert sorted(names) == ["goi-a.vcpkg", "goi-b.vcpkg"]


def test_list_files_moi_nhat_truoc(usb_dir):
    old = _touch(usb_dir / "cu.vcpkg", b"a")
    new = _touch(usb_dir / "moi.vcpkg", b"b")
    os.utime(old, (time.time() - 1000, time.time() - 1000))

    files = _client().get("/api/usb/list-files", params={"drive": str(usb_dir)}).json()["files"]
    assert [f["name"] for f in files] == ["moi.vcpkg", "cu.vcpkg"]
    assert files[0]["bytes"] == 1


def test_list_files_bo_qua_file_an_va_thu_muc(usb_dir):
    _touch(usb_dir / ".an.vcpkg", b"a")
    (usb_dir / "thu-muc.vcpkg").mkdir()

    files = _client().get("/api/usb/list-files", params={"drive": str(usb_dir)}).json()["files"]
    assert files == []


def test_list_files_doi_duoi_khac(usb_dir):
    _touch(usb_dir / "a.vcpkg", b"a")
    _touch(usb_dir / "b.xlsx", b"b")

    files = _client().get(
        "/api/usb/list-files", params={"drive": str(usb_dir), "ext": "xlsx"}
    ).json()["files"]
    assert [f["name"] for f in files] == ["b.xlsx"]


def test_list_files_drive_khong_cam_thi_bao_loi(usb_dir):
    r = _client().get("/api/usb/list-files", params={"drive": "/media/khong-ton-tai"})
    assert r.status_code == 400


def test_list_files_drive_la_dongle_thi_bao_loi(usb_dir):
    _make_dongle(usb_dir)
    r = _client().get("/api/usb/list-files", params={"drive": str(usb_dir)})
    assert r.status_code == 400
    assert "dongle" in r.json()["detail"]


# ---------------------------------------------------------------------------
# read-file
# ---------------------------------------------------------------------------

def test_read_file_tra_dung_noi_dung(usb_dir):
    payload = b"day la ruot goi dong bo" * 100
    _touch(usb_dir / "goi.vcpkg", payload)

    r = _client().get("/api/usb/read-file", params={"drive": str(usb_dir), "name": "goi.vcpkg"})
    assert r.status_code == 200
    assert r.content == payload


@pytest.mark.parametrize(
    "name",
    ["../cccd_dongle.key", "../../etc/passwd", "..%2Fetc", "thu-muc/../x.vcpkg"],
)
def test_read_file_chan_thoat_thu_muc(usb_dir, name):
    # Tao file ngoai thu muc USB de chac chan no khong bi doc ra.
    (usb_dir.parent / "bi-mat.vcpkg").write_bytes(b"khong duoc doc")

    r = _client().get("/api/usb/read-file", params={"drive": str(usb_dir), "name": name})
    assert r.status_code == 400, r.status_code


def test_read_file_khong_ton_tai_thi_404(usb_dir):
    r = _client().get("/api/usb/read-file", params={"drive": str(usb_dir), "name": "khong-co.vcpkg"})
    assert r.status_code == 404


def test_read_file_ten_bi_bam_thanh_ten_khac_thi_tu_choi(usb_dir):
    # "goi vcpkg" (co dau cach) bi sanitize thanh "goi_vcpkg" -> ten KHAC ten yeu cau.
    # Tu sua roi doc file khac la hanh vi nguy hiem, phai tu choi han.
    _touch(usb_dir / "goi_vcpkg")
    r = _client().get("/api/usb/read-file", params={"drive": str(usb_dir), "name": "goi vcpkg"})
    assert r.status_code == 400


def test_read_file_drive_la_dongle_thi_bao_loi(usb_dir):
    _make_dongle(usb_dir)
    r = _client().get("/api/usb/read-file", params={"drive": str(usb_dir), "name": "a.vcpkg"})
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# save-export van phai duoc chan nhu truoc (da tach _require_writable_drive)
# ---------------------------------------------------------------------------

def test_save_export_chan_drive_la(usb_dir):
    r = _client().post(
        "/api/usb/save-export",
        data={"drive": "/media/khong-co"},
        files={"file": ("a.xlsx", b"x")},
    )
    assert r.status_code == 400


def test_save_export_ghi_duoc_file(usb_dir):
    r = _client().post(
        "/api/usb/save-export",
        data={"drive": str(usb_dir)},
        files={"file": ("bang-kem.xlsx", b"noi dung that")},
    )
    assert r.status_code == 200
    assert (usb_dir / "bang-kem.xlsx").read_bytes() == b"noi dung that"


def test_save_export_them_hau_to_khi_trung_ten(usb_dir):
    _touch(usb_dir / "bang-kem.xlsx", b"ban cu")
    _client().post(
        "/api/usb/save-export",
        data={"drive": str(usb_dir)},
        files={"file": ("bang-kem.xlsx", b"ban moi")},
    )
    assert (usb_dir / "bang-kem.xlsx").read_bytes() == b"ban cu"
    assert (usb_dir / "bang-kem_1.xlsx").read_bytes() == b"ban moi"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _make_dongle(drive):
    """Tao file .key hop le de drive bi coi la dongle.

    Khong ghi `volume_serial` trong payload: _read_key_file chi kiem serial khi
    payload CO truong do, ma tren may test khong lay duoc serial cua thu muc.
    """
    payload = b'{"org":"CAND","nonce":"test"}'
    sig = hmac.new(SECRET, payload, hashlib.sha256).hexdigest().encode("ascii")
    (drive / usb.KEY_FILENAME).write_bytes(payload + usb.KEY_SEPARATOR + sig)
