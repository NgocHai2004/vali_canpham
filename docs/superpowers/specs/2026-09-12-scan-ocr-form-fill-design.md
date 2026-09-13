# Scan Chỉ bản / Danh bản → điền form đăng ký

Ngày: 2026-09-12. Trạng thái: **đã triển khai** (backend + frontend + client OCR).

## Mục đích

ScanSnap iX1400 quét Chỉ bản (295) / Danh bản (204) → service OCR (`ScanSnap_iX1400_Driver_AutoInstall`) nhận diện → đẩy kết quả vào **đúng một** form đăng ký đang mở trong App_CCCD. Cán bộ kiểm tra rồi bấm Lưu.

## Nguyên tắc (thỏa thuận với cán bộ sử dụng — bắt buộc)

Kết quả scan chỉ được chèn vào form đăng ký khi **cả ba** điều kiện đúng:

1. File scan trả về **đúng một** đối tượng (một `HoSo`; một PDF 2 trang Chỉ bản + Danh bản của cùng một người vẫn tính là một đối tượng).
2. Đối tượng đó là Chỉ bản (295) hoặc Danh bản (204), có đủ 12 số CCCD.
3. Có **đúng một** form đăng ký đang mở và còn "sống" tại thời điểm đó.

Thiếu bất kỳ điều kiện nào → **từ chối kèm lý do**, không giữ lại để chèn sau. Một form mở sau khi file đã đi qua thì không được nhận dữ liệu của file đó. Không chèn vào form sửa hồ sơ có sẵn.

Khác đầu đọc CCCD: đầu đọc đọc cho riêng từng người nên phát cho mọi session đang mở là an toàn; một lần quét có thể chứa nhiều hồ sơ, chèn nhầm form là sai hồ sơ.

## Kiến trúc

```
ScanSnap Home → scan_paper/ → service OCR (app/api_server.py)
   → pair_all(sheets của file) → POST /api/scan/push (X-Scan-Key)
   → App_CCCD scan_inbox.push() → đúng 1 form đang mở → long-poll
   → DataCapturePage.applyScanData() → form → cán bộ bấm Lưu
```

Hai khái niệm session **không trùng nhau**:

- `work_sessions` — trả lời "hồ sơ này LƯU vào đâu" (chỉ dùng khi bấm Lưu).
- `capture_session` (mới) — trả lời "kết quả scan này THUỘC VỀ form nào". Tạo khi form đăng ký MỚI hiện lên, xóa khi lưu/hủy/điều hướng khác/chuyển sang sửa.

## Thay đổi

### App_CCCD backend

- `scan_inbox.py` (mới): hộp thư scan. `capture_start/end/wait`, `push(payload)`, `fields_tu_ho_so`, `parse_ngay`. Ba cửa chặn trong `push()`. Map OCR field → `DetaineeIn` field.
- `main.py`:
  - `FEATURE_SCAN_OCR = _env_bool("FEATURE_SCAN_OCR")` (mặc định bật).
  - `/api/config/features` thêm `scan_ocr`.
  - Routes: `POST /api/scan/capture/start`, `GET /api/scan/session/{sid}/wait` (204 timeout / 404 mất session), `DELETE /api/scan/session/{sid}`, `POST /api/scan/push` (key `X-Scan-Key` ↔ `SCAN_API_KEY`).

### Service OCR (`ScanSnap_iX1400_Driver_AutoInstall`)

- `app/push_client.py` (mới): `push_ho_so(ho_so, url, api_key, timeout)` → POST JSON. Không bao giờ ném; lỗi mạng → dict lỗi.
- `app/api_server.py`: `Service` nhận `push_func`; `_ket_qua` gọi `_day_sang_app(sheets)` gửi `pair_all(sheets, include_open=True)` của **đúng file vừa quét**. `--push-url` / `--no-push`. `loiPush` hiện ở `/health`.

### Frontend

- `api.js`: `scanApi` (`startCapture`, `wait`, `cancel`); `cccdRequest` xử lý 401-DELETE cho cả `/api/scan/session/`.
- `DataCapturePage.jsx`: effect long-poll scan, gated `!sessionReadOnly && !isEdit && features.scan_ocr`; `applyScanData` điền form (không ghi đè gì cán bộ đã gõ tay); cleanup `scanApi.cancel(sid)`.
- `lib/features.js`: thêm `scan_ocr`.
- `locales/{vi,en}.json`: `capture.status.scan_read`.

## Map trường

OCR field → `DetaineeIn`: `hoTen→full_name`, `tenGoiKhac→alias`, `sinhNgay→dob`, `cmndCccd→cccd_number` (12 số), `queQuan→hometown`, `noiThuongTru→address`, `noiTamTru→temp_address`, `noiOHienNay→current_address`, `quocTich→nationality`, `danToc→ethnicity`, `ngheNghiep→occupation`, `hoTenCha→father_name`, `hoTenMe→mother_name`, `lapVeViec→case_about`, `ctVanTay→fp_formula`, `batDauNgay→arrest_date`, `donViBat→arrest_agency`, `canBoLap→officer_name`, `canBoPhanLoai→officer_classifier`, `canBoKtPhanLoai→officer_class_checker`, `lapNgay→record_date`. `so` của danh bản → `record_sheet_no`, của chỉ bản → `fp_sheet_no`. Ngày → `YYYY-MM-DD`.

## Kiểm thử

- `app_cccd/backend/tests/test_scan_inbox.py` (34): cửa chặn, map trường, long-poll.
- `app_cccd/backend/tests/test_scan_api.py` (14): route, key, feature flag.
- `ScanSnap_iX1400_Driver_AutoInstall/tests/test_push_client.py` (19): client, gắn vào `Service`, CLI.

Lệnh chạy:
```
cd app_cccd/backend && ../.venv/Scripts/python.exe -m pytest tests/ -q
cd ScanSnap_iX1400_Driver_AutoInstall && PYTHONIOENCODING=utf-8 python -m pytest tests/ -q
cd app_cccd/frontend && node_modules/.bin/vite build
```

## Cấu hình khi triển khai

- Backend: đặt `SCAN_API_KEY` trong `.env` (nếu để trống thì push không cần key — chỉ nội bộ).
- OCR: `SCAN_PUSH_URL` / `SCAN_PUSH_KEY` env, hoặc `--push-url` / `--no-push` khi chạy `python -m app.api_server`.