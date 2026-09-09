# Thiết kế — Trang "Xem trước hồ sơ" (A4 ngang)

Tài liệu này mô tả layout cho **modal xem trước hồ sơ nghi phạm** đúng khổ **A4 landscape (297 × 210 mm)**, hiển thị toàn bộ dữ liệu trên **1 trang duy nhất**, **không có thanh cuộn**, sẵn sàng in ra hoặc xuất PDF khổ giấy ngang.

Chỉ mô tả **layout, kích thước, typography, thứ tự đọc**. Data đã có sẵn trong `form / photos / cells / session` — không đổi state hay API.

---

## 1. Nguyên tắc thiết kế

1. **Đúng khổ A4 ngang** — nội dung khớp tỉ lệ `297 / 210`, không co giãn tự do.
2. **Không scroll** — cả modal và tài liệu đều `overflow: hidden`. Nếu dữ liệu vượt trang thì phải cắt/rút gọn, không đẩy scrollbar ra.
3. **1 mắt nhìn — hiểu ngay** — thông tin quan trọng nhất (tên, ảnh, CCCD) nằm ở nửa trên bên trái, chỗ mắt bắt đầu quét.
4. **Đọc kiểu Z** — mắt đi từ trái sang phải, trên xuống dưới. Sắp xếp block theo thứ tự đọc.
5. **Đủ để in — đúng để tra cứu trên màn** — cùng 1 layout, không có 2 phiên bản riêng.
6. **Tone ngành** — tiêu đề, viền, label header dùng đỏ đô Công an `#8E0000`; nền trắng, chữ đen (in tiết kiệm mực).
7. **Chỉ 1 tiêu đề trang** — "HỒ SƠ NGHI PHẠM", đặt trung tâm phía trên.

---

## 2. Khung tổng thể

Kích thước cố định khi in: **297 mm × 210 mm** (A4 landscape).
Padding an toàn trong trang: **8 mm trên/dưới**, **10 mm trái/phải** → vùng nội dung `277 × 194 mm`.

Cấu trúc **grid dọc 4 hàng**:

```
┌─────────────────────────────────────────────────────────────────────────────┐  ▲
│                    HÀNG 1 — DOC HEADER (auto ~24mm)                        │  │
├─────────────────────────────────────────────────────────────────────────────┤  │
│                                                                             │  │
│                    HÀNG 2 — NỘI DUNG CHÍNH (fill 1fr, ~150mm)              │  │  A4
│                    Grid 4 cột                                              │  │  ngang
│                                                                             │  │  210mm
├─────────────────────────────────────────────────────────────────────────────┤  │
│                    HÀNG 3 — CHÂN TRANG THÔNG TIN (auto ~8mm)               │  │
├─────────────────────────────────────────────────────────────────────────────┤  │
│                    HÀNG 4 — CHỮ KÝ (auto ~20mm)                             │  │
└─────────────────────────────────────────────────────────────────────────────┘  ▼
                              ←──── 297 mm ────→
```

CSS gốc:

```css
.preview-a4-landscape {
  width: 297mm; height: 210mm;
  padding: 8mm 10mm;
  display: grid;
  grid-template-rows: auto 1fr auto auto;
  gap: 4mm;
  overflow: hidden;
  font-family: "Times New Roman", "Cambria", serif;
  color: #0F1116;
  background: #fff;
}
```

Trên màn hình modal: dùng `width: min((100dvh - 76px) * (297/210), 100vw - 24px)` + `aspect-ratio: 297/210` để scale nguyên bản, tỉ lệ luôn đúng.

---

## 3. Hàng 1 — Doc Header (3 cột)

Grid: `grid-template-columns: 76mm 1fr 52mm; align-items: center; gap: 6mm;`
Đáy có gạch chân **1.5mm** màu maroon để tách biệt phần thân.

```
┌──────────────────┬──────────────────────────────┬──────────────────────┐
│                  │                              │                      │
│ CỘNG HÒA XÃ HỘI  │      HỒ SƠ NGHI PHẠM          │   ┌──────────────┐   │
│ CHỦ NGHĨA VIỆT   │                              │   │              │   │
│ NAM              │  Số định danh: **CP0001**    │   │  ẢNH CCCD    │   │
│ ─────            │  CCCD: 001203033844          │   │  MẶT TRƯỚC   │   │
│ Độc lập - Tự do  │                              │   │              │   │
│ - Hạnh phúc      │  Mã phiên: S20260722-0001    │   └──────────────┘   │
│                  │                              │      44×28 mm         │
│  (10.5px bold)   │  (title 22px maroon bold)    │                      │
└──────────────────┴──────────────────────────────┴──────────────────────┘
       76 mm                    ~123 mm                     52 mm
```

**Chi tiết:**
- **Cột trái (76mm)**: Quốc hiệu 2 dòng, gạch chân 45×1 mm, canh giữa. Font 10.5px bold.
- **Cột giữa (1fr)**:
  - Tiêu đề `HỒ SƠ NGHI PHẠM` — **22px bold, letter-spacing 2px, maroon #8E0000**, canh giữa.
  - Dòng meta 11px: `Số định danh · CCCD · Mã phiên` — hiển thị 3 field trong 1 hoặc 2 dòng, format `label: **value**`.
- **Cột phải (52mm)**: ảnh CCCD mặt trước, khung 44×28 mm, viền 1 px đen. Empty state: chữ nghiêng "Chưa có CCCD" trên nền `#F8FAFC` viền đứt.

---

## 4. Hàng 2 — Nội dung chính (4 cột)

Đây là hàng chiếm hết chiều dọc còn lại. Grid 4 cột tỉ lệ **`1.15fr 1fr 0.85fr 1.1fr`** — tinh chỉnh để mỗi cột đủ nội dung không tràn.

```
┌──────────────────┬─────────────────┬────────────────┬───────────────────┐
│ I. THÔNG TIN     │ II. NHẬN DẠNG   │ III. CHÂN DUNG │ IV. VÂN TAY       │
│    CÁ NHÂN       │  & GIAM GIỮ     │    ĐA GÓC      │    10 NGÓN        │
│  (viền maroon)   │  (viền maroon)  │  (viền maroon) │  (viền maroon)    │
│──────────────────│─────────────────│────────────────│───────────────────│
│                  │                 │                │                   │
│ Họ tên           │ Chiều cao 165cm │  ┌──────────┐  │  ┌───┬───┬───┬── │
│ Ngày sinh        │ Cân nặng  60kg  │  │  FRONT   │  │  │Út │Áp │Gi │Tr │
│ Giới tính        │ Buồng B01       │  └──────────┘  │  ├───┼───┼───┼── │
│ Số CCCD          │ Tội danh …      │  ┌──────────┐  │  │Út │Áp │Gi │Tr │
│ Quốc tịch        │ Ngày vào …      │  │   LEFT   │  │  └───┴───┴───┴── │
│ Dân tộc          │ Ghi chú …       │  └──────────┘  │  Bàn tay TRÁI    │
│ Tôn giáo         │                 │  ┌──────────┐  │  Bàn tay PHẢI    │
│ Quê quán         │  ┌───────────┐  │  │  RIGHT   │  │                  │
│ Nơi thường trú   │  │ Ảnh 4×6   │  │  └──────────┘  │  (5 cột × 2 hàng)│
│ Ngày cấp CCCD    │  │           │  │                │                  │
│ Ngày hết hạn     │  │ chân dung │  │                │                  │
│ Nơi cấp          │  └───────────┘  │                │                  │
│  (12 field)      │  (auto-push đáy)│                │                  │
└──────────────────┴─────────────────┴────────────────┴───────────────────┘
     ~66 mm              ~58 mm            ~49 mm           ~64 mm
```

### 4.1. Cột I — Thông tin cá nhân

Bảng key-value, `.pv-label` (background `#FBEAEA` maroon nhạt, `color #4A0000`, font 9.5px bold, width 22mm) — value cột phải flex fill.

12 dòng field theo thứ tự:
1. Họ và tên
2. Ngày sinh
3. Giới tính (Nam / Nữ)
4. Số CCCD (định dạng mono, 12 số cách nhau `001 203 033 844`)
5. Quốc tịch
6. Dân tộc
7. Tôn giáo
8. Quê quán
9. Nơi thường trú
10. Ngày cấp
11. Ngày hết hạn
12. Nơi cấp

Font row: 10px Times New Roman. Border cell: 0.6px `#CBD5E1`.
Value dài (`nơi thường trú`) → `word-break: break-word`, tối đa 2 dòng, dôi ra thì ellipsis.

### 4.2. Cột II — Nhận dạng & giam giữ + ảnh chân dung 4×6

**Phần trên**: bảng key-value dày 6 dòng:
- Chiều cao (cm)
- Cân nặng (kg)
- Buồng giam (`code — name`)
- Tội danh
- Ngày vào buồng
- Ghi chú

**Phần dưới (auto-push xuống đáy cột)**:
- Khung ảnh chân dung **44 mm × 58.7 mm** (tỉ lệ 3:4 = ảnh 4×6), viền 1px đen.
- Caption dưới ảnh: `Ảnh chân dung 4×6` italic 9.5px.
- Dùng `margin-top: auto` để đẩy xuống đáy — tách rõ 2 vùng.

Empty state ảnh: chữ "Ảnh 4×6" trên nền `#F8FAFC`, viền đứt.

### 4.3. Cột III — Chân dung đa góc (3 ảnh dọc)

3 khung **tỉ lệ 4:3**, chồng dọc, cách nhau 2mm. Bên dưới mỗi khung: caption 9.5px `Chính diện` / `Nghiêng trái` / `Nghiêng phải`.

Kỹ thuật: mỗi item là `flex: 1 1 0; min-height: 0;` → 3 ô tự chia đều chiều cao còn lại. Viền 0.8px đen.

Empty state: `Chưa có` màu `#94A3B8`, size 9.5px.

### 4.4. Cột IV — Vân tay 10 ngón

Grid **5 cột × 2 hàng** = 10 ô. Mỗi ô là 1 ngón vân tay, tỉ lệ 3:4.

**Thứ tự (chuẩn):**

| | Ngón út | Ngón áp út | Ngón giữa | Ngón trỏ | Ngón cái |
|---|---|---|---|---|---|
| Hàng 1 | L5 | L4 | L3 | L2 | L1 |
| Hàng 2 | R5 | R4 | R3 | R2 | R1 |

- Hàng 1 = bàn tay **TRÁI** (Left), thứ tự từ ngón út → cái, khớp mockup bàn tay trái đặt trên bàn.
- Hàng 2 = bàn tay **PHẢI** (Right), mirror của hàng 1.
- Label dưới mỗi cell: font 8px, chỉ hiện tên ngắn (ví dụ `L1 · Cái`).
- Trước hàng 1 và trước hàng 2 có 1 label ngoài lề trái: `Trái` / `Phải` xoay dọc 90° hoặc chú thích nhỏ ở đầu cột 1 (tuỳ chọn — nếu không kịp chỗ thì bỏ).

Border cell: 0.6px `#333`. Nền empty: `#F8FAFC`. Empty state ký hiệu: `—`.

---

## 5. Hàng 3 — Chân trang thông tin (footer meta, ~8mm)

Dải mỏng, chữ 9px `#4A5160`, canh giữa. Dùng để in metadata thu nhận, không phải chữ ký.

```
────────────────────────────────────────────────────────────────────────────
Thiết bị: L-Scan Guardian · Cán bộ: canbo01 · Địa điểm: Trại Tạm giam A · Thời điểm: 09:31 24/07/2026
```

Format: các mục tách bằng `·`, canh giữa, 1 dòng. Nếu chạy tràn → nén size 8.5px.

Border trên: 0.5px `#CBD5E1`.

---

## 6. Hàng 4 — Chữ ký (2 cột, ~20mm)

```
┌─────────────────────────────────────┬─────────────────────────────────────┐
│         Ngày 24 tháng 07 năm 2026   │                                     │
│                                     │                                     │
│         CÁN BỘ LẬP HỒ SƠ            │         NGƯỜI KHAI                  │
│         (Ký, ghi rõ họ tên)         │         (Ký, ghi rõ họ tên)         │
│                                     │                                     │
│         [ ~10mm chỗ trống để ký ]   │         [ ~10mm chỗ trống để ký ]   │
└─────────────────────────────────────┴─────────────────────────────────────┘
```

- Grid 2 cột đều, gap **20mm**.
- Font:
  - Dòng ngày: 9.5px italic
  - Chức danh: 10.5px UPPERCASE bold letter-spacing 0.4px
  - Ghi chú `(Ký, ghi rõ họ tên)`: 9px italic `#555`
- Không thêm border/box quanh vùng chữ ký — chỉ có border-top của hàng 4 để tách với chân trang.

---

## 7. Typography chốt

| Vai trò | Font | Weight | Size | Note |
|---|---|---|---|---|
| Tiêu đề trang | Times New Roman | 700 | 22px | maroon `#8E0000`, letter-spacing 2px |
| Header quốc hiệu | Times New Roman | 700 | 10.5px | canh giữa |
| Tiêu đề section (I/II/III/IV) | Times New Roman | 700 | 10.5px | UPPERCASE, gạch chân maroon 1.2px, letter-spacing 0.3px |
| Bảng label | Times New Roman | 600 | 9.5px | nền `#FBEAEA`, text `#4A0000` |
| Bảng value | Times New Roman | 400 | 10px | text `#0F1116`, `tabular-nums` cho số |
| Caption ảnh | Times New Roman | 400 italic | 9.5px | text `#333` |
| Chân trang meta | Times New Roman | 400 | 9px | text `#4A5160` |
| Chữ ký chức danh | Times New Roman | 700 | 10.5px | UPPERCASE, letter-spacing 0.4px |

Số CCCD, chiều cao, cân nặng, ngày tháng: dùng `font-variant-numeric: tabular-nums` để cột số thẳng hàng.

---

## 8. Màu

| Token | Value | Dùng cho |
|---|---|---|
| `--pv-primary` | `#8E0000` | tiêu đề, viền section, đường phân cách hàng 1 |
| `--pv-primary-soft` | `#FBEAEA` | nền label bảng |
| `--pv-primary-dark` | `#4A0000` | text label bảng |
| `--pv-text` | `#0F1116` | body text |
| `--pv-text-muted` | `#4A5160` | chân trang meta |
| `--pv-border` | `#CBD5E1` | border cell, border-top footer |
| `--pv-border-strong` | `#333` | viền ảnh, viền khung vân tay |
| `--pv-empty` | `#94A3B8` | text empty state |
| `--pv-frame-bg` | `#F8FAFC` | nền khung ảnh empty |

Toàn bộ **không dùng gradient**, không dùng shadow trong nội dung tài liệu (chỉ modal ngoài có shadow để "float" trên backdrop).

---

## 9. Chế độ in / xuất PDF

```css
@media print {
  body * { visibility: hidden !important; }
  .preview-backdrop, .preview-backdrop * { visibility: visible !important; }
  .preview-backdrop { position: static !important; background: #fff !important; }
  .no-print { display: none !important; }
  .preview-a4-landscape {
    box-shadow: none !important;
    margin: 0 !important;
    width: 297mm !important;
    height: 210mm !important;
    aspect-ratio: auto !important;
    padding: 8mm 10mm !important;
    page-break-after: avoid;
  }
  @page { size: A4 landscape; margin: 0; }
}
```

Kết quả:
- Người dùng nhấn `In / Xuất PDF` → browser dialog mở sẵn khổ **A4 landscape**.
- Không có toolbar, không có backdrop tối, không có scroll bar.
- Nội dung khớp đúng 297×210 mm, không lệch, không cắt.

---

## 10. Ràng buộc "không scroll"

Đây là ràng buộc **cứng**, phải kiểm ở 3 tầng:

1. **`.preview-backdrop { overflow: hidden }`** — modal ngoài không scroll.
2. **`.preview-scroll { overflow: hidden !important }`** — vùng chứa document không scroll (override tên class cũ đang là "scroll").
3. **`.preview-a4-landscape { overflow: hidden }`** + `display: grid; grid-template-rows: auto 1fr auto auto;` — bản thân trang A4 không scroll, hàng 2 tự co giãn để chiếm phần còn lại.
4. **Trong mỗi cột**: `min-height: 0; overflow: hidden;` + các item con dùng `flex: 1 1 0` hoặc `aspect-ratio` → tự thu nhỏ khi hết chỗ, không đẩy scroll.

Nếu 1 field text dài quá → **ellipsis 2 dòng**, không cho phép field đẩy chiều cao bảng.

---

## 11. Trạng thái rỗng (empty states)

| Thiếu gì | Hiển thị |
|---|---|
| Ảnh CCCD | Khung viền đứt `#94A3B8`, chữ "Chưa có CCCD" italic 9px |
| Ảnh chân dung 4×6 | Chữ "Ảnh 4×6" trên nền `#F8FAFC` viền đứt |
| Ảnh đa góc | Chữ "Chưa có" `#94A3B8` |
| Vân tay | Ký hiệu `—` `#94A3B8`, cell vẫn giữ nguyên khung |
| Field text | Chuỗi `…………………………` (dùng `val()` helper sẵn có) |

**Không** để 1 khung trắng trơn — phải luôn có dấu hiệu "trống nhưng đã dự trù chỗ".

---

## 12. Toolbar (nằm ngoài trang A4, chỉ hiện trên màn)

Toolbar là 1 dải mỏng ~52 px phía trên trang A4, KHÔNG in ra (class `.no-print`).

```
┌─────────────────────────────────────────────────────────────────┐
│  [ 🖨  In / Xuất PDF ]  [ 📥 Tải PDF ]  [ ✕ Đóng ]              │  ← 52px, nền #1a0808
└─────────────────────────────────────────────────────────────────┘
                            ▼
                    ┌───── trang A4 ─────┐
                    │                    │
```

Nút primary (`In / Xuất PDF`): background maroon `#8E0000`, hover `#7A0000`.
Nút Đóng: background `#4A5160`, hover `#2A2F38`.
Toolbar dính đỉnh modal, border-bottom maroon 2px.

---

## 13. Checklist trước khi nghiệm thu

- [ ] Mở modal ở laptop 1366×768 và desktop 1920×1080 — trang A4 fit đủ, **không scroll**.
- [ ] Nhấn `In / Xuất PDF` → PDF ra đúng **A4 ngang**, nội dung khớp mép, không lệch trang.
- [ ] Với hồ sơ đầy đủ 10 vân tay + 3 chân dung + CCCD → **không tràn**, không cắt.
- [ ] Với hồ sơ rỗng (chưa có ảnh nào) → tất cả khung vẫn hiển thị empty state, không có ô trắng trơn.
- [ ] Với `nơi thường trú` dài 3 dòng → ellipsis sau 2 dòng, không đẩy bảng cao ra.
- [ ] Toolbar biến mất khi in (class `.no-print`).
- [ ] Backdrop tối biến mất khi in (visibility trick trong `@media print`).
- [ ] Tone maroon nhất quán: 4 tiêu đề section + gạch chân hàng 1 + label bảng + tiêu đề trang.
- [ ] Số CCCD, chiều cao, cân nặng hiển thị mono / tabular-nums, không nhảy cột khi dữ liệu ngắn/dài khác nhau.
- [ ] Khi print preview (Ctrl+P): chỉ thấy 1 trang duy nhất, không có trang trắng thứ 2.

---

## 14. Phạm vi triển khai

**File chạm:**
- `frontend/src/DataCapturePage.jsx` — `ProfilePreviewModal` (đã có sẵn, chỉnh lại JSX theo 4 cột đúng doc này).
- `frontend/src/styles.css` — khối `.preview-*` và `.pv-*` (dòng ~5850 trở đi).

**Không chạm:**
- State/handler của `DataCapturePage`, `PORTRAITS`, `FINGERS`, `photos`, `form`.
- API backend.
- Bất kỳ component nào khác của app.

**Ước lượng:**
- JSX: ~120 dòng
- CSS: ~250 dòng (bỏ khoảng 200 dòng cũ của portrait A4, thêm 250 dòng landscape)

---

## 15. Câu hỏi cần chốt trước khi triển khai

Nếu bạn duyệt doc này, mình cần bạn chốt 4 điểm sau:

1. **Ảnh CCCD ở header** — chỉ hiện `cccd_front`, hay cần cả mặt sau trong cột riêng? (Hiện đề xuất chỉ mặt trước để tiết kiệm không gian).
2. **Cột II — ảnh chân dung 4×6** — có cần thiết không, hay bỏ vì đã có 3 ảnh đa góc ở cột III? (Nếu bỏ, cột II chỉ còn bảng thông tin — giảm áp lực chiều cao).
3. **Thứ tự vân tay hàng ngang** — `Út · Áp út · Giữa · Trỏ · Cái` (đề xuất, khớp mockup) hay `Cái · Trỏ · Giữa · Áp út · Út` (thứ tự Latin phổ biến)?
4. **Metadata footer (hàng 3)** — bạn muốn hiện thông tin gì trong dải chân trang? Đề xuất: `Thiết bị · Cán bộ · Địa điểm · Thời điểm`. Có cần thêm mã hồ sơ, mã phiên?

Trả lời 4 câu này xong mình sẽ code lại theo đúng doc.
