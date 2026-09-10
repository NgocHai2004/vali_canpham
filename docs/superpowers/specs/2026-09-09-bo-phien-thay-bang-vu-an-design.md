# Bỏ phiên làm việc, thay bằng Vụ án

Ngày: 09/09/2026. Nhánh: `Hai_dev`.

## Vấn đề

`work_sessions` đang gánh hai vai lẫn nhau:

1. **Vụ án** — nơi gom dấu vết hiện trường (`case_name`, `location`). `SceneCasePicker`
   đọc `GET /api/sessions` và gọi mỗi hàng là "vụ án".
2. **Ca làm việc của cán bộ** — `officer`, `opened_at`/`closed_at`, `status` open/closed,
   mã `S20260904-0001`, khái niệm "phiên đang mở của tôi".

Người dùng chỉ cần vai 1. Vai 2 đã bị bỏ khỏi menu trái nhưng vẫn còn ở trang chủ
(hero "Vào phiên", ô thống kê "Phiên đang mở", panel "Phiên gần đây") và vẫn còn
nguyên ở backend (13 route `/api/sessions*`, 179 chỗ nhắc `session` trong `main.py`).

## Quyết định đã chốt

| Câu hỏi | Chốt |
|---|---|
| Phạm vi | Mức 3 — xoá cả ở backend, không chỉ ẩn UI |
| Vụ án là gì | Collection `cases` mới |
| Trạng thái | Có, và **vẫn khoá**: vụ án đã kết thúc thì không thêm/sửa dấu vết và hồ sơ |
| Trường thời gian | Có thêm — thời gian xảy ra vụ án |
| Dữ liệu cũ | Xoá sạch, không migrate, không backup (là dữ liệu seed) |
| Menu trái | Không thêm mục riêng — quản lý vụ án gộp vào tab Dấu vết hiện trường |

## Hiện trạng dữ liệu (đã đo trong DB `app_cccd`)

- `work_sessions`: 14 (2 đang mở)
- `detainees`: 60, **toàn bộ** có `session_id`
- `scene_traces`: 61, **toàn bộ** có `session_id`
- 6 phiên giữ dữ liệu (24, 17, 6, 6, 4, 3 hồ sơ); 8 phiên rỗng
- `case_name`: chỉ 6/14 phiên có
- `custody_type` / `facility_code` / `sub_camp_code` / `cell_code`: **0/14** phiên có

Điểm cuối quan trọng: `WorkSessionIn` (`backend/main.py:496-508`) khai báo 4 trường nơi
giam giữ kèm comment giải thích rằng phiên chốt sẵn 4 giá trị này để form hồ sơ không
phải chọn lại cho từng nghi phạm. **Chưa dùng thật lần nào** → bỏ được, không mất dữ liệu,
không cần dựng chỗ ở mới cho chúng.

## Thiết kế

### Collection `cases`

```
_id
code          str   VA20260909-0001, sinh qua _next_case_code() (mẫu _next_session_code)
name          str   tên vụ án
location      str   địa điểm
occurred_at   dt    thời gian xảy ra vụ án  ← trường mới
status        str   "investigating" | "closed"
note          str
created_at    dt
created_by    str   username người tạo
closed_at     dt|None
report_url    str   giữ, dùng cho xuất báo cáo
report_filename str
```

Bỏ khỏi schema cũ: `officer`, `officer_full_name`, `opened_at`, `detainee_count`
(đếm động khi cần), và 4 trường nơi giam giữ.

`detainees.session_id` → `detainees.case_id`. `scene_traces.session_id` → `scene_traces.case_id`.
`audit_logs.session_id` → `audit_logs.case_id`.

### Khoá theo trạng thái

`_ensure_session_editable` (`main.py:565`) → `_ensure_case_editable`:

- `status == "closed"` → 403 "Vụ án đã kết thúc, không thể chỉnh sửa."
- **Bỏ** nhánh `officer != username` — vụ án không thuộc riêng cán bộ nào, ai cũng
  thao tác được trên vụ án đang điều tra.

Áp dụng ở: tạo/sửa/xoá hồ sơ, tạo/sửa/xoá dấu vết.

### Route

Gom 13 route `/api/sessions*` còn 8 route `/api/cases*`:

| Mới | Thay cho | Ghi chú |
|---|---|---|
| `POST /api/cases` | `POST /api/sessions` | tạo vụ án |
| `GET /api/cases` | `GET /api/sessions` | danh sách, lọc status + q + phân trang |
| `GET /api/cases/{id}` | `GET /api/sessions/{id}` | kèm danh sách hồ sơ |
| `PATCH /api/cases/{id}` | `POST /api/sessions/{id}/close` | sửa thông tin **và** kết thúc vụ án |
| `DELETE /api/cases/{id}` | `DELETE /api/sessions/{id}` | xoá kèm hồ sơ bên trong |
| `GET /api/cases/{id}/report` | `GET /api/sessions/{id}/report` | giữ nguyên cách hoạt động |
| `GET /api/cases/full` | `GET /api/sessions/full` | đồng bộ USB, giữ nguyên hình dữ liệu |
| `POST /api/cases/{id}/sync-log` | `POST /api/sessions/{id}/sync-log` | giữ nguyên |

Bỏ hẳn `GET /api/sessions/current` — không còn "phiên đang mở của tôi".

`POST /api/cccd/session/*` (4 route, `main.py:2020-2047`) **không đụng tới**: đó là
phiên đọc thẻ CCCD của đầu đọc, không liên quan phiên làm việc.

### Đồng bộ USB

`/api/cases/full` giữ đúng hình dữ liệu của `/api/sessions/full` (vụ án kèm hồ sơ bên
trong), chỉ đổi tên khoá. Nhờ vậy `SyncDiffModal` và `UsbDrivePickerModal` chỉ đổi nhãn,
không đổi logic so sánh.

### Frontend

| Hiện tại | Sau |
|---|---|
| `SessionListPage.jsx` | **xoá** — thay bằng `SceneCasePicker` mở rộng |
| `SessionDetailPage.jsx` | `CaseDetailPage.jsx` |
| `SessionOpenModal.jsx` | `CaseFormModal.jsx` (tạo + sửa) |
| `SceneCasePicker.jsx` | thêm nút Tạo vụ án / Sửa / Kết thúc / Xoá |
| `Dashboard.jsx` 3 khối phiên | thống kê vụ án |

Tab **Dấu vết hiện trường** thành nơi quản lý vụ án:

```
scene_traces (chưa chọn vụ án)  → SceneCasePicker: bảng vụ án + tạo/sửa/kết thúc/xoá
scene_traces (đã chọn vụ án)    → SceneMatchPage như hiện tại
```

`SceneCasePicker` đã có sẵn bảng, lọc trạng thái, tìm kiếm, phân trang theo ngôn ngữ
`smp-*` — chỉ thêm hàng nút, không dựng lại trang.

Trang chủ: bỏ hero phiên (`Dashboard.jsx:719-741`), ô "Phiên đang mở" (`:766`), panel
"Phiên gần đây" (`:809-831`). Thay bằng ô "Vụ án đang điều tra" và panel "Vụ án gần đây"
trỏ sang tab Dấu vết hiện trường.

State trong `Dashboard`: `sessionCtx` → `caseCtx`, `activeSessionId` → `activeCaseId`,
`sceneSessionId` → `sceneCaseId`. Giữ cơ chế `returnTo` vừa sửa.

### Luồng thu nhận hồ sơ

**Đây là thay đổi về cách dùng, cần bạn xác nhận.**

Hiện nay nút tạo hồ sơ mới nằm trong trang chi tiết phiên (`SessionDetailPage.jsx:190`).
Bỏ trang đó thì đường vào thu nhận còn:

```
Dấu vết hiện trường → chọn vụ án → Phân tích đối sánh → Thêm đối tượng → thu nhận hồ sơ
```

cộng nút Thêm hồ sơ trong `CaseDetailPage`. Nghĩa là **mọi hồ sơ đều thuộc một vụ án**
(`case_id` bắt buộc khi tạo) — đúng bằng ràng buộc `session_id` bắt buộc hiện tại
(`main.py:1142`), nên không phải bước lùi. Nếu bạn cần thu nhận hồ sơ rời không thuộc vụ án
nào thì nói, tôi cho `case_id` thành tuỳ chọn.

Sửa/xem hồ sơ cũ không đổi: vẫn qua tab Hồ sơ can phạm và Tra cứu.

### i18n

`vi.json` + `en.json`: nhóm khoá `session.*` → `case.*`, `dashboard.session.*` →
`dashboard.case.*`. Đổi văn bản "phiên làm việc" → "vụ án", "mở phiên" → "tạo vụ án",
"đóng phiên" → "kết thúc vụ án". Xoá khoá không còn dùng (`session.open.err.officer_required`,
`smp.sub.add_closed` đổi thành "Vụ án đã kết thúc...").

### Xoá dữ liệu cũ

Script `backend/scripts/drop_sessions.py`, chạy tay một lần, in ra số bản ghi trước khi xoá:

```
drop collection work_sessions
delete_many detainees {}            60 hồ sơ
delete_many scene_traces {}         61 dấu vết
delete_many audit_logs {}
xoá counters session_code_* và scene_seq_*
xoá file trong backend/uploads/scene/ và uploads/ của detainee
```

Không backup theo yêu cầu. `seed_scene_cases.py` và `seed_dashboard.py` sửa theo schema
`cases` để seed lại được.

## Thứ tự thi công

1. Backend: schema `cases` + `_next_case_code` + `_ensure_case_editable` + 8 route mới.
2. Backend: đổi `session_id` → `case_id` ở `detainees`, `scene_traces`, `_log`.
3. Script xoá dữ liệu cũ + sửa 2 file seed.
4. Frontend: `api.js` đổi hàm gọi; `CaseFormModal`, `CaseDetailPage`, `SceneCasePicker` mở rộng.
5. Frontend: `Dashboard` — bỏ 3 khối phiên, đổi state, đổi điều hướng.
6. i18n 2 file.
7. Chạy `npm run build` + thử luồng: tạo vụ án → upload dấu vết → thêm đối tượng →
   thu nhận → quay lại vụ án → kết thúc vụ án → kiểm tra bị khoá.

## Ngoài phạm vi

- **Đối sánh vân tay thật.** Upload dấu vết hiện chỉ lưu ảnh; bảng KẾT QUẢ ĐỐI SÁNH đọc
  `MATCH_ROWS` trong `sceneMatchDemo.js` (data giả), nút "Phân tích lại" chỉ xoay icon.
  Cần engine trích minutiae từ ảnh latent — không có trong repo. Việc riêng.
- **Panel HỒ SƠ ĐỐI TƯỢNG đọc data thật.** Vẫn dùng `SUBJECTS` giả. Việc riêng.
- 4 route `/api/cccd/session/*` của đầu đọc thẻ.
