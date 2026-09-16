# Services — App_CCCD (instance `Vali_hientruong`: port 8767 / 8768)

Các service phần cứng chạy native (không Docker, cần truy cập USB/COM/BLE).

| Service | Thư mục | Port | Venv | Cách chạy riêng |
|---|---|---|---|---|
| USB dongle | `usb_service/` | 8768 | `app_cccd/.venv` | `uvicorn --app-dir backend\services\usb_service api:app --host 127.0.0.1 --port 8768` |
| Vân tay (Morfin) | `morfin_service/` | 8767 | `app_cccd/.venv` | `uvicorn --app-dir backend\services\morfin_service api:app --host 127.0.0.1 --port 8767` |
| CccdService (.NET) | `cccd_scanner/` | — | binary riêng | xem `cccd_scanner/README.md` |
| Cân kỹ thuật | `weight/` | — | `app_cccd/.venv` | `python weight/main.py` |

Tất cả service Python dùng chung venv `app_cccd/.venv`. Cài deps:
```powershell
.\.venv\Scripts\Activate.ps1
pip install -r backend\services\usb_service\requirements.txt
pip install -r backend\services\morfin_service\requirements.txt
pip install -r backend\services\weight\requirements.txt
```

Start cả usb + vân tay (morfin):
```powershell
.\start-services.ps1
```
