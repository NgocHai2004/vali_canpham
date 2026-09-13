# -*- coding: utf-8 -*-
"""Route /api/scan/* — lop keo quanh scan_inbox.

Khong dung lifespan (TestClient khong dung dang context manager) nen Mongo
khong bi cham toi; duoc vi main.py chi noi DB trong lifespan startup.
"""
import os
import sys

import pytest
from fastapi.testclient import TestClient

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import main  # noqa: E402
import scan_inbox  # noqa: E402

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def _dang_nhap_va_bat_cock():
    main.app.dependency_overrides[main.get_current_user] = lambda: {
        "username": "cb01", "role": "officer", "full_name": "Cán bộ Một"}
    saved_flag = main.FEATURE_SCAN_OCR
    saved_key = main.SCAN_API_KEY
    main.FEATURE_SCAN_OCR = True
    main.SCAN_API_KEY = ""
    scan_inbox._sessions.clear()
    yield
    scan_inbox._sessions.clear()
    main.FEATURE_SCAN_OCR = saved_flag
    main.SCAN_API_KEY = saved_key
    main.app.dependency_overrides.pop(main.get_current_user, None)


def _den_body():
    return {"hoSo": [{"soThuTu": 1, "trangThai": "complete", "doiChieu": {},
                      "chiBan": {"template": "chi_ban_295", "fullText": "",
                                 "confidence": 0.9, "pages": 1,
                                 "fields": {"hoTen": "NGUYEN VAN A",
                                            "cmndCccd": "074123456789"}},
                      "danhBan": None}]}


# --- cookie dang ky ---------------------------------------------------------

def test_start_tra_ve_session_id():
    r = client.post("/api/scan/capture/start")
    assert r.status_code == 200
    assert r.json()["session_id"]
    assert r.json()["session_id"] in scan_inbox._sessions


def test_start_can_dang_nhap():
    main.app.dependency_overrides.pop(main.get_current_user, None)
    assert client.post("/api/scan/capture/start").status_code == 401


def test_delete_dung_session():
    sid = client.post("/api/scan/capture/start").json()["session_id"]
    assert client.delete(f"/api/scan/session/{sid}").json() == {"ok": True}
    assert sid not in scan_inbox._sessions


def test_wait_session_khong_ton_tai_tra_404():
    assert client.get("/api/scan/session/khong-co/wait").status_code == 404


def test_wait_khong_co_gi_tra_204():
    sid = client.post("/api/scan/capture/start").json()["session_id"]
    r = client.get(f"/api/scan/session/{sid}/wait", params={"timeout": 1})
    assert r.status_code == 204 and r.content == b""


def test_wait_tra_ve_du_lieu_scan():
    sid = client.post("/api/scan/capture/start").json()["session_id"]
    assert client.post("/api/scan/push", json=_den_body()).status_code == 200
    r = client.get(f"/api/scan/session/{sid}/wait", params={"timeout": 1})
    assert r.status_code == 200
    assert r.json()["data"]["full_name"] == "NGUYEN VAN A"


# --- push tu ben OCR --------------------------------------------------------

def test_push_khong_can_token_nhung_khai_bao_ly_do_tu_choi():
    """Ben goi la service OCR chay voi tai khoan may, khong co JWT cua can bo."""
    r = client.post("/api/scan/push", json={"hoSo": []})
    assert r.status_code == 200
    assert r.json()["ok"] is False
    assert r.json()["reason"] == scan_inbox.LY_DO_KHONG_DUNG_DOI_TUONG


def test_push_sai_key_bi_401():
    main.SCAN_API_KEY = "bi-mat"
    r = client.post("/api/scan/push", json=_den_body(),
                    headers={"X-Scan-Key": "sai"})
    assert r.status_code == 401


def test_push_dung_key_duoc_chap_nhan():
    main.SCAN_API_KEY = "bi-mat"
    sid = client.post("/api/scan/capture/start").json()["session_id"]
    r = client.post("/api/scan/push", json=_den_body(),
                    headers={"X-Scan-Key": "bi-mat"})
    assert r.status_code == 200 and r.json()["session_id"] == sid


def test_feature_tat_thi_chan_ca_push_lan_dang_ky():
    main.FEATURE_SCAN_OCR = False
    assert client.post("/api/scan/push", json=_den_body()).status_code == 503
    assert client.post("/api/scan/capture/start").status_code == 503


def test_feature_tat_van_xoa_duoc_session_cu():
    """DELETE phai luon chay duoc — frontend cleanup luc dong form."""
    sid = client.post("/api/scan/capture/start").json()["session_id"]
    main.FEATURE_SCAN_OCR = False
    assert client.delete(f"/api/scan/session/{sid}").status_code == 200


def test_body_khong_phai_object_khong_lam_roi_backend():
    assert client.post("/api/scan/push", json=[1, 2]).status_code == 422


# --- co quan bat/tat --------------------------------------------------------

def test_features_liet_ke_scan_ocr():
    r = client.get("/api/config/features")
    assert r.status_code == 200
    assert "scan_ocr" in r.json()
    assert r.json()["scan_ocr"] is True


def test_features_van_giu_ba_cot_cu():
    data = client.get("/api/config/features").json()
    assert {"cccd_reader", "weight_scale", "height_yolo"} <= set(data)
