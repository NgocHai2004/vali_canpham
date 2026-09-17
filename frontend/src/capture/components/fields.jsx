// Các ô hiển thị/nhãn nhỏ dùng chung trong trang thu nhận dữ liệu.
export function Field({ label, children }) {
  return (
    <div className="cccd-field">
      <span className="cccd-field-label">{label}</span>
      {children}
    </div>
  );
}

export function InfoField({ label, children, className = "" }) {
  return (
    <label className={"info-field " + className}>
      <span className="info-field-label">{label}</span>
      {children}
    </label>
  );
}

export function Tier3Row({ label, children }) {
  return (
    <div className="tier3-row" style={{ gridTemplateColumns: "1fr 110px" }}>
      <span className="tier3-label">{label}</span>
      {children}
    </div>
  );
}

export function Tier3Static({ label, value }) {
  return (
    <div className="tier3-row">
      <span className="tier3-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" />
          <path d="M7 7h.01M7 17h.01" />
        </svg>
      </span>
      <span className="tier3-label">{label}</span>
      <span className="tier3-value">{value}</span>
    </div>
  );
}

export function SummaryRow({ label, value }) {
  return (
    <div className="summary-row">
      <span className="s-label">{label}</span>
      <span className="s-value" title={String(value)}>{value}</span>
    </div>
  );
}

export function TimelineItem({ time, desc }) {
  return (
    <div className="timeline-item">
      <span className="timeline-dot" />
      <div>
        <div className="timeline-time">{time}</div>
        <div className="timeline-desc">{desc}</div>
      </div>
    </div>
  );
}

export function CheckDot({ ok, tone }) {
  const cls = tone ? tone : ok ? "ok" : "warn";
  return (
    <span className={"chk-dot " + cls}>
      {ok ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" /><path d="M12 8v5M12 16h.01" />
        </svg>
      )}
    </span>
  );
}

export function InfoDot() {
  return (
    <span className="info-dot">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" />
      </svg>
    </span>
  );
}
