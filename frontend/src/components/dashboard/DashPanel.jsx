import React from "react";
import { Icon } from "../Icons";

/**
 * Khung panel dùng chung cho mọi khối trên dashboard.
 *
 * @param title      Tiêu đề panel
 * @param right      Node hiển thị bên phải tiêu đề, trước nút hành động (vd: DashSelect)
 * @param actionLabel Nhãn nút hành động ("Quản lý", "Xem tất cả"...)
 * @param onAction   Handler của nút hành động
 */
export function DashPanel({ title, right, actionLabel, onAction, className = "", children }) {
  return (
    <section className={className ? `dh-panel ${className}` : "dh-panel"}>
      <div className="dh-panel__head">
        <h3 className="dh-panel__title">{title}</h3>
        <div className="dh-panel__right">
          {right}
          {actionLabel && (
            <button type="button" className="dh-panel__action" onClick={onAction}>
              <span>{actionLabel}</span>
              <span className="dh-panel__action-icon">{Icon.arrow}</span>
            </button>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

export default DashPanel;
