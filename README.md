# Hệ thống Vali Thu nhận Thông tin & Quản lý Hồ sơ Can phạm (Version 5.6.4.0)

Hệ thống phần mềm chuyên dụng tích hợp trong thiết bị Vali di động phục vụ công tác thu nhận thông tin, quản lý hồ sơ đối tượng can phạm, thu thập sinh trắc học (ảnh chân dung 3 góc, vân tay 10 ngón lăn + 3 chùm vân phẳng), bóc tách hồ sơ giấy (OCR) và kết xuất in ấn tờ Chỉ bản (Mẫu 205/295), Danh bản (Mẫu 204/208) theo quy chuẩn nghiệp vụ Bộ Công an.

---

## 🛠 Kiến trúc & Công nghệ

- **Backend:** Python 3.10+, FastAPI, MongoDB (Motor async driver), Uvicorn.
- **Frontend:** React 18, Vite, Electron (chế độ ứng dụng Desktop).
- **Phần cứng & Ngoại vi:**
  - **Dịch vụ Vân tay:** Morfin Service (Port `8765`) — Thu nhận 10 ngón vân lăn, 3 cụm vân phẳng (4-4-2), đánh giá chất lượng NFIQ/Score.
  - **Dịch vụ Bản quyền:** USB Dongle Service (Port `8766`) — Bảo vệ bản quyền phần cứng thời gian thực.
  - **Dịch vụ OCR Hồ sơ:** ScanSnap Service / OCR Watcher — Tự động nhận diện và bóc tách 23 trường thông tin từ file scan PDF.
- **Giao diện:** Chuẩn nghiệp vụ, hỗ trợ Song ngữ (Tiếng Việt / English), thiết kế tối ưu cho màn hình cảm ứng của Vali di động.

---

## 📁 Cấu trúc Thư mục

```text
app_cccd/
├── backend/                         # FastAPI Backend
│   ├── main.py                      # FastAPI App entrypoint
│   ├── auth.py                      # Xác thực JWT & phân quyền RBAC
│   ├── database.py                  # Kết nối MongoDB motor async
│   ├── scan_inbox.py                # Hàng đợi tiếp nhận OCR từ máy Scan
│   ├── routers/                     # Các module API
│   │   ├── auth.py                  # API Đăng nhập, thông tin tài khoản
│   │   ├── detainees.py             # API Quản lý hồ sơ can phạm, đối soát trùng
│   │   ├── sessions.py              # API Quản lý phiên ca trực, xuất Excel
│   │   ├── cells.py                 # API Quản lý Cơ sở giam giữ / Phân trại / Buồng
│   │   ├── scan.py                  # API Tiếp nhận dữ liệu OCR
│   │   └── users.py                 # API Quản trị người dùng
│   └── services/                    # Dịch vụ điều khiển ngoại vi
│       ├── morfin_service/          # Service máy quét vân tay (:8765)
│       └── usb_service/             # Service xác thực khóa USB Dongle (:8766)
├── frontend/                        # Ứng dụng Giao diện React
│   ├── src/
│   │   ├── DataCapturePage.jsx      # Màn hình thu nhận thông tin can phạm
│   │   ├── SessionDetailPage.jsx    # Màn hình chi tiết phiên làm việc
│   │   ├── NameSheetPreview.jsx     # Xem trước Danh bản (Mẫu 204/208)
│   │   ├── FpSheetPreview.jsx       # Xem trước Chỉ bản (Mẫu 205/295)
│   │   ├── SessionSheetsPdfExporter.jsx # Xuất gói PDF toàn phiên & ghi USB
│   │   ├── SessionSheetsPrinter.jsx # Module in ấn trực tiếp hàng loạt
│   │   ├── IncompleteConfirmModal.jsx # Hộp thoại kiểm tra trường thiếu
│   │   ├── DuplicateWarnModal.jsx   # Hộp thoại đối chiếu hồ sơ trùng lặp
│   │   └── locales/                 # Tệp đa ngôn ngữ (vi.json, en.json)
│   └── package.json
├── electron/                        # Vỏ ứng dụng Desktop Electron
├── docs/                            # Tài liệu kỹ thuật kiến trúc
├── run-electron.ps1                 # Script khởi động toàn diện kèm giao diện Electron
├── run.ps1                          # Script khởi động Backend & Frontend Web
├── start-services.ps1               # Script khởi động các service ngoại vi (Vân tay + Dongle)
└── stop.ps1                         # Script dừng an toàn toàn bộ tiến trình
```

---

## 🚀 Hướng dẫn Khởi chạy Hệ thống

### 1. Khởi động ứng dụng Vali (Electron Desktop + Backend + Services)
Chạy lệnh PowerShell (với quyền thông thường hoặc Admin):
```powershell
.\run-electron.ps1
```
*Script sẽ tự động khởi động MongoDB, Backend FastAPI (:8000), Dịch vụ Vân tay (:8765), Dịch vụ Dongle (:8766) và mở giao diện ứng dụng Desktop.*

### 2. Khởi động chế độ Web Dev
```powershell
.\run.ps1
```
Truy cập trình duyệt: `http://localhost:5173`

### 3. Dừng hệ thống
```powershell
.\stop.ps1
```

---

## 🔑 Tài khoản Đăng nhập Mặc định

- **Tài khoản:** `admin`
- **Mật khẩu:** `admin123`
*(Cán bộ quản trị có thể tạo thêm tài khoản cán bộ nghiệp vụ `officer` trong mục Quản trị người dùng).*

---

## 📑 Các Phân hệ Nghiệp vụ Chính

1. **Quản lý Hồ sơ & Biểu mẫu:**
   - Đăng ký linh hoạt: Cho phép lưu hồ sơ khi đủ CCCD & Mã hồ sơ, cảnh báo danh sách trường thiếu có phân nhóm tag.
   - Nhập liệu 16 trường nhân thân, thông tin vụ án, 4 vị trí cán bộ thụ lý và 7 trường đặc điểm nhận dạng.
   - Đối soát tự động phát hiện hồ sơ can phạm trùng lặp.
   - Quản lý cây cấu trúc Cơ sở giam giữ — Phân trại — Buồng giam.

2. **Thu nhận Ngoại vi & Sinh trắc học:**
   - Tự động nhận diện hồ sơ giấy (OCR) từ máy quét ScanSnap, bóc tách 23 trường và xóa file scan an toàn.
   - Chụp ảnh chân dung nhận dạng 3 góc (Chính diện, Nghiêng trái, Nghiêng phải).
   - Thu nhận 10 ngón vân lăn và 3 cụm vân chùm phẳng (4-4-2) theo chuẩn nghiệp vụ C06.

3. **Báo cáo, Biểu mẫu & In ấn:**
   - Xem trước và in trực tiếp tờ Danh bản (Mẫu 204/208), Chỉ bản (Mẫu 205/295).
   - Xuất gói PDF tổng hợp Chỉ bản/Danh bản toàn bộ hồ sơ trong ca trực, tự động sao lưu vào ổ USB ngoài.
   - Xuất báo cáo tổng kết ca trực ra file Excel (.xlsx).

4. **Quản trị & Bảo mật:**
   - Khóa bản quyền phần cứng bằng USB Dongle.
   - Phân quyền người dùng (RBAC), quản lý vòng đời ca trực (Mở/Đóng phiên), khóa dữ liệu phiên đã đóng.
   - Giao diện Song ngữ (Việt - Anh) chuẩn hóa Version **`5.6.4.0`**.
