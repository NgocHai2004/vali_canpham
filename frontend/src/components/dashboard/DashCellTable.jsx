import React from "react";
import { useI18n } from "../../i18n";
import { Icon } from "../Icons";

/**
 * Bảng buồng giam.
 *
 * @param rows     [{ id, code, name, current, capacity, status }]
 * @param onOpen   Handler khi bấm một dòng (tuỳ chọn)
 */
export function DashCellTable({ rows = [], onOpen }) {
  const { t } = useI18n();

  if (!rows.length) return <div className="dh-empty">{t("dashboard.panel.cells_empty")}</div>;

  return (
    <div className="dh-table-wrap">
      <table className="dh-table">
        <thead>
          <tr>
            <th className="dh-table__idx">#</th>
            <th>{t("dashboard.cells.col.code")}</th>
            <th>{t("dashboard.cells.col.name")}</th>
            <th>{t("dashboard.cells.col.count")}</th>
            <th>{t("dashboard.cells.col.status")}</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            // Buồng đầy khi đã dùng hết sức chứa — giữ lại tín hiệu này từ
            // bảng cũ, chỉ đổi chỗ hiển thị sang cột "Trạng thái".
            const full = (c.capacity || 0) > 0 && (c.current || 0) >= c.capacity;
            return (
              <tr
                key={c.id || c.code}
                onClick={onOpen ? () => onOpen(c) : undefined}
                className={onOpen ? "is-clickable" : undefined}
              >
                <td className="dh-table__idx">{i + 1}</td>
                <td className="dh-table__code">{c.code}</td>
                <td className="dh-table__name">{c.name}</td>
                <td className="dh-table__count">{c.current || 0}/{c.capacity || 0}</td>
                <td>
                  <span className={`dh-status ${full ? "is-warn" : "is-ok"}`}>
                    <span className="dh-status__dot" aria-hidden="true" />
                    {full ? t("dashboard.cells.status.full") : t("dashboard.cells.status.normal")}
                  </span>
                </td>
                <td className="dh-table__chev" aria-hidden="true">{Icon.arrow}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default DashCellTable;
