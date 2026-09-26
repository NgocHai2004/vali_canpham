/**
 * MOCK cho màn "Đồng bộ phiên".
 *
 * LÝ DO PHẢI CÓ FILE NÀY: luồng đồng bộ hiện chưa có gì thật ở phía sau.
 *   - `backend/main.py` không include router sync nào => `POST /api/sync/execute`
 *     mà SyncPage gọi là 404.
 *   - `api.js` không có hàm `fetchSessionSyncDiff` => `api.fetchSessionSyncDiff(...)`
 *     ném thẳng TypeError ngay khi bấm nút Đồng bộ.
 * Nên trước file này, trang Đồng bộ phiên bấm vào là lỗi, không phải "chạy nhưng
 * thiếu dữ liệu".
 *
 * ================================ SEAM ================================
 * Khi trung tâm có API thật, chỉ sửa ĐÚNG hai hàm export dưới đây:
 *   fetchSessionSyncDiff() -> GET  /api/sync/diff?session_id=...
 *   executeSync()          -> POST /api/sync/execute
 * Hình dữ liệu trả về đã theo đúng cái `SyncDiffModal.jsx` đọc, nên không phải
 * sửa component nào. `api.logSessionSync()` trong SyncPage là API THẬT
 * (backend/routers/sessions.py:391) — không mock, cứ để nguyên.
 * ======================================================================
 */

import { api } from "../api";

/** Đổi false khi đã nối API thật, để giữ lại file này làm tài liệu hình dữ liệu. */
export const SYNC_MOCKED = true;

/** Trễ giả. Có trễ thì mới thấy được spinner và trạng thái "đang đồng bộ". */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Băm ổn định từ id. Dùng để chia nhóm thay vì Math.random(): mở lại cùng một
 * phiên phải ra đúng kết quả cũ, nếu mỗi lần mở một kiểu thì cán bộ tưởng lỗi.
 */
function hashOf(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i += 1) {
    h = (h * 31 + String(str).charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Các bộ trường "khác nhau" gán cho nhóm cần cập nhật. Khoá phải nằm trong
 * FIELD_LABELS của SyncDiffModal.jsx để modal hiện nhãn tiếng Việt thay vì khoá thô.
 */
const DIFF_PRESETS = [
  ["cell_code"],
  ["address", "hometown"],
  ["charge"],
  ["height_cm", "weight_kg"],
  ["religion", "ethnicity"],
  ["portrait_front", "cccd_front"],
];

/** Hàng tóm tắt mà modal cần: rowLine() đọc code / full_name / cccd_number. */
function rowOf(d) {
  return {
    id: d.id,
    code: d.code || d.personal_id || "",
    full_name: d.full_name || "",
    cccd_number: d.cccd_number || "",
    cell_code: d.cell_code || "",
    local: d,
  };
}

/**
 * Dựng diff giả cho một phiên.
 *
 * Hồ sơ là THẬT (lấy từ chính phiên đó), chỉ việc chia nhóm là giả. Làm vậy để
 * modal hiện tên và số CCCD thật của phiên đang xem — dữ liệu bịa hoàn toàn thì
 * không kiểm được layout với họ tên dài, CCCD trống, v.v.
 *
 * Chia theo băm id: 0 -> thêm mới, 1 -> cập nhật, 2 -> trùng (bỏ qua).
 */
export async function fetchSessionSyncDiff(sessionId) {
  const s = await api.getSession(sessionId);
  await sleep(650);

  const detainees = Array.isArray(s?.detainees) ? s.detainees : [];
  const toAdd = [];
  const toUpdate = [];
  const duplicates = [];

  detainees.forEach((d) => {
    const h = hashOf(d.id || d.code || "");
    const bucket = h % 3;
    if (bucket === 0) {
      toAdd.push(rowOf(d));
    } else if (bucket === 1) {
      toUpdate.push({
        ...rowOf(d),
        remoteId: `TT-${h.toString(16).slice(0, 8)}`,
        diffFields: DIFF_PRESETS[h % DIFF_PRESETS.length],
      });
    } else {
      duplicates.push({ ...rowOf(d), remoteId: `TT-${h.toString(16).slice(0, 8)}` });
    }
  });

  return { toAdd, toUpdate, duplicates };
}

/**
 * Đẩy dữ liệu lên trung tâm (giả). Trễ theo số hồ sơ để nút "Đang đồng bộ..."
 * hiện đủ lâu mà thấy, nhưng chặn trên 2.5s để khỏi phải ngồi chờ khi test.
 */
export async function executeSync(payload) {
  const n = (payload?.added_ids?.length || 0) + (payload?.updated_ids?.length || 0);
  await sleep(Math.min(2500, 700 + n * 120));
  return {
    ok: true,
    session_id: payload?.session_id || "",
    added: payload?.added_ids?.length || 0,
    updated: payload?.updated_ids?.length || 0,
  };
}
