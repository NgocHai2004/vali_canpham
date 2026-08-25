"""InsightFace (buffalo_sc) face recognition — extract embedding 512d + cosine match.

Singleton pattern giống person_detect.py: load 1 lần ở startup trong threadpool,
is_ready()/get_status()/load_blocking(). Fail → caller fallback yên lặng.
Fallback Haar Cascade khi InsightFace chưa ready hoặc không detect mặt.
"""
import logging
import os
import threading

import numpy as np

_log = logging.getLogger("face_recognition")

MODEL_NAME = "buffalo_sc"
MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "model_insight")
DET_SIZE = (640, 640)
# -1 = CPU. Đặt 0 (GPU) nếu máy có CUDA + onnxruntime-gpu; CPU đủ cho vài nghìn hồ sơ.
CTX_ID = int(os.getenv("FACE_CTX_ID", "-1"))
EMBED_DIM = 512
DEFAULT_THRESHOLD = float(os.getenv("FACE_MATCH_THRESHOLD", "0.4"))

_app = None          # insightface.app.FaceAnalysis instance
_lock = threading.Lock()
_load_error = None


def is_ready() -> bool:
    return _app is not None


def get_status() -> dict:
    return {
        "ready": is_ready(),
        "model": MODEL_NAME,
        "device": "gpu" if CTX_ID >= 0 else "cpu",
        "det_size": list(DET_SIZE),
        "embed_dim": EMBED_DIM,
        "threshold": DEFAULT_THRESHOLD,
        "error": _load_error,
    }


def load_blocking() -> None:
    """Load buffalo_sc 1 lần. Gọi ở startup (threadpool). Fail → _app=None, log lỗi."""
    global _app, _load_error
    with _lock:
        if _app is not None:
            return
        try:
            from insightface.app import FaceAnalysis
            app = FaceAnalysis(name=MODEL_NAME, root=MODELS_DIR, ctx_id=CTX_ID)
            app.prepare(ctx_id=CTX_ID, det_size=DET_SIZE)
            # warmup
            dummy = np.zeros((640, 480, 3), dtype=np.uint8)
            app.get(dummy)
            _app = app
            _load_error = None
            _log.info("face_recognition: model ready (device=%s)", CTX_ID)
        except Exception as e:  # noqa: BLE001
            _load_error = str(e)
            _log.exception("face_recognition: load model FAIL: %s", e)


def get_embedding(img_bytes: bytes):
    """Trả (embedding np.float32(512)|None, n_faces, method).

    - InsightFace ready + detect được face → embedding face lớn nhất, method='insightface'.
    - Không ready / 0 face / ảnh hỏng → (None, n, 'none').
    """
    if _app is None:
        return None, 0, "none"
    try:
        import cv2
        arr = np.frombuffer(img_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return None, 0, "none"
        faces = _app.get(img)
        if not faces:
            return None, 0, "none"
        # face lớn nhất (area lớn nhất)
        face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        emb = np.asarray(face.embedding, dtype=np.float32)
        return emb, len(faces), "insightface"
    except Exception as e:  # noqa: BLE001
        _log.warning("face_recognition get_embedding fail: %s", e)
        return None, 0, "none"


def match(embedding, candidates, threshold=None):
    """Cosine similarity vs list candidates. Trả list[{'_id': str, 'score': float}] sort desc, score>=threshold.

    candidates: list dict, mỗi dict có '_id' (str|ObjectId) + 'face_embedding' (list 512 float).
    """
    if embedding is None or not candidates:
        return []
    if threshold is None:
        threshold = DEFAULT_THRESHOLD
    emb = np.asarray(embedding, dtype=np.float32)
    norm = np.linalg.norm(emb)
    if norm == 0:
        return []
    emb = emb / norm
    out = []
    for c in candidates:
        vec = c.get("face_embedding")
        if not vec:
            continue
        v = np.asarray(vec, dtype=np.float32)
        vn = np.linalg.norm(v)
        if vn == 0:
            continue
        score = float(np.dot(emb, v / vn))
        if score >= threshold:
            out.append({"_id": str(c["_id"]), "score": score})
    out.sort(key=lambda r: -r["score"])
    return out
