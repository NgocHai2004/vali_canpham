import React from "react";
import { useI18n } from "../../i18n";

/**
 * Bảng dữ liệu dùng chung cho các màn danh sách.
 *
 * Khác `DashCellTable` (bảng nhỏ nhúng trong panel dashboard) ở chỗ đây là bảng
 * cả trang: có `colgroup` chia đều cột, ba trạng thái loading/error/empty và
 * footer tổng số + phân trang.
 *
 * Cột dãn đều bằng `colgroup` + `table-layout: fixed` chứ không để trình duyệt
 * tự co theo nội dung — nếu không, cột "Họ và tên" dài sẽ ăn hết chỗ của các
 * cột còn lại.
 *
 * @param columns  [{ key, label, width, align, className, render(row, i) }]
 *                 `width` là phần trăm dạng chuỗi, vd "22%". Tổng nên bằng 100.
 * @param rows     Mảng dữ liệu
 * @param rowKey   (row, i) => key
 * @param rowClassName (row) => string — để giữ các class phân cấp như row-facility
 * @param onRowClick   (row) => void — có thì cả dòng bấm được
 * @param loading  Đang nạp
 * @param error    Thông báo lỗi (ưu tiên hiển thị trước empty)
 * @param empty    Chữ hiện khi không có dòng nào
 * @param pager    { page, totalPages, total, onPrev, onNext } — bỏ trống thì không có footer
 */
export function DashDataTable({
  columns = [],
  rows = [],
  rowKey,
  rowClassName,
  onRowClick,
  loading = false,
  error = "",
  empty = "",
  pager,
  /* Class phụ gắn lên `.dh-datatable` để một trang riêng lẻ chỉnh được cỡ chữ /
     padding mà không đụng 5 trang khác đang dùng chung component này. */
  className = "",
}) {
  const { t } = useI18n();

  let state = null;
  if (loading) state = <div className="dh-datatable__state">{t("common.loading")}</div>;
  else if (error) state = <div className="dh-datatable__state is-error">{error}</div>;
  else if (!rows.length) state = <div className="dh-datatable__state">{empty}</div>;

  return (
    <div className={"dh-datatable" + (className ? " " + className : "")}>
      <div className="dh-datatable__scroll">
        <table className="dh-datatable__table">
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={c.width ? { width: c.width } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c) => {
                const isAction = c.key === "actions" || c.key === "action" || (typeof c.label === "string" && c.label.toLowerCase().includes("thao tác"));
                const align = isAction ? "center" : c.align;
                return (
                  <th key={c.key} style={align ? { textAlign: align } : undefined}>
                    {c.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          {!state && (
            <tbody>
              {rows.map((row, i) => {
                const extra = rowClassName?.(row) || "";
                const clickable = onRowClick ? "is-clickable" : "";
                const cls = `${clickable} ${extra}`.trim();
                return (
                  <tr
                    key={rowKey ? rowKey(row, i) : (row.id ?? i)}
                    className={cls || undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((c) => {
                      const isAction = c.key === "actions" || c.key === "action" || (typeof c.label === "string" && c.label.toLowerCase().includes("thao tác"));
                      const align = isAction ? "center" : c.align;
                      return (
                        <td
                          key={c.key}
                          className={c.className}
                          style={align ? { textAlign: align } : undefined}
                        >
                          {c.render ? c.render(row, i) : row[c.key]}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>

      {state}

      {pager && (
        <div className="dh-pager">
          <span className="dh-pager__total">
            {t("common.total", { n: pager.total ?? rows.length })}
          </span>
          <span className="dh-pager__nav">
            <button
              type="button"
              onClick={pager.onPrev}
              disabled={loading || pager.page <= 1}
            >
              {t("common.prev")}
            </button>
            <span className="dh-pager__pos">
              {t("common.page_of", { page: pager.page, total: pager.totalPages })}
            </span>
            <button
              type="button"
              onClick={pager.onNext}
              disabled={loading || pager.page >= pager.totalPages}
            >
              {t("common.next")}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

export default DashDataTable;
