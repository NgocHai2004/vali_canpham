# Design — "Case Preview" Screen

This document describes the layout for the **Case Preview screen**
(XEM TRƯỚC HỒ SƠ) based on the reference mockup
`photo_6275915357084127706_y.jpg`. Goal: display ALL captured data for one
detainee on a **single screen**, dashboard style — minimal scrolling — so
officers can verify completeness before saving.

Only **layout & components** are described here. Colors were finalized in an
earlier session (Vietnamese Public Security maroon-red theme) and are not
changed here.

---

## 1. Overall frame

Keep the existing app shell (top header + left sidebar). The page content is a
**2-column grid**:

- **Left column (main)** — 3 vertical tiers stacked, takes most of the width
- **Right column (aside)** — a tall block spanning the full page height,
  containing **Case Summary** on top + **Data Verification** below. This
  column is independent from the tiers on the left.

No page title / heading / breadcrumb above the grid — the content starts
directly with the 2-column layout.

Rough CSS:
```
.case-preview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;   /* main | aside */
  grid-template-rows: minmax(0, 1fr) auto;       /* body | action-bar */
  gap: 10px;
}
.case-main     { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.case-aside    { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.action-bar    { grid-column: 1 / -1; }
```

```
+------------------------------------------------------------------------------+
|  HEADER (existing)                                                           |
+---------+--------------------------------------------------------------------+
|         |  ┌───────────────────────────────────────────┬──────────────┐     |
|         |  │  LEFT COLUMN (main)                        │  ASIDE       │     |
|SIDEBAR  |  │  [ TIER 1 — 3 columns ]                    │  ┌─────────┐ │     |
|(existing)| │  ┌───────────┬────────────┬──────────┐    │  │ Case    │ │     |
|         |  │  │Body photos│Personal    │CCCD card │    │  │ Summary │ │     |
|         |  │  │(F/L/R)    │info        │          │    │  │         │ │     |
|         |  │  └───────────┴────────────┴──────────┘    │  │ chip:   │ │     |
|         |  │                                            │  │ SẴN SÀNG│ │     |
|         |  │  [ TIER 2 — Fingerprints + KPI ]           │  ├─────────┤ │     |
|         |  │  ┌───────────────────────────┬───────┐    │  │ Data    │ │     |
|         |  │  │ 10 fp cells (5 x 2)       │ Round │    │  │ Verify  │ │     |
|         |  │  │                           │ KPI   │    │  │ progress│ │     |
|         |  │  └───────────────────────────┴───────┘    │  │ + list  │ │     |
|         |  │                                            │  │         │ │     |
|         |  │  [ TIER 3 — Additional info (4 cols) ]     │  │ banner  │ │     |
|         |  │  ┌──────┬───────┬───────┬─────────────┐   │  │ ⭐ No    │ │     |
|         |  │  │Extra │Device │Notes  │Case history │   │  │ issues  │ │     |
|         |  │  │info  │       │       │timeline     │   │  │ detected│ │     |
|         |  │  └──────┴───────┴───────┴─────────────┘   │  └─────────┘ │     |
|         |  └───────────────────────────────────────────┴──────────────┘     |
|         |  [ ACTION BAR — Save / Preview / Reset ]  (full width)             |
+---------+--------------------------------------------------------------------+
```

The right column has a fixed width (~260–280px) and its height matches the
main column. Inside it is a flex-column: **Case Summary** on top (auto height)
and **Data Verification** below (flex: 1, expands to fill remaining space).

---

## 2. Tier 1 — Identity block (3 columns)

Grid: `grid-template-columns: 1.15fr 1fr 0.9fr;` (tune during build).

### 2.1. Body photos
- Block title: `ẢNH CHỤP TOÀN THÂN`
- 3 photo frames arranged horizontally: **FRONT · LEFT · RIGHT**
- To the left of each frame, a **height ruler** (100–200 cm scale) — purely
  decorative, for visual reference
- Empty state: dashed frame + camera icon + "Chưa có ảnh"

### 2.2. Personal information
- Block title: `THÔNG TIN CÁ NHÂN`
- 2-column grid, each field on its own row `[icon] [label]  [value]`
- Left column: Họ và tên · Số CCCD · Ngày sinh · Giới tính · Quốc tịch · Dân tộc
- Right column: Tôn giáo · Nơi thường trú · Ngày cấp · Nhị cư · Ghi chú
- Values in `font-weight: 700`; labels in muted gray

### 2.3. CCCD card (preview)
- Block title: `THẺ CĂN CƯỚC CÔNG DÂN`
- Reuse the existing `CccdCardUpload` component; only tweak border-radius +
  subtle shadow to match the mockup
- Fixed width ~260–300px, height following the CCCD aspect ratio

---

## 3. Tier 2 — Fingerprints + circular KPI

Grid: `grid-template-columns: 1fr 260px;`

### 3.1. Fingerprints
- Block title: `DẤU VÂN TAY (10 / 10)`
- 5-column × 2-row grid = 10 fingerprint cells
- Row 1 = LEFT hand, row 2 = RIGHT hand
- Per-column labels (aligned across both rows):
  `NGÓN ÚT · NGÓN ÁP ÚT · NGÓN GIỮA · NGÓN TRỎ · NGÓN CÁI`
  (matches the mockup ordering; left hand goes pinky → thumb, right hand
   mirrors it)
- Each cell:
  - Grayscale fingerprint thumbnail
  - Quality chip below: `Chất lượng: Xuất sắc` (green) / `Trung bình` (orange)
    / `Kém` (red)
- Ngón thật sự không có vân tay (cán bộ đã xác nhận — xem `photos.fp_missing`):
  cell hiển thị chip xám `Không có vân tay` (thay vì thumbnail), coi là **đã
  xử lý**, KHÔNG đếm vào hàng "Thiếu" trong `5.2. Data Verification`. Ngón
  trong `fp_missing` vẫn tính vào tổng `10 / 10` như ngón đã thu thập bình
  thường. Phân biệt với ngón chưa thu thập được (không có trong cả `fp_templates`
  lẫn `fp_missing`) — ngón đó vẫn là `Thiếu` đỏ.

### 3.2. Circular KPI (right of the fingerprint grid)
- Single square-ish card, centered content
- Large circular fingerprint icon on top (maroon)
- Line: `10 / 10 — Đã thu thập` (maroon, bold)
- Big number: `98%` — average quality (maroon, extra large)
- Small caption below: `Chất lượng trung bình — Xuất sắc`

---

## 4. Tier 3 — Additional info (4 columns)

Grid: `grid-template-columns: repeat(4, 1fr);`, gap 12px.

### 4.1. Additional information
- Block title: `THÔNG TIN BỔ SUNG`
- Chiều cao (cm) · Cân nặng (kg) · Nhóm máu · Đặc điểm nhận dạng · Sẹo · Dấu
  hiệu khác
- One field per row, small icon on the left

### 4.2. Capture device
- Block title: `THIẾT BỊ THU NHẬN`
- Tên thiết bị · Số seri · Phiên bản phần mềm · Phương thức (`Live Scan`) ·
  Cán bộ thu nhận · Vị trí
- Mono font for codes/numbers

### 4.3. Notes
- Block title: `GHI CHÚ`
- Free text area; empty state: `Không có ghi chú.`
- Height matches the two neighbor blocks

### 4.4. Case history
- Block title: `LỊCH SỬ HỒ SƠ`
- Vertical timeline; each item:
  ```
  ●  09:51 24/07/2026   admin
     Thu nhận dữ liệu
  ```
- Sample events: Thu nhận dữ liệu · Kiểm tra & xác minh · Đóng tệp hồ sơ · Sẵn
  sàng lưu vào hệ thống
- Dots in maroon-red; connectors in light gray

---

## 5. Right aside — Case summary + Data verification

### 5.1. Case Summary (top)
- Block title: `TÓM TẮT HỒ SƠ`
- Compact `label : value` list, one metric per row:
  - Mã hồ sơ · Thời gian thu nhận · Cán bộ · Thiết bị · Máy trạm
  - Số vân tay `10 / 10`
  - Số ảnh chụp `3 / 3`
  - Ghi chú (if any)
- At the bottom, a large chip: `SẴN SÀNG` — gold (`#f0c33c`) background,
  maroon text, full-width, 40px tall
- Numeric values in bold mono font

### 5.2. Data Verification (below)
- Block title: `KIỂM TRA DỮ LIỆU`
- Top: `Tiến độ tổng thể ────────── 100%` (maroon progress bar)
- Verification list (2-column `Hạng mục | Trạng thái`):
  - Xác minh CCCD · Vân tay · Ảnh khuôn body · Chữ ký chốt · Trường bắt buộc
  - Status: green chip `Đã xác minh` / `Đầy đủ`, or red chip `Thiếu` when
    incomplete
- Bottom: light-yellow banner with a star icon:
  `⭐ Không phát hiện vấn đề.` (or light-red variant when there are issues)

---

## 6. Action bar (bottom)

Sticky at the bottom of the page, white background, light-gray top border,
10px padding.

3-column even grid:

| Button | Style | Purpose |
|---|---|---|
| **Lưu dữ liệu vào hồ sơ** | `.button.primary` (maroon red) | Call existing save API |
| **Xem trước hồ sơ** | `.button.secondary` (gray border) | Open preview modal / print PDF |
| **Xoá dữ liệu** | `.button.danger` (red border, red text) | Reset form with confirm |

Buttons fill their column width, 44px tall, icon on the left.

---

## 7. Constraints & principles

- **No vertical scroll** on screens ≥ 1440×900. On smaller screens, allow
  scrolling inside `.content`, NOT on body.
- All sub-blocks reuse the existing `.cap-block` frame — add modifiers like
  `.cap-block--wide`, `.cap-block--tall` only if needed.
- Photos & fingerprints: empty states must show icon + label; no blank white
  frames.
- Data state:
  - Complete → green chip
  - Missing → light-red chip + surfaced in "Kiểm tra dữ liệu"
- Font: keep Inter; use mono for numbers/codes.
- **Do not touch existing logic**: `DataCapturePage.jsx` state, handlers, and
  APIs stay the same. Only the JSX structure + CSS change.

---

## 8. Code scope

Files to touch:

- `frontend/src/DataCapturePage.jsx` — rewrite the JSX render section (keep
  state/handlers at the top)
- `frontend/src/Dashboard.jsx` — add CSS inside the `styles` string for new
  classes: `.case-preview`, `.case-tier`, `.case-tier-1`, `.case-tier-2`,
  `.case-tier-3`, `.case-summary`, `.case-verify`, `.fp-grid`, `.fp-kpi`,
  `.check-list`, `.timeline`, `.body-shots`, `.ruler`, `.action-bar`, etc.
- No new files unless a piece clearly deserves its own component.

Rough estimate: ~500 lines of JSX + ~300 lines of CSS. Layout first, then
wire up bindings from the existing `form / photos / fpQuality / session`
state.

---

## 9. Questions to confirm before coding

1. **Body photos** — does the project already capture full-body shots, or
   should we reuse the existing `portrait_front/left/right`? (The mockup
   shows full body; the project currently only has portraits.)
2. **Height ruler** in the photo column — purely decorative, or auto-derived
   from the entered height?
3. **KPI `Average quality 98%`** — is fingerprint quality data available
   from the backend, or should we mock/average it for now?
4. **`SẴN SÀNG` status** — flipped manually by the officer, or auto-triggered
   once 10 fingerprints + 3 photos + CCCD are all captured?
5. **"Xem trước hồ sơ" button** — open a PDF-print modal, or switch to a
   view-only mode?

Once you confirm the layout and answer these 5 questions, I'll start building.
