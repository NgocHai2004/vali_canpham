"""Test engine.capture_slap truyen danh sach ngon khong co van vao StartCapture.

Bug da sua: engine build `exceptions` (FingerPosition) tu tham so `absent` nhung
KHONG truyen xuong sdk.start_capture. Hau qua: nguoi thieu 1 ngon (vd chi co 3
ngon tay) ma can bo da danh dau none truoc khi chup thi SDK van doi du 4 ngon
cua slap position -> chay het timeout -> tra -2019, khong bao gio co anh nao
bup len, du 3 ngon con lai hoan toan tot.

Test nay dung SDK gia de bat tham so `exceptions` truyen vao StartCapture. Khong
can thiet bi that, khong can chay async capture.
"""
import os
import sys
import threading
from unittest.mock import patch

import pytest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import engine  # noqa: E402
from engine import MorfinError  # noqa: E402
from morfin import SlapPosition, SUCCESS  # noqa: E402


class _FakeSDK:
    """Morfin gia chi de bat tham so StartCapture + chot done de capture_slap tra ve.

    on_complete nhan None params -> engine bi loi deref nhung van bi except bat
    va van set(done) o finally. State final rong -> result.fingers rong, nhung
    dieu ta can assert la `exceptions` da duoc truyen xuong SDK dung.
    """
    def __init__(self):
        self.initialized = True
        self.captured_exceptions = None

    def start_capture(self, on_preview, on_complete, timeout=10,
                      slap=SlapPosition.RIGHT_HAND, exceptions=None,
                      auto_capture=True, nfiq_quality=0):
        self.captured_exceptions = exceptions
        # Goi on_complete tu thread moi de giong SDK that (goi callback tu thread).
        t = threading.Thread(target=lambda: on_complete(SUCCESS, None, None))
        t.start()
        t.join()
        return SUCCESS

    def get_image(self, fmt, compression=0):
        return SUCCESS, []

    def get_template(self, fmt):
        return SUCCESS, []

    def stop_capture(self):
        return SUCCESS


@pytest.fixture
def fake_sdk():
    sdk = _FakeSDK()
    # engine.engine la singleton (CaptureEngine) - patch ensure_open tren no.
    with patch.object(engine.engine, "ensure_open", return_value=sdk):
        yield sdk


def test_exceptions_passed_to_start_capture(fake_sdk):
    """Khi absent co ["left_middle"], StartCapture nhan FingerPosition.LEFT_MIDDLE=True."""
    engine.engine.capture_slap(SlapPosition.LEFT_HAND, expect=3, absent=["left_middle"])

    assert fake_sdk.captured_exceptions is not None, \
        "StartCapture phai nhan exceptions (khong duoc None)"
    assert fake_sdk.captured_exceptions.LEFT_MIDDLE is True
    # Cac ngon khac trong cung cum khong bi danh dau nham.
    assert fake_sdk.captured_exceptions.LEFT_LITTLE is False
    assert fake_sdk.captured_exceptions.LEFT_RING is False
    assert fake_sdk.captured_exceptions.LEFT_INDEX is False


def test_no_absent_passes_empty_fingerposition(fake_sdk):
    """Khong co ngon nao danh dau none => engine truyen exceptions=None (SDK tu dung FingerPosition trong)."""
    engine.engine.capture_slap(SlapPosition.LEFT_HAND, expect=4, absent=None)

    # engine truyen None; morfin.start_capture doi exceptions or FingerPosition()
    # nen None khong gay loi - chi can khong phai la FingerPosition co ngon nao True.
    assert fake_sdk.captured_exceptions is None


def test_multiple_absent(fake_sdk):
    """Nhieu ngon khong co van => tat ca deu True trong FingerPosition."""
    engine.engine.capture_slap(SlapPosition.RIGHT_HAND, expect=2,
                        absent=["right_middle", "right_little"])

    assert fake_sdk.captured_exceptions.RIGHT_MIDDLE is True
    assert fake_sdk.captured_exceptions.RIGHT_LITTLE is True
    assert fake_sdk.captured_exceptions.RIGHT_INDEX is False


def test_thumbs_absent(fake_sdk):
    """Cum 2 ngon cai: danh dau 1 ngon cai thieu, ngon con lai khong bi nham."""
    engine.engine.capture_slap(SlapPosition.THUMB, expect=1, absent=["left_thumb"])

    assert fake_sdk.captured_exceptions.LEFT_THUMB is True
    assert fake_sdk.captured_exceptions.RIGHT_THUMB is False