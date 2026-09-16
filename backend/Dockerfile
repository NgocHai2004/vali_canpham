# App_CCCD backend image
# Build context = ./app_cccd (root của app) để có thể COPY model_insight/ (ngoài backend/).
# Base: python 3.11-slim (Debian) — insightface/onnxruntime hỗ trợ tốt, tránh musl/alpine.

FROM python:3.11-slim AS build

# System libs cần để cài onnxruntime + insightface + opencv-headless (build stage)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        cmake \
        libgomp1 \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements trước để tận dụng Docker layer cache
COPY backend/requirements.txt ./backend/requirements.txt

# Loại bỏ ultralytics (kéo theo torch hàng GB, không được main.py dùng) —
# tạo file tạm, GIỮ NGUYÊN requirements.txt gốc cho môi trường dev Windows.
# Thêm opencv-python-headless (cv2, face_recognition_service dùng) không có trong file gốc.
RUN grep -v -i "^ultralytics" backend/requirements.txt > backend/requirements.docker.txt \
    && echo "opencv-python-headless" >> backend/requirements.docker.txt

RUN pip install --no-cache-dir -r backend/requirements.docker.txt

# Copy mã nguồn + model insight (buffalo_sc) vào image — self-contained
COPY backend/ /app/backend/
COPY model_insight/ /app/model_insight/

# Stage chạy — bỏ build-essential/cmake để image gọn
FROM python:3.11-slim

# System libs runtime: onnxruntime cần libgomp1; opencv-headless cần libgl1 + libglib2.0-0
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=build /app/backend /app/backend
COPY --from=build /app/model_insight /app/model_insight

WORKDIR /app/backend

ENV PYTHONUNBUFFERED=1 \
    FACE_CTX_ID=-1 \
    DB_NAME=app_cccd_master

EXPOSE 8000

# HEALTHCHECK qua Python stdlib (không cần curl trong image)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=5)"

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]