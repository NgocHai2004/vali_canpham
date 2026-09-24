import React from "react";
import { useI18n } from "../../i18n";

/**
 * Danh sách phiên gần nhất.
 *
 * @param sessions [{ id, code, status, officer_full_name, detainee_count, opened_at }]
 * @param onOpen   Handler khi bấm một dòng (tuỳ chọn)
 */
export function DashSessionList({ sessions = [], onOpen }) {
  const { t, formatDateTime } = useI18n();

  if (!sessions.length) return <div className="dh-empty">{t("dashboard.session.list.empty")}</div>;

  return (
    <div className="dh-sessions">
      {sessions.map((s) => {
        const open = s.status === "open";
        const meta = t("dashboard.session.meta", {
          n: s.detainee_count || 0,
          time: formatDateTime(s.opened_at),
        });
        return (
          <div
            key={s.id || s.code}
            className={`dh-session${onOpen ? " is-clickable" : ""}`}
            onClick={onOpen ? () => onOpen(s) : undefined}
          >
            <span className={`dh-session__dot${open ? " dh-pulse" : ""}`} aria-hidden="true" />
            <span className="dh-session__main">
              <span className="dh-session__line">
                <strong className="dh-session__code">{s.code}</strong>
                <span className="dh-session__name">{s.officer_full_name || s.officer}</span>
              </span>
              <span className="dh-session__meta">{meta}</span>
            </span>
            <span className={`dh-badge ${open ? "is-open" : "is-closed"}`}>
              {open ? t("dashboard.session.status.open") : t("dashboard.session.status.closed")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default DashSessionList;
