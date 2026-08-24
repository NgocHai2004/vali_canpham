// Dữ liệu mẫu cho trang Dấu vết hiện trường.
//
// Backend hiện chưa lưu các trường mà thiết kế cần: code, trace_type,
// collection_source, và bộ 4 ảnh (2 ảnh gốc cán bộ gửi + 2 ảnh đã xử lý
// chấm đặc trưng). Nên khi phiên chưa có dấu vết nào, trang hiển thị bộ
// mẫu này để đúng bố cục đã chốt. Có dữ liệu thật thì mẫu tự tắt.
//
// Ảnh đều là ảnh THẬT, lấy từ hai nguồn khác nhau đúng theo nghiệp vụ:
//   - Vết hiện trường: 20 file latent trong backend/uploads/scene_demo/
//   - Vân tay đối chiếu: vân tay lăn đã thu nhận qua máy quét, trong
//     backend/uploads/ (xem ENROLLED bên dưới)
// Riêng các con số đối sánh (điểm minutiae, %, kết luận) là số dựng — hệ
// thống chưa có engine trích minutiae.
//
// Xoá file này sau khi backend lưu đủ các trường trên.

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

// 20 ảnh latent thật, giải nén từ bộ "Dấu vết - Latent" vào
// backend/uploads/scene_demo/ (backend mount /uploads bằng StaticFiles).
// Thư mục này nằm trong .gitignore nên ảnh không vào repo.
const LATENT = [
  "1601010010201.png",
  "1601180010401.png",
  "1601270010201.png",
  "1601300010101.png",
  "1602040010901.png",
  "1602230010401.png",
  "1602230010501.png",
  "1602250010201.png",
  "1603160010101.png",
  "1604110010101.png",
  "1604180010301.png",
  "1605090020301.png",
  "1605100010101.png",
  "1605100010201.png",
  "1605100010501.png",
  "1605130010101.png",
  "1605290010101.png",
  "1606170010101.png",
  "1607020010601.png",
  "1607210010501.png",
];

// Ảnh latent gốc là 512x512, khác khổ ảnh đối chiếu (300x400) nên đã crop
// lấy phần giữa theo tỉ lệ 3:4 rồi resize về đúng 300x400, ghi sang
// scene_crop/ (ảnh gốc trong scene_demo/ vẫn giữ nguyên).
const LATENT_BASE = "/uploads/scene_crop/";

// Vân tay ĐỐI CHIẾU: không phải latent, mà là vân tay lăn THẬT đã thu nhận
// qua máy quét và nằm sẵn trong backend/uploads/ (grayscale 300x400 hoặc
// 400x500 PNG). Thư mục uploads còn lẫn ảnh chân dung, ảnh thẻ CCCD và ảnh
// quét lỗi/trắng, nên danh sách dưới đây đã lọc tay: chỉ giữ file đúng là
// vân tay và đủ rõ nét (độ tương phản + độ phủ mực vùng trung tâm).
const ENROLLED = [
  "20260721095252_6a5f41745fb131b5ff122b62.png",
  "20260721104638_6a5f4e0e5fb131b5ff122b73.png",
  "20260722091102_6a6089268bc28ce0b8826d5a.png",
  "20260728021823_6a68116fd97fabc55d7d7bca.png",
  "20260729071717_6a69a8fda56dc0f97d2c8502.png",
  "20260804074339_6a71982bf6d3100319d82483.png",
  "20260806103421_6a74632d3b838176cdbb5d9b.png",
  "20260806104138_6a7464e23b838176cdbb5daf.png",
  "20260807072651_6a7588bb989cdea278da0cc0.png",
  "20260807073254_6a758a265fa804995ffbe49b.png",
  "20260807073444_6a758a945fa804995ffbe4b8.png",
  "20260808031029_6a769e25da6df88218bda526.png",
  "20260813025321_6a7d31a18a7301f452d91da5.png",
  "20260813032042_6a7d380a3f5334697d542ec3.png",
  "20260813032159_6a7d38573f5334697d542edd.png",
  "20260813034110_6a7d3cd65c01946f7ed0c70b.png",
  "20260821105241_6a882df9d5f5a396f0886ddd.png",
  "20260822050429_6a892dddd5f5a396f0886e31.png",
  "20260822063442_6a894302d5f5a396f0886e3e.png",
  "20260822080859_6a89591bd5f5a396f0886e54.png",
];

const ENROLLED_BASE = "/uploads/";

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

// Toạ độ % các điểm đặc trưng để vẽ overlay lên ảnh.
export function minutiae(seq) {
  const out = [];
  for (let i = 0; i < 9; i++) {
    const a = ((i * 47 + seq * 11) % 360) * (Math.PI / 180);
    const r = 12 + ((i * 13 + seq * 3) % 26);
    out.push({
      x: (50 + r * Math.cos(a)).toFixed(1),
      y: (50 + r * Math.sin(a)).toFixed(1),
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
  return [
    { key: "raw1", labelKey: "scene.shot.raw1", url: demoImage(seq, "raw", "latent") },
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
  return [
    {
      n: 1,
      key: "raw1",
      name: "01_latent_original.png",
      groupKey: "scene.file.g_raw",
      kindKey: "scene.file.k_latent",
      url: demoImage(seq, "raw", "latent"),
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
      url: demoImage(seq, "dots"),
      size: 1.3,
    },
    {
      n: 4,
      key: "dot2",
      name: "04_candidate_minutiae.png",
      groupKey: "scene.file.g_dots",
      kindKey: "scene.file.k_candidate",
      url: demoImage(seq + 3, "dots"),
      size: 1.3,
    },
  ];
}

// Kết quả đối sánh mẫu. Engine trích minutiae chưa có trong hệ thống nên
// toàn bộ số liệu dưới đây là số dựng, KHÔNG phải kết quả đối sánh thật.
export function demoMatch(item) {
  const seq = item?.seq ?? 1;
  const total = 22;
  const found = 17 + (seq % 5);
  return {
    verdict: found >= 19 ? "match" : "review",
    found,
    total,
    percent: ((found / total) * 100).toFixed(1),
    finger: "Ngón giữa - Bàn tay phải",
    subject: "Nghi phạm: Trần Văn A (SN 1992)",
    analyzed_at: "24/05/2025 10:42",
    analyst: DEMO_OFFICER,
    quality: "Cao",
    confidence: "Rất cao",
    place: "P. Tân Phú, Q.7, TP. Hồ Chí Minh",
    report_code: "S20250624-0002",
    report_at: "24/05/2025 11:05",
  };
}
