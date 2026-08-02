# Services — App_CCCD

Các service phần cứng chạy native (không Docker, cần truy cập USB/COM/BLE).

| Service | Thư mục | Port | Venv | Cách chạy riêng |
|---|---|---|---|---|
| USB dongle | `usb_service/` | 8766 | `app_cccd/.venv` | `uvicorn --app-dir backend\services\usb_service api:app --host 127.0.0.1 --port 8766` |
| Fingerprint (ZK) | `fingerprint_service/` | 8765 | `app_cccd/.venv` | `uvicorn --app-dir backend\services\fingerprint_service api:app --host 127.0.0.1 --port 8765` |
| CccdService (.NET) | `cccd_scanner/` | — | binary riêng | xem `cccd_scanner/README.md` |
| Cân kỹ thuật | `weight/` | — | `app_cccd/.venv` | `python weight/main.py` |

Tất cả service Python dùng chung venv `app_cccd/.venv`. Cài deps:
```powershell
.\.venv\Scripts\Activate.ps1
pip install -r backend\services\usb_service\requirements.txt
pip install -r backend\services\fingerprint_service\requirements.txt
pip install -r backend\services\weight\requirements.txt
```

Start cả usb + fingerprint:
```powershell
.\start-services.ps1
```
