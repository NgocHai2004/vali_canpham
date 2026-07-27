import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { translations, AVAILABLE_LOCALES } from "./locales";

const LANG_KEY = "cccd_lang";
const DEFAULT_LOCALE = "vi";
const SUPPORTED = AVAILABLE_LOCALES.map((l) => l.code);
const FADE_MS = 180; // 150–250ms spec range

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
  const [fading, setFading] = useState(false);

  const setLocale = (next) => {
    if (!SUPPORTED.includes(next)) return;
    if (next === currentLocale) return;
    // 1. Fade out, 2. swap dictionary at midpoint, 3. fade back in.
    // Total ~180ms — within the 150-250ms range required by spec.
    setFading(true);
    const half = Math.round(FADE_MS / 2);
    setTimeout(() => {
      currentLocale = next;
      try { localStorage.setItem(LANG_KEY, next); } catch { /* noop */ }
      setLocaleState(next);
      setTimeout(() => setFading(false), half);
    }, half);
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

  return (
    <I18nContext.Provider value={value}>
      <div className={`i18n-fade ${fading ? "i18n-fading" : ""}`.trim()}>
        {children}
      </div>
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within LanguageProvider");
  return ctx;
}

// -------- Small reusable UI: language switch (globe + full names) --------
// Renders "🌐 Tiếng Việt | English" as a segmented toggle.
// Config-driven via AVAILABLE_LOCALES so adding ja/zh/ko later is a JSON drop.
const GlobeIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.8 3 4.2 6 4.2 9s-1.4 6-4.2 9c-2.8-3-4.2-6-4.2-9s1.4-6 4.2-9z" />
  </svg>
);

export function LanguageSwitch({ compact = false, className = "" }) {
  const { locale, setLocale } = useI18n();
  return (
    <div
      className={`lang-switch ${compact ? "compact" : ""} ${className}`.trim()}
      role="group"
      aria-label="Language / Ngôn ngữ"
    >
      <span className="lang-switch-globe" aria-hidden="true">
        <GlobeIcon />
      </span>
      {AVAILABLE_LOCALES.map((l, idx) => (
        <span key={l.code} className="lang-switch-cell">
          {idx > 0 && <span className="lang-switch-sep" aria-hidden="true">|</span>}
          <button
            type="button"
            className={locale === l.code ? "active" : ""}
            onClick={() => setLocale(l.code)}
            aria-pressed={locale === l.code}
            title={l.label}
          >
            <span className="lang-switch-flag" aria-hidden="true">{l.flag}</span>
            <span className="lang-switch-label">{l.label}</span>
            <span className="lang-switch-short" aria-hidden="true">{l.short}</span>
          </button>
        </span>
      ))}
    </div>
  );
}
