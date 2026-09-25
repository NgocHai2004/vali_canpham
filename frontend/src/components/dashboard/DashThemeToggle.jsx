import React from "react";
import { useI18n } from "../../i18n";
import { DashIcon } from "../Icons";

/**
 * Nút đổi giao diện sáng/tối của dashboard.
 *
 * Hiện đặt trên `.header-actions`, ngay cạnh nút chuông thông báo.
 *
 * `className` có thể thay để nút mượn bộ style của chỗ nó đứng. Trong header
 * truyền "icon-button" để giống hệt nút chuông bên cạnh — class đó đã có sẵn
 * biến thể theme sáng (dashboardHome.css:382 và :719), còn `.dh-theme-toggle`
 * thì không, nên dùng lại `.icon-button` vừa khỏi viết CSS vừa khỏi lệch tông.
 * Mặc định vẫn là `.dh-theme-toggle` cho chỗ nào đặt nút ngoài header.
 *
 * Ghi chú cũ (đã hết đúng, giữ lại vì là cái bẫy dễ tái phát): trước đây nút bị
 * dời khỏi header vì đo trên kiosk 1536px thấy `.header-actions` chỉ còn ~46px
 * trống, thêm nút 44px + gap 14px = 58px là `.brand-title` xuống dòng ở MỌI
 * trang. Nay nhét lại được nhờ ở dưới 1120px `.device-chip-label` đã bị ẩn,
 * nhả ra đủ chỗ. NẾU sau này thêm nút thứ hai vào header thì phải đo lại.
 */
export function DashThemeToggle({ theme, onToggle, className = "dh-theme-toggle" }) {
  const { t } = useI18n();
  const isDark = theme === "dark";
  const label = t("dashboard.theme.toggle");

  return (
    <button
      type="button"
      className={className}
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
