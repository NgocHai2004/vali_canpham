# In toàn bộ Chỉ bản / Danh bản khi phiên đã đóng

Ngày: 2026-09-12. Trạng thái: **đã triển khai** (backend + frontend).

## Mục đích

Khi một phiên làm việc đã **đóng**, cán bộ cần in **toàn bộ** Chỉ bản (295) và Danh bản (204) của danh sách can phạm trong phiên đó — để lưu hồ sơ giấy. Một nút in trên trang chi tiết phiên, gộp tất cả các tờ thành **một file PDF nhiều trang** rồi mở hộp thoại in trình duyệt.

## Quyết định (thỏa thuận với cán bộ sử dụng)

1. **Vị trí nút:** trang chi tiết phiên (SessionDetailPage).
2. **Hình thức in:** một file PDF gộp (2 tờ × số can phạm), mở hộp thoại in trình duyệt.
3. **Thiếu dữ liệu:** vẫn in, để trống ô thiếu — không chặn.

## Vấn đề phát hiện

`get_session_detail` (`GET /api/sessions/{id}`) trả về danh sách can phạm **chỉ với trường tóm tắt** (id, code, personal_id, full_name, cccd_number, gender, dob, cell_code, created_at) — **không đủ** để render Chỉ bản/Danh bản (thiếu địa chỉ, dân tộc, nghề nghiệp, cha/mẹ, vân tay, ảnh…). Gọi N lần `getDetainee` là chậm và rời rạc.

→ Thêm endpoint backend trả về **toàn bộ dữ liệu + photos** của mọi can phạm trong một lần gọi.

## Kiến trúc

```
SessionDetailPage (phiên đã đóng) → nút "In Chỉ bản/Danh bản"
  → GET /api/sessions/{id}/sheets   (backend, đủ dữ liệu + photos)
  → SessionSheetsPrinter: render NameSheetPreviewContent + FpSheetPreviewContent
      cho từng can phạm (vị trí trong suốt, không che UI)
  → buildSheetsPdfBlob(nodes): html2canvas từng tờ → gộp 1 jsPDF nhiều trang
  → window.open(blob) → hộp thoại in trình duyệt
```

Mỗi can phạm đóng góp **2 tờ**: Danh bản (204) rồi Chỉ bản (295) — đúng thứ tự khi lưu hồ sơ. Thứ tự can phạm theo `created_at` (như khi thu nhận).

## Thay đổi

### Backend (`app_cccd/backend/main.py`)

- `GET /api/sessions/{session_id}/sheets` (sau `get_session_detail`):
  - 404 nếu không có phiên; 403 nếu không phải cán bộ của phiên và không phải admin.
  - Trả về `{session: _s_session(doc), detainees: [...]}` với mỗi can phạm là `_s(d)` **đầy đủ** (kể cả `photos`).
  - **Bỏ `photos.face_embedding`** (vector 512 chiều không cần cho in, làm phản hồi nặng và lộ dữ liệu nhận dạng).
  - Không chặn phiên đang mở (admin có thể in giữa chừng để kiểm tra), nhưng UI chỉ hiện nút khi phiên đã đóng.

### Frontend

- `lib/exportProfilePdf.js`: tách `nodeToCanvas()` + `addCanvasToPdf(pdf, canvas)` (dùng chung, kể cả logic cắt tờ cao), thêm `buildSheetsPdfBlob(nodes)` — mỗi node một trang A4.
- `api.js`: `getSessionSheets(id)` → `GET /api/sessions/{id}/sheets`.
- `SessionSheetsPrinter.jsx` (mới): nhận `detainees` + `unitName`, render tất cả tờ ở `position:fixed; opacity:0; z-index:-1`, effect chụp `.preview-a4` → `buildSheetsPdfBlob` → `window.open(blob)` → `onDone()`.
- `SessionDetailPage.jsx`: nút "🖨 In Chỉ bản/Danh bản" (chỉ khi `session.status === "closed"`), `doPrintSheets` gọi `getSessionSheets`, render `SessionSheetsPrinter`.
- `locales/{vi,en}.json`: `session.detail.print_sheets`, `.printing`, `.err.sheets`.

## Kiểm thử

- `backend/tests/test_scan_sheets.py` (8): trả đủ dữ liệu + photos, thứ tự theo `created_at`, bỏ `face_embedding`, phiên mở vẫn trả được, 404, 403 người khác, admin xem được phiên người khác, phiên không có can phạm trả rỗng.
- Frontend: không có test framework (chỉ oxlint + vite) → xác minh bằng `vite build`; logic test được dồn về backend.

Lệnh chạy:
```
cd app_cccd/backend && ../.venv/Scripts/python.exe -m pytest tests/ -q
cd app_cccd/frontend && node_modules/.bin/vite build
```

## Ngoài phạm vi

- Không in tự động khi đóng phiên — cán bộ bấm nút.
- Không đụng `app/main.py` / `app/queue.py` của repo OCR.
- Không commit.