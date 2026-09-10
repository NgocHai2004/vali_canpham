# Thiết kế — Trang quản lý Vụ án

Chuyển tab **Dấu vết hiện trường** (`scene_traces`) từ bảng chọn vụ án chỉ-đọc
thành trang quản lý vụ án đầy đủ: danh sách + thêm/sửa/đóng/xóa + lọc theo
nhiều trường. Bỏ hẳn 2 tab **Phiên làm việc** và **Cơ sở giam giữ**.

## 1. Hiện trạng

- Tab `scene_traces` render `SceneCasePicker.jsx` (265 dòng) — bảng chỉ-đọc.
  Bấm 1 hàng → `SceneMatchPage` (Phân tích đối sánh).
- Lọc hiện có: trạng thái open/closed, tìm theo tên/mã **nhưng chỉ trong 10
  hàng của trang hiện tại** (`SceneCasePicker.jsx:61-65`).
- "Vụ án" = collection `work_sessions`. Cùng dữ liệu với tab Phiên làm việc.
- Nav đã ẩn `sessions` + `cells` (`Dashboard.jsx:78`), nhưng route, component
  và các nút dẫn từ trang chủ vẫn còn.
- Backend có `POST` / `GET` / `close` / `DELETE`. **Không có endpoint sửa.**
- `SceneTracesPage.jsx` (425 dòng) không còn được render, chỉ còn bị import
  lấy 2 helper `traceCode` + `fmtSize`.

## 2. Phân quyền

| | Cán bộ | Admin |
|---|---|---|
| Xem + lọc | vụ của mình | mọi vụ |
| Thêm / Sửa | ✓ vụ của mình | ✗ |
| Đóng / Xóa | ✓ vụ của mình | ✗ |
| Xem hồ sơ, tải báo cáo | ✓ | ✓ |

Admin xem thuần. Đây là **thu hồi quyền** so với hiện tại: backend đang cho
admin đóng (`main.py:1679`) và xóa (`main.py:1725`) mọi phiên.

## 3. Backend — `main.py`

### 3.1 `POST /api/sessions`

- **Giữ** chặn admin → 403 (`main.py:1356`). Admin không tạo vụ án.
- **Bỏ** chặn "1 phiên open / cán bộ" (`main.py:1358-1360`). Một cán bộ có
  nhiều vụ án đang mở cùng lúc.
- Bỏ gọi `_resolve_session_place` (`main.py:1367`) và xóa hàm đó
  (`main.py:1290-1347`) — không còn ai gọi.

### 3.2 `PATCH /api/sessions/{session_id}` (mới)

Sửa `case_name`, `location`, `note`, `officer_full_name`.

Không cho sửa `code` — mã sinh tự động qua counter, là khóa tra cứu trong
`_log` và báo cáo Excel.

Điều kiện: chỉ chủ sở hữu (`officer == user["username"]`), vụ phải `status ==
"open"`. Dùng lại `_ensure_session_editable`. Admin → 403.

Ghi `_log(action="update", resource="work_session")`.

### 3.3 `POST /api/sessions/{id}/close` + `DELETE /api/sessions/{id}`

Bỏ nhánh `and user.get("role") != "admin"` ở cả 2 chỗ kiểm quyền
(`main.py:1679`, `main.py:1725`) → admin nhận 403.

`DELETE` giữ nhánh `main.py:1726` "chỉ xóa được vụ đang mở" nhưng bỏ ngoại lệ
admin: cán bộ chỉ xóa vụ đang mở, không ai xóa được vụ đã đóng.

### 3.4 `GET /api/sessions`

Thêm 2 query param:

- `q` — regex không phân biệt hoa/thường trên `case_name` **hoặc** `code`.
- `officer` — username cán bộ. Với cán bộ thường bị ghi đè bởi filter
  `officer = mình` đã có (`main.py:1513`), chỉ có tác dụng với admin.

Lọc ở server để bỏ hẳn cảnh "tìm chỉ trong 10 hàng".

`skip`/`limit`/`status`/`date_from`/`date_to`/`mine_only` giữ nguyên.

### 3.5 `_get_open_session_or_none`

Thêm `.sort("opened_at", -1)`:

```python
async def _get_open_session_or_none(username: str) -> Optional[dict]:
    return await db.work_sessions.find_one(
        {"officer": username, "status": "open"},
        sort=[("opened_at", -1)],
    )
```

"Phiên hiện tại" = vụ open mở gần nhất. Cần vì 1 cán bộ giờ có nhiều vụ open,
không còn duy nhất. Ảnh hưởng 3 chỗ, đều theo hướng mong muốn:

- `GET /api/sessions/current` — `Dashboard.editDetainee` gắn hồ sơ vào vụ mới nhất.
- `_scene_session_or_400` — máy ngoài bắn ảnh vào vụ mở gần nhất.
- Thống kê `open_session` ở dashboard (`main.py:2693`).

### 3.6 `WorkSessionIn`

Bỏ 4 trường `custody_type`, `facility_code`, `sub_camp_code`, `cell_code`
(`main.py:505-508`).

Đã kiểm: hồ sơ can phạm **không** kế thừa 4 trường này từ phiên — chúng đến từ
`DataCapturePage` (`DataCapturePage.jsx:1482-1485`). Bỏ khỏi `WorkSessionIn`
không ảnh hưởng luồng thu nhận.

Giữ nguyên toàn bộ API `/api/cells` — `DataCapturePage` và `SyncDiffModal` còn
dùng để hiển thị tên buồng.

## 4. Frontend

### 4.1 File mới

| File | Nhiệm vụ |
|---|---|
| `CasesPage.jsx` | Bảng vụ án + toolbar lọc + phân trang + nút Thêm |
| `CaseFormModal.jsx` | Form thêm/sửa (dùng chung 2 chế độ) |
| `sceneTraceUtils.js` | `traceCode` + `fmtSize` tách khỏi `SceneTracesPage` |

`CasesPage` giữ style `smp-*` của `SceneCasePicker` để không lệch hình với
`SceneMatchPage`.

`CaseFormModal` — 4 ô: tên vụ án (bắt buộc), địa điểm, ghi chú, điều tra viên.
Không có diện/cơ sở/phân trại/buồng.

### 4.2 File xóa

- `SceneCasePicker.jsx` — thay bằng `CasesPage.jsx`
- `SceneTracesPage.jsx` — code chết sau khi tách helper
- `SessionListPage.jsx` — tab Phiên làm việc
- `SessionOpenModal.jsx` — form cũ có 4 trường giam giữ
- `CellsPage` + `CellsStatus` trong `Dashboard.jsx`
- `_resolve_session_place` trong `main.py`

### 4.3 Bộ lọc

Đẩy hết xuống server, không lọc client:

| Trường | Kiểu | Param |
|---|---|---|
| Tên vụ án / mã | ô tìm | `q` |
| Trạng thái | segmented: tất cả / đang mở / đã đóng | `status` |
| Cán bộ | select (chỉ admin thấy) | `officer` |
| Ngày mở | từ — đến | `date_from`, `date_to` |
| Địa điểm | ô tìm | gộp vào `q` |

Không có trường giam giữ. Không có cột số dấu vết / số hồ sơ.

`scene_count` backend đang trả (`main.py:1531-1540`) giữ nguyên — không hiển
thị thành cột lọc, nhưng dùng trong modal xác nhận xóa.

### 4.4 Hành vi hàng

Bấm vào hàng → `SceneMatchPage` như hiện nay. Không đổi thói quen.

Menu ⋮ mỗi hàng:

1. **Xem hồ sơ** → `SessionDetailPage` (thông tin vụ + danh sách hồ sơ + tải
   báo cáo Excel). Cả cán bộ và admin.
2. **Sửa** → `CaseFormModal`. Ẩn với admin, ẩn với vụ đã đóng.
3. **Đóng vụ án** → xác nhận rồi `POST .../close`. Ẩn với admin, ẩn với vụ đã đóng.
4. **Xóa** → modal xác nhận. Ẩn với admin, ẩn với vụ đã đóng.

### 4.5 `Dashboard.jsx`

- Xóa route `page === "sessions"` và `page === "cells"`.
- `sessions_detail`: `onBack` quay về `scene_traces` thay vì `sessions`.
- Nút "Vào phiên" / "Tạo phiên mới" ở hero trang chủ → `scene_traces`.
- Xóa panel "Cơ sở giam giữ" + `go("cells")`.
- 4 chỗ `setPage("sessions")` trong các handler (`editDetainee` fallback,
  `backToSessionList`, `doneSessionCapture`, `handleSessionClosed`) → `scene_traces`.

Giữ nguyên: `SessionDetailPage`, `DataCapturePage`, `SceneMatchPage`.

## 5. Xử lý lỗi

| Tình huống | Xử lý |
|---|---|
| Sửa vụ đã đóng | UI ẩn mục Sửa; backend `PATCH` → 403 |
| Admin gọi POST/PATCH/close/DELETE | 403, UI ẩn sẵn các nút |
| Cán bộ sửa vụ người khác | 403 |
| Xóa vụ có dấu vết + hồ sơ | Modal nêu rõ số dấu vết + số hồ sơ sẽ mất |
| Tên vụ án rỗng | Form chặn trước khi gửi |

## 6. Kiểm thử

Backend đã có `pytest.ini`. Test cần thêm:

- `PATCH` thành công (cán bộ, vụ đang mở)
- `PATCH` vụ đã đóng → 403
- `PATCH` vụ của cán bộ khác → 403
- `PATCH` bởi admin → 403
- `POST` bởi admin → 403 (giữ hành vi cũ)
- `POST` khi cán bộ đã có vụ open → **thành công** (hành vi mới)
- `close` + `DELETE` bởi admin → 403 (hành vi mới)
- `GET` với `q` khớp `case_name`, khớp `code`
- `GET` với `officer` (admin)
- `_get_open_session_or_none` trả vụ mở gần nhất khi có nhiều vụ open

Frontend chưa có test runner — kiểm bằng chạy app thật (`run-electron.ps1`).
