import pytest
from backend import person_detect


def test_not_ready_before_load():
    # reset trạng thái module về chưa load (đảm bảo test độc lập)
    person_detect._model = None
    assert person_detect.is_ready() is False


def test_get_status_shape():
    person_detect._model = None
    st = person_detect.get_status()
    assert set(st.keys()) >= {"ready", "model", "device"}
    assert st["model"] == "yolo26n.pt"
    assert st["device"] == "cpu"
    assert st["ready"] is False


def make_jpeg_bytes(w=120, h=160):
    """Tạo ảnh JPEG rỗng (không người)."""
    from PIL import Image
    import io
    img = Image.new("RGB", (w, h), (200, 200, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_draw_boxes_not_ready_raises():
    person_detect._model = None
    with pytest.raises(RuntimeError):
        person_detect.draw_person_boxes(make_jpeg_bytes())


def test_draw_boxes_zero_persons_with_fake_model():
    """Fake model trả 0 box → n_persons=0, boxed_bytes là JPEG hợp lệ."""
    class _FakeRes:
        def __init__(self): self.boxes = None
    class _FakeModel:
        def predict(self, img, **kw):
            return [_FakeRes()]
    person_detect._model = _FakeModel()
    boxed, n, head_ratio = person_detect.draw_person_boxes(make_jpeg_bytes())
    assert n == 0
    assert head_ratio is None
    assert boxed[:3] == b"\xff\xd8\xff"   # JPEG magic
    person_detect._model = None


def test_draw_boxes_one_person_with_fake_model():
    """Fake model trả 1 box → n_persons=1, vẽ 1 đường ngang đỏ ở đỉnh đầu."""
    import torch  # ultralytics dùng tensor
    class _FakeBox:
        def __init__(self):
            self.xyxy = [torch.tensor([10.0, 10.0, 100.0, 100.0])]
            self.conf = [torch.tensor([0.91])]
    class _FakeRes:
        def __init__(self): self.boxes = [_FakeBox()]
    class _FakeModel:
        def predict(self, img, **kw):
            return [_FakeRes()]
    person_detect._model = _FakeModel()
    boxed, n, head_ratio = person_detect.draw_person_boxes(make_jpeg_bytes(200, 200))
    assert n == 1
    assert head_ratio == pytest.approx(10.0 / 200)
    assert boxed[:3] == b"\xff\xd8\xff"
    person_detect._model = None
