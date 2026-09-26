"""Đóng gói / mở gói dữ liệu đồng bộ để mang qua USB.

Module này CỐ TÌNH không import `database`, không import FastAPI — mọi thứ vào ra
đều qua tham số. Nhờ vậy test được thuần tuý (xem backend/tests/test_sync_package.py)
mà không cần Mongo, không cần cắm USB.

ĐỊNH DẠNG FILE (.vcpkg)
-----------------------
Ngoài cùng là 1 dòng header JSON (ĐỌC ĐƯỢC khi chưa có khoá) rồi tới ciphertext:

    {"magic":"VCPKG","v":1,"alg":"AES-256-GCM","kdf":"HKDF-SHA256","salt":"...","nonce":"..."}\\n
    <ciphertext + 16 byte GCM tag>

Header để dạng rõ vì cần biết gói thuộc định dạng/phiên bản nào TRƯỚC khi giải mã —
nếu không thì gói cũ gặp bản mới chỉ báo được "sai khoá hoặc hỏng", không phân biệt
được với "gói của phiên bản khác". Header được đưa vào AAD nên sửa nó là GCM fail.

Bên trong (sau khi giải mã) là 1 ZIP:

    manifest.json          schema_version, thời điểm, nguồn, danh sách file kèm sha256
    data/sessions.json     mảng work_session
    data/detainees.json    mảng hồ sơ (URL ảnh đã đổi sang dạng pkgfiles/...)
    pkgfiles/<thư mục>/<tên file>  ảnh, vân tay... nhúng kèm

Đường dẫn file nhúng và URL trong bản ghi DÙNG CHUNG một tiền tố `pkgfiles/` — cố ý,
để lúc import tra file chỉ là `files[url]`, không phải dịch qua lại giữa hai cách
đặt tên khác nhau.

VÌ SAO KHÔNG CÓ `manifest.sig` (HMAC riêng như bản thiết kế ban đầu)
--------------------------------------------------------------------
Bản thiết kế đầu có thêm 1 file HMAC-SHA256 ký manifest. Bỏ, vì khoá HMAC và khoá
mã hoá là CÙNG một khoá: ai sửa được ciphertext thì cũng tính lại được HMAC, nên nó
không thêm một chút bảo vệ nào. Thứ tự toàn vẹn đã do GCM tag đảm nhiệm (sửa 1 bit
bất kỳ ở header, nonce hay ciphertext đều làm giải mã thất bại). Cái còn thiếu và
THỰC SỰ có ích là biết file NÀO hỏng để báo cho người dùng — việc đó do
`files[].sha256` trong manifest lo, và chỉ kiểm được sau khi đã giải mã.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import re
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

# Phiên bản schema của GÓI (khác phiên bản app). Tăng khi cấu trúc manifest hoặc
# cấu trúc bản ghi thay đổi theo cách không tương thích ngược. Bản import chỉ nhận
# đúng version nó biết; gói cũ hơn phải có hàm migrate riêng, không đoán.
SCHEMA_VERSION = 1

MAGIC = "VCPKG"
ALG = "AES-256-GCM"
KDF = "HKDF-SHA256"
_HEADER_END = b"\n"
_NONCE_BYTES = 12
_SALT_BYTES = 16
_KEY_BYTES = 32
_GCM_TAG_BYTES = 16

# Tiền tố đánh dấu URL ảnh đã được nhúng kèm trong gói. Khi import, URL dạng này
# được giải nén ra /uploads/detainees/<pid>/<file> rồi đổi lại thành URL thường.
PKG_URL_PREFIX = "pkgfiles/"

EXPORT_RE = re.compile(r"^[A-Za-z0-9._-]+$")


class PackageError(Exception):
    """Gói không dùng được. `step` để UI hiện đúng bước nào hỏng."""

    def __init__(self, step: str, message: str):
        super().__init__(message)
        self.step = step
        self.message = message


# Tên bước — trùng với các bước trong modal tiến trình ở frontend.
STEP_FORMAT = "format"      # không phải gói / header hỏng
STEP_DECRYPT = "decrypt"    # sai khoá hoặc đã bị sửa
STEP_MANIFEST = "manifest"  # thiếu/không đọc được manifest
STEP_VERSION = "version"    # schema_version không hỗ trợ
STEP_CHECKSUM = "checksum"  # sha256 của 1 file không khớp
STEP_SCHEMA = "schema"      # bản ghi sai cấu trúc


# ---------------------------------------------------------------------------
# Khoá
# ---------------------------------------------------------------------------

def derive_key(secret: bytes, salt: bytes) -> bytes:
    """HKDF-SHA256(secret, salt) -> 32 byte khoá AES.

    Có salt ngẫu nhiên cho từng gói nên cùng một secret dùng cho nhiều gói vẫn cho
    ra các khoá khác nhau — không có hai gói nào dùng chung khoá/keystream.
    """
    if not secret:
        raise PackageError(STEP_DECRYPT, "Chưa cấu hình khoá gói đồng bộ.")
    return HKDF(
        algorithm=hashes.SHA256(),
        length=_KEY_BYTES,
        salt=salt,
        info=b"vali_canpham/sync-package/v1",
    ).derive(secret)


# ---------------------------------------------------------------------------
# Kết quả parse
# ---------------------------------------------------------------------------

@dataclass
class ParsedPackage:
    manifest: dict
    sessions: list[dict]
    detainees: list[dict]
    # đường dẫn trong gói -> nội dung file nhúng
    files: dict[str, bytes] = field(default_factory=dict)

    @property
    def counts(self) -> dict:
        return self.manifest.get("counts", {}) or {}


# ---------------------------------------------------------------------------
# Tiện ích
# ---------------------------------------------------------------------------

def _json_bytes(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_pid(value: str) -> str:
    """Chuẩn hoá personal_id thành 1 đoạn đường dẫn an toàn.

    Không dùng thẳng giá trị trong DB vì personal_id do người dùng nhập: một giá
    trị kiểu "../../etc" sẽ ghi file ra ngoài thư mục uploads khi giải nén.

    Chặn 2 lớp: mọi ký tự ngoài [A-Za-z0-9._-] (trong đó có "/" và "\\") thành "_",
    rồi gộp mọi dãy ".." và "__" — riêng "/" -> "_" là chưa đủ, "HS 001/../x" sẽ ra
    "HS_001_.._x", vẫn còn một dãy ".." nằm trong tên file.
    """
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value or "").strip())
    cleaned = re.sub(r"\.{2,}", "_", cleaned)
    cleaned = re.sub(r"_{2,}", "_", cleaned).strip("._")
    return cleaned[:64] or "unnamed"


def safe_filename(name: str) -> str:
    """Như safe_pid nhưng GIỮ phần mở rộng khi phải cắt ngắn.

    safe_pid cắt thẳng 64 ký tự nên tên file dài sẽ mất đuôi ".png"; StaticFiles
    phục vụ theo đuôi file, mất đuôi là ảnh trả về sai content-type.
    """
    base = os.path.basename(str(name or ""))
    stem, dot, ext = base.rpartition(".")
    # `stem` rỗng nghĩa là tên bắt đầu bằng dấu chấm (".hidden") — không phải có
    # phần mở rộng, nếu không sẽ ra "unnamed.hidden".
    if dot and stem and 0 < len(ext) <= 8:
        return f"{safe_pid(stem)}.{safe_pid(ext)}"
    return safe_pid(base)


def inner_path_for(url: str, taken) -> str:
    """Đường dẫn nhúng trong gói cho một URL /uploads/...

    Một URL luôn ra đúng một đường dẫn (hàm thuần, trừ phần chống trùng). Lấy tên
    thư mục từ CHÍNH URL chứ không từ personal_id của hồ sơ: hai hồ sơ dùng chung
    một ảnh thì phải ra cùng đường dẫn, nếu không ảnh bị nhúng 2 lần.
    """
    parts = [p for p in str(url).split("/") if p]
    name = safe_pid(parts[-1]) if parts else "file"
    owner = safe_pid(parts[-2]) if len(parts) >= 2 else "shared"
    candidate = f"{PKG_URL_PREFIX}{owner}/{name}"
    if candidate in taken:
        # Hai URL khác nhau cùng tên file trong cùng thư mục: thêm hash của URL để
        # tách, vẫn tất định nên chạy lại cho ra cùng kết quả.
        stem, dot, ext = name.rpartition(".")
        digest = hashlib.sha256(str(url).encode("utf-8")).hexdigest()[:6]
        candidate = f"{PKG_URL_PREFIX}{owner}/{stem or name}_{digest}{'.' + ext if dot else ''}"
    return candidate


def _collect_urls(node, out: list) -> None:
    """Gom mọi URL /uploads/... trong cấu trúc photos (dict/list/str, lồng nhau)."""
    if isinstance(node, str):
        if node.startswith("/uploads/"):
            out.append(node)
    elif isinstance(node, dict):
        for v in node.values():
            _collect_urls(v, out)
    elif isinstance(node, list):
        for v in node:
            _collect_urls(v, out)


def remap_urls(node, mapping: dict):
    """Thay URL theo bảng ánh xạ, giữ nguyên cấu trúc."""
    if isinstance(node, str):
        return mapping.get(node, node)
    if isinstance(node, dict):
        return {k: remap_urls(v, mapping) for k, v in node.items()}
    if isinstance(node, list):
        return [remap_urls(v, mapping) for v in node]
    return node


# ---------------------------------------------------------------------------
# BUILD
# ---------------------------------------------------------------------------

def build_package(
    *,
    secret: bytes,
    sessions: list[dict],
    detainees: list[dict],
    read_upload,           # (url) -> bytes | None
    source: dict | None = None,
    created_at: datetime | None = None,
) -> tuple[bytes, str]:
    """Đóng gói dữ liệu thành nội dung file .vcpkg.

    `read_upload` là hàm đồng bộ nhận URL kiểu "/uploads/..." trả về bytes (hoặc
    None nếu file không còn trên đĩa). Truyền vào thay vì tự đọc để module này
    không phụ thuộc config đường dẫn.

    Trả (nội dung file, tên file gợi ý).
    """
    zf_buf = io.BytesIO()
    embedded: list[dict] = []
    added: set[str] = set()   # đường dẫn đã ghi vào zip, để không nhúng trùng

    with zipfile.ZipFile(zf_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        def add(path: str, payload: bytes) -> None:
            zf.writestr(path, payload)
            added.add(path)
            embedded.append({"path": path, "sha256": _sha256_hex(payload), "bytes": len(payload)})

        add("data/sessions.json", _json_bytes(sessions))

        # Ảnh/vân tay: gom URL của TẤT CẢ hồ sơ trước, nhúng mỗi URL đúng một lần,
        # rồi mới thay URL trong từng bản ghi. Làm gộp-từng-hồ-sơ thì hai hồ sơ
        # dùng chung một ảnh sẽ nhúng ảnh đó hai lần, mà ảnh dùng lại là chuyện
        # thường (cùng một cán bộ scan, cùng một ảnh đối chiếu).
        all_urls: list[str] = []
        for doc in detainees:
            _collect_urls(doc.get("photos"), all_urls)

        mapping: dict[str, str] = {}
        for url in dict.fromkeys(all_urls):   # bỏ trùng, giữ thứ tự
            data = read_upload(url)
            if data is None:
                # File mất trên đĩa: giữ nguyên URL gốc. Hồ sơ vẫn đi được, chỉ
                # thiếu ảnh — im lặng bỏ qua sẽ làm gói thiếu mà không ai biết.
                continue
            inner = inner_path_for(url, set(mapping.values()))
            add(inner, data)
            mapping[url] = inner

        packaged = []
        for doc in detainees:
            doc = dict(doc)
            if mapping and doc.get("photos"):
                doc["photos"] = remap_urls(doc["photos"], mapping)
            packaged.append(doc)
        add("data/detainees.json", _json_bytes(packaged))

        manifest = {
            "schema_version": SCHEMA_VERSION,
            "created_at": (created_at or datetime.now(timezone.utc)).isoformat(),
            "source": source or {},
            "session_codes": sorted({s.get("code", "") for s in sessions if s.get("code")}),
            "counts": {
                "sessions": len(sessions),
                "detainees": len(packaged),
                "files": len([f for f in embedded if f["path"].startswith(PKG_URL_PREFIX)]),
            },
            "files": embedded,
        }
        # manifest ghi CUỐI nhưng phải là entry ĐẦU khi đọc; zip không bắt thứ tự
        # nên cứ ghi bình thường, bên parse tra theo tên.
        add("manifest.json", _json_bytes(manifest))

    plain = zf_buf.getvalue()
    filename = _suggest_filename(manifest, created_at)
    return seal(plain, secret), filename


def seal(plain: bytes, secret: bytes) -> bytes:
    """Bọc 1 ZIP đã dựng sẵn thành nội dung .vcpkg (header rõ + ciphertext).

    Tách khỏi build_package để test kiểm được nhánh checksum: muốn chạm bước
    "sha256 không khớp" thì phải sửa RUỘT gói rồi bọc lại, chứ sửa ciphertext chỉ
    làm GCM fail và dừng ở bước giải mã.
    """
    salt = os.urandom(_SALT_BYTES)
    nonce = os.urandom(_NONCE_BYTES)
    header = {
        "magic": MAGIC,
        "v": SCHEMA_VERSION,
        "alg": ALG,
        "kdf": KDF,
        "salt": base64.b64encode(salt).decode("ascii"),
        "nonce": base64.b64encode(nonce).decode("ascii"),
    }
    header_bytes = _json_bytes(header)
    cipher = AESGCM(derive_key(secret, salt)).encrypt(nonce, plain, header_bytes)
    return header_bytes + _HEADER_END + cipher


def _suggest_filename(manifest: dict, created_at: datetime | None) -> str:
    codes = manifest.get("session_codes") or []
    stamp = (created_at or datetime.now(timezone.utc)).strftime("%Y%m%d-%H%M%S")
    if not codes:
        return f"sync_all_{stamp}.vcpkg"
    if len(codes) == 1:
        stem = codes[0]
    else:
        stem = f"{codes[0]}_va_{len(codes) - 1}"
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem)
    return f"sync_{stem}_{stamp}.vcpkg"


# ---------------------------------------------------------------------------
# PARSE
# ---------------------------------------------------------------------------

def read_header(raw: bytes) -> dict:
    """Đọc header rõ của gói. Ném PackageError(STEP_FORMAT) nếu không phải gói."""
    if not raw:
        raise PackageError(STEP_FORMAT, "File rỗng.")
    idx = raw.find(_HEADER_END)
    if idx <= 0 or idx > 4096:
        raise PackageError(STEP_FORMAT, "Không phải gói dữ liệu đồng bộ (thiếu header).")
    try:
        header = json.loads(raw[:idx].decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise PackageError(STEP_FORMAT, "Header gói không đọc được.")
    if not isinstance(header, dict) or header.get("magic") != MAGIC:
        raise PackageError(STEP_FORMAT, "Không phải gói dữ liệu đồng bộ.")
    if header.get("alg") != ALG or header.get("kdf") != KDF:
        raise PackageError(STEP_FORMAT, f"Thuật toán gói không hỗ trợ: {header.get('alg')}.")
    return header


def peek_manifest(raw: bytes, secret: bytes) -> dict:
    """Đọc manifest mà không giải nén file nhúng.

    Dùng cho bước "kiểm tra hợp lệ" ở UI: cần biết gói chứa gì để hỏi người dùng
    trước khi ghi, nhưng chưa muốn đọc hết ảnh ra bộ nhớ.
    """
    header = read_header(raw)
    plain = _decrypt(raw, header, secret)
    with zipfile.ZipFile(io.BytesIO(plain)) as zf:
        return _load_manifest(zf, header)


def parse_package(raw: bytes, secret: bytes, *, verify_files: bool = True) -> ParsedPackage:
    """Giải mã + kiểm tra toàn vẹn + đọc dữ liệu. Ném PackageError ở bước hỏng đầu tiên."""
    header = read_header(raw)
    plain = _decrypt(raw, header, secret)

    try:
        zf = zipfile.ZipFile(io.BytesIO(plain))
    except zipfile.BadZipFile:
        raise PackageError(STEP_FORMAT, "Ruột gói hỏng (không mở được ZIP).")

    with zf:
        manifest = _load_manifest(zf, header)
        if verify_files:
            _verify_checksums(zf, manifest)

        try:
            sessions = json.loads(zf.read("data/sessions.json").decode("utf-8"))
            detainees = json.loads(zf.read("data/detainees.json").decode("utf-8"))
        except KeyError as e:
            raise PackageError(STEP_FORMAT, f"Gói thiếu file dữ liệu: {e}.")
        except (ValueError, UnicodeDecodeError):
            raise PackageError(STEP_FORMAT, "File dữ liệu trong gói không đọc được.")

        if not isinstance(sessions, list) or not isinstance(detainees, list):
            raise PackageError(STEP_SCHEMA, "Dữ liệu trong gói sai cấu trúc (phải là mảng).")

        files: dict[str, bytes] = {}
        for path in [
            f["path"]
            for f in manifest.get("files", [])
            if str(f.get("path", "")).startswith(PKG_URL_PREFIX)
        ]:
            try:
                files[path] = zf.read(path)
            except KeyError:
                raise PackageError(STEP_CHECKSUM, f"Gói thiếu file nhúng: {path}.")

    _validate_records(detainees)
    return ParsedPackage(manifest=manifest, sessions=sessions, detainees=detainees, files=files)


def _decrypt(raw: bytes, header: dict, secret: bytes) -> bytes:
    idx = raw.find(_HEADER_END)
    header_bytes = raw[:idx]
    body = raw[idx + len(_HEADER_END):]
    if len(body) <= _GCM_TAG_BYTES:
        raise PackageError(STEP_FORMAT, "Gói cụt (thiếu dữ liệu).")
    try:
        salt = base64.b64decode(header["salt"])
        nonce = base64.b64decode(header["nonce"])
    except (KeyError, ValueError):
        raise PackageError(STEP_FORMAT, "Header gói thiếu salt/nonce.")
    try:
        return AESGCM(derive_key(secret, salt)).decrypt(nonce, body, header_bytes)
    except InvalidTag:
        # GCM không phân biệt được "sai khoá" và "bị sửa", nên nói cả hai khả năng.
        raise PackageError(
            STEP_DECRYPT,
            "Không mở được gói: sai khoá đồng bộ hoặc gói đã bị sửa đổi.",
        )


def _load_manifest(zf: zipfile.ZipFile, header: dict) -> dict:
    try:
        manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
    except KeyError:
        raise PackageError(STEP_MANIFEST, "Gói thiếu manifest.json.")
    except (ValueError, UnicodeDecodeError):
        raise PackageError(STEP_MANIFEST, "manifest.json không đọc được.")
    if not isinstance(manifest, dict):
        raise PackageError(STEP_MANIFEST, "manifest.json sai cấu trúc.")

    version = manifest.get("schema_version")
    if version != SCHEMA_VERSION:
        raise PackageError(
            STEP_VERSION,
            f"Gói thuộc phiên bản {version}, phần mềm này chỉ đọc được phiên bản {SCHEMA_VERSION}.",
        )
    # header.v và manifest.schema_version phải khớp: header nằm ngoài vùng mã hoá
    # nên nếu chỉ tin header thì gói cũ gắn nhãn mới vẫn lọt qua bước version.
    if header.get("v") != version:
        raise PackageError(STEP_VERSION, "Header và manifest ghi phiên bản khác nhau.")
    return manifest


def _verify_checksums(zf: zipfile.ZipFile, manifest: dict) -> None:
    for entry in manifest.get("files", []):
        path = entry.get("path")
        if not path:
            continue
        try:
            data = zf.read(path)
        except KeyError:
            raise PackageError(STEP_CHECKSUM, f"Gói thiếu file: {path}.")
        if _sha256_hex(data) != entry.get("sha256"):
            raise PackageError(STEP_CHECKSUM, f"File trong gói bị hỏng: {path}.")
        if len(data) != entry.get("bytes"):
            raise PackageError(STEP_CHECKSUM, f"File trong gói sai kích thước: {path}.")


def _validate_records(detainees: list[dict]) -> None:
    """Kiểm tối thiểu những trường mà đường ghi DB chắc chắn cần.

    Không kiểm toàn bộ lược đồ: hồ sơ cũ thiếu trường là chuyện bình thường (xem
    require_capture_fields — chỉ 2 trường bắt buộc). Ở đây chỉ chặn loại gói sai
    cấu trúc làm hỏng DB, tức là kiểu dữ liệu và khoá định danh.
    """
    for i, doc in enumerate(detainees):
        if not isinstance(doc, dict):
            raise PackageError(STEP_SCHEMA, f"Hồ sơ thứ {i + 1} không phải object.")
        if not str(doc.get("id") or "").strip():
            raise PackageError(STEP_SCHEMA, f"Hồ sơ thứ {i + 1} thiếu id.")
        cccd = doc.get("cccd_number")
        if cccd not in (None, "") and not re.fullmatch(r"\d{12}", str(cccd)):
            raise PackageError(STEP_SCHEMA, f"Hồ sơ thứ {i + 1}: số CCCD không hợp lệ.")
