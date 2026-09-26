"""Test cho services/sync_package.py — thuần tuý, không cần Mongo, không cần USB.

Chạy: pytest -q   (từ gốc repo; pytest.ini đã trỏ testpaths + pythonpath)

Mấu chốt của bộ test này là mỗi test hỏng phải rơi ĐÚNG vào một bước, vì giao diện
hiển thị tiến trình theo bước — "gói hỏng" chung chung thì người dùng không biết
đường nào mà sửa (cắm lại USB? xin gói mới? hay máy sai khoá?).
"""
import io
import json
import zipfile
from datetime import datetime, timezone

import pytest

from services import sync_package as sp

SECRET = b"khoa-thu-nghiem-cho-test"
OTHER_SECRET = b"khoa-khac-hoan-toan"


# ---------------------------------------------------------------------------
# Dựng dữ liệu mẫu
# ---------------------------------------------------------------------------

def _detainee(**over):
    doc = {
        "id": "6ab5e72e1bc5752f79cf2a92",
        "code": "CP00001",
        "personal_id": "HS001",
        "full_name": "Nguyễn Thị Quân",
        "cccd_number": "955705423785",
        "gender": "female",
        "photos": {},
    }
    doc.update(over)
    return doc


def _session(**over):
    doc = {"id": "6ab5da5cb873e15564f759ae", "code": "S20260925-0001", "status": "open"}
    doc.update(over)
    return doc


class FakeDisk:
    """Giả lập thư mục uploads: url -> bytes."""

    def __init__(self, mapping=None):
        self.mapping = dict(mapping or {})

    def read(self, url):
        return self.mapping.get(url)


def _build(detainees=None, sessions=None, disk=None, secret=SECRET):
    return sp.build_package(
        secret=secret,
        sessions=sessions if sessions is not None else [_session()],
        detainees=detainees if detainees is not None else [_detainee()],
        read_upload=(disk or FakeDisk()).read,
        source={"device": "may-test"},
        created_at=datetime(2026, 9, 26, 10, 30, 0, tzinfo=timezone.utc),
    )


def _craft_zip(files: dict, manifest: dict) -> bytes:
    """Dựng ruột ZIP tuỳ ý để test các nhánh mà build_package không tạo ra được."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, payload in files.items():
            zf.writestr(path, payload)
        zf.writestr("manifest.json", json.dumps(manifest).encode("utf-8"))
    return buf.getvalue()


def _manifest_for(files: dict, version=sp.SCHEMA_VERSION) -> dict:
    return {
        "schema_version": version,
        "created_at": "2026-09-26T10:30:00+00:00",
        "source": {},
        "session_codes": ["S20260925-0001"],
        "counts": {},
        "files": [
            {"path": p, "sha256": sp._sha256_hex(d), "bytes": len(d)}
            for p, d in files.items()
        ],
    }


# ---------------------------------------------------------------------------
# Đường hạnh phúc
# ---------------------------------------------------------------------------

def test_roundtrip_tra_ve_dung_du_lieu():
    photo = b"\x89PNG\r\n\x1a\n" + b"anh-gia"
    doc = _detainee(photos={"portrait_front": "/uploads/detainees/HS001/a.png"})
    disk = FakeDisk({"/uploads/detainees/HS001/a.png": photo})

    raw, filename = _build(detainees=[doc], disk=disk)
    parsed = sp.parse_package(raw, SECRET)

    assert filename == "sync_S20260925-0001_20260926-103000.vcpkg"
    assert len(parsed.sessions) == 1
    assert len(parsed.detainees) == 1
    assert parsed.detainees[0]["full_name"] == "Nguyễn Thị Quân"
    assert parsed.counts["detainees"] == 1
    # Ảnh nhúng kèm và URL trong bản ghi đã đổi sang dạng pkgfiles/...
    assert parsed.detainees[0]["photos"]["portrait_front"] == "pkgfiles/HS001/a.png"
    assert parsed.files["pkgfiles/HS001/a.png"] == photo
    assert parsed.counts["files"] == 1


def test_anh_mat_tren_dia_thi_giu_nguyen_url():
    # File đã bị xoá khỏi uploads: hồ sơ vẫn phải đi được, chỉ thiếu ảnh.
    doc = _detainee(photos={"portrait_front": "/uploads/detainees/HS001/mat-roi.png"})
    raw, _ = _build(detainees=[doc], disk=FakeDisk())
    parsed = sp.parse_package(raw, SECRET)

    assert parsed.detainees[0]["photos"]["portrait_front"] == "/uploads/detainees/HS001/mat-roi.png"
    assert parsed.files == {}


def test_hai_ho_so_dung_chung_mot_anh_chi_nhung_mot_lan():
    url = "/uploads/detainees/HS001/chung.png"
    disk = FakeDisk({url: b"x" * 10})
    docs = [
        _detainee(id="1", personal_id="HS001", photos={"portrait_front": url}),
        _detainee(id="2", personal_id="HS002", photos={"portrait_front": url}),
    ]
    raw, _ = _build(detainees=docs, disk=disk)
    parsed = sp.parse_package(raw, SECRET)

    assert [f["path"] for f in parsed.manifest["files"] if f["path"].startswith(sp.PKG_URL_PREFIX)] == [
        "pkgfiles/HS001/chung.png"
    ]


def test_moi_goi_mot_salt_nonce_nen_ciphertext_khac_nhau():
    a, _ = _build()
    b, _ = _build()
    assert a != b, "cùng dữ liệu mà ra cùng ciphertext => salt/nonce bị cố định"
    # Nhưng vẫn mở được bằng cùng khoá.
    assert sp.parse_package(a, SECRET).detainees == sp.parse_package(b, SECRET).detainees


def test_peek_manifest_khong_doc_file_nhung():
    photo = b"y" * 5000
    doc = _detainee(photos={"portrait_front": "/uploads/detainees/HS001/b.png"})
    raw, _ = _build(detainees=[doc], disk=FakeDisk({"/uploads/detainees/HS001/b.png": photo}))

    manifest = sp.peek_manifest(raw, SECRET)
    assert manifest["schema_version"] == sp.SCHEMA_VERSION
    assert manifest["counts"]["files"] == 1
    assert len(manifest["files"]) == 3  # 2 file data + 1 ảnh


# ---------------------------------------------------------------------------
# Từng bước hỏng
# ---------------------------------------------------------------------------

def test_file_khong_phai_goi_thi_bao_format():
    with pytest.raises(sp.PackageError) as e:
        sp.parse_package(b"day chi la file text binh thuong", SECRET)
    assert e.value.step == sp.STEP_FORMAT


def test_file_rong_thi_bao_format():
    with pytest.raises(sp.PackageError) as e:
        sp.parse_package(b"", SECRET)
    assert e.value.step == sp.STEP_FORMAT


def test_sai_khoa_thi_bao_decrypt():
    raw, _ = _build()
    with pytest.raises(sp.PackageError) as e:
        sp.parse_package(raw, OTHER_SECRET)
    assert e.value.step == sp.STEP_DECRYPT


def test_sua_mot_byte_trong_ciphertext_thi_bao_decrypt():
    raw, _ = _build()
    idx = raw.find(b"\n") + 20          # nằm trong phần ciphertext
    tampered = raw[:idx] + bytes([raw[idx] ^ 0x01]) + raw[idx + 1:]
    with pytest.raises(sp.PackageError) as e:
        sp.parse_package(tampered, SECRET)
    assert e.value.step == sp.STEP_DECRYPT


def test_sua_header_thi_bao_decrypt_vi_header_nam_trong_aad():
    raw, _ = _build()
    tampered = raw.replace(b'"kdf":"HKDF-SHA256"', b'"kdf":"HKDF-SHA512"')
    assert tampered != raw
    # alg/kdf la thi bi chan ngay o read_header -> FORMAT, truoc khi toi GCM.
    with pytest.raises(sp.PackageError) as e:
        sp.parse_package(tampered, SECRET)
    assert e.value.step == sp.STEP_FORMAT


def test_sua_ruot_goi_thi_bao_checksum():
    data = b'[{"id":"1"}]'
    files = {"data/detainees.json": data, "data/sessions.json": b"[]"}
    manifest = _manifest_for(files)
    manifest["files"][0]["sha256"] = "0" * 64        # sha ghi sai
    raw = sp.seal(_craft_zip(files, manifest), SECRET)

    with pytest.raises(sp.PackageError) as e:
        sp.parse_package(raw, SECRET)
    assert e.value.step == sp.STEP_CHECKSUM
    assert "data/detainees.json" in e.value.message


def test_goi_thieu_file_nhung_thi_bao_checksum():
    files = {"data/detainees.json": b"[]", "data/sessions.json": b"[]"}
    manifest = _manifest_for(files)
    manifest["files"].append({"path": "pkgfiles/HS001/mat.png", "sha256": "a" * 64, "bytes": 3})
    raw = sp.seal(_craft_zip(files, manifest), SECRET)

    with pytest.raises(sp.PackageError) as e:
        sp.parse_package(raw, SECRET)
    assert e.value.step == sp.STEP_CHECKSUM


def test_phien_ban_moi_hon_thi_bao_version():
    files = {"data/detainees.json": b"[]", "data/sessions.json": b"[]"}
    raw = sp.seal(_craft_zip(files, _manifest_for(files, version=99)), SECRET)

    with pytest.raises(sp.PackageError) as e:
        sp.parse_package(raw, SECRET)
    assert e.value.step == sp.STEP_VERSION
    assert "99" in e.value.message


def test_thieu_manifest_thi_bao_manifest():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("data/detainees.json", b"[]")
    raw = sp.seal(buf.getvalue(), SECRET)

    with pytest.raises(sp.PackageError) as e:
        sp.parse_package(raw, SECRET)
    assert e.value.step == sp.STEP_MANIFEST


def test_ruot_khong_phai_zip_thi_bao_format():
    raw = sp.seal(b"khong phai zip", SECRET)
    with pytest.raises(sp.PackageError) as e:
        sp.parse_package(raw, SECRET)
    assert e.value.step == sp.STEP_FORMAT


def test_thieu_file_du_lieu_thi_bao_format():
    files = {"data/sessions.json": b"[]"}       # thieu detainees.json
    raw = sp.seal(_craft_zip(files, _manifest_for(files)), SECRET)
    with pytest.raises(sp.PackageError) as e:
        sp.parse_package(raw, SECRET)
    assert e.value.step == sp.STEP_FORMAT


# ---------------------------------------------------------------------------
# Kiểm cấu trúc bản ghi
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "doc, mo_ta",
    [
        ({"full_name": "Thiếu id"}, "thiếu id"),
        ({"id": "1", "cccd_number": "123"}, "CCCD không đủ 12 số"),
        ({"id": "1", "cccd_number": "95570542378a"}, "CCCD có chữ"),
    ],
)
def test_ban_ghi_sai_thi_bao_schema(doc, mo_ta):
    files = {
        "data/detainees.json": json.dumps([doc]).encode("utf-8"),
        "data/sessions.json": b"[]",
    }
    raw = sp.seal(_craft_zip(files, _manifest_for(files)), SECRET)

    with pytest.raises(sp.PackageError) as e:
        sp.parse_package(raw, SECRET)
    assert e.value.step == sp.STEP_SCHEMA, mo_ta


def test_cccd_de_trong_van_hop_le():
    # require_capture_fields chỉ bắt buộc CCCD lúc THU NHẬN; hồ sơ cũ thiếu thì
    # vẫn phải đồng bộ được, nếu không gói không bao giờ gửi được.
    raw, _ = _build(detainees=[_detainee(cccd_number=None)])
    assert sp.parse_package(raw, SECRET).detainees[0]["cccd_number"] is None


# ---------------------------------------------------------------------------
# An toàn đường dẫn
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "raw_pid, mong_doi",
    [
        ("../../etc/passwd", "etc_passwd"),
        ("..\\..\\windows", "windows"),
        ("HS 001/../x", "HS_001_x"),
        ("", "unnamed"),
        ("...", "unnamed"),
    ],
)
def test_safe_pid_chan_thoat_thu_muc(raw_pid, mong_doi):
    assert sp.safe_pid(raw_pid) == mong_doi


def test_personal_id_doc_hai_chi_ghi_trong_thu_muc_files():
    doc = _detainee(personal_id="../../etc", photos={"portrait_front": "/uploads/x/p.png"})
    raw, _ = _build(detainees=[doc], disk=FakeDisk({"/uploads/x/p.png": b"z"}))
    parsed = sp.parse_package(raw, SECRET)

    for path in parsed.files:
        assert path.startswith(sp.PKG_URL_PREFIX)
        assert ".." not in path


@pytest.mark.parametrize(
    "raw_name, mong_doi",
    [
        ("a.png", "a.png"),
        ("anh-chan-dung.PNG", "anh-chan-dung.PNG"),
        ("noext", "noext"),
        ("../../etc/passwd", "passwd"),
        (".hidden", "hidden"),
        ("a.tar.gz", "a.tar.gz"),
    ],
)
def test_safe_filename(raw_name, mong_doi):
    assert sp.safe_filename(raw_name) == mong_doi


def test_safe_filename_dai_qua_thi_giu_duoi():
    # Mất đuôi file là StaticFiles trả sai content-type, ảnh không hiện.
    out = sp.safe_filename("x" * 90 + ".jpg")
    assert out.endswith(".jpg")
    assert len(out) <= 68


def test_inner_path_for_tach_hai_url_cung_ten():
    # Hai thư mục khác nhau, cùng tên file -> phải ra 2 đường dẫn khác nhau, nếu
    # không file sau ghi đè file trước và hồ sơ này nhận ảnh của hồ sơ kia.
    a = sp.inner_path_for("/uploads/detainees/HS001/anh.png", set())
    b = sp.inner_path_for("/uploads/detainees/HS002/anh.png", {a})
    assert a != b
    # Tất định: gọi lại cho ra đúng kết quả cũ.
    assert sp.inner_path_for("/uploads/detainees/HS002/anh.png", {a}) == b
    assert sp.inner_path_for("/uploads/detainees/HS001/anh.png", set()) == a
