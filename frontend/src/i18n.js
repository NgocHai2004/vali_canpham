import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { translations } from "./locales";

const LANG_KEY = "cccd_lang";
const DEFAULT_LOCALE = "vi";
const SUPPORTED = ["vi", "en"];

// -------- module-level translator (for api.js / non-React callers) --------
let currentLocale = (() => {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    return SUPPORTED.includes(saved) ? saved : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
})();

function interpolate(str, params) {
  if (!params) return str;
  return String(str).replace(/\{(\w+)\}/g, (_, k) =>
    params[k] === undefined || params[k] === null ? "" : String(params[k])
  );
}

export function apiT(key, params) {
  const dict = translations[currentLocale] || translations[DEFAULT_LOCALE];
  const fallback = translations[DEFAULT_LOCALE];
  const raw = dict[key] !== undefined ? dict[key] : (fallback[key] !== undefined ? fallback[key] : key);
  return interpolate(raw, params);
}

export function getCurrentLocale() {
  return currentLocale;
}

// -------- React Context --------
const I18nContext = createContext(null);

export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState(currentLocale);

  const setLocale = (next) => {
    if (!SUPPORTED.includes(next)) return;
    currentLocale = next;
    try { localStorage.setItem(LANG_KEY, next); } catch { /* noop */ }
    setLocaleState(next);
  };

  useEffect(() => {
    currentLocale = locale;
    try { document.documentElement.lang = locale; } catch { /* noop */ }
  }, [locale]);

  const value = useMemo(() => {
    const dict = translations[locale] || translations[DEFAULT_LOCALE];
    const fallback = translations[DEFAULT_LOCALE];
    const t = (key, params) => {
      const raw = dict[key] !== undefined ? dict[key] : (fallback[key] !== undefined ? fallback[key] : key);
      return interpolate(raw, params);
    };

    const formatDate = (iso) => {
      if (!iso) return "—";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      const pad = (n) => String(n).padStart(2, "0");
      // Universal DD/MM/YYYY for VI, MM/DD/YYYY for EN
      if (locale === "en") {
        return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
      }
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    };

    const formatDateTime = (iso) => {
      if (!iso) return "—";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      const pad = (n) => String(n).padStart(2, "0");
      const date = locale === "en"
        ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`
        : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
      return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const formatDateLong = (d) => {
      const dt = d instanceof Date ? d : new Date(d);
      if (isNaN(dt.getTime())) return "";
      const day = dt.getDate();
      const month = dt.getMonth() + 1;
      const year = dt.getFullYear();
      if (locale === "en") {
        const months = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"];
        return `${months[dt.getMonth()]} ${day}, ${year}`;
      }
      return `Ngày ${day} tháng ${month} năm ${year}`;
    };

    const formatNumber = (n) => {
      if (n === null || n === undefined) return "";
      try {
        return new Intl.NumberFormat(locale === "en" ? "en-US" : "vi-VN").format(n);
      } catch {
        return String(n);
      }
    };

    const dayNames = locale === "en"
      ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
      : ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

    const greeting = (hour) => {
      if (locale === "en") {
        if (hour < 12) return "Good morning";
        if (hour < 18) return "Good afternoon";
        return "Good evening";
      }
      if (hour < 11) return "Chào buổi sáng";
      if (hour < 14) return "Chào buổi trưa";
      if (hour < 18) return "Chào buổi chiều";
      return "Chào buổi tối";
    };

    return { locale, setLocale, t, formatDate, formatDateTime, formatDateLong, formatNumber, dayNames, greeting };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within LanguageProvider");
  return ctx;
}

// -------- Small reusable UI: language switch (chip pair) --------
export function LanguageSwitch({ compact = false, className = "" }) {
  const { locale, setLocale } = useI18n();
  return (
    <div className={`lang-switch ${compact ? "compact" : ""} ${className}`.trim()} role="group" aria-label="Language">
      <button
        type="button"
        className={locale === "vi" ? "active" : ""}
        onClick={() => setLocale("vi")}
        aria-pressed={locale === "vi"}
      >
        VI
      </button>
      <button
        type="button"
        className={locale === "en" ? "active" : ""}
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
    </div>
  );
}
