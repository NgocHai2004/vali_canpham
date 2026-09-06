FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# cv2 (insightface keo opencv-python ban GUI) can cac shared lib nay tren slim.
RUN apt-get update && apt-get install -y --no-install-recommends         libgl1 libglib2.0-0 libxcb1 libsm6 libxext6 libxrender1     && rm -rf /var/lib/apt/lists/*

COPY . .

RUN mkdir -p /app/data_cccd /app/uploads /app/fp

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
