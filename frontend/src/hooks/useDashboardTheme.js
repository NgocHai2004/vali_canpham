import { useCallback, useState } from "react";

/**
 * Theme sáng/tối cho toàn app.
 *
 * Phạm vi: hook này điều khiển thuộc tính `data-dash-theme` mà `Dashboard.jsx`
 * gắn lên `.app` ở MỌI trang, nên nút đổi theme trong sidebar áp cho cả app.
 *
 * Mặc định là "dark" và không tự theo `prefers-color-scheme`.
 */

const STORAGE_KEY = "ccdp_dash_theme";
const THEMES = ["dark", "light"];
const DEFAULT_THEME = "dark";

export function readStoredTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function useDashboardTheme() {
  const [theme, setThemeState] = useState(readStoredTheme);

  const setTheme = useCallback((next) => {
    if (!THEMES.includes(next)) return;
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // bỏ qua
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
