# Phân cấp Tỉnh → Phiên (chọn Xã) → Hồ sơ

Ngày: 2026-08-23
Trạng thái: đã duyệt thiết kế, chờ kế hoạch triển khai

## Mục tiêu

Gắn dữ liệu hành chính có cấu trúc vào hồ sơ thu nhận, thay cho ô `location`
free-text hiện tại. Tỉnh là cấu hình cố định của thiết bị; xã/phường do cán bộ
chọn khi mở phiên; mọi hồ sơ trong phiên kế thừa xã của phiên đó.

## Quyết định đã chốt

1. **Xã = địa bàn thu thập** (nơi cán bộ tác nghiệp / công an xã chuyển giao),
   KHÔNG phải nơi cư trú của can phạm. Nơi cư trú đã có `hometown`, `address`,
   `address_before_arrest`, `release_residence` trên hồ sơ.
2. **Tỉnh mặc định: Hà Nội** (`province_code = "01"`).
3. **Giữ ràng buộc 1 cán bộ chỉ 1 phiên mở** (`main.py:1250`). Cán bộ đi nhiều
   xã trong ngày phải đóng/mở phiên tuần tự.
4. **Khoá xã sau hồ sơ đầu tiên**: chỉ đổi được khi `detainee_count == 0`.

## Hiện trạng liên quan

- `db.work_sessions` (`main.py:1257`): có `location` free-text max 200,
  default `"Trung tâm thu thập dữ liệu"`. Không có khái niệm tỉnh/xã.
- `db.detainees`: trỏ phiên qua `session_id` (ObjectId), đồng thời đã
  denormalize `cell_code`, `facility_code`, `sub_camp_code`, `custody_type`
  thành string trên hồ sơ.
- `db.cells` (`main.py:307`): cây **tổ chức giam giữ**
  `facility → sub_camp → cell`. Độc lập hoàn toàn với cây hành chính.
- `db.settings`: pattern singleton doc theo chủ đề (`_id: "measurement"`,
  `_id: "fingerprint"`), seed từ `.env` lần đầu rồi DB là nguồn thật
  (`main.py:217-241`).

## Kiến trúc

### 1. Tỉnh — cấu hình thiết bị

Dùng lại pattern `_load_measurement_config`. Không tạo collection `provinces`
(một thiết bị một tỉnh, collection 1 dòng là dư).

```python
# db.settings
{"_id": "deployment", "province_code": "01", "province_name": "Thành phố Hà Nội"}
```

```
# .env
DEPLOY_PROVINCE_CODE=01
DEPLOY_PROVINCE_NAME=Thành phố Hà Nội
```

- `_load_deployment_config()` gọi trong startup cạnh `_ensure_default_cells()`
  (`main.py:181`), cache in-memory `_province_cache`.
- `GET /api/deployment` → `{province_code, province_name}`.
- `PATCH /api/deployment` — chỉ admin, dùng khi triển khai sang tỉnh khác.

### 2. Danh mục Xã — `db.admin_units`

```python
{
  "code": "00001",           # unique
  "name": "Phường Ba Đình",
  "province_code": "01",
  "unit_type": "phuong",     # phuong | xa | dac_khu
  "active": True,
  "created_at": ..., "updated_at": ...
}
```

- Seed từ `backend/data/admin_units_vn.json` qua
  `_ensure_default_admin_units()`, chỉ chạy khi collection rỗng (cùng cơ chế
  `_ensure_default_cells`).
- Index: `code` unique; `[("province_code", 1), ("name", 1)]`.
- `GET /api/admin-units` — tự lọc theo `province_code` của thiết bị, chỉ trả
  `active=True`, sort `unit_type` rồi `name`.
- `POST/PATCH/DELETE /api/admin-units` — chỉ admin. DELETE là soft delete
  (`active=False`), không xoá cứng: hồ sơ cũ vẫn tham chiếu `code` đó.

**Rủi ro dữ liệu** (điểm không chắc chắn duy nhất của thiết kế): chưa xác nhận
được danh sách chính thức 126 phường/xã Hà Nội sau sáp nhập 2025 từ nguồn tin
cậy. Wikipedia ghi "126 đơn vị cấp xã, gồm 51 phường và 75 xã" nhưng không
khẳng định là mốc sau sắp xếp.

Giảm thiểu: lấy từ dataset mở (`provinces.open-api.vn` hoặc tương đương) tại
thời điểm implement, ghi nguồn + ngày lấy vào header file JSON. Nếu fetch không
được thì seed danh sách rút gọn các phường nội thành rồi bổ sung sau. Endpoint
admin CRUD là van an toàn: sai tên, thiếu xã, hay sáp nhập tiếp đều sửa trong
app, không phải sửa code + redeploy.

### 3. Phiên làm việc

`WorkSessionIn` thêm:

```python
commune_code: str = Field(min_length=1, max_length=20)   # bắt buộc
```

`open_session` (`main.py:1244`) tra danh mục rồi snapshot đủ 4 trường:

```python
unit = await db.admin_units.find_one({
    "code": body.commune_code, "province_code": prov_code, "active": True
})
if not unit:
    raise HTTPException(400, "Xã/phường không hợp lệ hoặc không thuộc tỉnh triển khai.")

doc.update({
    "province_code": prov_code,
    "province_name": prov_name,
    "commune_code": unit["code"],
    "commune_name": unit["name"],
})
```

Snapshot cả tên, không chỉ code: xã đổi tên năm sau thì báo cáo in lại vẫn ra
tên đúng thời điểm thu.

`location` **giữ nguyên**, nghĩa hẹp lại thành vị trí cụ thể trong xã ("Buồng
tiếp nhận 2", "UBND xã"). Bỏ default `"Trung tâm thu thập dữ liệu"` ở backend
(`main.py:1262`) và ở `locales/*.json` key `session.open.location_default` để
không gợi ý sai.

### 4. Hồ sơ

`DetaineeIn` **không** thêm field — cán bộ không nhập xã, xã kế thừa từ phiên.
`create_detainee` (`main.py:1113`) copy xuống lúc insert, cạnh `session_id`:

```python
doc.update({
    ...
    "session_id": session_doc["_id"],
    "province_code": session_doc.get("province_code"),
    "commune_code": session_doc.get("commune_code"),
    "commune_name": session_doc.get("commune_name"),
})
```

Denormalize là bắt buộc, không phải tối ưu: xã sáp nhập/đổi tên thì hồ sơ cũ
phải giữ giá trị tại thời điểm thu; và lọc/thống kê theo xã không phải join.

- Index mới: `[("commune_code", 1), ("created_at", -1)]`.
- `update_detainee` (`main.py:1146`) **không cần sửa gì**. Nó dựng `upd` từ
  `body.model_dump()` (`main.py:1157`), mà `DetaineeIn` không có 3 trường này,
  nên `$set` không bao giờ chạm tới chúng. Client gửi kèm `commune_code` trong
  JSON thì Pydantic bỏ qua field lạ. 3 trường được bảo vệ sẵn nhờ thiết kế
  "không thêm vào `DetaineeIn`" — không tốn dòng code nào.
- `_MATCH_PROJECTION` (`main.py:856`) thêm `commune_name` — modal cảnh báo trùng
  CCCD cho biết đối tượng đã thu ở xã nào.

### 5. Sửa phiên — endpoint mới

Hiện chưa có endpoint sửa phiên nào (chỉ create/close/delete), nên phải thêm:

```
PATCH /api/sessions/{session_id}
body: {commune_code?, location?, note?}
```

Điều kiện đổi `commune_code`: `status == "open"` VÀ `officer` là chính mình
(hoặc admin) VÀ `detainee_count == 0`. Vi phạm điều cuối → `409`:
`"Phiên đã có hồ sơ, không thể đổi xã/phường. Đóng phiên và mở phiên mới cho xã khác."`

`location` / `note` sửa thoải mái khi phiên còn mở — chúng không lan xuống hồ sơ.

### 6. Báo cáo & lọc

- `_build_session_report_xlsx` (`main.py:1422`): sheet "Thông tin phiên" thêm 2
  dòng Tỉnh / Xã ngay trên "Địa điểm".
- `list_detainees` (`main.py:821`): thêm query param `commune_code` cạnh
  `cell_code`.
- `/api/sessions` và `/api/sessions/full`: thêm filter `commune_code`.

### 7. Frontend

| File | Thay đổi |
|---|---|
| `SessionOpenModal.jsx` | Dòng tĩnh "Tỉnh/Thành phố" (từ `/api/deployment`) + `<select>` Xã bắt buộc từ `/api/admin-units`, nhóm bằng `<optgroup>` Phường/Xã. Chặn submit khi chưa chọn. |
| `SessionListPage.jsx:264` | Thêm cột Xã/Phường |
| `SessionDetailPage.jsx:176` | Hiện Tỉnh + Xã cạnh `location` |
| `Dashboard.jsx:1785` | Bảng sync thêm cột Xã; `:1518` gộp `commune_name` vào ô tìm kiếm |
| `locales/vi.json` + `en.json` | ~12 key mới: `session.open.province`, `session.open.commune`, `session.col.commune`, các message lỗi |

126 lựa chọn thì `<select>` gốc + `<optgroup>` là đủ; gõ chữ đầu là nhảy tới.
Không tự viết combobox.

## Dữ liệu cũ

Phiên và hồ sơ tạo trước thay đổi này có `commune_code = None`. **Không viết
script migration** — không đoán được xã của chúng.

Hệ quả phải chịu được:
- Query lọc `commune_code` bỏ qua doc null (Mongo tự làm).
- UI render `commune_name || "—"`.
- Phiếu Excel để trống 2 dòng mới.
- Phiên cũ đang mở vẫn tạo hồ sơ được, hồ sơ đó cũng `commune_code = None`.
  Không chặn — chặn thì cán bộ đang giữa ca bị kẹt.

## Test

`backend/tests/test_sessions.py` và `test_face_recognition.py:162,182` hiện gọi
`POST /api/sessions` với `{"location":..., "note":...}` → sẽ **fail** vì thiếu
`commune_code` bắt buộc. Phải sửa cả hai file.

Test mới:
- Tạo phiên với xã hợp lệ → snapshot đủ 4 trường.
- Xã không thuộc tỉnh triển khai → 400.
- Xã `active=False` → 400.
- Hồ sơ kế thừa `commune_code` / `commune_name` từ phiên.
- `PATCH` đổi xã khi `detainee_count == 0` → 200.
- `PATCH` đổi xã khi đã có hồ sơ → 409.
- `PATCH` hồ sơ cố sửa `commune_code` → bị bỏ qua / 400.
- `list_detainees?commune_code=` lọc đúng.

## Cố ý không làm

- **Không** tạo cây `admin_units` đa cấp (tỉnh→xã→thôn) — không có nhu cầu.
- **Không** gắn xã vào `db.cells` — cây giam giữ và cây hành chính là hai trục
  độc lập, trộn vào nhau là hỏng cả hai.
- **Không** cho phiên nhiều xã — mâu thuẫn trực tiếp với quyết định 3 và 4.
- **Không** làm dashboard thống kê theo xã — dữ liệu và filter sẵn sàng, UI
  thống kê là việc riêng, làm sau nếu cần.
- **Không** nhớ xã dùng gần nhất trong `localStorage` — chờ xác nhận có cần.
