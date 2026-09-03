"""Test cho _quality_of - chon field nao lam so do quality cua 1 ngon.

Boi canh (do tu log that, 7 lan chup, ca hai tay):
  slot 1 (ngon ngoai cung ben TRAI anh slap = ut trai o left_hand, tro phai o
  right_hand) LUON co ImageInfo.Quality ngoai mien 0-100 trong complete callback.
  Do duoc: 193, 215, 215, 223, 230, 240, 305.

Va so hoc chi ra vi sao:
  slot1.Quality=193 == 45+48+48+52 == sum(NFIQScore ca 4 ngon)
  slot1.Quality=240 == 54+54+65+67 == sum(NFIQScore ca 4 ngon)
=> ImageInfo[0].Quality KHONG phai quality cua ngon ngoai cung, no la TONG ca cum.

Nen NFIQScore phai di TRUOC Quality, khong phai lam fallback.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import _preview_quality_of, _quality_of  # noqa: E402


def test_normal_finger_uses_per_finger_score():
    """Slot 2/3/4: Quality == NFIQScore tung lan => lay field nao cung ra so do do.

    Cac cap do duoc tu log: 48/48, 52/52, 54/54, 65/65, 67/67.
    """
    for v in (48, 52, 54, 65, 67):
        q, src = _quality_of(v, v)
        assert q == v
        assert src == "NFIQScore"


def test_outer_finger_recovers_real_score():
    """Slot 1: Quality la tong cum (hong), NFIQScore la so do that cua ngon.

    Day chinh la bug "ngon ngoai cung luon 0%": truoc day gia tri 193/240 bi loc
    vi ngoai mien roi code de quality = 0 MAC DINH.
    """
    q, src = _quality_of(193, 45)   # log: slot1 Quality=193 NFIQScore=45
    assert q == 45
    assert src == "NFIQScore"

    q, src = _quality_of(240, 54)   # log: slot1 Quality=240 NFIQScore=54
    assert q == 54
    assert src == "NFIQScore"


def test_all_observed_bad_quality_values_recovered():
    """Ca 7 gia tri Quality ngoai mien da quan sat deu phai ra so do that."""
    observed = [193, 215, 215, 223, 230, 240, 305]
    for bad in observed:
        q, src = _quality_of(bad, 60)
        assert q == 60, f"Quality={bad} phai bi bo qua, lay NFIQScore"
        assert src == "NFIQScore"


def test_sum_trap_does_not_leak_through():
    """BAY: "Quality truoc, NFIQ sau" sai kin.

    4 ngon moi ngon 18% => tong 72, van nam trong mien 0-100 nen thu tu uu tien
    nguoc lai se BAO 72% cho ngon ngoai cung thay vi 18%. Sai kieu nay kho phat
    hien hon 0% nhieu vi 72% trong nhu mot so do that.
    """
    for each in (18, 22, 25):
        total = each * 4
        assert 0 <= total <= 100, "tinh huong chi co nghia khi tong lot mien"
        q, src = _quality_of(total, each)
        assert q == each, f"phai lay {each}%, khong duoc lay tong {total}%"
        assert src == "NFIQScore"


def test_no_measurement_returns_none():
    """Ca hai field ngoai mien => None = "khong co so do".

    KHONG duoc tra 0 (cong chan tuong van tay kem) va khong duoc clamp ve 100
    (lot cong ma khong biet that gia). api.py xu ly None nhu no_quality.
    """
    q, src = _quality_of(240, 305)
    assert q is None
    assert src == "none"


def test_zero_is_a_real_measurement():
    """0 doc duoc tu SDK la so do THAT (ngon te), khac han "khong co so do"."""
    q, src = _quality_of(0, 0)
    assert q == 0
    assert src == "NFIQScore"


def test_boundary_values_accepted():
    """Bien 0 va 100 nam TRONG mien hop le, khong bi loai."""
    assert _quality_of(100, 100) == (100, "NFIQScore")
    assert _quality_of(101, 100) == (100, "NFIQScore")
    assert _quality_of(100, 101) == (100, "Quality")
    assert _quality_of(-1, -1) == (None, "none")


# --- PREVIEW callback: nguon khac, ham khac ---------------------------------
#
# Morfin_Enroll.h:218-223 danh dau tung field cua IMAGE_INFO. Intensity va
# NFIQScore deu ghi "(Only In Complete Callback)"; Quality thi khong ghi gi.
# => trong preview chi Quality co so do, NFIQScore la o nho chua ai ghi = 0.
def test_preview_reads_quality_not_nfiq():
    """Preview lay Quality. Day la lat nguoc uu tien so voi complete, co chu y.

    Goi _quality_of o preview tra ve NFIQScore = 0 cho MOI frame, va 0 la so do
    hop le nen no khong bi loai, khong vao `dropped`, di thang ra FE thanh "0%"
    ma khong de lai dau vet nao. Chinh la loi da gap.
    """
    assert _preview_quality_of(62) == (62, "Quality")
    # Cai bay: neu ai do doi lai thanh _quality_of(q, nfiq) voi nfiq=0 tu preview
    # thi ket qua se la 0 thay vi 62 - test nay do ngay.
    assert _quality_of(62, 0) == (0, "NFIQScore"), (
        "day la ly do preview KHONG duoc dung _quality_of")


def test_preview_out_of_range_is_no_measurement():
    """Quality ngoai mien 0-100 o preview => None, khong doan sang field khac."""
    assert _preview_quality_of(193) == (None, "none")
    assert _preview_quality_of(-1) == (None, "none")


def test_preview_boundaries():
    assert _preview_quality_of(0) == (0, "Quality")
    assert _preview_quality_of(100) == (100, "Quality")
    assert _preview_quality_of(101) == (None, "none")
