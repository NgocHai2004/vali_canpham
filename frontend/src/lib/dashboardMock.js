/**
 * MOCK DATA cho màn hình dashboard.
 *
 * Toàn bộ số liệu trang chủ lấy từ file này. Hình dạng dữ liệu được sao chép
 * ĐÚNG theo response thật của backend để khi nối API chỉ phải đổi nguồn, không
 * phải sửa component nào (mọi component đọc đúng tên field thật).
 *
 * ================================ SEAM ================================
 * ĐÃ NỐI API THẬT: `loadDashboardData()` ở cuối file gọi api.stats() +
 * api.listCells(). Các hằng mock bên dưới giờ chỉ còn dùng làm:
 *   - `mockHardware`: CPU/RAM/nhiệt độ — không có API nào cung cấp.
 *   - phần còn lại: giá trị dự phòng khi API lỗi.
 * ======================================================================
 */

import { api } from "../api";

/** GET /api/stats — tên field lấy nguyên văn từ backend/routers/stats.py */
export const mockStats = {
  total: 0,
  today: 0,
  yesterday: 0,
  male: 0,
  female: 0,
  missing_data_count: 0,

  // 14 phần tử, luôn đủ 14 ngày (backend zero-fill), cũ nhất -> mới nhất.
  // Đỉnh 20 hồ sơ rơi vào 12/9 đúng như mockup (index 7).
  activity_14d: [
    { date: "2026-09-05", count: 0 },
    { date: "2026-09-06", count: 0 },
    { date: "2026-09-07", count: 0 },
    { date: "2026-09-08", count: 0 },
    { date: "2026-09-09", count: 0 },
    { date: "2026-09-10", count: 0 },
    { date: "2026-09-11", count: 0 },
    { date: "2026-09-12", count: 20 },
    { date: "2026-09-13", count: 0 },
    { date: "2026-09-14", count: 0 },
    { date: "2026-09-15", count: 0 },
    { date: "2026-09-16", count: 0 },
    { date: "2026-09-17", count: 0 },
    { date: "2026-09-18", count: 0 },
  ],

  top_charges: [],
  today_by_officer: [],

  open_session: {
    id: "mock-session-2",
    code: "S20260918-0002",
    status: "open",
    officer: "hai.nn",
    officer_full_name: "Nguyễn Ngọc Hải",
    location: "Trung tâm thu nhập dữ liệu",
    note: "",
    opened_at: "2026-09-18T01:56:00",
    closed_at: null,
    detainee_count: 0,
  },

  // Tối đa 5, mới nhất trước — serialize_session (backend/helpers.py)
  recent_sessions: [
    {
      id: "mock-session-2",
      code: "S20260918-0002",
      status: "open",
      officer: "hai.nn",
      officer_full_name: "Nguyễn Ngọc Hải",
      location: "Trung tâm thu nhập dữ liệu",
      note: "",
      opened_at: "2026-09-18T01:56:00",
      closed_at: null,
      detainee_count: 0,
    },
    {
      id: "mock-session-1",
      code: "S20260917-0001",
      status: "closed",
      officer: "hai.nn",
      officer_full_name: "Nguyễn Ngọc Hải",
      location: "Trung tâm thu nhập dữ liệu",
      note: "",
      opened_at: "2026-09-17T04:00:00",
      closed_at: "2026-09-17T09:30:00",
      detainee_count: 0,
    },
  ],

  // Tối đa 8, mới nhất trước. `ref` là mã đối tượng, `resource` là loại
  // (auth|session|cell|detainee) — dùng để dựng câu "X đã <action> <ref>".
  recent_activity: [
    { id: "mock-log-1", at: "2026-09-18T03:37:00", actor: "hai.nn", actor_full_name: "Nguyễn Ngọc Hải", action: "login", resource: "auth", ref: null },
    { id: "mock-log-2", at: "2026-09-18T01:56:00", actor: "hai.nn", actor_full_name: "Nguyễn Ngọc Hải", action: "create", resource: "session", ref: "S20260918-0002" },
    { id: "mock-log-3", at: "2026-09-18T01:56:00", actor: "hai.nn", actor_full_name: "Nguyễn Ngọc Hải", action: "delete", resource: "session", ref: "S20260918-0001" },
    { id: "mock-log-4", at: "2026-09-18T01:56:00", actor: "hai.nn", actor_full_name: "Nguyễn Ngọc Hải", action: "delete", resource: "cell", ref: "cp01" },
  ],

  recent: [],
};

/** GET /api/cells — { id, code, name, level, capacity, note, current }.
 *  `current` do backend tính (đếm hồ sơ theo cell_code), không lưu trong DB. */
export const mockCells = [
  { id: "mock-cell-1", code: "B01", name: "Buồng 01", level: "cell", capacity: 255, current: 0, note: "", status: "normal" },
  { id: "mock-cell-2", code: "B02", name: "Buồng 02", level: "cell", capacity: 255, current: 0, note: "", status: "normal" },
  { id: "mock-cell-3", code: "B101", name: "Buồng 101", level: "cell", capacity: 255, current: 0, note: "", status: "normal" },
  { id: "mock-cell-4", code: "B102", name: "Buồng 102", level: "cell", capacity: 255, current: 0, note: "", status: "normal" },
];

/**
 * Telemetry của vali thu nhận.
 *
 * KHÔNG có API tương ứng — đây là số tĩnh lấy từ bản thiết kế (đừng đi tìm
 * api.hardware(), nó không tồn tại). Nối cảm biến thật là việc riêng.
 */
export const mockHardware = {
  cpu: 27,
  ram: 62,
  disk: 85,
  chip: 38,
  temp: 47,
  /* 65 chứ không phải 85: mockup vẽ thanh nhiệt độ ngập tới ~72% (chỗ màu đỏ
     kết thúc rồi chuyển xám), tức thang đo là 47/65. Để 85 thì thanh chỉ ngập
     55% và chưa kịp chạm màu đỏ. */
  tempMax: 65,
  battery: 85,
  powerIn: "5.6 V",
  fan: "2.070 rpm",
  uptime: "4h 18m",
  ready: true,
};

/** Nguồn dữ liệu duy nhất của DashboardHome. */
export function getDashboardData() {
  return {
    stats: mockStats,
    cells: mockCells,
    hardware: mockHardware,
  };
}

/** Telemetry rỗng, dùng trong lúc đang tải để không phải guard từng field. */
export const EMPTY_HARDWARE = {
  cpu: 0, ram: 0, disk: 0, chip: 0,
  temp: 0, tempMax: 85, battery: 0,
  powerIn: "—", fan: "—", uptime: "—", ready: false,
};

/**
 * Nạp dữ liệu dashboard (bất đồng bộ) — ĐÃ NỐI API THẬT.
 *
 * `stats` lấy nguyên response /api/stats: nó đã chứa sẵn `recent_sessions` (5
 * phiên mới nhất) và `recent_activity` (8 bản ghi), nên không cần gọi thêm
 * /api/sessions hay /api/logs như khối SEAM ở đầu file mô tả.
 *
 * `hardware` vẫn là số tĩnh: CPU/RAM/nhiệt độ không có API.
 *
 * API lỗi thì trả về mock để dashboard vẫn dựng được khung (DashboardHome coi
 * `data == null` là đang tải, nếu để promise reject thì màn hình treo ở
 * trạng thái loading vĩnh viễn).
 */
export async function loadDashboardData() {
  try {
    const [stats, cells] = await Promise.all([api.stats(), api.listCells()]);
    return { stats, cells, hardware: mockHardware };
  } catch (err) {
    console.error("[dashboard] khong tai duoc du lieu that, dung mock:", err);
    return getDashboardData();
  }
}

export default getDashboardData;
