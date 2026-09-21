import React from "react";
import { useI18n } from "../../i18n";

/**
 * Nhật ký hoạt động dạng timeline (rail dọc + chấm).
 *
 * Câu hiển thị ghép từ dữ liệu thật của backend:
 *   "{actor_full_name} {động từ theo action} {ref || resource}"
 * nên không cần key i18n riêng cho từng dòng log.
 *
 * @param items [{ id, at, actor_full_name, action, resource, ref }]
 */
export function DashActivityFeed({ items = [] }) {
  const { t, formatDateTime } = useI18n();

  if (!items.length) return <div className="dh-empty">{t("dashboard.activity.empty")}</div>;

  return (
    <div className="dh-feed">
      {items.map((a) => (
        <div className="dh-feed__item" key={a.id}>
          <span className="dh-feed__dot" aria-hidden="true" />
          <span className="dh-feed__text">
            <strong className="dh-feed__actor">{a.actor_full_name || a.actor}</strong>{" "}
            {t(`activity.${a.action}`)}{" "}
            <span className="dh-feed__ref mono">{a.ref || a.resource}</span>
          </span>
          <span className="dh-feed__time">{formatDateTime(a.at)}</span>
        </div>
      ))}
    </div>
  );
}

export default DashActivityFeed;
