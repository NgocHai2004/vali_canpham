import React from "react";
import { useI18n } from "../../i18n";
import { DashIcon } from "../Icons";

/**
 * Nút đổi giao diện sáng/tối của dashboard.
 *
 * Đặt trong hero chứ không phải trên header dùng chung: đo trên kiosk thật
 * (1536px) thì `.header-actions` chỉ còn 46px trống, mà một nút icon là 44px
 * + 14px gap = 58px — nhét vào sẽ làm `.brand-title` xuống dòng ở MỌI trang.
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
