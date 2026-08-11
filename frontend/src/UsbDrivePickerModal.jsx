import { useState } from "react";
import { useI18n } from "./i18n";

function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return "?";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export default function UsbDrivePickerModal({ drives, onPick, onCancel }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(drives[0]?.path || "");

  const submit = (e) => {
    e.preventDefault();
    const d = drives.find((x) => x.path === selected);
    if (d) onPick(d);
  };

  return (
    <div
      className="session-modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel && onCancel()}
    >
      <form className="session-modal" onSubmit={submit}>
        <div className="session-modal-head">
          <h3>{t("usb.export.picker.title")}</h3>
          <button
            type="button"
            className="session-modal-close"
            onClick={onCancel}
            aria-label={t("common.close")}
          >×</button>
        </div>
        <div className="session-modal-body">
          <p style={{ marginTop: 0, color: "var(--muted, #666)" }}>
            {t("usb.export.picker.hint")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {drives.map((d) => (
              <label
                key={d.path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  border: "1px solid var(--border, rgba(53, 216, 255, 0.18))",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: selected === d.path ? "var(--selected-bg, rgba(22, 139, 255, 0.14))" : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="usb-drive"
                  value={d.path}
                  checked={selected === d.path}
                  onChange={() => setSelected(d.path)}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {d.label ? `${d.label} (${d.path})` : d.path}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted, #666)" }}>
                    {t("usb.export.picker.free", {
                      free: formatBytes(d.free_bytes),
                      total: formatBytes(d.total_bytes),
                    })}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="session-modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn-primary" disabled={!selected}>
            {t("usb.export.picker.confirm")}
          </button>
        </div>
      </form>
    </div>
  );
}
