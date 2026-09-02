# Thiết kế: Trang đăng ký can phạm

Ngày: 2026-08-31
Tham chiếu: `photo_2026-08-31_11-14-43.jpg`

## Mục tiêu

Thiết kế lại `DataCapturePage.jsx` từ layout dashboard 3 tier sang layout **tờ khai**
theo mockup: thanh meta đầu trang, các mục đánh số La Mã, nhóm trường theo khối
nghiệp vụ. Bổ sung nhóm trường quan hệ gia đình và thông tin vụ án (cả frontend
lẫn backend). Tách mục III thành vân lăn + vân phẳng.

Giữ nguyên theme đỏ mận (Công an) cho header/nút/số mục; vùng khai nền trắng để
dễ đọc và dễ in.

## Hiện trạng

`app_cccd/frontend/src/DataCapturePage.jsx` — 3082 dòng, một file, chứa:

- Layout `case-preview` 3 tier: tier 1 (3 ảnh chân dung + CCCD 2 mặt),
  tier 2 (`personal-info--4col`), tier 3 (vân tay 10 ô + khối kiểm tra dữ liệu)
- Logic thiết bị đã chạy ổn định: camera + YOLO, đo chiều cao, cân điện tử,
  đọc CCCD, thu vân tay Morfin theo cụm
- `ProfilePreviewContent` (dòng 2753) — export ra ngoài, `PreviewWindow.jsx:3`
  đang import

Backend `DetaineeIn` (`backend/main.py:405`) đã có trường CCCD + 21 trường
nghiệp vụ. Chưa có quan hệ gia đình và thông tin vụ án.

## A. Cấu trúc file

Tách thành `frontend/src/capture/`:

| File | Nội dung |
|---|---|
| `DataCapturePage.jsx` | Shell: layout tờ khai + footer (~250 dòng) |
| `useCaptureForm.js` | State form, `setField`, validate, save |
| `useFingerprintCapture.js` | Morfin: cụm, `/confirm_step`, `/mark_none` |
| `useCameraCapture.js` | Camera, YOLO, đo chiều cao, cân |
| `sections/MetaBar.jsx` | Số HS · ngày lập · đơn vị · tiến độ |
| `sections/SectionNhanThan.jsx` | Mục I + CCCD 2 mặt |
| `sections/SectionGiaDinh.jsx` | Bảng quan hệ gia đình (mới) |
| `sections/SectionVuAn.jsx` | Thông tin vụ án (mới) |
| `sections/SectionNhanDang.jsx` | Mục II: 3 ảnh + đặc điểm nhận dạng |
| `sections/SectionVanTay.jsx` | Mục III: vân lăn + vân phẳng |
| `sections/FooterActions.jsx` | Lưu tạm · Xem trước · Hoàn tất |
| `components/` | `CccdCardUpload`, `CccdCardBackUpload`, `LiveCamShot`, `PhotoSlot`, `Field`, `InfoField`, `HandGlyph`, `CameraCaptureModal` |

Ràng buộc: logic thiết bị **chỉ di chuyển, không viết lại**.

`ProfilePreviewContent` phải giữ được đường import cũ (`PreviewWindow.jsx:3`,
`lib/dualMonitorPreview.js`, `lib/exportProfilePdf.js`) — dùng re-export từ
`DataCapturePage.jsx` cũ hoặc sửa các import đó sang đường dẫn mới.

## B. Layout

Vùng khai nền trắng (`--paper: #fff`), số mục và nút dùng đỏ mận sẵn có.
Khung tối đa ~1180px, canh giữa.

```
Số HS ___ · Ngày lập __/__/__ · Đơn vị ___ · [●●●●○ 78%]
─────────────────────────────────────────────────────────
I. THÔNG TIN NHÂN THÂN              │ ┌─ CCCD trước ─┐
 Họ tên*        Tên khác            │ └──────────────┘
 Ngày sinh*     Giới tính*          │ ┌─ CCCD sau ───┐
 Số CCCD*       CMND cũ             │ └──────────────┘
 Dân tộc  Tôn giáo  Quốc tịch       │   [Đọc CCCD]
 Nguyên quán                        │
 HKTT                               │
 Nghề nghiệp    Trình độ            │
─────────────────────────────────────────────────────────
QUAN HỆ GIA ĐÌNH
 Quan hệ │ Họ tên │ Năm sinh │ Địa chỉ        [+ Thêm]
─────────────────────────────────────────────────────────
THÔNG TIN VỤ ÁN
 Tội danh │ Ngày bắt │ Cơ quan thụ lý │ Số QĐ │ Diện giam
─────────────────────────────────────────────────────────
II. ẢNH NHẬN DẠNG
 [Chính diện 3x4] [Nghiêng trái] [Nghiêng phải]
 Cao ___cm  Nặng ___kg  Nhóm máu ___
 Đặc điểm riêng / vết tích, hình xăm ______________
─────────────────────────────────────────────────────────
III. CHỈ BẢN VÂN TAY
 Vân lăn   [T5][T4][T3][T2][T1] │ [P1][P2][P3][P4][P5]
 Vân phẳng [4 ngón trái] [2 ngón cái] [4 ngón phải]
─────────────────────────────────────────────────────────
                      [Lưu tạm] [Xem trước] [Hoàn tất]
```

Khối "kiểm tra dữ liệu" ở cột phải hiện tại **bỏ đi** — mockup không có cột phải.
Thay bằng thanh tiến độ trong `MetaBar` cộng badge lỗi tại chỗ từng mục. Logic
`checks` hiện có được giữ, chỉ đổi cách trình bày.

## C. Trường mới — backend

Thêm vào `DetaineeIn` (`backend/main.py:405`), tất cả `Optional` nên dữ liệu cũ
không vỡ:

```python
family: Optional[list[dict]] = None   # [{relation, full_name, birth_year, address}]
charge_detail: Optional[str] = None   # tội danh chi tiết
arrest_date: Optional[str] = None     # ngày bắt
arrest_agency: Optional[str] = None   # cơ quan thụ lý
decision_no: Optional[str] = None     # số quyết định
scars: Optional[str] = None           # vết tích, hình xăm
blood_type: Optional[str] = None
```

`charge`, `date_in`, `distinguishing_features` đã có — dùng lại, không nhân bản.

Frontend: thêm các key tương ứng vào `EMPTY_FORM`, `normalizeInitial`, và
`locales/vi.json` + `en.json`.

## D. Vân tay roll + plain

- `fp_l1..fp_r5` = **vân lăn**, 10 ảnh từng ngón — giữ nguyên key, dữ liệu cũ
  đọc được nguyên vẹn.
- `fp_plain_left`, `fp_plain_thumbs`, `fp_plain_right` = **vân phẳng**, 3 ảnh cụm
  nguyên bản, khớp đúng 3 `STEPS` của `morfin_service`
  (`left_hand` / `thumbs` / `right_hand`, xem `FP_CLUSTERS` dòng 61).

Không sửa `morfin_service` — máy vốn chụp theo cụm, chỉ lưu thêm ảnh cụm trước
khi tách ngón. Luồng `/confirm_step` + `/mark_none` giữ nguyên.

Tiêu chí "đủ vân tay" (`fpCount === 10`) giữ nguyên; ảnh cụm phẳng là bổ sung,
không đưa vào điều kiện bắt buộc ở bước này.

## E. Triển khai 2 giai đoạn

Tách một file 3082 dòng là phần rủi ro nhất, lớn hơn cả việc đổi layout — file
này chứa logic thiết bị đã chạy ổn. Chia 2 giai đoạn để kiểm tra được từng bước:

**Giai đoạn 1** — tách file theo mục A, **giữ nguyên layout hiện tại**.
Tiêu chí xong: app chạy, camera + YOLO + đo cao + cân + đọc CCCD + thu vân tay
Morfin hoạt động như trước; `PreviewWindow` và xuất PDF không lỗi.

**Giai đoạn 2** — đổi layout theo mục B, thêm trường mục C, thêm roll/plain mục D.

## Ngoài phạm vi

- Không đổi `DetaineeForm.jsx` (modal thêm/sửa nhanh từ Dashboard)
- Không đổi theme chung của app
- Không sửa `morfin_service`
- Không tách ngón từ ảnh cụm vân phẳng
