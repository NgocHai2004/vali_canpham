# -*- coding: utf-8 -*-
"""Hop thu scan: day ket qua OCR vao DUNG MOT form dang ky dang mo.

Khai niem khong trung voi "phien lam viec" (work_sessions). work_sessions tra
loi cho cau hoi "ho so nay LUU vao dau"; con o day can tra loi "ket qua scan
nay THUOC VE AI". Do do phai co mot session cap nhat-form rieng:

  frontend mo form dang ky MOI  -> POST /api/scan/capture/start  -> capture_id
  frontend giu form song        -> GET  /api/scan/session/{id}/wait  (long-poll)
  luu / huy / dong form         -> DELETE /api/scan/session/{id}
  service OCR quet xong 1 file  -> POST /api/scan/push  -> push() o day

Ba cua chan cua push(), Nghiem ngat theo yeu cau cua can bo su dung:
  1. file scan phai tra ra DUNG MOT doi tuong (mot HoSo);
  2. doi tuong ay phai la Chi ban (295) hoac Danh ban (204), co du 12 so CCCD;
  3. phai co DUNG MOT form dang mo va con song tai thoi diem do.
Thieu bat cu dieu kien nao -> tu choi kem ly do, KHONG git lai de chen sau. Mot
form mo sau khi file di qua roi thi khong duoc phep nhan du lieu cua file ay.

Ly do khong dung co che fan-out cccd_inject(): dau doc CCCD doc cho rieng tung
nguoi mot nen phat cho moi session dang mo la an toan; con mot lan quet co the
chứa nhieu ho so, va chen nham form cua mot pham khac la sai ho so.
"""
from __future__ import annotations

import asyncio
import re
import threading
import time
import uuid
from typing import Optional

# Mot form du coi la "dang mo" khi con long-poll trong khoang nay. Frontend doi
# 25 s moi lan wait(), nen 30 s du cho mot lan roi mang, va du ngan de tab chet
# khong con chen duoc vao nua.
ACTIVE_WINDOW = 30.0
# Session vua start() chua kip wait() lan dau: van tinh la dang mo, de ket qua
# scan den trong khoang ngan giua luc mo form va luc poll dau tien khong bi roi.
FRESH_WINDOW = 5.0

_POLL_INTERVAL = 0.5
# Form dang ky co the mo rat lau (van tay, anh, ma can pham). TTL chi de don
# tab chet khong kip gui DELETE; moi lan wait() duoc gia han nen form song
# khong bao gio bi don.
_SESSION_TTL = 900.0

# Ten mau ben OCR (app/templates.py) — giu nguyen chuoi, khong import qua OCR.
MAU_CHI_BAN = "chi_ban_295"
MAU_DANH_BAN = "danh_ban_204"
MAU_CHAP_NHAN = (MAU_CHI_BAN, MAU_DANH_BAN)

# Ly do tu choi, tra ve cho service OCR ghi log va cho health().
LY_DO_KHONG_DUNG_DOI_TUONG = "khong_dung_mot_doi_tuong"
LY_DO_KHONG_PHAI_CHI_DANH_BAN = "khong_phai_chi_hoac_danh_ban"
LY_DO_THIEU_CCCD = "thieu_cccd_12_so"
LY_DO_KHONG_DUNG_FORM = "khong_dung_mot_form_dang_mo"

# OCR field (app/templates.py) -> DetaineeIn field (main.py). Danh ban giau
# truong hon nen duoc gop sau cung: truong nao ca hai to deu doc duoc thi lay
# ben danh ban, ben in duoi day.
_TRUONG_DANG_CAP = {
    "hoTen": "full_name",
    "tenGoiKhac": "alias",
    "sinhNgay": "dob",
    "queQuan": "hometown",
    "noiThuongTru": "address",
    "noiTamTru": "temp_address",
    "noiOHienNay": "current_address",
    "quocTich": "nationality",
    "danToc": "ethnicity",
    "ngheNghiep": "occupation",
    "hoTenCha": "father_name",
    "hoTenMe": "mother_name",
    "lapVeViec": "case_about",
    "ctVanTay": "fp_formula",
    "batDauNgay": "arrest_date",
    "donViBat": "arrest_agency",
    "canBoLap": "officer_name",
    "canBoPhanLoai": "officer_classifier",
    "canBoKtPhanLoai": "officer_class_checker",
    "lapNgay": "record_date",
    "cmndCccd": "cccd_number",
}

# "so" trung ten o ca hai mau nhung la hai thu khac nhau: so danh ban khac so
# chi ban van tay, nen khong the gop chung mot khoa.
_TRUONG_RIENG = {
    MAU_CHI_BAN: {"so": "fp_sheet_no"},
    MAU_DANH_BAN: {"so": "record_sheet_no"},
}

# Cua so ngay: OCR tra ve tho, khong phai datetime.
_NGAY_SO = ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d")
_NGAY_LOI = re.compile(
    r"ng[àa]y\s*(\d{1,2})\s*th[áa]ng\s*(\d{1,2})\s*n[ăa]m\s*(\d{4})",
    re.IGNORECASE)


def _now() -> float:
    """Tach ra ham de test dich duoc thoi gian ma khong phai cho."""
    return time.time()


def parse_ngay(tho: Optional[str]) -> Optional[str]:
    """'15/03/1990' | 'ngày 15 tháng 3 năm 1990' -> '1990-03-15'; khong ra -> None.

    Backend luu dinh dang YYYY-MM-DD (_parse_dob trong main.py), nen gui tho
    dang khac la mat gia tri khi luu.
    """
    if not tho:
        return None
    tho = str(tho).strip()
    if not tho:
        return None
    from datetime import datetime

    for dinh_dang in _NGAY_SO:
        try:
            return datetime.strptime(tho, dinh_dang).strftime("%Y-%m-%d")
        except ValueError:
            continue
    khop = _NGAY_LOI.search(tho)
    if khop:
        ngay, thang, nam = (int(x) for x in khop.groups())
        try:
            return datetime(nam, thang, ngay).strftime("%Y-%m-%d")
        except ValueError:
            return None  # 31/02 — OCR doc sai con so, khong doan
    return None


def _chi_so_cccd(tho: Optional[str]) -> Optional[str]:
    """'074.123.456.789' -> '074123456789'; khong du 12 so -> None.

    DetaineeIn cccd_number la `^\\d{12}$`: ghi gia tri khong du 12 so vao form
    thi can bo bam Luu moi biet la loi, va rat co the doi thanh so khac.
    """
    if not tho:
        return None
    so = "".join(c for c in str(tho) if c.isdigit())
    return so if len(so) == 12 else None


def _gop_fields(ho_so: dict) -> Optional[dict]:
    """Gop fields cua hai to trong mot HoSo; None neu to nao khong phai 295/204."""
    gop: dict = {}
    for khoa_mau in ("chiBan", "danhBan"):
        to = ho_so.get(khoa_mau)
        if not to:
            continue
        mau = to.get("template")
        if mau not in MAU_CHAP_NHAN:
            return None
        ten_truong_rieng = _TRUONG_RIENG[mau]
        for ten, gia_tri in (to.get("fields") or {}).items():
            if gia_tri is None or (isinstance(gia_tri, str) and not gia_tri.strip()):
                continue  # OCR khong doc duoc: de white space trong form yen
            if ten in _TRUONG_DANG_CAP:
                gop[_TRUONG_DANG_CAP[ten]] = gia_tri.strip() if isinstance(gia_tri, str) else gia_tri
            elif ten in ten_truong_rieng:
                gop[ten_truong_rieng[ten]] = gia_tri
    if "cccd_number" in gop:
        # DetaineeIn cccd_number la `^\d{12}$` — OCR doc thieu so thi khong do
        # vao form (can bo nhap tay), vi ghi so sai se lam loi khi bam Luu.
        so = _chi_so_cccd(gop.pop("cccd_number"))
        if so:
            gop["cccd_number"] = so
    return gop or None


def _ngay_hoa(gop: dict) -> None:
    """Doi tại chỗ các trường ngày sang YYYY-MM-DD; xoa neu khong parse duoc."""
    for khoa in ("dob", "record_date", "arrest_date"):
        if khoa in gop:
            gia_tri = parse_ngay(gop.pop(khoa))
            if gia_tri:
                gop[khoa] = gia_tri


def fields_tu_ho_so(ho_so: dict) -> Optional[dict]:
    """Mot HoSo (dict) -> dict truong cua DetaineeIn; None neu khong dung mau."""
    gop = _gop_fields(ho_so)
    if gop is None:
        return None
    _ngay_hoa(gop)
    return gop


class _CaptureSession:
    __slots__ = ("id", "created_at", "last_poll", "pending")

    def __init__(self) -> None:
        self.id = uuid.uuid4().hex
        self.created_at = _now()
        self.last_poll: Optional[float] = None   # None: chua poll lan nao
        self.pending: list[dict] = []


_sessions: dict[str, _CaptureSession] = {}
_lock = threading.Lock()


def _gc_locked(now: float) -> None:
    """Bo những session khong con ai cham tới — vet cua tab da dong moc."""
    cho = [sid for sid, s in _sessions.items() if now - s.created_at > _SESSION_TTL]
    for sid in cho:
        _sessions.pop(sid, None)


def _dang_mo_locked(now: float) -> list[_CaptureSession]:
    """Cac form that su dang mo tai thoi diem `now`."""
    song = []
    for s in _sessions.values():
        if s.last_poll is None:
            if now - s.created_at <= FRESH_WINDOW:
                song.append(s)
        elif now - s.last_poll <= ACTIVE_WINDOW:
            song.append(s)
    return song


def capture_start() -> str:
    """Mo mot session cap nhat — frontend goi luc form dang ky MOI hiện lên."""
    with _lock:
        now = _now()
        _gc_locked(now)
        s = _CaptureSession()
        _sessions[s.id] = s
        return s.id


def capture_end(sid: str) -> None:
    """Dong mot session: luu xong, huy, dieu huong khac, hoac chuyen sang sua."""
    with _lock:
        _sessions.pop(sid, None)


def capture_count() -> int:
    with _lock:
        _gc_locked(_now())
        return len(_sessions)


def push(payload: dict) -> dict:
    """Nhan ket qua scan tu service OCR va quyet dinh co chen hay khong.

    payload la `{"hoSo": [HoSo.to_dict()]}` — ben OCR gan theo DUNG file vua
    quet, khong phai ca lo, nen mot xap 2 nguoi trong 1 file ra 2 HoSo va bi
    tu choi o cua chẹn 1.
    """
    ho_so = payload.get("hoSo") if isinstance(payload, dict) else None
    if not isinstance(ho_so, list):
        ho_so = []
    if len(ho_so) != 1:
        return {"ok": False, "reason": LY_DO_KHONG_DUNG_DOI_TUONG,
                "soLuong": len(ho_so)}

    fields = fields_tu_ho_so(ho_so[0])
    if fields is None:
        return {"ok": False, "reason": LY_DO_KHONG_PHAI_CHI_DANH_BAN}
    if not fields.get("cccd_number"):
        return {"ok": False, "reason": LY_DO_THIEU_CCCD}

    with _lock:
        now = _now()
        _gc_locked(now)
        dang_mo = _dang_mo_locked(now)
        if len(dang_mo) != 1:
            # 0: chua mo form nao. >1: khong biet can bo dang nhin cai nao —
            # doan la ghi nham ho so, nen thot la an toan hon.
            return {"ok": False, "reason": LY_DO_KHONG_DUNG_FORM,
                    "soLuong": len(dang_mo)}
        s = dang_mo[0]
        s.pending.append(fields)
        s.created_at = now
        return {"ok": True, "session_id": s.id, "fields": fields}


async def capture_wait(sid: str, timeout: int) -> Optional[dict]:
    """Long-poll cua form. Khac cccd_wait: moi lan goi duoc tinh la 'form nay
    dang duoc nhin', nen no gia han cả two chi số de push() tim thay no."""
    with _lock:
        s = _sessions.get(sid)
        if not s:
            return None
        s.created_at = s.last_poll = _now()
        if s.pending:
            return {"status": "ok", "data": s.pending.pop(0)}

    het_han = _now() + max(1, timeout)
    while True:
        await asyncio.sleep(_POLL_INTERVAL)
        with _lock:
            s = _sessions.get(sid)
            if s is None:
                return None
            s.created_at = s.last_poll = _now()
            if s.pending:
                return {"status": "ok", "data": s.pending.pop(0)}
        if _now() >= het_han:
            return {"status": "timeout"}
