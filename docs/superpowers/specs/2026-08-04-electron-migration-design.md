# Chuyển App_CCCD sang Electron: ổn định hơn & khó lộ công nghệ

Ngày: 2026-08-04
Trạng thái: Design (đã duyệt qua brainstorming)

## 1. Bối cảnh & vấn đề

App_CCCD hiện chạy dưới dạng nhiều tiến trình rời rạc, được ghép lại bằng
PowerShell (`run.ps1`, `kiosk/launch-kiosk.ps1`) và hiển thị qua Microsoft Edge
ở chế độ `--app`:

- **Backend**: FastAPI (`app_cccd/backend/main.py`, port 8000, đang bind `0.0.0.0`)
  + YOLO/PyTorch (`models/yolo26n.pt`) + các service con: `cccd_scanner` (.NET),
  `fingerprint_service` (8765), `usb_service` (8766, dongle bản quyền), `weight`.
- **Frontend**: React 19 + Vite dev server (port 5173).
- **MongoDB**: qua Docker hoặc `mongo_portable` (27017).
- **Hiển thị**: Edge `--app` trỏ vào `http://localhost:5173`, dùng Win32
  `MoveWindow`/F11 ép fullscreen 2 màn hình, `kiosk-guard.ahk` chặn thoát.

### Vấn đề

1. **Không ổn định**: 4 cửa sổ độc lập, không ai quản lý vòng đời. Service chết
   là chết một mình, không tự phục hồi. Đóng app còn sót tiến trình/cửa sổ mồ côi.
   Layout 2 màn hình bằng MoveWindow/F11 dễ vỡ. Màn hình trắng lúc backend
   chưa load xong YOLO.
2. **Lộ công nghệ**:
   - Người dùng cuối: thấy đây là trình duyệt (mở DevTools được, thấy
     `localhost:5173`, thấy React), thoát ra desktop được.
   - Người soi source: frontend chạy dev server không minify; backend là `.py`
     đọc thẳng.
   - Crack/copy: model YOLO nằm trần trên đĩa; `.py` chạy được ở máy khác; backend
     bind `0.0.0.0` lộ ra LAN.

### Mục tiêu

- Chạy ổn định hơn: một tiến trình cha quản lý toàn bộ vòng đời, tự phục hồi,
  teardown sạch.
- Khó lộ công nghệ ở 3 tầng: chống người dùng cuối, chống soi source, chống
  crack/copy — ở mức thực tế đạt được với giải pháp client-side.

### Phi mục tiêu

- Không viết lại backend sang ngôn ngữ khác (YOLO/PyTorch ràng buộc Python).
- Không đạt bảo vệ IP tuyệt đối bằng giải pháp client-side (xem "Giới hạn").
- Không làm biến thể server-hosted (Hướng C) trong spec này — để dành cho khách
  cần bảo vệ IP tối đa.

## 2. Kiến trúc tổng thể

Một app Electron làm **vỏ + orchestrator**. Các thành phần nặng chạy như tiến
trình con ẩn, do Electron quản lý vòng đời.

```
┌─ Electron App (App_CCCD.exe) ─────────────────────────────┐
│                                                            │
│  Main process (Node)          Renderer (React build)       │
│  ├─ Kiosk lockdown            ├─ frontend hiện tại          │
│  ├─ Quản lý vòng đời          │   (build tĩnh, load qua      │
│  │   tiến trình con           │    app:// protocol)         │
│  ├─ Watchdog + health-check   └─ gọi API → 127.0.0.1:8000   │
│  └─ spawn/kill PID tracking                                 │
│         │                                                   │
│         ├─→ backend(.exe)  FastAPI + YOLO, bind 127.0.0.1:8000
│         │      └─ usb / fingerprint / weight (giữ như hiện tại)
│         └─→ mongod.exe     Mongo portable, bind 127.0.0.1:27017
└────────────────────────────────────────────────────────────┘
```

Nguyên tắc thiết kế:

- **Không còn Vite dev server (5173)**. Frontend build tĩnh, Electron load qua
  custom protocol `app://` → không lộ `localhost:5173`.
- **Chỉ bind `127.0.0.1`** cho backend và Mongo → không lộ ra LAN (khác hiện tại
  đang `0.0.0.0`).
- **Electron là tiến trình cha** → đóng app kill sạch mọi con, không mồ côi.
- **Dongle USB giữ nguyên** vai trò khoá bản quyền.
- **contextIsolation + nodeIntegration=false** → renderer không chạm Node.

## 3. Lockdown & các lớp bảo vệ

### Tầng 1 — Chống người dùng cuối (Electron làm tốt, thay Edge)

- Cửa sổ `kiosk: true` + `fullscreen`, không frame, không menu bar.
- `devTools: false`, chặn phím tắt: **F12, Ctrl+Shift+I, Ctrl+R, Ctrl+W,
  Alt+F4, Ctrl+P, phím Win**.
- Chặn menu chuột phải, kéo-thả file, mở cửa sổ mới / link ngoài
  (`setWindowOpenHandler` → deny).
- Watchdog cửa sổ: đóng bất thường thì mở lại (thay `kiosk-guard.ahk`).
- Quản lý 2 màn hình bằng Electron `screen` API thay MoveWindow/F11.

#### Dev escape hatch — Ctrl+Shift+Q

- Tổ hợp ít trùng, không phải phím người dùng vô tình bấm.
- Khi bấm (chỉ bản dev): thoát fullscreen/kiosk, cho Alt+Tab ra desktop chọn app
  khác để dev. **Không** kill backend, **không** đóng app — chỉ nhả khoá hiển thị.
- **Bị strip khỏi build production tại compile-time** (không phải kiểm tra
  runtime), qua 2 build target `dev` / `prod`. Bản prod không chứa code phím này
  → không thể mở lại bằng chỉnh `.env`/registry.

### Tầng 2 — Chống soi source (làm chậm, không tuyệt đối)

- Frontend build production (minify + tree-shake), **không** sourcemap.
- `bytenode`: biên dịch code main-process JS thành V8 bytecode `.jsc`.
- Bật `asar` + `integrity` check (Electron verify hash asar khi chạy).
- Đặt tên tiến trình/cửa sổ trung tính (không "Electron", không "React").

### Tầng 3 — Chống crack/copy (backend là trọng tâm)

- Backend Python → biên dịch bằng **Nuitka** thành `backend.exe` (dịch sang C,
  khó reverse hơn PyInstaller). Không còn `.py` lộ ra.
- Model YOLO (`yolo26n.pt`) mã hoá AES khi đóng gói, giải mã trong RAM lúc load.
- **Dongle USB giữ nguyên** làm khoá bản quyền; backend từ chối khởi động nếu
  dongle không hợp lệ.
- Backend bind `127.0.0.1` + token nội bộ Electron↔backend để renderer / tiến
  trình khác không gọi API trực tiếp được.

### Giới hạn (nói rõ với người vận hành)

Tầng 2 và 3 **làm chậm** người quyết tâm chứ không chặn tuyệt đối. Không có giải
pháp client-side nào đạt 100%. Muốn tuyệt đối phải để backend chạy trên server
mình giữ (Hướng C). Với ràng buộc "giao cho khách tự cài", đây là mức thực tế
tốt nhất.

## 4. Khởi động & quản lý vòng đời

### Thứ tự khởi động (có splash screen trung tính)

1. Electron khởi động → hiện splash ("Đang khởi động…"), chưa mở cửa sổ chính.
2. Kiểm tra dongle USB hợp lệ → không có thì báo và dừng.
3. Spawn `mongod.exe` (portable, `127.0.0.1:27017`) → chờ port sẵn sàng.
4. Spawn backend → **poll `/api/health`** tới khi backend báo sẵn sàng (YOLO load
   mất vài giây — splash che khoảng này, tránh màn hình trắng).
5. Backend healthy → load frontend qua `app://`, chuyển splash sang cửa sổ kiosk.

### Giám sát khi chạy (watchdog)

- Theo dõi từng tiến trình con. Backend/Mongo chết bất ngờ:
  - Tự restart (tối đa N lần), ghi log.
  - Trong lúc restart hiện lại splash "Đang kết nối lại…".
  - Quá N lần → màn hình lỗi thân thiện, không phơi stack trace.
- Health-check định kỳ `/api/health` để phát hiện backend treo.

### Tắt app (teardown sạch)

- Kill theo thứ tự ngược: frontend → backend → Mongo, theo PID đã track.
- Không để lại tiến trình mồ côi.

### Cổng nội bộ

- Backend + Mongo chỉ bind `127.0.0.1`. Không còn `0.0.0.0:8000`. Không còn Vite.

### MongoDB

- **Bundle `mongo_portable`** vào app (không dùng Docker cho bản đóng gói — khách
  không phải cài Docker Desktop).

## 5. Đóng gói & build targets

### Hai build target

- **`dev`**: có Ctrl+Shift+Q, backend chạy từ venv Python trực tiếp (build nhanh,
  sửa code không compile lại), DevTools bật được bằng cờ ẩn. Dùng khi phát triển.
- **`prod`**: Ctrl+Shift+Q bị strip (compile-time), backend là `backend.exe`
  (Nuitka), model mã hoá, bytenode, asar integrity. Bản giao khách / kiosk thật.

### Đóng gói

`electron-builder` → 1 file cài `.exe` (NSIS). Cấu trúc runtime:

```
App_CCCD/
├─ App_CCCD.exe            (Electron launcher, tên/icon trung tính)
├─ resources/
│  ├─ app.asar             (main process bytenode + frontend build)
│  ├─ backend/backend.exe  (Nuitka, kèm YOLO đã mã hoá)
│  └─ mongo/mongod.exe     (portable)
└─ ...
```

## 6. Lộ trình theo giai đoạn

Spec mô tả cả 2 giai đoạn; plan/implement **giai đoạn 1 trước**.

- **Giai đoạn 1 (nền tảng)**: Electron shell, spawn backend Python từ venv hiện
  có, kiosk lockdown (Tầng 1), watchdog, splash, Ctrl+Shift+Q, bind 127.0.0.1,
  bỏ Vite, bundle mongo_portable, quản lý 2 màn hình. → Chạy ổn định thay Edge
  ngay, chống người dùng cuối. Backend vẫn là `.py`.
- **Giai đoạn 2 (cứng hoá)**: Nuitka compile backend, bytenode, mã hoá model,
  asar integrity, token nội bộ, electron-builder ra installer prod. → Chống soi
  source + crack.

## 7. Rủi ro & lưu ý

- **Nuitka build** với PyTorch/YOLO có thể phức tạp (dependency lớn, thời gian
  build lâu) — cần thử nghiệm sớm trong giai đoạn 2; nếu quá khó, cân nhắc
  PyInstaller làm phương án lùi (kém an toàn hơn nhưng ổn định hơn).
- **cccd_scanner (.NET)**: đã có binary riêng; cần quyết đóng gói kèm hay giữ
  ngoài — làm rõ khi lập plan giai đoạn 1.
- **Kích thước installer**: PyTorch + Mongo portable + Electron → installer lớn
  (vài trăm MB). Chấp nhận được cho ứng dụng kiosk.
- **fingerprint/weight service**: xác nhận có cần bật mặc định không, để watchdog
  quản đúng phạm vi.
