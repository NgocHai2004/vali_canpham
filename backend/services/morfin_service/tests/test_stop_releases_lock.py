"""Bug: thoat giua luc dang thu nhan => vao lai KHONG thu duoc van tay nua.

Duong di that (nguoi dung xac nhan): bam menu ben trai => React unmount
DataCapturePage => cleanup goi POST /api/capture/stop roi DELETE /api/session/{sid}.
Vao lai trang => startSession + capture moi.

Nut chan nam o _capture_lock trong api.py:
  - capture() acquire(blocking=False) va chi nha trong `finally` CUA CHINH NO.
  - engine.stop() chi bao SDK thoi cho tay; request capture cu con dang block
    trong engine.capture_roll()/capture_slap() => chua chay den `finally`
    => _capture_lock VAN GIU.
  - Frontend mount lai ngay va goi capture moi => acquire that bai => HTTP 409
    "Dang co lenh chup khac chay." => man hinh dung han.

Test dung buoc LAN (roll_*): no di qua _capture_lock y het buoc chum nhung khong
dung _png_width/anh slap, nen khong can anh PNG that.
"""
import os
import sys
import threading
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import engine as E  # noqa: E402,F401
import api  # noqa: E402
from engine import CaptureResult, FingerCapture  # noqa: E402

client = TestClient(api.app)


def _roll_result():
    # FingerCapture dinh danh ngon bang SLOT (1..4), khong phai code; anh va
    # template la bytes. Xem engine.py:137.
    return CaptureResult(
        code=0,
        finger_count=1,
        fingers=[FingerCapture(slot=1, quality=80, template=b"t", image=b"img")],
    )


@pytest.fixture(autouse=True)
def _no_device():
    """Khong dung thiet bi that: canh dang do la vong doi LOCK, khong phai hanh vi
    SDK. Chan ensure_open/stop de test chay o may nao cung duoc va khong giat
    thiet bi that dang cam."""
    with patch.object(api.engine, "ensure_open"), \
         patch.object(api.engine, "stop", return_value=0), \
         patch.object(api, "_bmp_to_png_b64", return_value="fakepng"):
        yield


def test_stop_capture_waits_for_capture_lock_release():
    sid = client.post("/api/session/start",
                      json={"user_name": "test"}).json()["session_id"]

    entered = threading.Event()
    release = threading.Event()

    def slow_capture(*a, **kw):
        # Dang trong SDK, dang giu _capture_lock: mo phong "dang cho can bo lan ngon".
        entered.set()
        release.wait(timeout=5)
        return _roll_result()

    with patch.object(api.engine, "capture_roll", side_effect=slow_capture):
        t = threading.Thread(
            target=lambda: client.post(f"/api/session/{sid}/capture",
                                       json={"step": "roll_left_little"}),
            daemon=True)
        t.start()
        assert entered.wait(timeout=5), "capture chua vao duoc engine"

        # Cleanup luc unmount. engine.stop() bi mock => tra ve ngay, KHONG lam
        # luong tren thoat -> dung canh that khi SDK cham nha.
        assert client.post("/api/capture/stop").status_code == 200

        # Vao lai trang: capture moi. Day la cho bug bieu hien.
        r2 = client.post(f"/api/session/{sid}/capture",
                         json={"step": "roll_left_little"})

        release.set()
        t.join(timeout=5)

    assert r2.status_code != 409, (
        "REGRESSION: /api/capture/stop tra ve khi _capture_lock chua duoc nha "
        "=> lan chup sau an 409 = bug 'vao lai trang khong thu duoc van tay'."
    )
