import React from "react";
import { useI18n } from "../../i18n";
import { Icon } from "../Icons";

/**
 * Bảng 5 phiên gần nhất (kiểu bảng giống danh sách buồng giam).
 *
 * @param sessions [{ id, code, status, officer_full_name, detainee_count, opened_at }]
 * @param onOpen   Handler khi bấm một dòng (tuỳ chọn)
 */
export function DashSessionList({ sessions = [], onOpen }) {
  const { t } = useI18n();

  if (!sessions.length) return <div className="dh-empty">{t("dashboard.session.list.empty")}</div>;

  return (
    <div className="dh-table-wrap">
      <table className="dh-table dh-table--sessions">
        <thead>
          <tr>
            <th className="dh-table__idx">#</th>
            <th>{t("dashboard.sessions.col.code") || "MÃ PHIÊN"}</th>
            <th>{t("dashboard.sessions.col.officer") || "CÁN BỘ"}</th>
            <th>{t("dashboard.sessions.col.records") || "HỒ SƠ"}</th>
            <th>{t("dashboard.sessions.col.status") || "TRẠNG THÁI"}</th>
            <th className="dh-table__chev" aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {sessions.map((s, i) => {
            const open = s.status === "open";
            return (
              <tr
                key={s.id || s.code}
                onClick={onOpen ? () => onOpen(s) : undefined}
                className={onOpen ? "is-clickable" : undefined}
              >
                <td className="dh-table__idx">{i + 1}</td>
                <td className="dh-table__code">{s.code}</td>
                <td className="dh-table__name">{s.officer_full_name || s.officer || "—"}</td>
                {/* Chữ "hồ sơ" PHẢI nằm span riêng: .dh-table__count trước đây đặt
                    font mono cho cả ô, mà ui-monospace không có glyph dựng sẵn cho
                    "ồ" nên dấu bị tách ra thành glyph rời — trên màn hiện ra
                    "0 hô`sơ". Số giữ mono (cho thẳng cột), chữ dùng font thường. */}
                <td className="dh-table__count">
                  <span className="dh-table__count-num">{s.detainee_count || 0}</span>{" "}
                  <span className="dh-table__count-unit">{t("dashboard.sessions.unit.records")}</span>
                </td>
                <td>
                  <span className={`dh-status ${open ? "is-ok" : "is-muted"}`}>
                    <span className={`dh-status__dot${open ? " dh-pulse" : ""}`} aria-hidden="true" />
                    {open ? t("dashboard.session.status.open") : t("dashboard.session.status.closed")}
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

export default DashSessionList;
