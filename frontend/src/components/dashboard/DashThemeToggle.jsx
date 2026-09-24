import React from "react";
import { useI18n } from "../../i18n";
import { DashIcon } from "../Icons";

/**
 * Nút đổi giao diện sáng/tối.
 *
 * Render trong `Header.jsx`, cạnh chuông thông báo. Header đủ chỗ: đo lại
 * 2026-09-24 thì `.header-actions` còn 434px trống ở 1536px và 245px ở 1920px,
 * nút chỉ cần 42-58px kể cả gap.
 *
 * (Ghi chú cũ nói header "chỉ còn 46px trống" là số đo của bố cục trước khi
 * `.logout-button` thu về icon 32px — đừng dựa vào nó để đẩy nút đi chỗ khác.)
 *
 * Theme do `Dashboard.jsx` giữ (hook useDashboardTheme) và truyền xuống, vì
 * `data-dash-theme` gắn trên `.app` ở đó.
 */
export function DashThemeToggle({ theme, onToggle }) {
  const { t } = useI18n();
  const isDark = theme === "dark";
  const label = t("dashboard.theme.toggle");

  return (
    <button
      type="button"
      className="dh-theme-toggle"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-pressed={!isDark}
    >
      {isDark ? DashIcon.sun : DashIcon.moon}
    </button>
  );
}

export default DashThemeToggle;
