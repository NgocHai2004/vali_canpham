# Tách ngón cái thành 2 lần chụp + hiện % chất lượng trên ảnh vân chụm

Ngày: 2026-09-08

## Vấn đề

Hai chuyện trong cùng một hàng "Vân tay chụm" (`DataCapturePage.jsx`, khối
`.fp-plain-row`):

1. Bước `thumbs` gọi MỘT `StartCapture(SlapPosition.THUMB)` lấy cả 2 ngón cái
   cùng lúc. Ba hệ quả: `redo()` chụp lại cái trái thì xoá luôn cái phải
   (`api.py` `redo()` xoá theo `step["codes"]`); mapping slot → ngón cái phải
   ĐOÁN, và chỗ đoán đó được ghi rõ là chưa xác minh được trên thiết bị
   (`api.py:58-63` — SDK chỉ trả "Thumb A"/"Thumb B", không nói bên nào);
   khung nháy báo hiệu cả ô thay vì đúng ngón đang chụp.
2. Ba ô ảnh chụm không hiện số chất lượng nào. `captured[].quality` đã có sẵn
   trong response nhưng chỉ lưới 10 ô vân LĂN dùng nó (`fpQuality`). Cán bộ bấm
   Xác nhận cụm mà chỉ nhìn ảnh đoán bằng mắt.

## Phạm vi

Sửa: `morfin_service/engine.py`, `morfin_service/api.py`,
`frontend/src/capture/constants.js`, `frontend/src/DataCapturePage.jsx`,
`frontend/src/styles.css`, `frontend/src/locales/{vi,en}.json`.

Không đụng: vân LĂN (10 ô, `fpQuality`, `FP_ROLL_*`), template và luồng tra cứu,
ngưỡng `quality.json`, `mark_none`, `confirm_step`.

## Bố cục đích

```
Vân tay chụm                                    4 / 4
┌──────────────────┐ ┌────────┬─────────┐ ┌──────────────────┐
│                  │ │        │         │ │                  │
│  ▓▓  ▓▓  ▓▓  ▓▓  │ │   ▓▓   │   ▓▓    │ │  ▓▓  ▓▓  ▓▓  ▓▓  │
│  ▓▓  ▓▓  ▓▓  ▓▓  │ │   ▓▓   │   ▓▓    │ │  ▓▓  ▓▓  ▓▓  ▓▓  │
│▒85▒▒82▒▒79▒▒41▒▒▒│ │▒▒▒88▒▒▒│▒▒▒86▒▒▒▒│ │▒▒81▒▒84▒▒80▒▒77▒▒│
└──────────────────┘ └────────┴─────────┘ └──────────────────┘
   4 ngón trái        cái trái  cái phải     4 ngón phải
   (1 lần chụp)       (2 lần chụp riêng)     (1 lần chụp)
```

Ba ô như cũ. Ô giữa chia đôi bằng vạch dọc mảnh, mỗi nửa một ảnh riêng. Dải `▒`
là nền mờ ở đáy ảnh, số nằm TRÊN dải nên hàng giữ nguyên chiều cao.

## 1. Backend: tách `thumbs` thành `thumb_left` + `thumb_right`

SDK không có "slap 1 ngón cái", nhưng đã có đường sẵn: tham số `exceptions`
(`FingerPosition`) của `StartCapture`, hiện dùng để khai báo ngón "không có vân
tay". Chụp cái trái = `StartCapture(THUMB, exceptions={RIGHT_THUMB: true})`,
`expect=1`.

`SLAP_STEPS` bỏ entry `thumbs`, thêm hai entry, và xếp lại thứ tự:

```python
SLAP_STEPS = [
    {"step": "left_hand",   "slap": SlapPosition.LEFT_HAND,  "expect": 4,
     "label_vi": "4 ngon ban tay trai",
     "codes": ["left_little", "left_ring", "left_middle", "left_index"]},
    {"step": "thumb_left",  "slap": SlapPosition.THUMB, "expect": 1,
     "label_vi": "Ngon cai trai",
     "codes": ["left_thumb"],  "absent_extra": ["right_thumb"]},
    {"step": "thumb_right", "slap": SlapPosition.THUMB, "expect": 1,
     "label_vi": "Ngon cai phai",
     "codes": ["right_thumb"], "absent_extra": ["left_thumb"]},
    {"step": "right_hand",  "slap": SlapPosition.RIGHT_HAND, "expect": 4,
     "label_vi": "4 ngon ban tay phai",
     "codes": ["right_index", "right_middle", "right_ring", "right_little"]},
]
```

Tên bước là `thumb_left`, KHÔNG phải `left_thumb`: `STEP_BY_NAME` và `s.fingers`
là hai không gian tên khác nhau, trùng chữ là mời gọi lỗi tra nhầm bảng.

Thứ tự đổi từ (trái, phải, cái) sang (trái, cái trái, cái phải, phải) để khớp
thứ tự ba ô trên màn hình — khung nháy chạy trái sang phải một mạch, đúng quy
ước đã dùng cho `ROLL_ORDER`. `STEPS = ROLL_STEPS + SLAP_STEPS` giữ nguyên.

Trong `capture()`, `absent` cộng thêm `absent_extra`:

```python
absent = ([c for c in step["codes"] if s.fingers[c].missing]
          + step.get("absent_extra", []))
```

`FINGERS[].step`: `left_thumb` → `"thumb_left"`, `right_thumb` → `"thumb_right"`.

Ba chỗ tự đúng theo, không phải sửa thêm:

- `redo()` xoá theo `step["codes"]` → chụp lại cái trái không còn xoá cái phải.
- `confirm_step` xác nhận từng ngón cái riêng.
- Chỗ chưa xác minh ở `api.py:58-63` biến mất: mỗi lần chụp một ngón, bước đã
  biết nó là ngón nào, không còn suy slot → ngón. Xoá luôn khối comment đó.

## 2. Backend: toạ độ để đặt số %

`engine.py`:

- `FingerCapture` thêm `x2: int = 0`.
- Trong `on_complete`, `state["final"][slot]` thêm `"x2":
  fi.RightBottomCordinates[0]` (field này đã có trong `ImageInfo`, chưa ai đọc).
- Chỗ dựng `FingerCapture` thêm `x2=meta.get("x2", 0)`.

`api.py` — `capture()` trả thêm một field top-level, CHỈ cho bước chụm
(`not step.get("roll")`):

```python
"slap_marks": [
  {"code": "left_little", "quality": 85, "no_quality": False,
   "low": False, "x_pct": 12.4},
  ...
]
```

`x_pct = (fc.x + fc.x2) / 2 / slap_width * 100`, làm tròn 1 chữ số. `slap_width`
lấy từ `Image.open(io.BytesIO(result.slap_image)).width`. Nếu `fc.x2 <= fc.x`
(SDK không ghi `RightBottomCordinates`) thì rơi về `fc.x / slap_width * 100` —
số lệch sang trái một chút, vẫn đúng ngón, hơn là không có số. Nếu
`slap_width <= 0` thì bỏ `slap_marks` (list rỗng).

Dùng phần trăm chứ không pixel vì `slap_thumb_b64` đã qua `thumbnail(600)` và
frontend còn scale theo CSS.

`low` = `quality < _min_quality(code)`, tính lại tại đây thay vì để frontend
suy — ngưỡng riêng từng ngón là chuyện của service (`min_quality_by_code` đã
được trả về, nhưng frontend không cần ghép hai bảng cho việc tô màu).

## 3. Frontend: ô cái chứa 2 ảnh

`constants.js` — `FP_PLAIN_SLOTS` giữ 3 phần tử, ô cái có `sub`:

```js
export const FP_PLAIN_SLOTS = [
  { key: "fp_plain_left", step: "left_hand", labelKey: "capture.fp.plain_left" },
  { key: "fp_plain_thumbs", labelKey: "capture.fp.plain_thumbs", sub: [
      { key: "fp_plain_left_thumb",  step: "thumb_left",
        side: "left",  labelKey: "capture.fp.plain_left_thumb" },
      { key: "fp_plain_right_thumb", step: "thumb_right",
        side: "right", labelKey: "capture.fp.plain_right_thumb" }]},
  { key: "fp_plain_right", step: "right_hand", labelKey: "capture.fp.plain_right" },
];
```

`FP_SHEET_KEY_BY_STEP` sinh từ cả `sub` nên `thumb_left` → `fp_plain_left_thumb`.
Chỗ upload ảnh cụm (`DataCapturePage.jsx:532-537`) không phải sửa — nó tra đúng
bảng này.

Đếm ở tiêu đề: `plainCount / 3` → `/ 4` (4 lần chụp, 3 ô). Hồ sơ cũ chỉ có
`fp_plain_thumbs` thì key đó đếm là 2 — nó chứa cả hai ngón cái — nên hồ sơ cũ
đủ ảnh vẫn hiện `4 / 4`, không tụt xuống `3 / 4`.

Ô cái render `sub`: hai `.fp-plain-half` trong `.fp-plain-thumb--split`, mỗi nửa
tự lo ảnh / glyph / marks / khung nháy của riêng nó. Khung nháy giờ khoanh đúng
NỬA ô đang chụp (`fpActiveStep === sub.step`), không phải cả ô.

### `FP_CLUSTERS` và `plainHandsByStep`

`FP_CLUSTERS` (`constants.js:53`) giữ NGUYÊN cả ba phần tử, kể cả
`step: "thumbs"`. Nó đang gánh hai việc: nguồn thứ tự `FP_ROLL_ORDER`
(`flatMap(c => c.codes)`) và nguồn glyph bàn tay. Việc thứ nhất chỉ đọc `codes`
nên không đụng tới. Việc thứ hai chuyển đi (xem dưới), nên field `step` của
`FP_CLUSTERS` thành không ai đọc — thêm comment nói rõ nó chỉ còn để nhóm lưới,
KHÔNG còn khớp tên bước nào của service. Xoá nó thì `FP_ROLL_ORDER` mất nguồn
thứ tự, đúng cái lỗi mà comment ở `constants.js:65-69` đã cảnh báo.

`plainHandsByStep` (`DataCapturePage.jsx:1257`) hiện khoá theo step của
`FP_CLUSTERS` và trả về MỘT MẢNG hình cho ô cái (2 bàn tay). Mỗi nửa ô giờ cần
đúng MỘT hình, nên dựng lại thành `plainHandsBySlotKey`, khoá theo key ảnh
(`fp_plain_left` / `fp_plain_left_thumb` / …), sinh từ `FP_PLAIN_SLOTS` gồm cả
`sub`. Nửa `thumb_left` ra một glyph tay trái với ngón cái tô; `fp_plain_left`
ra một glyph tay trái với 4 ngón tô — y như cũ.

## 4. Frontend: số % đè lên ảnh

State mới `fpPlainMarks`: `{ [photoKey]: slap_marks }`, set trong
`collectFingersRun` khi `capRes.slap_marks && !step.roll`:

```js
const plainKey = FP_SHEET_KEY_BY_STEP[step.step];
if (plainKey && !step.roll && capRes.slap_marks) {
  setFpPlainMarks((p) => ({ ...p, [plainKey]: capRes.slap_marks }));
}
```

Đây là chỗ hiện thực "% chỉ sống trong lúc thu": state React, KHÔNG vào `photos`,
KHÔNG vào payload lưu hồ sơ. Mở lại hồ sơ là không còn số, ảnh vẫn nguyên. Số tồn
tại từ lúc chụp xong đến khi rời trang — đủ để cán bộ xem rồi bấm Xác nhận hay
Chụp lại.

Chặn `if (step.roll)` ở `DataCapturePage.jsx:516` giữ nguyên: số bước chụm đi vào
`fpPlainMarks`, số bước lăn đi vào `fpQuality`. Hai đường riêng, không ghi đè
nhau — đúng lý do đã ghi trong comment ở dòng 511-515.

Trong `.fp-plain-thumb` (và mỗi `.fp-plain-half`), khi CÓ ảnh và CÓ marks:

```jsx
<span className="fp-mark-strip">
  {marks.map((m) => (
    <span key={m.code}
          className={"fp-mark" + (m.low ? " low" : "") +
                     (m.no_quality ? " nq" : "")}
          style={{ left: `${m.x_pct}%` }}
          title={fingerNameOf(m.code)}>
      {m.no_quality ? "—" : m.quality}
    </span>
  ))}
</span>
```

Ba trạng thái một số, dùng đúng quy ước đã có ở lưới 10 ô lăn — `no_quality`
hiện `—` chứ không hiện `0%`, để cán bộ không tưởng ngón hỏng:

| hiển thị | nghĩa | style |
|---|---|---|
| `85` | đạt ngưỡng | chữ trắng |
| `41` | dưới ngưỡng (`low`) | chữ đỏ, đậm |
| `—` | SDK không đo được (`no_quality`) | chữ xám |

`styles.css`: `.fp-mark-strip` là `position:absolute` dán đáy ảnh, cao ~16px,
nền `rgba(0,0,0,.55)` để số đọc được trên cả vùng vân sáng và nền trắng.
`.fp-mark` `position:absolute`, `transform:translateX(-50%)`, font ~11px,
`font-variant-numeric:tabular-nums`. `.fp-plain-thumb` cần `position:relative`.
`.fp-plain-thumb--split` là flex 2 nửa, vạch giữa bằng `border-left` 1px.

## 5. Hồ sơ cũ

Hồ sơ đã lưu có `photos.fp_plain_thumbs` (1 ảnh 2 ngón). Ô cái đọc theo thứ tự:
có key mới → hiện 2 nửa; không có key mới mà có `fp_plain_thumbs` → hiện 1 ảnh cũ
full ô, không chia đôi, không số. Không migrate, không xoá — ảnh cũ vẫn là bản
ghi hợp lệ.

## 6. i18n

Thêm vào `vi.json` + `en.json`: `fpenroll.step.thumb_left`,
`fpenroll.step.thumb_right`, `capture.fp.plain_left_thumb`,
`capture.fp.plain_right_thumb`. Bỏ `fpenroll.step.thumbs`. Giữ
`capture.fp.plain_thumbs` (nhãn ô ngoài + hồ sơ cũ).

## 7. Rủi ro chính

**Chưa xác minh được trên thiết bị:** SDK có chấp nhận `THUMB` + 1 exception rồi
chốt frame ở 1 ngón, hay vẫn đợi đủ 2 ngón đến hết timeout (-2019). Header SDK
không nói. Đây là việc PHẢI test trên máy thật ở bước đầu implement, trước khi
sửa frontend.

Nếu SDK từ chối, hai đường lùi, chọn cùng người dùng chứ không tự quyết:

- **B:** chụp ngón cái ở `LEFT_HAND` / `RIGHT_HAND` với 3 ngón kia khai `absent`.
  Cùng cơ chế, chỉ khác slap position.
- **C:** giữ 1 lần chụp 2 ngón cái, chỉ làm phần % (mục 2 + 4). Phần % không phụ
  thuộc mục 1 — hai nửa của spec này độc lập nhau.

## 8. Test

`morfin_service/tests/`, cả hai là hàm thuần, chạy được không cần thiết bị:

- `absent` có gộp `absent_extra`: bước `thumb_left` phải truyền `right_thumb` vào
  exceptions của `StartCapture`.
- Phép tính `x_pct`: nhánh thường (`x2 > x`), nhánh fallback (`x2 <= x`), nhánh
  `slap_width <= 0`.

Chuyện SDK có chốt frame ở 1 ngón cái hay không thì test tự động không trả lời
được — phải chụp thật.

## Ngoài phạm vi

- Lưu % vào hồ sơ (đã chốt: chỉ hiện lúc đang thu).
- Nạm số vào pixel ảnh — ảnh chụm là bản ghi chính thức, không sửa pixel.
- Ghép 2 ảnh cái thành 1 ảnh.
- Đổi ngưỡng, đổi luồng xác nhận, đụng vân lăn.
