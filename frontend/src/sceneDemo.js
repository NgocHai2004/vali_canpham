// Dữ liệu mẫu cho trang Dấu vết hiện trường.
//
// Backend hiện chưa lưu các trường mà thiết kế cần: code, trace_type,
// collection_source, và bộ 4 ảnh (2 ảnh gốc cán bộ gửi + 2 ảnh đã xử lý
// chấm đặc trưng). Nên khi phiên chưa có dấu vết nào, trang hiển thị bộ
// mẫu này để đúng bố cục đã chốt. Có dữ liệu thật thì mẫu tự tắt.
//
// Ảnh đều là ảnh THẬT, lấy từ hai nguồn khác nhau đúng theo nghiệp vụ:
//   - Vết hiện trường: 17 ảnh latent đã cắt, backend/uploads/latent_cut/
//   - Vân tay đối chiếu: 49 bản vân tay, backend/uploads/vantay_synth/
// Riêng các con số đối sánh (điểm minutiae, %, kết luận) là số dựng — hệ
// thống chưa có engine trích minutiae.
//
// Xoá file này sau khi backend lưu đủ các trường trên.

// Tổng số điểm đặc trưng của 1 lần đối sánh. Dùng chung cho bảng KẾT QUẢ ĐỐI
// SÁNH, thanh trượt "Điểm tối thiểu" và trang chi tiết => cả 3 chỗ cùng thang.
export const SCORE_TOTAL = 22;

// 60 dấu vết: đủ nhiều trang để thấy phân trang, không lặp ảnh quá lộ.
export const DEMO_TOTAL = 60;

const PLACES = [
  "Cửa kính",
  "Điện thoại",
  "Tay nắm cửa",
  "Ly thủy tinh",
  "Bàn gỗ",
  "Vỏ lon",
  "Tường sơn",
  "Máy tính",
];

const DEMO_TYPE = "Vân tay latent";
const DEMO_OFFICER = "Nguyễn Ngọc Hải";
const DEMO_NOTE =
  "Vân tay thu được trên bề mặt ngoài của kính tầng 2, phòng phía Tây.";

// Vết hiện trường (latent): 17 ảnh đã cắt sẵn, khổ dọc ~2:3 (130..146 x 188..217),
// trong backend/uploads/latent_cut/ (backend mount /uploads bằng StaticFiles).
// Thư mục nằm trong .gitignore nên ảnh không vào repo.
const LATENT = [
  "dauvantay_01.png",
  "dauvantay_02.png",
  "dauvantay_03.png",
  "dauvantay_04.png",
  "dauvantay_05.png",
  "dauvantay_06.png",
  "dauvantay_07.png",
  "dauvantay_08.png",
  "dauvantay_09.png",
  "dauvantay_10.png",
  "vantay_02.png",
  "vantay_03.png",
  "vantay_04.png",
  "vantay_05.png",
  "vantay_06.png",
  "vantay_07.png",
  "vantay_08.png",
];

const LATENT_BASE = "/uploads/latent_cut/";

// Vân tay ĐỐI CHIẾU: 49 bản vân tay 380x380 trong backend/uploads/vantay_synth/.
// Đủ nhiều để 60 dấu vết + 9 đối tượng x 10 ngón không lặp ảnh quá lộ.
const ENROLLED = [
  "vantay_synth_02.png",
  "vantay_synth_03.png",
  "vantay_synth_04.png",
  "vantay_synth_05.png",
  "vantay_synth_06.png",
  "vantay_synth_07.png",
  "vantay_synth_08.png",
  "vantay_synth_09.png",
  "vantay_synth_10.png",
  "vantay_synth_11.png",
  "vantay_synth_12.png",
  "vantay_synth_13.png",
  "vantay_synth_14.png",
  "vantay_synth_15.png",
  "vantay_synth_16.png",
  "vantay_synth_17.png",
  "vantay_synth_18.png",
  "vantay_synth_19.png",
  "vantay_synth_20.png",
  "vantay_synth_21.png",
  "vantay_synth_22.png",
  "vantay_synth_23.png",
  "vantay_synth_24.png",
  "vantay_synth_25.png",
  "vantay_synth_26.png",
  "vantay_synth_27.png",
  "vantay_synth_28.png",
  "vantay_synth_29.png",
  "vantay_synth_30.png",
  "vantay_synth_31.png",
  "vantay_synth_32.png",
  "vantay_synth_33.png",
  "vantay_synth_34.png",
  "vantay_synth_35.png",
  "vantay_synth_36.png",
  "vantay_synth_37.png",
  "vantay_synth_38.png",
  "vantay_synth_39.png",
  "vantay_synth_40.png",
  "vantay_synth_41.png",
  "vantay_synth_42.png",
  "vantay_synth_43.png",
  "vantay_synth_44.png",
  "vantay_synth_45.png",
  "vantay_synth_46.png",
  "vantay_synth_47.png",
  "vantay_synth_48.png",
  "vantay_synth_49.png",
  "vantay_synth_50.png",
];

const ENROLLED_BASE = "/uploads/vantay_synth/";

// Vết hiện trường (latent) — ảnh cán bộ thu tại hiện trường.
export function latentUrl(seq) {
  return LATENT_BASE + LATENT[(Math.abs(seq - 1)) % LATENT.length];
}

// Vân tay đối chiếu — bản lăn đã thu nhận trong hệ thống.
export function enrolledUrl(seq) {
  return ENROLLED_BASE + ENROLLED[(Math.abs(seq - 1)) % ENROLLED.length];
}

// role: "latent" = vết hiện trường; "candidate" = vân tay đối chiếu.
// kind: "raw" = ảnh gốc; "dots" = bản đã chấm đặc trưng. Hệ thống chưa có
// engine trích minutiae nên bản "dots" chỉ lấy ảnh thật khác trong cùng
// nguồn, KHÔNG có điểm đặc trưng được đánh dấu.
export function demoImage(seq, kind, role = "latent") {
  const s = kind === "dots" ? seq + 3 : seq;
  return role === "candidate" ? enrolledUrl(s) : latentUrl(s);
}

// Toạ độ % các điểm đặc trưng để vẽ overlay lên ảnh (ảnh 03/04 trong thư mục
// đối sánh). CÙNG một bộ toạ độ dùng cho cả ảnh latent và ảnh đối chiếu, nên
// chấm số k trên ảnh 03 và chấm số k trên ảnh 04 là 1 cặp điểm khớp — đó là
// cách minh hoạ "hai ảnh giống nhau ở đâu".
// Vị trí là số DỰNG: hệ thống chưa có engine trích minutiae.
export function minutiae(seq, n = 9) {
  const out = [];
  for (let i = 0; i < n; i++) {
    // Xoắn ốc theo góc vàng: điểm phủ đều vùng giữa ảnh thay vì dồn 1 vòng tròn.
    const a = i * 2.39996 + seq * 0.37;
    const r = 8 + 26 * Math.sqrt((i + 0.5) / n);
    out.push({
      x: +(50 + r * Math.cos(a)).toFixed(1),
      // Ảnh vân tay khổ 3:4 => giãn trục y cho chấm phủ hết vùng vân.
      y: +(50 + r * Math.sin(a) * 1.15).toFixed(1),
    });
  }
  return out;
}

// Giờ địa phương, không hậu tố Z: tránh lệch múi giờ khi hiển thị lại.
function localIso(d) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

const BASE = new Date(2025, 4, 20, 14, 23, 0);

export const DEMO_ITEMS = Array.from({ length: DEMO_TOTAL }, (_, i) => {
  const seq = i + 1;
  const at = new Date(BASE.getTime() + i * 150000);
  return {
    id: `demo-${seq}`,
    demo: true,
    seq,
    code: `DVHT-2025-${String(seq).padStart(4, "0")}`,
    trace_type: DEMO_TYPE,
    collection_source: `Hiện trường - ${PLACES[i % PLACES.length]}`,
    captured_at: localIso(at),
    created_by: DEMO_OFFICER,
    note: DEMO_NOTE,
    url: demoImage(seq, "raw"),
    size: 240000 + ((seq * 5137) % 380000),
    mime: "image/jpeg",
    source: "push",
  };
});

// 4 ảnh của 1 dấu vết, đúng thứ tự lưới 2x2 trong thiết kế.
// Cột 01 = vết hiện trường (latent), cột 02 = vân tay đối chiếu đã thu nhận.
export function demoShots(item) {
  const seq = item?.seq ?? 1;
  // Anh latent = ANH THAT cua dau vet dang xem (item.url), khong dung lai theo
  // seq: url trong DB gan theo index tuyet doi nen dung seq se ra anh khac.
  const latent = item?.url || demoImage(seq, "raw", "latent");
  return [
    { key: "raw1", labelKey: "scene.shot.raw1", url: latent },
    { key: "raw2", labelKey: "scene.shot.raw2", url: demoImage(seq, "raw", "candidate") },
    { key: "dot1", labelKey: "scene.shot.dot1", url: demoImage(seq, "dots", "latent") },
    { key: "dot2", labelKey: "scene.shot.dot2", url: demoImage(seq, "dots", "candidate") },
  ];
}

// 4 file ảnh của thư mục đối sánh: 2 ảnh gốc + 2 ảnh đã chấm đặc trưng.
// File 01/03 là vết hiện trường (latent), file 02/04 là vân tay đối chiếu
// đã thu nhận qua máy quét trong hệ thống.
export function demoFiles(item) {
  const seq = item?.seq ?? 1;
  // File 01/03 = ANH THAT cua dau vet dang xem => the 4.1 khop anh o bang KET
  // QUA DOI SANH / DAU VET HIEN TRUONG va o o anh latent ben tren.
  const latent = item?.url || demoImage(seq, "raw", "latent");
  return [
    {
      n: 1,
      key: "raw1",
      name: "01_latent_original.png",
      groupKey: "scene.file.g_raw",
      kindKey: "scene.file.k_latent",
      url: latent,
      size: 1.2,
    },
    {
      n: 2,
      key: "raw2",
      name: "02_candidate_original.png",
      groupKey: "scene.file.g_raw",
      kindKey: "scene.file.k_candidate",
      url: demoImage(seq, "raw", "candidate"),
      size: 1.1,
    },
    {
      n: 3,
      key: "dot1",
      name: "03_latent_minutiae.png",
      groupKey: "scene.file.g_dots",
      kindKey: "scene.file.k_latent",
      // Đúng ảnh 01, chấm minutiae vẽ overlay khi render (xem SceneTraceFull).
      url: latent,
      dots: true,
      size: 1.3,
    },
    {
      n: 4,
      key: "dot2",
      name: "04_candidate_minutiae.png",
      groupKey: "scene.file.g_dots",
      kindKey: "scene.file.k_candidate",
      // Đúng ảnh 02, cùng bộ toạ độ chấm với ảnh 03 => thấy cặp điểm khớp.
      url: demoImage(seq, "raw", "candidate"),
      dots: true,
      size: 1.3,
    },
  ];
}

// Kết quả đối sánh mẫu của ĐÚNG dòng vừa bấm trong bảng "KẾT QUẢ ĐỐI SÁNH".
// Bảng đó chỉ liệt kê các cặp TRÙNG KHỚP nên verdict luôn là match, và mọi số
// liệu phải lấy từ chính row — trước đây hàm này tự dựng số điểm theo seq của
// dấu vết nên chi tiết nói khác bảng (dòng ghi Trùng khớp, chi tiết ghi Cần
// thẩm định). Điểm minutiae vẫn là số dựng: quy từ % của row cho khớp bảng.
export function demoMatch(item, row) {
  return {
    verdict: "match",
    found: row.score,
    total: SCORE_TOTAL,
    percent: String(row.pct).replace(/[^\d.]/g, ""),
    finger: row.finger,
    subject: `Nghi phạm: ${row.name} (CCCD ${row.cccd})`,
    analyzed_at: row.time,
    analyst: DEMO_OFFICER,
    quality: "Cao",
    confidence: "Rất cao",
    place: "P. Tân Phú, Q.7, TP. Hồ Chí Minh",
    report_code: "S20250624-0002",
    report_at: "24/05/2025 11:05",
  };
}
