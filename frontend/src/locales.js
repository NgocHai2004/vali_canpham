// Locale dictionaries. Translations live in /src/locales/<lang>.json
// so translators can edit them without touching JS. Vite imports JSON natively.
// Add a new language by dropping in another JSON file and registering it below.

import vi from "./locales/vi.json";
import en from "./locales/en.json";

export const translations = { vi, en };

// Ordered list drives the language switcher and future additions (ja, zh, ko...).
export const AVAILABLE_LOCALES = [
  { code: "vi", label: "Tiếng Việt", short: "VI", flag: "🇻🇳" },
  { code: "en", label: "English",    short: "EN", flag: "🇺🇸" },
];
