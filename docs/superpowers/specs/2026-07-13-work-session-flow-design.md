# Thiết kế: Phiên làm việc (Work Session)

**Ngày**: 2026-07-13
**Trạng thái**: Draft — chờ user review
**Người viết**: brainstorm giữa `hai` và Claude

---

## 1. Bối cảnh

App `app_cccd` hiện tại có luồng: login → thu nhận dữ liệu can phạm → lưu hồ sơ. Mọi hồ sơ chỉ gắn `created_by = username`, không có khái niệm "phiên"/"ca trực". Điều này khiến khó:

- Nhóm các hồ sơ nhập trong cùng một đợt / ca trực
- Chốt sổ cuối ca, sinh báo cáo
- Truy vết audit theo phiên
- Ngăn chỉnh sửa hồ sơ đã "chốt"

Yêu cầu mới: thêm khái niệm **Phiên làm việc** — bao ngoài luồng tạo can phạm hiện có.

## 2. Quyết định nghiệp vụ đã chốt

| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Một phiên chứa 1 hay nhiều can phạm? | **Nhiều** — phiên = ca trực / đợt nhập liệu |
| Q2 | Vòng đời phiên — có mở lại được không? | **Đóng là niêm phong**, không mở lại; muốn sửa phải tạo phiên mới |
| Q3 | Nhiều cán bộ mở phiên song song? | **Mỗi cán bộ 1 phiên riêng**; 1 cán bộ chỉ 1 phiên `open` tại 1 thời điểm |
| Q4 | "Lưu phiên" sinh ra cái gì? | **Đóng** + **xuất báo cáo Excel** |
| Q5 | Format báo cáo? | **Excel (.xlsx)** — dùng openpyxl (đã có) |
| Q6 | UX approach? | **Approach 3** — thêm tab "Phiên làm việc" riêng ở Dashboard |
| Q7 | Navigation khi mở phiên mới? | **Danh sách phiên → trang phiên → DataCapture** |
| Q8 | Admin có sửa được hồ sơ trong phiên đã đóng? | **Không** — read-only tuyệt đối, kể cả admin |

## 3. Data model

### 3.1 Collection mới: `work_sessions`

```
{
  _id: ObjectId,
  code: "S20260713-0001",              // sinh auto, dạng S<yyyymmdd>-<seq_trong_ngày>
  status: "open" | "closed",
  officer: "hai",                       // username của cán bộ mở phiên
  officer_full_name: "Nguyễn V. Hải",   // snapshot lúc mở phiên
  location: "Buồng tiếp nhận 2",        // optional
  note: "",                             // optional
  opened_at: <datetime>,
  closed_at: <datetime | null>,
  detainee_count: 0,                    // cache — tăng/giảm mỗi lần create/delete detainee
  report_url: null,                     // đường dẫn file Excel, có sau khi đóng
  report_filename: null
}
```

### 3.2 Sửa collection `detainees`

Thêm field:
- `session_id: ObjectId | null` — trỏ về `work_sessions._id`

Ràng buộc:
- Hồ sơ cũ (nhập trước khi feature này ra đời): `session_id = null` — vẫn xem/tìm được, không bị đụng
- Hồ sơ mới (từ khi feature ra đời): **bắt buộc** có `session_id`, và session đó phải đang `open`, thuộc chính user

### 3.3 Counter cho code phiên

Dùng lại collection `counters` (đã có), thêm doc:
```
{ _id: "session_code_YYYYMMDD", seq: <int> }
```
Sinh code theo ngày, reset về 1 mỗi ngày.

### 3.4 Index

- `work_sessions.status` — filter danh sách nhanh
- `work_sessions.officer` — filter "của tôi"
- `work_sessions.code` — unique
- `work_sessions.opened_at` — sort mới nhất trước
- `detainees.session_id` — join với phiên

## 4. State machine

```
    [không có phiên]
          │
          │ POST /api/sessions  (mở phiên mới)
          │ ràng buộc: user chưa có phiên open nào
          ▼
       ┌──────┐
       │ open │
       └──────┘
          │
          │ POST /api/sessions/{id}/close
          │ → sinh Excel, lưu vào uploads/reports/
          │ → status = closed, closed_at = now
          ▼
       ┌────────┐
       │ closed │  ← chốt vĩnh viễn (không quay lại open được)
       └────────┘
```

## 5. Ràng buộc kiểm tra ở backend

| Thao tác | Điều kiện | Lỗi nếu vi phạm |
|---|---|---|
| `POST /api/sessions` | User chưa có phiên `open` | 409 "Bạn đang có 1 phiên đang mở. Đóng phiên đó trước khi mở phiên mới." |
| `POST /api/detainees` | Body có `session_id` hợp lệ, session `open`, thuộc user | 400 "Bạn phải mở 1 phiên làm việc trước khi tạo hồ sơ." |
| `PATCH /api/detainees/{id}` | Session của hồ sơ đang `open` HOẶC `session_id = null` (hồ sơ cũ) | 403 "Hồ sơ này thuộc phiên đã đóng, không thể chỉnh sửa." |
| `DELETE /api/detainees/{id}` | Cùng điều kiện PATCH | 403 (như trên) |
| `POST /api/sessions/{id}/close` | Session `open`, thuộc user | 409 "Phiên này đã đóng." |
| `DELETE /api/sessions/{id}` | Session `open`, `detainee_count == 0`, thuộc user | 400 "Chỉ có thể xoá phiên rỗng đang mở." |

Admin không có quyền đặc biệt trên hồ sơ trong phiên `closed` — read-only cho tất cả.

## 6. API surface

### 6.1 Endpoints mới

```
GET    /api/sessions
       Query: status?, mine_only?, date_from?, date_to?, skip?, limit?
       Response: {total, items: [{id, code, status, officer, opened_at, closed_at, detainee_count, report_url}]}

GET    /api/sessions/current
       Trả về phiên open của user hiện tại (404 nếu không có)
       Dùng để restore state khi F5 / login lại

POST   /api/sessions
       Body: {location?, note?}
       Response: {id, code, status: "open", ...}
       409 nếu user đã có phiên open

GET    /api/sessions/{id}
       Response: {id, code, status, officer, opened_at, closed_at, location, note, detainees: [{id, code, full_name, cccd_number, gender, dob, cell_code, created_at}]}

POST   /api/sessions/{id}/close
       Đóng phiên → sinh Excel → lưu file → cập nhật report_url
       Response: {ok: true, closed_at, report_url, report_filename}

GET    /api/sessions/{id}/report
       Stream file Excel của phiên đã đóng (redirect / stream tuỳ implementation)
       404 nếu phiên chưa đóng

DELETE /api/sessions/{id}
       Xoá phiên open còn rỗng (chống rác)
       400 nếu phiên đã có hồ sơ hoặc đã đóng
```

### 6.2 Endpoints hiện có cần sửa

```
POST   /api/detainees
       Body: (như cũ) + session_id: ObjectId (BẮT BUỘC)
       Backend validate session tồn tại, open, thuộc user
       Gán detainee.session_id, tăng session.detainee_count

PATCH  /api/detainees/{id}
       Chặn nếu session của hồ sơ đã closed → 403

DELETE /api/detainees/{id}
       Chặn nếu session của hồ sơ đã closed → 403
       Nếu xoá thành công và session_id != null → giảm session.detainee_count
```

### 6.3 Cấu trúc file Excel báo cáo phiên

**Đường dẫn lưu**: `backend/uploads/reports/session_<code>_<yyyymmdd_hhmmss>.xlsx`
**URL truy cập**: `/uploads/reports/<filename>`

**Sheet 1 "Thông tin phiên"**:
```
A1:  PHIẾU BÁO CÁO PHIÊN LÀM VIỆC
A3:  Mã phiên:     S20260713-0001
A4:  Cán bộ:       hai (Nguyễn V. Hải)
A5:  Địa điểm:     Buồng tiếp nhận 2
A6:  Ghi chú:      <text>
A7:  Mở lúc:       13/07/2026 08:15
A8:  Đóng lúc:     13/07/2026 12:03
A9:  Tổng hồ sơ:   15
```

**Sheet 2 "Danh sách hồ sơ"**:
```
STT | Mã HS | Họ và tên | Giới tính | Ngày sinh | Số CCCD | Quê quán | Buồng | Ghi chú
```

## 7. UX flow & màn hình

### 7.1 Navigation

Thêm mục **"Phiên làm việc"** vào sidebar Dashboard, đứng trên "Thu nhận dữ liệu" và "Danh sách hồ sơ".

Khi user click "Thu nhận dữ liệu":
- Frontend gọi `GET /api/sessions/current`
- Có phiên open → nav vào `SessionDetailPage` của phiên đó
- Không có → nav sang `SessionListPage` + toast "Vui lòng mở phiên trước"

### 7.2 Màn 1: SessionListPage — Danh sách phiên

```
┌──────────────────────────────────────────────────────────────────┐
│  PHIÊN LÀM VIỆC                              [+ Mở phiên mới]    │
├──────────────────────────────────────────────────────────────────┤
│  Filter: [ Tất cả ▼ ] [ Của tôi ]  Từ: [__] Đến: [__]           │
├──────────────────────────────────────────────────────────────────┤
│  Mã phiên           Cán bộ    Mở           Đóng         Hồ sơ  ▸│
│  ─────────────────────────────────────────────────────────────  │
│  🟢 S20260713-0001  hai       08:15 hôm nay  —           3     │
│  ✓  S20260712-0004  hai       14:20 12/07   17:45        12   ⬇│
│  ✓  S20260712-0003  hai       08:00 12/07   12:00        8    ⬇│
└──────────────────────────────────────────────────────────────────┘
```

- Badge: 🟢 open / ✓ closed
- Icon ⬇ ở phiên closed: tải file Excel báo cáo
- Click row → mở màn 2
- Nút "+ Mở phiên mới" **disabled** khi user đang có phiên open (tooltip: "Bạn đang có phiên #S... đang mở")

### 7.3 Modal "Mở phiên mới"

```
┌────────────────────────────────────────────────┐
│  MỞ PHIÊN LÀM VIỆC MỚI                    ✕    │
├────────────────────────────────────────────────┤
│  Cán bộ:          hai (Nguyễn V. Hải)          │
│  Thời điểm mở:    13/07/2026 16:20             │
│  Địa điểm         [ Buồng tiếp nhận 2       ]  │
│  Ghi chú          [                         ]  │
│                        [Huỷ]  [Mở phiên ▶]    │
└────────────────────────────────────────────────┘
```

Nhấn "Mở phiên" → `POST /api/sessions` → nhảy sang **màn 2**.

### 7.4 Màn 2: SessionDetailPage — Trang một phiên

**Khi phiên open:**
```
┌──────────────────────────────────────────────────────────────────┐
│  ← Quay lại danh sách                                            │
│                                                                  │
│  🟢 PHIÊN S20260713-0001                                         │
│  Cán bộ: hai · Mở lúc: 13/07/2026 08:15 · Địa điểm: Buồng 2     │
│                                                                  │
│  Hồ sơ trong phiên (3)   [+ Thêm hồ sơ mới]  [Đóng phiên]       │
│  ─────────────────────────────────────────────────────────       │
│  Mã HS       Họ tên              CCCD          Thời điểm         │
│  CP202600001 Nguyễn Văn A        079204012345 08:22              │
│  CP202600002 Trần Thị Bích       001093456789 09:15              │
│  CP202600003 Lê Hoàng Cường      001085234567 10:03              │
│  (rỗng: hiện "Chưa có hồ sơ nào. Bấm 'Thêm hồ sơ mới'.")        │
└──────────────────────────────────────────────────────────────────┘
```

- Click row hồ sơ → mở DataCapturePage ở chế độ edit
- "+ Thêm hồ sơ mới" → DataCapturePage ở chế độ tạo mới, đã có sẵn `session_id`
- "Đóng phiên" → dialog xác nhận (`Đóng phiên với 3 hồ sơ? Sau khi đóng không sửa được.`) → gọi API close → auto-download Excel + toast "Đã đóng phiên"

**Khi phiên closed:**
- Header: `✓ PHIÊN S20260713-0001 (đã đóng lúc 17:45)`
- Ẩn "+ Thêm hồ sơ mới" và "Đóng phiên"
- Thay bằng "⬇ Tải báo cáo Excel"
- Row hồ sơ click được nhưng vào chế độ view-only (form disable toàn bộ input)

### 7.5 Màn 3: DataCapturePage (sửa)

- Nhận thêm prop `sessionId` (bắt buộc cho tạo mới)
- Banner nhỏ ở đầu: `Đang trong phiên: S20260713-0001 · Cán bộ: hai`
- Sau khi bấm "Lưu dữ liệu vào hồ sơ" → toast + tự động quay về Session Detail (không reset form nhập tiếp như cũ)
- Nếu vào từ session đã đóng → banner đổi thành `Phiên S20260713-0001 (đã đóng)`, mọi input disabled, ẩn nút Lưu

### 7.6 Edge cases

- **F5 giữa chừng**: App bootstrap gọi `GET /api/sessions/current` → cache trong state global. Mọi màn ngữ cảnh phiên đọc từ đây.
- **Đóng browser, mai login lại**: Phiên vẫn `open`, không auto-timeout. User có thể tiếp tục hoặc chủ động đóng.
- **User bị admin xoá tài khoản**: Phiên `open` vẫn tồn tại, hồ sơ vẫn còn. Không cascade delete.
- **Transfer detainee giữa 2 phiên**: KHÔNG cho — một khi đã gắn `session_id`, giữ nguyên vĩnh viễn.

## 8. Ảnh hưởng đến code hiện có

### Backend

- `backend/main.py`: thêm collection `work_sessions`, thêm models `WorkSessionIn`, thêm routes `/api/sessions/*`, sửa `create_detainee` để validate `session_id`, sửa `update/delete_detainee` để check trạng thái phiên
- Reports directory: `backend/uploads/reports/` (tạo mới, mount qua `/uploads`)
- Excel generator: hàm mới `_build_session_report_xlsx()` — tái sử dụng logic từ `export_xlsx`

### Frontend

- `frontend/src/api.js`: thêm methods `listSessions`, `getCurrentSession`, `createSession`, `getSession`, `closeSession`, `deleteSession`, `getSessionReport`
- `frontend/src/App.jsx`: thêm route/tab "Phiên làm việc"
- `frontend/src/Dashboard.jsx`: thêm mục sidebar "Phiên làm việc"
- **Mới**: `frontend/src/SessionListPage.jsx`, `frontend/src/SessionDetailPage.jsx`, `frontend/src/SessionOpenModal.jsx`
- `frontend/src/DataCapturePage.jsx`: nhận `sessionId` prop, gửi kèm khi tạo hồ sơ, banner phiên ở đầu, hành vi sau khi lưu

## 9. Ngoài phạm vi (out of scope)

- Dongle login (tạm gác theo yêu cầu user)
- PDF báo cáo (chỉ làm Excel)
- Dialog xác nhận có thể thêm nhưng không bắt buộc — sẽ có nút xác nhận đơn giản khi close
- Auto-close phiên theo thời gian
- Transfer / merge / split phiên
- Chữ ký số trên báo cáo

## 10. Kế hoạch triển khai (dự kiến — writing-plans sẽ chi tiết)

1. Backend: model + collection + counter + endpoints CRUD session
2. Backend: validate session_id trong detainees CRUD
3. Backend: hàm sinh Excel báo cáo + endpoint close
4. Frontend: api.js methods
5. Frontend: SessionListPage + Modal mở phiên
6. Frontend: SessionDetailPage
7. Frontend: sửa DataCapturePage để nhận sessionId
8. Frontend: sidebar + navigation guard cho "Thu nhận dữ liệu"
9. Test end-to-end: mở → tạo hồ sơ → đóng → tải Excel → xem lại phiên cũ
