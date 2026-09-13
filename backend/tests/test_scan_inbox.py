# -*- coding: utf-8 -*-
"""scan_inbox: hop thu cua mot form dang ky.

Bat buoc nghiem ngat (thoa thuan voi can bo su dung):
  - ket qua scan chi duoc chen vao DUNG MOT form dang ky MOI dang mo,
  - va chi khi file scan tra ve DUNG MOT doi tuong,
  - khong chen nguoc vao form mo sau nay, khong chen vao ho so dang sua.
"""
import asyncio
import json
import os
import sys

import pytest

# scan_inbox.py nam canh main.py; pytest chi duoc them `..` (app_cccd) vao path.
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import scan_inbox as S  # noqa: E402

CHI = "chi_ban_295"
DANH = "danh_ban_204"
CCCD = "074123456789"


@pytest.fixture(autouse=True)
def _rong_hop_thu():
    """Moi test dem mot bo session rieng — khong doi vet cua test truoc."""
    S._sessions.clear()
    yield
    S._sessions.clear()


# --- do ha cho ping payload dung cau truc HoSo.to_dict() cua ben OCR ---------

def _to(template, **fields):
    return {"template": template, "fields": fields, "confidence": 0.9,
            "fullText": "", "pages": 1, "anh": "scan_p01"}


def _hoso(chi_ban=None, danh_ban=None, trang_thai="complete"):
    return {"soThuTu": 1, "trangThai": trang_thai,
            "doiChieu": {"hoTen": True, "cmndCccd": True},
            "chiBan": chi_ban, "danhBan": danh_ban}


def _payload(*ho_so):
    return {"hoSo": list(ho_so)}


def _den(chi=True, danh=True):
    """Mot ho so du hai to, co day du truong de doi chieu."""
    return _hoso(
        chi_ban=_to(CHI, hoTen="NGUYEN VAN A", cmndCccd=CCCD,
                    noiThuongTru="12 Le Loi, Q1", so="CB-001",
                    lapNgay="10/09/2026", canBoLap="TRAN VAN LAP",
                    canBoPhanLoai="LE VAN PHAN LOAI",
                    canBoKtPhanLoai="PHAM VAN KT") if chi else None,
        danh_ban=_to(DANH, hoTen="Nguyễn Văn A", cmndCccd="074.123.456.789",
                     sinhNgay="15/03/1990", queQuan="Ha Noi", tenGoiKhac="Ty",
                     noiTamTru="3 Tran Hung Dao", noiOHienNay="5 Ham Nghi",
                     quocTich="Viet Nam", danToc="Kinh", ngheNghiep="Lai xe",
                     hoTenCha="NGUYEN VAN CHA", hoTenMe="TRAN THI ME",
                     batDauNgay="01/09/2026", donViBat="CA Q1",
                     lapVeViec="Buon ban ma tuy", ctVanTay="1-1-1-1-1-2-2-2-2-2",
                     so="DB-002", lapNgay="10/09/2026") if danh else None,
        trang_thai="complete" if (chi and danh) else
                   ("thieu_danh_ban" if chi else "thieu_chi_ban"))


def _mo_form():
    """Mo mot form dang ky va gi cho no 'song' nhu dang long-poll that."""
    sid = S.capture_start()
    S._sessions[sid].last_poll = S._now()
    return sid


def _fields(sid):
    """Lay du lieu dang ngong trong hang doi cua mot session (khong pop)."""
    return list(S._sessions[sid].pending)


# --- dong mo session --------------------------------------------------------

def test_capture_start_tra_ve_id_khac_nhau():
    a, b = S.capture_start(), S.capture_start()
    assert a and b and a != b


def test_capture_end_xoa_session():
    sid = S.capture_start()
    S.capture_end(sid)
    assert sid not in S._sessions


async def test_capture_end_xong_wait_tra_none():
    sid = S.capture_start()
    S.capture_end(sid)
    assert await S.capture_wait(sid, 1) is None


# --- cua chẹn 1: dung mot doi tuong -----------------------------------------

def test_push_khong_co_ho_so_bi_tu_choi():
    _mo_form()
    ket_qua = S.push(_payload())
    assert ket_qua["ok"] is False
    assert ket_qua["reason"] == S.LY_DO_KHONG_DUNG_DOI_TUONG


def test_push_hai_ho_so_khong_duoc_chen():
    """Quet ca xap 2 nguoi trong mot file -> khong duoc do vao form nao."""
    sid = _mo_form()
    ket_qua = S.push(_payload(_den(), _den()))
    assert ket_qua["ok"] is False
    assert ket_qua["reason"] == S.LY_DO_KHONG_DUNG_DOI_TUONG
    assert ket_qua["soLuong"] == 2
    assert _fields(sid) == []


def test_to_khong_nhan_dien_mau_bi_tu_choi():
    _mo_form()
    hoso = _hoso(chi_ban=_to("unknown", hoTen="AI DO"))
    ket_qua = S.push(_payload(hoso))
    assert ket_qua["ok"] is False
    assert ket_qua["reason"] == S.LY_DO_KHONG_PHAI_CHI_DANH_BAN


def test_chi_ban_don_lec_van_la_mot_doi_tuong():
    sid = _mo_form()
    ket_qua = S.push(_payload(_den(danh=False)))
    assert ket_qua["ok"] is True
    assert _fields(sid)[0]["full_name"] == "NGUYEN VAN A"


def test_danh_ban_don_lec_van_la_mot_doi_tuong():
    sid = _mo_form()
    ket_qua = S.push(_payload(_den(chi=False)))
    assert ket_qua["ok"] is True
    assert _fields(sid)[0]["full_name"] == "Nguyễn Văn A"


# --- cua chẹn 2: du CCCD 12 so ----------------------------------------------

def test_cccd_khong_du_12_so_khong_duoc_chen():
    """cccd_number la `^\\d{12}$` o DetaineeIn — do vao form la bao loi khi luu."""
    sid = _mo_form()
    hoso = _hoso(chi_ban=_to(CHI, hoTen="A", cmndCccd="0741234567"))
    ket_qua = S.push(_payload(hoso))
    assert ket_qua["ok"] is False
    assert ket_qua["reason"] == S.LY_DO_THIEU_CCCD
    assert _fields(sid) == []


def test_cccd_co_dau_cham_van_duoc_chap_nhan():
    sid = _mo_form()
    hoso = _hoso(chi_ban=_to(CHI, hoTen="A", cmndCccd="074.123.456.789"))
    assert S.push(_payload(hoso))["ok"] is True
    assert _fields(sid)[0]["cccd_number"] == CCCD


# --- cua chẹn 3: dung mot form dang mo --------------------------------------

def test_push_khong_co_form_mo_thi_bo_qua_hoan_toan():
    ket_qua = S.push(_payload(_den()))
    assert ket_qua["ok"] is False
    assert ket_qua["reason"] == S.LY_DO_KHONG_DUNG_FORM
    assert S._sessions == {}


async def test_khong_giai_lai_de_chen_vao_form_mo_sau_do():
    """File den truoc khi mo form -> roi. Mo form SAU DO khong duoc nhan lai."""
    assert S.push(_payload(_den()))["ok"] is False
    sid = _mo_form()
    assert (await S.capture_wait(sid, 1))["status"] == "timeout"


def test_form_da_dong_thi_khong_con_nhan():
    sid = _mo_form()
    S.capture_end(sid)
    ket_qua = S.push(_payload(_den()))
    assert ket_qua["ok"] is False
    assert ket_qua["reason"] == S.LY_DO_KHONG_DUNG_FORM


def test_hai_form_cung_mo_khong_duoc_doan():
    """Khong co chuyen 'chen vao cai gan nhat' — khong ro dang nhin cai nao."""
    _mo_form()
    _mo_form()
    ket_qua = S.push(_payload(_den()))
    assert ket_qua["ok"] is False
    assert ket_qua["reason"] == S.LY_DO_KHONG_DUNG_FORM
    assert ket_qua["soLuong"] == 2


def test_form_ngung_poll_binh_tinh_la_dong():
    """Tab dong khong bao gio gui DELETE — no phai tu bo sau mot lau."""
    che = _mo_form()
    S._sessions[che].last_poll = S._now() - (S.ACTIVE_WINDOW + 5)
    song = _mo_form()
    ket_qua = S.push(_payload(_den()))
    assert ket_qua["ok"] is True
    assert ket_qua["session_id"] == song
    assert _fields(che) == []


def test_session_mo_ra_chua_kip_poll_van_du_moi():
    """start() -> push co the den trước wait() dau tien; khong duoc bo sot."""
    sid = S.capture_start()
    assert S.push(_payload(_den()))["ok"] is True
    assert len(_fields(sid)) == 1


# --- map truong JSON -> form ------------------------------------------------

def test_map_dung_ten_truong_cua_DetaineeIn():
    sid = _mo_form()
    S.push(_payload(_den()))
    d = _fields(sid)[0]
    assert d["full_name"] == "Nguyễn Văn A"          # danh ban lap lai sau cung
    assert d["cccd_number"] == CCCD
    assert d["alias"] == "Ty"
    assert d["hometown"] == "Ha Noi"
    assert d["address"] == "12 Le Loi, Q1"
    assert d["temp_address"] == "3 Tran Hung Dao"
    assert d["current_address"] == "5 Ham Nghi"
    assert d["nationality"] == "Viet Nam"
    assert d["ethnicity"] == "Kinh"
    assert d["occupation"] == "Lai xe"
    assert d["father_name"] == "NGUYEN VAN CHA"
    assert d["mother_name"] == "TRAN THI ME"
    assert d["case_about"] == "Buon ban ma tuy"
    assert d["fp_formula"] == "1-1-1-1-1-2-2-2-2-2"
    assert d["arrest_date"] == "2026-09-01"
    assert d["arrest_agency"] == "CA Q1"


def test_so_cua_hai_to_khong_di_trung_nhau():
    """"so" tren danh ban la so danh ban; tren chi ban la so chi ban van tay."""
    sid = _mo_form()
    S.push(_payload(_den()))
    d = _fields(sid)[0]
    assert d["record_sheet_no"] == "DB-002"
    assert d["fp_sheet_no"] == "CB-001"


def test_can_bo_lap_chi_dung_lam_officer_name():
    sid = _mo_form()
    S.push(_payload(_den()))
    d = _fields(sid)[0]
    assert d["officer_name"] == "TRAN VAN LAP"
    assert d["officer_classifier"] == "LE VAN PHAN LOAI"
    assert d["officer_class_checker"] == "PHAM VAN KT"


def test_ngay_chuyen_ve_dinh_dang_cua_backend():
    """_parse_dob() chi nhan YYYY-MM-DD / dd/mm/yyyy / dd-mm-yyyy; tra ve YYYY-MM-DD."""
    sid = _mo_form()
    S.push(_payload(_den()))
    assert _fields(sid)[0]["dob"] == "1990-03-15"
    assert _fields(sid)[0]["record_date"] == "2026-09-10"


@pytest.mark.parametrize("tho,ky_vong", [
    ("15/03/1990", "1990-03-15"),
    ("15-3-1990", "1990-03-15"),
    ("15.03.1990", "1990-03-15"),
    ("1990-03-15", "1990-03-15"),
    ("ngày 15 tháng 3 năm 1990", "1990-03-15"),
    ("Ngay 1 thang 2 nam 2003", "2003-02-01"),
    ("", None),
    (None, None),
    ("khong co ngay thang", None),
    ("31/02/1990", None),
])
def test_parse_ngay(tho, ky_vong):
    assert S.parse_ngay(tho) == ky_vong


def test_khong_ghi_truong_rong_vao_form():
    """OCR tra None cho vuong khong doc duoc — do vao form la xoa mat du lieu
    can bo da go tay truon do."""
    sid = _mo_form()
    hoso = _hoso(chi_ban=_to(CHI, hoTen="A", cmndCccd=CCCD, queQuan=None))
    S.push(_payload(hoso))
    assert "hometown" not in _fields(sid)[0]


# --- long-poll --------------------------------------------------------------

async def test_wait_tra_dung_du_lieu_roi_no_hang_doi():
    sid = _mo_form()
    S.push(_payload(_den()))
    first = await S.capture_wait(sid, 1)
    assert first["status"] == "ok"
    assert first["data"]["full_name"] == "Nguyễn Văn A"
    second = await S.capture_wait(sid, 1)
    assert second["status"] == "timeout"


async def test_wait_khong_co_session_tra_none():
    assert await S.capture_wait("khong-ton-tai", 1) is None


async def test_wait_cap_nhat_last_poll_de_session_song():
    sid = _mo_form()
    S._sessions[sid].last_poll = S._now() - (S.ACTIVE_WINDOW + 5)
    await S.capture_wait(sid, 1)
    assert S._sessions[sid].last_poll > S._now() - 5
    assert S.push(_payload(_den()))["ok"] is True
