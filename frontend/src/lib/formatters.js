// Shared mutable locale getter for the module-level formatDateTime helper
let _lastLocale = "vi";

export function setLastLocale(v) {
  _lastLocale = v;
}

export function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  const locale = _lastLocale;
  const date = locale === "en"
    ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`
    : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default formatDateTime;
