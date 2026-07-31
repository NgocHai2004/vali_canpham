"""YOLO person detection — vẽ bbox người lên ảnh chân dung.

Singleton model load 1 lần ở startup. Chạy CPU. Nếu model chưa ready,
draw_person_boxes ném RuntimeError để caller tự fallback ảnh gốc.
"""
import io
import logging
import os
import threading

_log = logging.getLogger("person_detect")

MODEL_NAME = "yolo26n.pt"
# Ưu tiên model đã có sẵn trong app_cccd/models/, nếu không có thì để YOLO tự tải.
_MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
_LOCAL_MODEL = os.path.join(_MODELS_DIR, MODEL_NAME)
MODEL_PATH = _LOCAL_MODEL if os.path.exists(_LOCAL_MODEL) else MODEL_NAME

PERSON_CLS = 0          # COCO class 0 = person
CONF_THRES = 0.35
DEVICE = "cpu"

# Trạng thái module (singleton)
_model = None
_lock = threading.Lock()
_load_error = None


def is_ready() -> bool:
    return _model is not None


def get_status() -> dict:
    return {
        "ready": is_ready(),
        "model": MODEL_NAME,
        "device": DEVICE,
        "error": _load_error,
    }


def load_blocking() -> None:
    """Load + warmup model. Gọi 1 lần ở startup (trong threadpool).
    Fail → log lỗi, _model vẫn None, is_ready()=False.
    """
    global _model, _load_error
    with _lock:
        if _model is not None:
            return
        try:
            from ultralytics import YOLO
            _log.info("person_detect: đang load %s ...", MODEL_PATH)
            m = YOLO(MODEL_PATH)          # tự tải lần đầu nếu chưa có
            m.to(DEVICE)
            # warmup 1 lần
            import numpy as np
            dummy = np.zeros((640, 480, 3), dtype=np.uint8)
            m.predict(dummy, verbose=False)
            _model = m
            _load_error = None
            _log.info("person_detect: model ready (device=%s)", DEVICE)
        except Exception as e:           # noqa: BLE001
            _load_error = str(e)
            _log.exception("person_detect: load model FAIL: %s", e)


def draw_person_boxes(img_bytes: bytes):
    """Trả (boxed_jpeg_bytes, n_persons).

    - Chưa ready → RuntimeError (caller fallback ảnh gốc).
    - Ảnh hỏng → raise exception gốc.
    - 0 người → trả (ảnh gốc re-encode JPEG, 0).
    """
    if _model is None:
        raise RuntimeError("person_detect model chưa ready")
    from PIL import Image, ImageDraw
    import time

    t0 = time.time()
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    results = _model.predict(img, conf=CONF_THRES, classes=[PERSON_CLS], verbose=False)
    boxes = results[0].boxes
    n_persons = 0
    best_conf = 0.0
    draw = ImageDraw.Draw(img)
    if boxes is not None and len(boxes) > 0:
        for b in boxes:
            x1, y1, x2, y2 = b.xyxy[0].tolist()
            conf = float(b.conf[0])
            best_conf = max(best_conf, conf)
            # Chỉ vẽ 1 đường ngang màu đỏ ở mép trên bbox (đỉnh đầu) làm mốc đo chiều cao.
            # Không vẽ nhãn, không vẽ khung.
            draw.line([(x1, y1), (x2, y1)], fill=(255, 0, 0), width=3)
            n_persons += 1
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=92)
    ms = int((time.time() - t0) * 1000)
    _log.info("person_detect ok n=%d conf=%.2f ms=%d", n_persons, best_conf, ms)
    return out.getvalue(), n_persons
