# Hệ thống Quản lý dự án CCCD (mini)

Web quản lý phân công công việc dự án CCCD lưu động: 1 tài khoản admin, đăng nhập vào dashboard, tick/thêm/xoá task theo từng thành viên.

- **Backend:** FastAPI + MongoDB (motor async)
- **Frontend:** React (Vite)
- **Giao diện:** phong cách cổng dịch vụ công (banner đỏ + dải vàng, sub-nav xanh)

## Cấu trúc

```
app_cccd/
├── backend/
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx, Login.jsx, Dashboard.jsx, api.js, styles.css, main.jsx
│   │   └── ...
│   └── vite.config.js
├── .venv/                 (python venv)
└── README.md
```

## 1) MongoDB

Máy hiện chưa có MongoDB. Chọn 1 trong 2 cách:

**Cách A - Cài MongoDB Community bản native (khuyến nghị):**
```bash
sudo apt update
sudo apt install -y mongodb-server mongodb-clients   # Ubuntu 25.04
# hoặc theo hướng dẫn chính thức: https://www.mongodb.com/docs/manual/administration/install-on-linux/
sudo systemctl enable --now mongod
```

**Cách B - Dùng Docker:**
```bash
sudo docker run -d --name mongo -p 27017:27017 -v mongo_data:/data/db mongo:7
```

Kiểm tra: `curl http://localhost:27017` phải trả lời (dù là lỗi text-only).

## 2) Chạy backend

```bash
cd /home/ubuntu-ngochai/Documents/app_cccd
.venv/bin/uvicorn --app-dir backend main:app --reload --host 0.0.0.0 --port 8000
```

- Backend nghe cổng **8000**
- Swagger docs: http://localhost:8000/docs
- Health check: http://localhost:8000/api/health
- Lần chạy đầu tự tạo tài khoản `admin` / `admin123` và seed toàn bộ task ban đầu

Biến môi trường (tuỳ chọn):
- `MONGO_URL` — mặc định `mongodb://localhost:27017`
- `DB_NAME` — mặc định `app_cccd`
- `JWT_SECRET` — nên đặt khác trên production

## 3) Chạy frontend

```bash
cd /home/ubuntu-ngochai/Documents/app_cccd/frontend
npm run dev
```

Mở trình duyệt: **http://localhost:5173**

Vite đã proxy `/api/*` sang `http://localhost:8000` sẵn, không cần cấu hình CORS thêm.

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
