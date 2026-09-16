import React from "react";

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="page-header-actions">{children}</div>
    </div>
  );
}

export function StateBox({ type = "", children }) {
  return <div className={`state-box ${type}`}>{children}</div>;
}

export function ReportStat({ tone = "", icon, label, value, note }) {
  return (
    <div className={`report-stat ${tone}`}>
      <div className="report-stat-icon">{icon}</div>
      <div className="report-stat-body">
        <span className="report-stat-label">{label}</span>
        <strong className="report-stat-value">{value}</strong>
        {note && <small className="report-stat-note">{note}</small>}
      </div>
    </div>
  );
}

export function StatCard({ tone = "", icon, label, value, note, ring }) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <span>{label}</span>
        <strong>{value}</strong>
        {note && <small>{note}</small>}
      </div>
      {ring}
    </div>
  );
}

