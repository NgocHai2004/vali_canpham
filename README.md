# Hệ thống Quản lý dự án CCCD (mini)

Web quản lý phân công công việc dự án CCCD lưu động: 1 tài khoản admin, đăng nhập vào dashboard, tick/thêm/xoá task theo từng thành viên.

- **Backend:** FastAPI + MongoDB (motor async)
- **Frontend:** React (Vite)
- **Giao diện:** phong cách cổng dịch vụ công (banner đỏ + dải vàng, sub-nav xanh)

## Cấu trúc

```
app_cccd/
├── backend/
│   ├── main.py                  # FastAPI monolith (auth, detainees, sessions, cccd, weight, face)
│   ├── cccd_watcher.py          # Session-queue cho CccdService push
│   ├── person_detect.py         # YOLO person detection
│   ├── face_recognition_service.py  # InsightFace
│   ├── weight_hub.py            # WebSocket hub cho cân
│   ├── tests/
│   └── services/                # Các service phần cứng (xem services/README.md)
│       ├── usb_service/         # USB dongle (:8766)
│       ├── fingerprint_service/ # ZK fingerprint (:8765)
│       ├── cccd_scanner/        # CccdService .NET (binary ngoài git)
│       └── weight/              # Cân BLE → push backend
├── frontend/                    # React + Vite (:5173)
├── run.ps1 / stop.ps1           # Deploy 1 lệnh
└── start-services.ps1           # Start usb + fingerprint
```

## Chạy

Xem `../RUN.md`. Tóm tắt: tạo `.env`, cài deps, `.\run.ps1`.

## Đăng nhập

- Tài khoản: `admin`
- Mật khẩu: `admin123`

Có thể đổi mặc định trong `backend/main.py` (`ADMIN_USERNAME`, `ADMIN_PASSWORD`) — nhưng vì admin đã được tạo trong DB nên nếu muốn đổi mật khẩu sau này thì:
```bash
mongosh app_cccd --eval 'db.users.deleteOne({username:"admin"})'
```
rồi restart backend, nó sẽ tạo lại admin với mật khẩu trong code.

## Dashboard làm được gì

- Xem toàn bộ task chia theo 8 nhóm (Tuấn Anh AI, Hải BE, Hải FE, Hoàng Anh khảo sát/tích hợp, Linh Đan mua sắm/QA, Thiết bị cần mua)
- Tick / bỏ tick task, cập nhật realtime tiến độ %
- Lọc theo thành viên (Tuấn Anh, Hải, Hoàng Anh, Linh Đan, Chung)
- Tìm kiếm nhanh theo tên
- Thêm task mới vào từng nhóm
- Xoá task (hover vào để hiện nút ×)
- Hiển thị 4 chỉ số: tổng công việc, đã hoàn thành, chưa hoàn thành, % tiến độ

## API

Tất cả API dưới `/api/*`, đều yêu cầu header `Authorization: Bearer <token>` trừ `login` và `health`.

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/auth/login` | Đăng nhập (form: username, password) |
| GET | `/api/auth/me` | Lấy user hiện tại |
| GET | `/api/tasks` | Danh sách toàn bộ task |
| POST | `/api/tasks` | Tạo task (title, category, member, note) |
| PATCH | `/api/tasks/{id}` | Cập nhật (done, title, note) |
| DELETE | `/api/tasks/{id}` | Xoá |
| GET | `/api/stats` | Thống kê tổng, theo category, theo member |
| GET | `/api/health` | Kiểm tra kết nối Mongo |
Kill (cần PowerShell chạy Administrator — shell của tôi bị Access denied):

taskkill /PID 52640 /T /F

Nếu PID đã đổi, tìm lại rồi kill:

Get-NetTCPConnection -LocalPort 8000 -State Listen | ForEach-Object { taskkill /PID $_.OwningProcess /T /F }

Backend — chạy từ app_cccd (không cần cd backend, dùng --app-dir nên tránh được lỗi path bạn gặp):

cd C:\Users\vali-01\Documents\App_CCCD\app_cccd
$env:DONGLE_SECRET='4wYaZj6PURKzLJ2FlAf0thSvuWdH8cIC'
.\.venv\Scripts\python.exe -m uvicorn --app-dir backend main:app --host 0.0.0.0 --port 8000