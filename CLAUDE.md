# vali_canpham — hướng dẫn làm việc

## Quy chuẩn kích thước CSS (px ↔ rem)

Gốc: **1rem = 16px** (mặc định trình duyệt). Không có `html { font-size }` toàn cục;
`index.css` chỉ đặt `font-size: 16px` trong `@media (max-width: 1024px)`.

Quy đổi: `÷16`. Bảng tra nhanh:

| px | 2 | 4 | 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20 | 24 | 28 | 32 | 40 | 48 | 56 | 64 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| rem | .125 | .25 | .375 | .5 | .625 | .75 | .875 | 1 | 1.125 | 1.25 | 1.5 | 1.75 | 2 | 2.5 | 3 | 3.5 | 4 |

### DÙNG rem — mọi thứ chiếm chỗ trong layout

`font-size`, `padding`, `margin`, `width`/`height`, `min-*`/`max-*`,
`gap`, `top`/`right`/`bottom`/`left`, `flex-basis`, `grid-template-columns`,
`grid-auto-rows` (giá trị cố định).

### GIỮ px — chi tiết thị giác ở mức thiết bị, không theo cỡ chữ

- `border`, `border-top/right/bottom/left` và mọi độ dày viền. `1px` → `0.0625rem` bị
  làm tròn khác nhau theo từng mức zoom, sinh viền lúc có lúc mất (project có `zoom: 1.5`).
- `outline`, `outline-offset` — cùng lý do, đây là focus ring.
- `box-shadow`, `text-shadow`, `filter: blur()`, `backdrop-filter: blur()` — hiệu ứng.
  Đổi sang rem là để bóng phình theo cỡ chữ, không ai muốn thế.
- `border-radius` — giữ px cho góc nhất quán bất kể cỡ chữ. `9999px` (pill) giữ nguyên.
- `0` không có đơn vị. Đừng viết `0rem`.
- **`font-size` của `:root`/`html`** — đây là GỐC của rem. Đặt gốc bằng rem là tự tham
  chiếu vòng (trình duyệt giải theo giá trị khởi tạo, không theo giá trị bạn vừa đặt).
  Giữ px. Chỗ này: `index.css:29`.

### DÙNG em (KHÔNG phải rem)

`letter-spacing`, `text-indent` — phải giãn theo cỡ chữ của **chính** phần tử đó,
nên `em` mới đúng. `rem` ở đây làm chữ nhỏ bị giãn quá và chữ lớn bị bó.

### TUYỆT ĐỐI KHÔNG đổi: breakpoint trong `@media`

`rem` trong `@media` tính theo **font-size mặc định của trình duyệt**, không theo
`html { font-size }`. Đổi là âm thầm dịch breakpoint. Nặng hơn: project dùng
`@media (min-width: 1600px)` để bật `zoom: 1.5` cho kiosk 1080p
(`dashboardHome.css:495`) — lệch mốc này là vỡ toàn bộ bố cục kiosk.

Các mốc đang dùng: `max-width` 500/560/600/1024/1080/1100/1120/1180/1200,
`max-height` 720/780/800, `min-width` 1600. Giữ nguyên px.

### Lưu ý về zoom — đừng dùng rem sai mục đích

`.app[data-dash-zoom] { zoom: 1.5 }` phóng **mọi** đơn vị, kể cả px. Nên rem **không**
phải cơ chế scale lên kiosk; scale đã do `zoom` lo. Lý do dùng rem chỉ là để layout
tôn trọng cỡ chữ người dùng và để thang spacing nhất quán.

### Trạng thái hiện tại (tính đến 2026-09-24)

Commit `ede5717` đã quy đổi xong phần layout. Còn ~1568 lượt px, gần hết là loại
**phải giữ** theo bảng trên: `border-radius` 331, `border*` 279, `box-shadow` 122,
`letter-spacing` 49 (cần đổi sang `em`), blur 54, media query 40.
Chỉ còn ~40 lượt thuộc nhóm phải đổi (`padding` 10, `height` 7, `gap` 6, `width` 5,
`font-size` 9, `margin` 3, `max-width` 4, `grid-template-columns` 4).

Đừng chạy sed thay px→rem toàn file. Sẽ phá viền, bóng và breakpoint.

## Theme sáng/tối

`data-dash-theme` trên `.app` (Dashboard.jsx) — **màu sắc**, áp cho mọi trang.
`data-dash-zoom` — **hình học**, chỉ các trang trong `DH_PAGES`. Hai vai trò, đừng gộp.
localStorage key: `ccdp_dash_theme`.

## Đăng nhập khi chạy dev

Tài khoản mặc định `admin` / `admin123` (`backend/config.py:100-101`).
Token lưu ở localStorage key `cccd_token` (không phải `token`).
Đã bỏ gate USB dongle nên không cần cắm thiết bị để đăng nhập.

## Git

Không push lên `main`. Làm việc trên nhánh `vali_canpham`.
