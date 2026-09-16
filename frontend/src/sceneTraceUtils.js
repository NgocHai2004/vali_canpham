// Helper dùng chung cho các màn dấu vết hiện trường (SceneMatchPage,
// SceneTraceFull). Tách ra khỏi SceneTracesPage.jsx cũ — trang đó đã bị thay
// bằng CasesPage nên chỉ còn 2 hàm này là còn dùng.

// Mã dấu vết: dùng field code nếu backend đã lưu, chưa có thì dựng từ
// seq + năm thu thập. Khi backend có code thật thì bỏ nhánh dự phòng.
export function traceCode(it) {
  if (it?.code) return it.code;
  const y = String(it?.captured_at || "").slice(0, 4) || "----";
  return `DVHT-${y}-${String(it?.seq ?? 0).padStart(4, "0")}`;
}

export function fmtSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
