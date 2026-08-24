// Dữ liệu mẫu cho trang Dấu vết hiện trường.
//
// Backend hiện chưa lưu các trường mà thiết kế cần: code, trace_type,
// collection_source, và bộ 4 ảnh (2 ảnh gốc cán bộ gửi + 2 ảnh đã xử lý
// chấm đặc trưng). Nên khi phiên chưa có dấu vết nào, trang hiển thị bộ
// mẫu này để đúng bố cục đã chốt. Có dữ liệu thật thì mẫu tự tắt.
//
// Ảnh là 20 file latent THẬT trong backend/uploads/scene_demo/, xoay vòng
// theo seq. Riêng các con số đối sánh (điểm minutiae, %, kết luận) là số
// dựng — hệ thống chưa có engine trích minutiae.
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

const LATENT_BASE = "/uploads/scene_demo/";

// Ảnh gốc: lấy trực tiếp file latent thật, xoay vòng theo seq.
export function latentUrl(seq) {
  return LATENT_BASE + LATENT[(Math.abs(seq - 1)) % LATENT.length];
}

// kind: "raw" = ảnh cán bộ gửi lên; "dots" = ảnh đã chấm đặc trưng.
// Cả hai đều dùng chung ảnh latent thật; bản "dots" phủ thêm các vòng tròn
// đỏ đánh dấu điểm đặc trưng (minutiae) bằng SVG overlay. Vị trí điểm là
// số dựng — hệ thống chưa có engine trích minutiae thật.
export function demoImage(seq, kind) {
  return latentUrl(kind === "dots" ? seq + 3 : seq);
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
export function demoShots(item) {
  const seq = item?.seq ?? 1;
  return [
    { key: "raw1", labelKey: "scene.shot.raw1", url: demoImage(seq, "raw") },
    { key: "raw2", labelKey: "scene.shot.raw2", url: demoImage(seq + 3, "raw") },
    { key: "dot1", labelKey: "scene.shot.dot1", url: demoImage(seq, "dots") },
    { key: "dot2", labelKey: "scene.shot.dot2", url: demoImage(seq + 3, "dots") },
  ];
}

// 4 file ảnh của thư mục đối sánh: 2 ảnh gốc + 2 ảnh đã chấm đặc trưng,
// mỗi cặp gồm vết hiện trường và ảnh đối sánh trong hệ thống.
export function demoFiles(item) {
  const seq = item?.seq ?? 1;
  return [
    {
      n: 1,
      key: "raw1",
      name: "01_latent_original.png",
      groupKey: "scene.file.g_raw",
      kindKey: "scene.file.k_latent",
      url: demoImage(seq, "raw"),
      size: 1.2,
    },
    {
      n: 2,
      key: "raw2",
      name: "02_candidate_original.png",
      groupKey: "scene.file.g_raw",
      kindKey: "scene.file.k_candidate",
      url: demoImage(seq + 3, "raw"),
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
