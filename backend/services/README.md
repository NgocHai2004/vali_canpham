# Services — App_CCCD

Các service phần cứng chạy native (không Docker, cần truy cập USB/COM/BLE).

| Service | Thư mục | Port | Venv | Cách chạy riêng |
|---|---|---|---|---|
| USB dongle | `usb_service/` | 8766 | `app_cccd/.venv` | `uvicorn --app-dir backend\services\usb_service api:app --host 127.0.0.1 --port 8766` |
| Vân tay (Morfin) | `morfin_service/` | 8765 | `app_cccd/.venv` | `uvicorn --app-dir backend\services\morfin_service api:app --host 127.0.0.1 --port 8765` |

Tất cả service Python dùng chung venv `app_cccd/.venv`. Cài deps:
```powershell
.\.venv\Scripts\Activate.ps1
pip install -r backend\services\usb_service\requirements.txt
pip install -r backend\services\morfin_service\requirements.txt
```

Start cả usb + fingerprint:
```powershell
.\start-services.ps1
```
