import { useEffect, useState } from "react";

const EVENT = "toast:show";
const DEFAULT_DURATION = 3500;

/**
 * Push a toast. Type: "success" | "error" | "info" | "warning".
 * Ví dụ: toast.success("Đã lưu"); toast.error("Lỗi...", 5000);
 */
export const toast = {
  show(message, type = "info", duration = DEFAULT_DURATION) {
    window.dispatchEvent(
      new CustomEvent(EVENT, { detail: { message: String(message || ""), type, duration } }),
    );
  },
  success(message, duration) { this.show(message, "success", duration); },
  error(message, duration) { this.show(message, "error", duration ?? 5000); },
  info(message, duration) { this.show(message, "info", duration); },
  warning(message, duration) { this.show(message, "warning", duration); },
};

const COLORS = {
  success: { bg: "#065f46", border: "#10b981", icon: "✓" },
  error:   { bg: "#7f1d1d", border: "#ef4444", icon: "✕" },
  info:    { bg: "#1e3a8a", border: "#3b82f6", icon: "ℹ" },
  warning: { bg: "#78350f", border: "#f59e0b", icon: "!" },
};

export default function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const handler = (e) => {
      const { message, type = "info", duration = DEFAULT_DURATION } = e.detail || {};
      if (!message) return;
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setItems((prev) => [...prev, { id, message, type, duration }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== id));
      }, duration);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  const dismiss = (id) => setItems((prev) => prev.filter((x) => x.id !== id));

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
        maxWidth: 380,
      }}
    >
      {items.map((it) => {
        const c = COLORS[it.type] || COLORS.info;
        return (
          <div
            key={it.id}
            role="status"
            onClick={() => dismiss(it.id)}
            style={{
              pointerEvents: "auto",
              cursor: "pointer",
              background: c.bg,
              color: "#fff",
              borderLeft: `4px solid ${c.border}`,
              padding: "10px 14px",
              borderRadius: 6,
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
              fontSize: 13,
              lineHeight: 1.4,
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              animation: "toast-slide-in 200ms ease-out",
              wordBreak: "break-word",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: c.border,
                color: "#fff",
                fontWeight: 700,
                flexShrink: 0,
                fontSize: 12,
              }}
            >
              {c.icon}
            </span>
            <span style={{ flex: 1 }}>{it.message}</span>
          </div>
        );
      })}
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
