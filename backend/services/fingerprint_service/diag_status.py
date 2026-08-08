"""Chẩn đoán: in từng trạng thái sensor trả về theo thời gian thực.

Chạy:
    .\.venv\Scripts\python.exe backend\services\fingerprint_service\diag_status.py

Đặt ngón tay lên sensor nhiều lần (khô, ướt, đặt lệch...) và xem status:
    - ok          : chụp + trích template thành công
    - bad_quality : CÓ ngón tay nhưng ảnh kém (nguyên nhân "lúc được lúc không")
    - no_finger   : chưa có ngón tay
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import zkfp

z = zkfp.ZKFP()
z.init()
if z.device_count() < 1:
    print("KHONG TIM THAY THIET BI. Kiem tra USB / driver.")
    sys.exit(1)
z.open(0)
print(f"Thiet bi OK: {z.width}x{z.height}. Dat ngon tay len sensor, Ctrl+C de thoat.\n")

counts = {"ok": 0, "bad_quality": 0, "no_finger": 0}
try:
    while True:
        status, img, tmpl = z.acquire_status()
        counts[status] = counts.get(status, 0) + 1
        print(f"[{time.strftime('%H:%M:%S')}] status={status:<12} "
              f"(ok={counts['ok']} bad={counts['bad_quality']} no_finger={counts['no_finger']})")
        time.sleep(0.15)
except KeyboardInterrupt:
    print("\n--- Tong ket ---")
    for k, v in counts.items():
        print(f"  {k}: {v}")
    z.terminate()