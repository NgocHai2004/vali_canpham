"""
Cau hinh cho JPD-700A BLE Gateway (ban Windows).
Dich tu JpdBleConstants.kt cua app Android.
Sua cac gia tri o day de doi thiet bi / cach xuat du lieu.
"""

import os
from pathlib import Path

# ===== BLE UUID (Chipsea / CC254x - service FFF0) =====
SERVICE_UUID      = "0000fff0-0000-1000-8000-00805f9b34fb"
CHAR_WRITE_UUID   = "0000fff1-0000-1000-8000-00805f9b34fb"  # ghi lenh wakeup
CHAR_NOTIFY_UUID  = "0000fff4-0000-1000-8000-00805f9b34fb"  # nhan data can

# Service Weight Scale chuan BLE (JPD Scale doi moi co the dung)
WEIGHT_SERVICE_UUID = "0000181a-0000-1000-8000-00805f9b34fb"
WEIGHT_CHAR_UUID    = "00002a9c-0000-1000-8000-00805f9b34fb"

# ===== Match thiet bi =====
# Ten quang ba chua chuoi nay (khong phan biet hoa thuong) HOAC dung MAC.
TARGET_NAME_PREFIX = "JPD"
# De None neu khong muon loc theo MAC. Tren Windows dia chi co dang "CB:20:21:03:2E:C2".
TARGET_MAC = os.getenv("WEIGHT_SCALE_MAC", "CB:20:21:03:2E:C2")

# ===== Lenh wakeup (mot so can Chipsea can ghi moi day data) =====
WAKEUP_CMDS = [
    bytes([0x55, 0xAA, 0x00, 0x01, 0x01, 0x00, 0x01]),  # subscribe realtime (template Jumper)
    bytes([0xAA, 0x21, 0x00, 0x0D]),                    # yeu cau ban tin can (Chipsea 0x21)
    bytes([0xAA, 0x20, 0x00, 0x0D]),                    # query weight
    bytes([0xAB, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00]),  # wakeup khac
]

# ===== Nguon goc / xuat du lieu =====
SOURCE_ID = "scale-01"
# ID thiet bi (phan biet neu co nhieu can). Hien de = SOURCE_ID.
DEVICE_ID = "scale-01"

# Chi in/luu khi can da on dinh (stable=True). Dat False de lay moi ban do.
SEND_ONLY_STABLE = True

# Luu moi ban ghi JSON vao file (1 dong / ban ghi). De None neu chi muon in ra man hinh.
_BASE = Path(__file__).resolve().parent
LOG_FILE = str(_BASE / "weight_log.jsonl")

# Thoi gian quet toi da (giay) truoc khi thu lai.
SCAN_TIMEOUT = 15.0

# ============================================================
# ===== DAY JSON LEN TRANG WEB DANG KY CUA BAN (production) ==
# ============================================================
# >>> DAT DAY DU URL API cua trang web ban o day. <<<
# Vi du:
#   https://myapp.com/api/weight
#   https://api.example.com/v1/scales/ingest
# Neu de trong ("") thi khong gui (chi luu file local).
RECEIVER_URL = "http://127.0.0.1:8000/api/weight/push"

# Bat/tat viec gui len web. False = chi luu file local, khong gui.
SEND_TO_RECEIVER = True

# ----- Xac thuc voi web API cua ban -----
# Moi web xac thuc mot kieu. Chon kieu header cho khop:
#   "bearer"  -> gui header:  Authorization: Bearer <AUTH_TOKEN>
#   "apikey"  -> gui header:  X-API-Key: <AUTH_TOKEN>
#   "custom"  -> gui header:  <AUTH_HEADER_NAME>: <AUTH_TOKEN>
#   "none"    -> khong gui header xac thuc
AUTH_MODE = "none"
AUTH_TOKEN = ""
AUTH_HEADER_NAME = "Authorization"   # chi dung khi AUTH_MODE = "custom"

# File dem khi web tam khong truy cap duoc -> gui bu sau (khong mat so can).
QUEUE_FILE = str(_BASE / "pending_queue.jsonl")

# Timeout moi lan gui (giay).
SEND_TIMEOUT = 10.0

# So lan thu lai ngay lap tuc truoc khi cat vao hang doi.
SEND_RETRIES = 2

# Thu muc log cho ban chay nen (service_run.py).
LOG_DIR = str(_BASE / "logs")
