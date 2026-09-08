# Tắt tạm 3 thiết bị đo bằng feature flag

Ngày: 2026-09-08

## Mục tiêu

Tạm dừng 3 thiết bị ngoại vi, ẩn phần UI điều khiển chúng, nhưng **giữ toàn bộ code** để bật lại bằng một dòng trong `.env`:

1. **Máy đọc CCCD** (Hanel HN-212 / `CccdService.exe`)
2. **Cân điện tử** (máy ngoài POST vào `/api/weight/push`)
3. **Đo chiều cao bằng YOLO** (`person_detect.py` + thước đo trên ảnh chân dung)

## Nguyên tắc bắt buộc

- **Giữ nguyên mọi trường dữ liệu.** Các trường CCCD (`cccd_number`, `full_name`, `dob`, `gender`, `hometown`, `address`, `ethnicity`, `religion`), `height_cm`, `weight_kg` vẫn nhập tay bình thường. Chỉ mất phần tự động điền từ máy.
- **Không xóa code.** Chỉ thêm nhánh điều kiện. Bật lại = sửa `.env` + restart.
- **Mặc định là BẬT.** Thiếu cờ trong `.env` → coi như `1`. Máy nào chưa cấu hình vẫn chạy y như trước.
- **Giữ tông thiết kế.** Không đổi màu, không đổi ảnh nền. Chỉ ẩn phần tử.

## Cờ điều khiển

Đặt trong `App_CCCD/.env` (thư mục cha của `app_cccd/`) — đây đã là nguồn sự thật duy nhất: `start-services.ps1` load nó vào env của session, `electron/main.js` (`ensureEnvFile`) cũng đọc nó.

```
FEATURE_CCCD_READER=0
FEATURE_WEIGHT_SCALE=0
FEATURE_HEIGHT_YOLO=0
```

Quy tắc parse: `"0"`, `"false"`, `"no"`, `"off"` (không phân biệt hoa thường) → tắt. Mọi giá trị khác, kể cả rỗng hoặc thiếu hẳn → bật.

## Thay đổi theo tầng

### 1. Backend — `backend/main.py`

Thêm helper `_env_bool(name, default=True)` cạnh `_env_float` (dòng ~59), rồi 3 hằng số `FEATURE_CCCD_READER` / `FEATURE_WEIGHT_SCALE` / `FEATURE_HEIGHT_YOLO`.

**YOLO chiều cao:**
- `main.py:191-192` — bọc `threading.Thread(target=person_detect.load_blocking, ...)` trong `if FEATURE_HEIGHT_YOLO:`. Không load model = tiết kiệm RAM/CPU lúc khởi động.
- `main.py:1722` — điều kiện `if type == "portrait" and person_detect.is_ready()` thêm `FEATURE_HEIGHT_YOLO and`. Không vẽ box.
- `main.py:1749` `GET /api/detect/health` — trả `{"ready": False, "enabled": False}` khi tắt, thay vì gọi `person_detect.get_status()`.

**Đọc CCCD:**
- `main.py:1951` `GET /api/cccd/health` — trả `{"ok": False, "disabled": True}` khi tắt, không gọi `_cccd_health()` (tránh chạm thư mục watcher).
- `main.py:1956`, `:1962`, `:1972`, `:1980` (`session/start`, `session/{sid}/wait`, `read_again`, `DELETE session`) — trả HTTP 503 kèm thông báo tiếng Việt "Máy đọc CCCD đang tắt".
- `main.py:2044` `POST /api/cccd/push` và `main.py:2085` `POST /api/cccd/upload_image` — cũng trả 503. Nhất quán: máy ngoài không đẩy dữ liệu vào được khi tính năng đã tắt.
- Giữ nguyên `import` từ `cccd_watcher` ở `main.py:1940` để không phải sửa cấu trúc; chỉ chặn ở tầng route.

**Cân nặng:**
- `main.py:2114` `POST /api/weight/push` — trả 503 khi tắt.
- `main.py:2128` `GET /api/weight/last` — trả `{"weight_kg": None, "disabled": True}`.
- `main.py:2133` `WS /api/weight/ws` — `await ws.close()` ngay sau accept, không đăng ký vào hub. Frontend sẽ không mở WS này khi cờ tắt, nhưng vẫn cần chặn phía server cho client cũ.

**Endpoint mới:**
- `GET /api/config/features` → `{"cccd_reader": bool, "weight_scale": bool, "height_yolo": bool}`. Đặt cạnh `/api/config/measurement` (`main.py:1858`) theo đúng pattern sẵn có. Không cần quyền admin — mọi user đăng nhập đều đọc được, vì UI cần nó để render.

### 2. Frontend — đọc cờ một lần rồi ẩn UI

`frontend/src/api.js` — thêm `featureConfig: () => request("/api/config/features")` cạnh `measurementConfig` (dòng 187).

Tạo `frontend/src/lib/features.js`: một module nhỏ fetch `/api/config/features` một lần, cache kết quả, export hook `useFeatures()`. Mặc định khi fetch lỗi = **tất cả bật** (giữ hành vi cũ, không tự ẩn UI vì lỗi mạng).

**`Dashboard.jsx`:**
- Dòng 284-289 `DEVICE_CHIPS` — lọc bỏ chip `cccd` khi `!cccd_reader`, bỏ chip `scale` khi `!weight_scale`. Chip `camera` và `fp` giữ nguyên.
- `useDeviceConnections` (dòng 498) — bỏ `checkCccd()` khỏi `Promise.all` khi cờ tắt; không mở WebSocket `/api/weight/ws` (dòng 550) khi cờ cân tắt.
- Dòng 3777 — ẩn card Settings "công thức đo chiều cao" (`settings.formula.*` + bảng preview) khi `!height_yolo`. Công thức vô nghĩa khi không có YOLO.

**`DetaineeForm.jsx`:**
- Dòng 52-65 — không gọi `weightApi.connect()` khi `!weight_scale`. Bỏ luôn state `weightFlash` khỏi luồng (giữ khai báo, chỉ không kích hoạt).
- Nút đọc CCCD (`readCCCD`, dòng 68) — ẩn nút khi `!cccd_reader`.
- Trường `weight_kg` **vẫn hiển thị và nhập tay được**.

**`DataCapturePage.jsx`:**
- Nút quét CCCD (luồng `readCccd` quanh dòng 860-926) — ẩn khi `!cccd_reader`.
- `useEffect` dòng 183 fetch `measurementConfig()` — bỏ qua khi `!height_yolo` (không cần `height_image`/`height_offset`).
- `applyMeasuredHeight` (dòng 250) — không tự set `height_cm`. Trường vẫn nhập tay.

**`capture/sections/SectionPortraits.jsx`:**
- Dòng 32-37 — khi `!height_yolo`: `showRuler={false}`, `onMeasureHeight={undefined}`, `useYolo={false}`. `LiveCamShot` đã nhận `useYolo = false` làm mặc định nên không cần sửa file đó.

Giữ nguyên `frontend/src/lib/heightMeasurement.js` — không ai gọi khi cờ tắt, nhưng để nguyên cho lúc bật lại.

### 3. Service không spawn — `start-services.ps1`

Bọc block `CccdService.exe` (dòng 78-106) trong điều kiện:

```powershell
if ($env:FEATURE_CCCD_READER -eq '0') {
    Write-Host "  -> CCCD Reader: TAT (FEATURE_CCCD_READER=0) - bo qua spawn."
} else {
    # ... block hien tai giu nguyen
}
```

Cân và YOLO không có process riêng — cân là máy ngoài POST vào, YOLO nằm trong backend — nên không cần sửa gì thêm ở đây.

`morfin_service` (8765, vân tay) và `usb_service` (8766) **không thay đổi**. Vân tay vẫn hoạt động bình thường.

## Giới hạn đã biết: bản đóng gói (packaged)

`electron/main.js` đã bị obfuscate và `main_source_ref.js` không chứa hàm `startServices()`, nên không có source gốc để sửa sạch. Hàm đó spawn `CccdService.exe` khi chạy bản packaged (`config.IS_PACKAGED`).

**Quyết định:** chỉ sửa `start-services.ps1` (đường chạy dev + `run-electron.ps1`). Bản packaged vẫn spawn `CccdService.exe`, nhưng backend đã chặn toàn bộ route `/api/cccd/*` nên process đó không có tác dụng gì — chỉ tốn khoảng một process nhàn rỗi. Chấp nhận được vì hiện đang chạy dev.

Nếu sau này cần tắt cả bản packaged: hoặc patch chuỗi trong `electron/main.js` đã obfuscate, hoặc tìm lại source gốc của nó.

## Kiểm chứng

1. `.env` đặt cả 3 cờ = `0`, khởi động backend → log không có dòng load YOLO; `GET /api/config/features` trả cả 3 `false`.
2. `GET /api/cccd/health` → `{"ok": false, "disabled": true}`; `POST /api/cccd/session/start` → 503.
3. `GET /api/detect/health` → `{"enabled": false}`.
4. Mở UI: header chỉ còn chip `camera` + `fp`; không có nút đọc/quét CCCD; không có thước đo trên ảnh chân dung; Settings không có card công thức chiều cao.
5. **Quan trọng:** mở form nhập → gõ tay được đầy đủ số CCCD, họ tên, ngày sinh, quê quán, địa chỉ, dân tộc, tôn giáo, chiều cao, cân nặng. Lưu thành công, dữ liệu vào DB đúng.
6. Chạy `start-services.ps1` → có dòng "CCCD Reader: TAT"; `Get-Process CccdService` rỗng; port 8765/8766 vẫn listen (vân tay + USB còn sống).
7. Xóa 3 cờ khỏi `.env`, restart → mọi thứ trở lại như trước (chip đầy đủ, nút quét hiện lại, YOLO load).

## Ngoài phạm vi

- Không sửa `electron/main.js` (obfuscated — xem mục Giới hạn).
- Không xóa file service nào: `backend/services/weight/`, `backend/services/cccd_scanner/`, `backend/person_detect.py`, `backend/weight_hub.py`, `backend/cccd_watcher.py` giữ nguyên trên đĩa.
- Không đụng vân tay (`morfin_service`), USB, nhận diện khuôn mặt.
- Không đổi màu sắc, ảnh nền, hay bố cục chung.
