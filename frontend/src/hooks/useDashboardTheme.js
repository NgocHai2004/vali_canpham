import { useCallback, useState } from "react";

/**
 * Theme sáng/tối cho RIÊNG màn hình dashboard.
 *
 * Phạm vi: hook này chỉ điều khiển thuộc tính `data-dash-theme` mà
 * `Dashboard.jsx` gắn lên `.app` khi đang ở trang dashboard. Các trang khác
 * không có thuộc tính đó nên luôn giữ theme tối mặc định của app.
 *
 * Mặc định là "dark" và KHÔNG tự theo `prefers-color-scheme`: đây là thiết bị
 * kiosk, lựa chọn của người dùng phải thắng cài đặt hệ điều hành. Đừng "sửa"
 * thành auto — đó là quyết định có chủ ý.
 */

const STORAGE_KEY = "ccdp_dash_theme";
const THEMES = ["dark", "light"];
const DEFAULT_THEME = "dark";

export function readStoredTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(v) ? v : DEFAULT_THEME;
  } catch {
    // localStorage có thể bị chặn (chế độ riêng tư / policy) — rơi về mặc định.
    return DEFAULT_THEME;
  }
}

export function useDashboardTheme() {
  // Lazy initializer: đọc localStorage ngay lần render đầu để không nháy sai
  // theme (khác với đọc trong useEffect sẽ render dark rồi mới đổi sang light).
  const [theme, setThemeState] = useState(readStoredTheme);

  const setTheme = useCallback((next) => {
    if (!THEMES.includes(next)) return;
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Không lưu được thì thôi — theme vẫn đúng cho phiên hiện tại.
    }
  }, []);

  const toggle = useCallback(() => {
    setThemeState((cur) => {
      const next = cur === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // bỏ qua
      }
      return next;
    });
  }, []);

  return { theme, setTheme, toggle };
}

export default useDashboardTheme;
