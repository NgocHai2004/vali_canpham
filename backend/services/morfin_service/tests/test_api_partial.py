"""Test cho luong "can bo xac nhan tung cum".

Khong co thiet bi Morfin that => monkeypatch api.engine.capture_slap tra ve
CaptureResult gia. Kiem tra:
  - capture() luu MOI ngon tach duoc, ke ca ngon duoi nguong / khong do duoc
    chat luong (khong con 422 vi quality).
  - Buoc DAT NGUONG HET (low rong) thi TU xac nhan: needs_confirm=False, cum done
    ngay, next_step sang buoc sau. Chi con dung lai khi CO ngon dang ngo.
  - Cum CHUA xac nhan thi chua done, va next_step van tra ve chinh cum do
    (=> bam chup lai la thu lai dung cum dang lam).
  - confirm_step chuyen cum sang done va di tiep.
  - mark_none ghi none cho ngon khong co van tay: khong anh, khong template, va
    lam cum chi cho dung so ngon con lai (chong 422 vinh vien voi nguoi thieu ngon).
  - Van 422 khi SDK tach duoc it ngon hon so ngon cum dang cho (chong gan lech
    template sang ngon khac).
"""
import os
import sys
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

# api.py tu them thu muc cua no vao sys.path; them cha de import duoc engine/api.
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import engine as E  # noqa: E402,F401
import api  # noqa: E402
from engine import CaptureResult, FingerCapture  # noqa: E402

client = TestClient(api.app)

# left_hand codes theo thu tu slot: left_little(1), left_ring(2),
# left_middle(3), left_index(4).
LEFT = ["left_little", "left_ring", "left_middle", "left_index"]


@pytest.fixture(autouse=True)
def _mock_engine():
    # Khong co thiet bi Morfin that: chan truy cap dong DLL + capture.
    with patch.object(api.engine, "ensure_open"), \
         patch.object(api.engine, "capture_slap"):
        yield


# Nguong PHAI ghim, khong duoc de test doc cau hinh that cua may.
#
# api.py doc quality.json ngay luc import (de nguong song qua restart service).
# File do la cau hinh THAT do admin dat qua trang Cai dat, thay doi bat ky luc nao.
# Cac test duoi day cam gia tri "ngon yeu" = 20 vao ket qua chup roi assert
# low_quality is True - dieu do chi dung khi nguong > 20.
# Da xay ra 03/09: admin ha nguong xuong 10 => 20 thanh "dat", 5 test do cung luc
# du code khong he doi. Log lai tro sang dung file vua sua, rat de truy sai huong.
# => ghim ca 10 ngon ve 50 cho MOI test, va tra lai nguyen trang sau do.
@pytest.fixture(autouse=True)
def _pin_thresholds():
    saved = dict(api._min_quality_map)
    api._min_quality_map.update({c: 50 for c in api._min_quality_map})
    yield
    api._min_quality_map.clear()
    api._min_quality_map.update(saved)


def _new_session() -> str:
    r = client.post("/api/session/start", json={"user_name": "test"})
    assert r.status_code == 200, r.text
    return r.json()["session_id"]


def _new_session_at_slap() -> str:
    """Phien voi 10 buoc LAN da xong => next_step la buoc CHUM dau tien.

    File test nay kiem tra luong "xac nhan tung cum" cua van CHUM. Ke tu khi
    STEPS = 10 buoc lan + 3 buoc chum, buoc dau cua phien la roll_left_little nen
    assert next_step == "left_hand" se sai. Bo qua phan lan thay vi doi assert,
    vi cai dang test la logic cum 4 ngon - khong phai thu tu buoc.

    Dat truc tiep vao Session (khong goi capture) vi file nay chi mock
    capture_slap, khong mock capture_roll.

    LUU Y: buoc lan va buoc chum DUNG CHUNG cac FingerRecord, va ROLL_ORDER phu
    ca 10 ngon. Nen gan template cho 10 ngon lan lam step_captured() cua CA 3 cum
    thanh True luon - do la ly do helper nay KHONG dung cho test "xac nhan cum
    chua chup => 400": test do phai dung phien trang.
    """
    sid = _new_session()
    s = api.sessions[sid]
    for st in api.ROLL_STEPS:
        for code in st["codes"]:
            # done = co template HAY danh dau missing. Gia mot template la du.
            s.fingers[code].template_b64 = "x"
        s.confirmed.add(st["step"])
    return sid


def _make_result(got, no_quality=()):
    return CaptureResult(
        code=0,  # morfin.SUCCESS
        finger_count=len(got),
        slap_image=b"",
        fingers=got,
        message="",
        frames=1,
        dropped=[],
        no_quality=list(no_quality),
        diag={},
    )


def _ok(slot, quality=80):
    # template khong rong de luu duoc; image rong -> _bmp_to_png_b64 tra "".
    return FingerCapture(slot=slot, quality=quality,
                         template=b"TMPL%d" % slot, image=b"")


def _nq(slot):
    return FingerCapture(slot=slot, quality=0, template=b"TMPL%d" % slot, image=b"")


def _capture(sid, step, got, no_quality=()):
    with patch.object(api.engine, "capture_slap",
                      return_value=_make_result(got, no_quality=no_quality)):
        return client.post(f"/api/session/{sid}/capture", json={"step": step})


def _steps(data) -> dict:
    return {s["step"]: s["done"] for s in data["steps"]}


def _finger(data, code) -> dict:
    return next(f for f in data["fingers"] if f["code"] == code)


def test_low_quality_finger_is_saved_not_rejected():
    """Ngon duoi nguong VAN duoc luu template + anh, chi mang co low_quality.

    Day la thay doi cot loi: nguong khong con la cong chan luc chup. Ngon van tay
    mon truoc day khong bao gio qua duoc => ca cum bi chup lai vo han.
    """
    sid = _new_session()
    weak = FingerCapture(slot=4, quality=20, template=b"T4", image=b"")
    r = _capture(sid, "left_hand", [_ok(1), _ok(2), _ok(3), weak])
    assert r.status_code == 200, r.text
    data = r.json()
    # Ca 4 ngon deu duoc luu, khong ngon nao bi bo lai.
    assert len(data["captured"]) == 4
    assert {c["code"] for c in data["captured"]} == set(LEFT)
    # Ngon yeu bi bao trong "low" de FE hien cho can bo thay truoc khi xac nhan.
    assert len(data["low"]) == 1
    w = data["low"][0]
    assert w["code"] == "left_index"
    assert w["reason"] == "weak"
    assert w["quality"] == 20
    assert w["need"] == api._min_quality("left_index")
    # Nhung no CO template va CO co low_quality (de admin doc lai ho so con thay).
    rec = _finger(data, "left_index")
    assert rec["done"] is True
    assert rec["low_quality"] is True
    assert rec["missing"] is False


def test_no_quality_finger_is_saved_and_flagged():
    """Ngon SDK khong do duoc quality van duoc luu, mang co no_quality."""
    sid = _new_session()
    r = _capture(sid, "left_hand", [_ok(1), _ok(2), _nq(3), _ok(4)], no_quality=(3,))
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["captured"]) == 4
    assert [w["reason"] for w in data["low"]] == ["no_quality"]
    assert data["low"][0]["code"] == "left_middle"
    rec = _finger(data, "left_middle")
    assert rec["done"] is True
    # no_quality phai phan biet duoc voi "van tay te": quality=0 mot minh se lam
    # UI hien 0% va can bo tuong ngon hong roi chup lai vo ich.
    assert rec["no_quality"] is True


def test_cluster_with_weak_finger_needs_confirm_and_next_step_stays():
    """Cum CO ngon duoi nguong thi dung lai cho xac nhan, chua done.

    next_step phai van la chinh cum vua chup, nho do nut "chup lai" thu lai dung
    cum dang lam thay vi nhay sang cum khac.
    """
    sid = _new_session_at_slap()
    weak = FingerCapture(slot=4, quality=20, template=b"T4", image=b"")
    r = _capture(sid, "left_hand", [_ok(1), _ok(2), _ok(3), weak])
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["needs_confirm"] is True
    assert data["auto_confirmed"] is False
    assert [w["code"] for w in data["low"]] == ["left_index"]
    assert _steps(data)["left_hand"] is False
    assert data["next_step"]["step"] == "left_hand"
    assert data["finished"] is False


def test_cluster_meeting_threshold_auto_confirms():
    """Cum DAT NGUONG HET thi tu xac nhan: done ngay, next_step sang cum sau.

    Doi tu luat cu "cum nao cung phai bam Xac nhan". Anh tung ngon da nam trong
    `captured` nen FE hien len luoi 10 o ngay; bam Xac nhan cho mot cum ma may do
    duoc la dat het chi la thao tac thua.
    """
    sid = _new_session_at_slap()
    r = _capture(sid, "left_hand", [_ok(1), _ok(2), _ok(3), _ok(4)])
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["low"] == []
    assert data["needs_confirm"] is False
    assert data["auto_confirmed"] is True
    assert _steps(data)["left_hand"] is True
    assert data["next_step"]["step"] != "left_hand"
    # Anh van tra ve du: tu xac nhan KHONG duoc lam mat anh cua can bo.
    assert len(data["captured"]) == 4


def test_no_quality_finger_still_needs_confirm():
    """Ngon khong do duoc quality KHONG duoc tu xac nhan.

    quality khong dang tin thi khong co co so nao de may tu quyet - phai de can bo
    xem anh. Day la nua con lai cua luat: chi `low` rong moi tu xac nhan.
    """
    sid = _new_session_at_slap()
    r = _capture(sid, "left_hand", [_ok(1), _ok(2), _nq(3), _ok(4)], no_quality=(3,))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["needs_confirm"] is True
    assert data["auto_confirmed"] is False
    assert _steps(data)["left_hand"] is False


def test_roll_step_meeting_threshold_auto_confirms():
    """Buoc LAN dat nguong cung tu xac nhan - cung mot luat voi cum chum."""
    sid = _new_session()
    step = api.ROLL_STEPS[0]
    assert len(step["codes"]) == 1, "buoc lan phai dung 1 ngon"
    with patch.object(api.engine, "capture_roll",
                      return_value=_make_result([_ok(1)])):
        r = client.post(f"/api/session/{sid}/capture", json={"step": step["step"]})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["low"] == []
    assert data["needs_confirm"] is False
    assert data["auto_confirmed"] is True
    assert _steps(data)[step["step"]] is True
    assert data["next_step"]["step"] != step["step"]


def test_confirm_step_advances():
    """Xac nhan cum => cum done, next_step sang cum ke tiep."""
    sid = _new_session()
    _capture(sid, "left_hand", [_ok(1), _ok(2), _ok(3), _ok(4)])
    r = client.post(f"/api/session/{sid}/confirm_step", json={"step": "left_hand"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["confirmed_step"] == "left_hand"
    assert _steps(data)["left_hand"] is True
    assert data["next_step"]["step"] != "left_hand"


def test_confirm_step_accepts_low_quality_finger():
    """Xac nhan cum co ngon yeu => ngon do van done, template giu nguyen."""
    sid = _new_session()
    weak = FingerCapture(slot=4, quality=20, template=b"T4", image=b"")
    _capture(sid, "left_hand", [_ok(1), _ok(2), _ok(3), weak])
    r = client.post(f"/api/session/{sid}/confirm_step", json={"step": "left_hand"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert _steps(data)["left_hand"] is True
    rec = _finger(data, "left_index")
    assert rec["done"] is True
    # Da xac nhan nhung VAN giu dau hieu chat luong thap cho admin.
    assert rec["low_quality"] is True


def test_confirm_step_before_capture_400():
    """Xac nhan cum chua chup => 400 (khong duoc coi la xong voi ngon rong)."""
    sid = _new_session()
    r = client.post(f"/api/session/{sid}/confirm_step", json={"step": "left_hand"})
    assert r.status_code == 400


def test_recapture_clears_confirmation():
    """Chup lai cum da xac nhan, lan nay CO ngon yeu => xac nhan bi rut lai.

    Neu khong rut, cum se tu dong "xong" ngay khi chup lai, bo qua chinh anh
    vua chup - can bo khong bao gio duoc xem no. Anh moi kem hon anh cu ma cum
    van "da xac nhan" la dung cai phai chan.
    """
    sid = _new_session_at_slap()
    _capture(sid, "left_hand", [_ok(1), _ok(2), _ok(3), _ok(4)])
    client.post(f"/api/session/{sid}/confirm_step", json={"step": "left_hand"})
    weak = FingerCapture(slot=4, quality=20, template=b"T4", image=b"")
    r = _capture(sid, "left_hand", [_ok(1), _ok(2), _ok(3), weak])
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["needs_confirm"] is True
    assert _steps(data)["left_hand"] is False
    assert data["next_step"]["step"] == "left_hand"


def test_mark_none_records_none_without_image():
    """Ghi none cho ngon khong co van tay: khong anh, khong template, done."""
    sid = _new_session()
    r = client.post(f"/api/session/{sid}/mark_none", json={"codes": ["left_middle"]})
    assert r.status_code == 200, r.text
    data = r.json()
    rec = _finger(data, "left_middle")
    assert rec["missing"] is True
    assert rec["done"] is True
    assert rec["quality"] == 0
    # Ngon khong co van khong co template => khong duoc hien la "chat luong kem".
    assert rec["low_quality"] is False


def test_mark_none_shrinks_cluster_expectation():
    """Danh dau none TRUOC khi chup => cum chi cho 3 ngon, 3 anh la du.

    Day la muc dich chinh cua mark_none: nguoi thieu 1 ngon truoc day bi 422 mai
    mai vi cum luon doi 4 ngon.
    """
    sid = _new_session()
    client.post(f"/api/session/{sid}/mark_none", json={"codes": ["left_middle"]})
    # Chi 3 ngon tren sensor - du cho cum da co 1 ngon danh dau none.
    r = _capture(sid, "left_hand", [_ok(1), _ok(2), _ok(3)])
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["none_codes"] == ["left_middle"]
    # 3 anh gan cho 3 ngon CON LAI, khong gan cho ngon da danh none.
    assert {c["code"] for c in data["captured"]} == {
        "left_little", "left_ring", "left_index"}
    assert _finger(data, "left_middle")["missing"] is True
    # Xac nhan duoc ngay: 3 ngon co anh + 1 ngon none = du du lieu cho ca cum.
    r2 = client.post(f"/api/session/{sid}/confirm_step", json={"step": "left_hand"})
    assert r2.status_code == 200, r2.text
    assert _steps(r2.json())["left_hand"] is True


def test_mark_none_clears_existing_capture_and_confirmation():
    """Danh dau none sau khi da chup => xoa anh/template ngon do, rut xac nhan."""
    sid = _new_session()
    _capture(sid, "left_hand", [_ok(1), _ok(2), _ok(3), _ok(4)])
    client.post(f"/api/session/{sid}/confirm_step", json={"step": "left_hand"})
    r = client.post(f"/api/session/{sid}/mark_none", json={"codes": ["left_middle"]})
    assert r.status_code == 200, r.text
    data = r.json()
    assert _finger(data, "left_middle")["missing"] is True
    # So ngon trong cum da doi => phai xem lai va xac nhan lai.
    assert _steps(data)["left_hand"] is False
    # Anh da bi xoa => khong con preview.
    assert client.get(f"/api/session/{sid}/preview/left_middle.png").status_code == 404


def test_mark_none_off_restores_capture_requirement():
    """Bo danh dau none => ngon do can chup lai (chua done)."""
    sid = _new_session()
    client.post(f"/api/session/{sid}/mark_none", json={"codes": ["left_middle"]})
    r = client.post(f"/api/session/{sid}/mark_none",
                    json={"codes": ["left_middle"], "value": False})
    assert r.status_code == 200, r.text
    rec = _finger(r.json(), "left_middle")
    assert rec["missing"] is False
    assert rec["done"] is False


def test_mark_none_whole_cluster_then_capture_400():
    """Ca cum danh dau none => khong con ngon nao de chup, capture tra 400."""
    sid = _new_session()
    client.post(f"/api/session/{sid}/mark_none", json={"codes": LEFT})
    r = _capture(sid, "left_hand", [_ok(1)])
    assert r.status_code == 400
    # Nhung cum van xac nhan duoc: ca 4 ngon deu "xong" theo nghia khong con gi thu.
    r2 = client.post(f"/api/session/{sid}/confirm_step", json={"step": "left_hand"})
    assert r2.status_code == 200, r2.text
    assert _steps(r2.json())["left_hand"] is True


def test_mark_none_invalid_code_400():
    sid = _new_session()
    r = client.post(f"/api/session/{sid}/mark_none", json={"codes": ["khong_ton_tai"]})
    assert r.status_code == 400


def test_missing_finger_still_422():
    """Thieu ngon (3/4) van 422 - KHONG doan ngon nao thieu.

    engine gom slot 1->4 va bo qua slot rong, nen thieu 1 ngon giua cum se lam
    zip(codes, got) gan template LECH SANG NGON KHAC - sai nguy hiem hon 422
    nhieu vi khong ai phat hien duoc.
    """
    sid = _new_session()
    r = _capture(sid, "left_hand", [_ok(1), _ok(2), _ok(3)])
    assert r.status_code == 422


def test_redo_resets_cluster_and_confirmation():
    """redo() xoa ca cum: missing ve False, xac nhan bi rut, anh bi xoa."""
    sid = _new_session()
    client.post(f"/api/session/{sid}/mark_none", json={"codes": ["left_middle"]})
    _capture(sid, "left_hand", [_ok(1), _ok(2), _ok(3)])
    client.post(f"/api/session/{sid}/confirm_step", json={"step": "left_hand"})

    r = client.post(f"/api/session/{sid}/redo/left_middle")
    assert r.status_code == 200, r.text
    data = r.json()
    assert _steps(data)["left_hand"] is False
    for code in LEFT:
        rec = _finger(data, code)
        assert rec["missing"] is False
        assert rec["done"] is False


def test_full_session_all_good_finishes_without_any_confirm_click():
    """Ca 3 cum dat nguong => chay het khong can bam Xac nhan lan nao.

    Day la ca chinh cua luot thu binh thuong: nguoi co van tay tot thi can bo chi
    dat tay, may tu chay den het. finished thanh True ngay sau cum cuoi.
    """
    sid = _new_session_at_slap()
    plan = [
        ("left_hand", [_ok(1), _ok(2), _ok(3), _ok(4)]),
        ("thumbs", [_ok(1), _ok(2)]),
        ("right_hand", [_ok(1), _ok(2), _ok(3), _ok(4)]),
    ]
    for step, got in plan:
        r = _capture(sid, step, got)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["needs_confirm"] is False
        assert _steps(data)[step] is True
    assert r.json()["finished"] is True


def test_full_session_stops_only_at_the_weak_cluster():
    """Cum co ngon yeu la cum DUY NHAT dung lai; hai cum kia tu chay.

    Kiem chung dung y nghia cua luat: buoc xac nhan khong bi bo, no chi don ve dung
    luc can. finished phai cho den khi cum yeu duoc xac nhan tay.
    """
    sid = _new_session_at_slap()
    weak = FingerCapture(slot=2, quality=20, template=b"T2", image=b"")
    r = _capture(sid, "left_hand", [_ok(1), _ok(2), _ok(3), _ok(4)])
    assert r.json()["needs_confirm"] is False
    # Cum thumbs co ngon yeu => dung lai, va cum nay chua done.
    r = _capture(sid, "thumbs", [_ok(1), weak])
    data = r.json()
    assert data["needs_confirm"] is True
    assert _steps(data)["thumbs"] is False
    r = _capture(sid, "right_hand", [_ok(1), _ok(2), _ok(3), _ok(4)])
    # Cum cuoi tu xac nhan nhung CHUA finished: cum thumbs con treo.
    data = r.json()
    assert data["needs_confirm"] is False
    assert data["finished"] is False
    # Can bo xem anh roi chap nhan ngon yeu => gio moi xong.
    r = client.post(f"/api/session/{sid}/confirm_step", json={"step": "thumbs"})
    assert r.status_code == 200, r.text
    assert r.json()["finished"] is True
