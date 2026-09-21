import React from "react";
import { Icon } from "../Icons";

/**
 * Thẻ số liệu lớn ở đầu dashboard.
 *
 * @param tone   "emerald" | "blue" | "purple" | "amber" — quyết định màu ô icon
 *               và (chỉ ở theme tối) viền nhấn bên trái.
 * @param pill   Node tuỳ chọn thay cho mũi tên (mockup: pill "↑ 0%").
 * @param onClick Có thì thẻ trở thành <button> (điện được bằng bàn phím).
 */
export function DashStatCard({ tone = "blue", icon, label, value, note, pill, onClick }) {
  const inner = (
    <>
      <span className="dh-stat__main">
        <span className="dh-stat__icon" aria-hidden="true">{icon}</span>
        <span className="dh-stat__text">
          <span className="dh-stat__label">{label}</span>
          <strong className="dh-stat__value">{value}</strong>
          {note && <span className="dh-stat__note">{note}</span>}
        </span>
      </span>
      {/* Pill và mũi tên là HAI thứ khác nhau: mockup vẽ thẻ "Hồ sơ hôm nay"
          vừa có pill "↑ 0%" vừa có mũi tên; ba thẻ còn lại chỉ có mũi tên. */}
      <span className="dh-stat__trail">
        {pill}
        <span className="dh-stat__chev" aria-hidden="true">{Icon.arrow}</span>
      </span>
    </>
  );

  const cls = `dh-stat dh-stat--${tone}${onClick ? " dh-stat--clickable" : ""}`;

  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

export default DashStatCard;
