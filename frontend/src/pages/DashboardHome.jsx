import React, { useState, useEffect } from "react";
import api from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icons";
import { StateBox } from "../components/CommonUI";

function jitter(base, spread, min = 0, max = 100) {
  const v = base + (Math.random() - 0.5) * spread;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function makeHwSample() {
  return {
    cpu: jitter(38, 14),
    ram: jitter(54, 8),
    disk: jitter(41, 3),
    gpu: jitter(22, 10),
    temp: jitter(48, 5, 30, 90),
    battery: jitter(86, 3, 0, 100),
    powerIn: (jitter(53, 6, 30, 90) / 10).toFixed(1),
    fan: jitter(2100, 400, 800, 4200),
    uptime: 4 * 3600 + Math.floor(Math.random() * 60) * 60,
  };
}

function DashboardHome({ go, isAdmin = false, fullName = "" }) {
  const { t, greeting, dayNames, formatNumber, formatDateTime } = useI18n();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(new Date());
  const [hw, setHw] = useState(() => makeHwSample());
  const [cells, setCells] = useState([]);

  useEffect(() => {
    api.stats().then(setStats).catch((e) => setError(e.message));
    api.listCells().then(setCells).catch(() => {});
    const tmr = setInterval(() => setNow(new Date()), 30_000);
    const th = setInterval(() => setHw(makeHwSample()), 2500);
    const tc = setInterval(() => {
      api.listCells().then(setCells).catch(() => {});
    }, 15_000);
    return () => { clearInterval(tmr); clearInterval(th); clearInterval(tc); };
  }, []);

  if (error) return <StateBox type="error">{t("common.error_prefix", { message: error })}</StateBox>;
  if (!stats) return <StateBox>{t("dashboard.loading")}</StateBox>;

  const total = stats.total || 0;
  const male = stats.male || 0;
  const female = stats.female || 0;
  const malePct = total ? Math.round((male / total) * 100) : 0;
  const femalePct = total ? 100 - malePct : 0;
  const activity = stats.activity_14d || [];
  const topCharges = stats.top_charges || [];
  const officers = stats.today_by_officer || [];
  const recentSessions = stats.recent_sessions || [];
  const recentActivity = stats.recent_activity || [];
  const openSession = stats.open_session;
  const missing = stats.missing_data_count || 0;

  const hour = now.getHours();
  const greet = greeting(hour);
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dateStr = `${dayNames[now.getDay()]}, ${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  const todayDelta = stats.today - (stats.yesterday || 0);

  return (
    <div className="page dashboard-page">
      <div className="dash-hero">
        <div>
          <h1>{greet}, {stats.open_session?.officer_full_name || fullName || t("dashboard.greet_officer_default")}</h1>
          <p>{timeStr} • {dateStr}</p>
        </div>
        {/* Admin quản lý phiên chứ không chạy phiên → không có khối phiên ở trang chủ. */}
        {isAdmin ? null : openSession ? (
          <div className="dash-hero-session">
            <div className="dash-hero-session-info">
              <span className="dash-hero-badge">{t("dashboard.session.open_badge")}</span>
              <strong className="mono">{openSession.code}</strong>
              <small>{t("dashboard.session.detainee_count", { n: openSession.detainee_count || 0 })}</small>
            </div>
            <button className="button primary" onClick={() => go("sessions", { openSessionId: openSession.id })}>
              {t("dashboard.session.enter")} {Icon.arrow}
            </button>
          </div>
        ) : (
          <div className="dash-hero-session dash-hero-session-empty">
            <div className="dash-hero-session-info">
              <span className="dash-hero-badge dash-hero-badge-idle">{t("dashboard.session.idle_badge")}</span>
              <small>{t("dashboard.session.idle_hint")}</small>
            </div>
            <button className="button primary" onClick={() => go("sessions")}>
              {Icon.plus} {t("dashboard.session.new")}
            </button>
          </div>
        )}
      </div>

      {/* Admin không có card "Phiên đang mở" → grid còn 3 cột (stat-grid-3). */}
      <div className={isAdmin ? "stat-grid stat-grid-3" : "stat-grid"}>
        <StatCard
          tone="green"
          icon={Icon.file}
          label={t("dashboard.stat.today")}
          value={stats.today}
          note={todayDelta === 0 ? t("dashboard.stat.today.same") : todayDelta > 0 ? t("dashboard.stat.today.up", { n: todayDelta }) : t("dashboard.stat.today.down", { n: Math.abs(todayDelta) })}
          delta={todayDelta}
          extra={<Sparkline data={activity.map((a) => a.count)} color="#12af64" />}
        />
        <StatCard
          tone="blue"
          icon={Icon.folder}
          label={t("dashboard.stat.total")}
          value={formatNumber(total)}
          note={t("dashboard.stat.total.note")}
          onClick={() => go("detainees")}
        />
        {!isAdmin && (
          <StatCard
            tone="purple"
            icon={Icon.clipboard}
            label={t("dashboard.stat.open_session")}
            value={openSession ? 1 : 0}
            note={openSession ? openSession.code : t("dashboard.stat.open_session.none")}
          />
        )}
        <StatCard
          tone={missing > 0 ? "orange" : "green"}
          icon={Icon.shield}
          label={t("dashboard.stat.missing")}
          value={missing}
          note={missing > 0 ? t("dashboard.stat.missing.need") : t("dashboard.stat.missing.ok")}
          alert={missing > 0}
          onClick={() => go("detainees")}
        />
      </div>

      <div className="dashboard-body">
        <section className="panel">
          <PanelHeader title={t("dashboard.panel.activity14")} />
          <BarChart data={activity} />
        </section>

        <section className="panel panel-donut">
          <PanelHeader title={t("dashboard.panel.gender")} />
          <DonutGender male={male} female={female} malePct={malePct} femalePct={femalePct} />
        </section>

        <section className="panel">
          <PanelHeader title={t("dashboard.panel.hardware")} />
          <HardwareStatus hw={hw} />
        </section>

        <section className="panel">
          <PanelHeader
            title={t("dashboard.panel.cells")}
            action={t("dashboard.panel.manage")}
            onAction={() => go("cells")}
          />
          <CellsStatus cells={cells} />
        </section>

        <section className="panel">
          <PanelHeader
            title={t("dashboard.panel.recent_sessions")}
            action={t("dashboard.panel.view_all")}
            onAction={() => go("sessions")}
          />
          <div className="session-list">
            {recentSessions.map((s) => (
              <div className="session-row" key={s.id}>
                <span className={`session-dot ${s.status === "open" ? "open" : "closed"}`} />
                <div className="session-main">
                  <div className="session-line">
                    <strong className="mono">{s.code}</strong>
                    <small>{s.officer_full_name || s.officer}</small>
                  </div>
                  <div className="session-meta">
                    {t("dashboard.session.detainee_count", { n: s.detainee_count || 0 }).replace(/^.*? /, "")} • {formatDateTime(s.opened_at)}
                  </div>
                </div>
                <span className={`session-status ${s.status}`}>
                  {s.status === "open" ? t("dashboard.session.status.open") : t("dashboard.session.status.closed")}
                </span>
              </div>
            ))}
            {!recentSessions.length && <div className="empty">{t("dashboard.session.list.empty")}</div>}
          </div>
        </section>

        <section className="panel">
          <PanelHeader
            title={t("dashboard.panel.logs")}
            action={t("dashboard.panel.view_report")}
            onAction={() => go("logs")}
          />
          <div className="activity-feed">
            {recentActivity.map((a) => (
              <div className="activity-row" key={a.id}>
                <span className={`activity-dot ${a.action}`} />
                <div className="activity-main">
                  <div className="activity-line">
                    <strong>{a.actor_full_name}</strong> {t(`activity.${a.action}`, undefined) || a.action}{" "}
                    <span className="mono">{a.ref || a.resource}</span>
                  </div>
                  <div className="activity-time">{formatDateTime(a.at)}</div>
                </div>
              </div>
            ))}
            {!recentActivity.length && <div className="empty">{t("dashboard.activity.empty")}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Sparkline({ data = [], color = "#2371f4" }) {
  if (!data.length) return null;
  const w = 120;
  const h = 28;
  const max = Math.max(1, ...data);
  const step = w / Math.max(1, data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - (v / max) * h}`).join(" ");
  const area = `0,${h} ${points} ${w},${h}`;
  return (
    <svg className="sparkline-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polygon fill={color} fillOpacity="0.15" points={area} />
      <polyline fill="none" stroke={color} strokeWidth="1.8" points={points} />
    </svg>
  );
}

function BarChart({ data = [] }) {
  const { t } = useI18n();
  if (!data.length) return <div className="empty">{t("dashboard.no_data")}</div>;
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="bar-chart">
      <div className="bar-chart-body">
        {data.map((d) => {
          const pct = d.count ? Math.max(6, Math.round((d.count / max) * 100)) : 0;
          const day = new Date(d.date);
          const label = `${day.getDate()}/${day.getMonth() + 1}`;
          return (
            <div className="bar-col" key={d.date} title={t("dashboard.hoso.for_day", { label, n: d.count })}>
              <span className="bar-count">{d.count || ""}</span>
              <span className="bar-fill" style={{ height: `${pct}%` }} />
              <span className="bar-label">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DonutGender({ male, female, malePct, femalePct }) {
  const { t, formatNumber } = useI18n();
  const total = male + female;
  const r = 52;
  const c = 2 * Math.PI * r;
  const maleLen = total ? (malePct / 100) * c : 0;
  const femaleLen = total ? (femalePct / 100) * c : 0;
  const MALE_COLOR = "#168BFF";
  const FEMALE_COLOR = "#7E93B8";
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="donut">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(53, 216, 255, 0.10)" strokeWidth="18" />
        <circle
          cx="70" cy="70" r={r} fill="none"
          stroke={MALE_COLOR} strokeWidth="18" strokeLinecap="butt"
          strokeDasharray={`${maleLen} ${c}`}
          transform="rotate(-90 70 70)"
        />
        <circle
          cx="70" cy="70" r={r} fill="none"
          stroke={FEMALE_COLOR} strokeWidth="18" strokeLinecap="butt"
          strokeDasharray={`${femaleLen} ${c}`}
          strokeDashoffset={-maleLen}
          transform="rotate(-90 70 70)"
        />
        <text x="70" y="66" textAnchor="middle" className="donut-value">{malePct}%</text>
        <text x="70" y="86" textAnchor="middle" className="donut-label">{t("dashboard.donut.male")}</text>
      </svg>
      <div className="donut-legend">
        <div className="donut-legend-row">
          <span className="donut-dot" style={{ background: MALE_COLOR }} />
          <span>{t("dashboard.donut.male")}</span>
          <strong>{formatNumber(male)}</strong>
          <small>{malePct}%</small>
        </div>
        <div className="donut-legend-row">
          <span className="donut-dot" style={{ background: FEMALE_COLOR }} />
          <span>{t("dashboard.donut.female")}</span>
          <strong>{formatNumber(female)}</strong>
          <small>{femalePct}%</small>
        </div>
      </div>
    </div>
  );
}

function RingGauge({ value, label, unit = "%", tone = "red", size = 76 }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const dash = (pct / 100) * c;
  const palette = {
    red: "#b91c26",
    orange: "#e07a1f",
    green: "#12af64",
    blue: "#2371f4",
    purple: "#7745db",
  };
  const color = palette[tone] || palette.red;
  return (
    <div className="ring-gauge">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(53, 216, 255, 0.10)" strokeWidth="6" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="ring-gauge-value" fill={color}>
          {value}{unit}
        </text>
      </svg>
      <span className="ring-gauge-label">{label}</span>
    </div>
  );
}

function HardwareBar({ label, value, unit = "%", tone = "red" }) {
  const palette = {
    red: "#b91c26",
    orange: "#e07a1f",
    green: "#12af64",
    blue: "#2371f4",
  };
  const color = palette[tone] || palette.red;
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="hw-bar">
      <div className="hw-bar-head">
        <span>{label}</span>
        <strong>{value}{unit}</strong>
      </div>
      <span className="hw-bar-track">
        <span className="hw-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </span>
    </div>
  );
}

function HardwareStatus({ hw }) {
  const { t, formatNumber } = useI18n();
  const uptimeH = Math.floor(hw.uptime / 3600);
  const uptimeM = Math.floor((hw.uptime % 3600) / 60);
  return (
    <div className="hw-status">
      <div className="hw-rings">
        <RingGauge value={hw.cpu} label={t("hw.cpu")} tone={hw.cpu > 80 ? "red" : hw.cpu > 60 ? "orange" : "green"} />
        <RingGauge value={hw.ram} label={t("hw.ram")} tone={hw.ram > 80 ? "red" : hw.ram > 60 ? "orange" : "green"} />
        <RingGauge value={hw.disk} label={t("hw.disk")} tone={hw.disk > 85 ? "red" : "blue"} />
        <RingGauge value={hw.gpu} label={t("hw.chip")} tone="purple" />
      </div>
      <div className="hw-bars">
        <HardwareBar label={t("hw.temp")} value={hw.temp} unit="°C" tone={hw.temp > 70 ? "red" : hw.temp > 55 ? "orange" : "green"} />
        <HardwareBar label={t("hw.battery")} value={hw.battery} tone={hw.battery < 20 ? "red" : "green"} />
      </div>
      <div className="hw-meta">
        <div className="hw-meta-item">
          <span>{t("hw.power_in")}</span>
          <strong>{hw.powerIn} V</strong>
        </div>
        <div className="hw-meta-item">
          <span>{t("hw.fan")}</span>
          <strong>{formatNumber(hw.fan)} rpm</strong>
        </div>
        <div className="hw-meta-item">
          <span>{t("hw.uptime")}</span>
          <strong>{uptimeH}h {String(uptimeM).padStart(2, "0")}m</strong>
        </div>
        <div className="hw-meta-item">
          <span>{t("hw.status")}</span>
          <strong className="hw-meta-ok">{t("hw.ready")}</strong>
        </div>
      </div>
    </div>
  );
}

function DeviceStatus({ devices = [] }) {
  const { t } = useI18n();
  const okCount = devices.filter((d) => d.status === "ok").length;
  return (
    <div className="dev-status">
      <div className="dev-status-summary">
        <span>{t("device.connected")}</span>
        <strong>{okCount}/{devices.length}</strong>
      </div>
      <div className="dev-list">
        {devices.map((d) => (
          <div className={`dev-row dev-${d.status}`} key={d.id}>
            <span className="dev-dot" />
            <div className="dev-main">
              <div className="dev-line">
                <strong>{t(d.labelKey)}</strong>
                <span className={`dev-badge dev-badge-${d.status}`}>
                  {d.status === "ok" ? t("device.status.ok") : t("device.status.warn")}
                </span>
              </div>
              <div className="dev-meta">
                <span>{d.note}</span>
                <span className="dev-port">{d.port}</span>
              </div>
            </div>
            <div className="dev-latency">
              {d.latency != null ? (
                <>
                  <strong>{d.latency}</strong>
                  <small>ms</small>
                </>
              ) : (
                <small className="dev-offline">—</small>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CellsStatus({ cells = [] }) {
  const { t } = useI18n();
  const totalCap = cells.reduce((s, c) => s + (c.capacity || 0), 0);
  const totalCur = cells.reduce((s, c) => s + (c.current || 0), 0);
  if (!cells.length) {
    return <div className="empty">{t("dashboard.panel.cells_empty")}</div>;
  }
  return (
    <div className="dev-status cells-status">
      <div className="dev-status-summary">
        <span>{t("cells.subtitle", { n: cells.length })}</span>
        <strong>{totalCur}/{totalCap}</strong>
      </div>
      <div className="dev-list">
        {cells.map((c) => {
          const pct = c.capacity ? Math.round((c.current / c.capacity) * 100) : 0;
          const tone = pct >= 100 ? "warn" : "ok";
          return (
            <div className={`dev-row dev-${tone}`} key={c.id || c.code}>
              <span className="dev-dot" />
              <div className="dev-main">
                <div className="dev-line">
                  <strong>{c.code}</strong>
                  <span className={`dev-badge dev-badge-${tone}`}>
                    {pct}%
                  </span>
                </div>
                <div className="dev-meta">
                  <span>{c.name}</span>
                  {c.note ? <span className="dev-port">{c.note}</span> : null}
                </div>
              </div>
              <div className="dev-latency">
                <strong>{c.current || 0}</strong>
                <small>/ {c.capacity || 0}</small>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HBarList({ items = [], empty, color = "#2371f4" }) {
  const { t } = useI18n();
  if (!items.length) return <div className="empty">{empty || t("dashboard.no_data")}</div>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="hbar-list">
      {items.map((item, idx) => {
        const pct = Math.round((item.value / max) * 100);
        return (
          <div className="hbar-row" key={idx}>
            <span className="hbar-label" title={item.label}>{item.label}</span>
            <span className="hbar-track">
              <span className="hbar-fill" style={{ width: `${pct}%`, background: color }} />
            </span>
            <strong className="hbar-value">{item.value}</strong>
          </div>
        );
      })}
    </div>
  );
}

function OfficerList({ officers = [] }) {
  const { t } = useI18n();
  if (!officers.length) return <div className="empty">{t("dashboard.activity.empty")}</div>;
  const max = Math.max(1, ...officers.map((o) => o.count));
  return (
    <div className="officer-list">
      {officers.map((o, i) => {
        const pct = Math.round((o.count / max) * 100);
        const initials = ((o.full_name || o.username || "?").trim()[0] || "?").toUpperCase();
        return (
          <div className="officer-row" key={o.username}>
            <span className="officer-rank">{i + 1}</span>
            {o.avatar_url ? (
              <img className="officer-avatar" src={o.avatar_url} alt="" />
            ) : (
              <span className="officer-avatar officer-avatar-fallback">{initials}</span>
            )}
            <div className="officer-main">
              <div className="officer-name-row">
                <strong>{o.full_name}</strong>
                <span className="officer-count">{o.count}</span>
              </div>
              <span className="hbar-track">
                <span className="hbar-fill" style={{ width: `${pct}%`, background: "var(--primary)" }} />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReportStat({ tone, icon, label, value, note }) {
  return (
    <div className={`report-stat ${tone}`}>
      <div className="report-stat-icon">{icon}</div>
      <div className="report-stat-body">
        <span className="report-stat-label">{label}</span>
        <strong className="report-stat-value">{value}</strong>
        <small className="report-stat-note">{note}</small>
      </div>
    </div>
  );
}

function StatCard({ tone, icon, label, value, note, ring }) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
      {typeof ring === "number" ? (
        <div
          className="stat-ring"
          style={{ background: `conic-gradient(#35D8FF ${ring}%, rgba(53, 216, 255, 0.12) 0)` }}
        >
          <span>{ring}%</span>
        </div>
      ) : (
        <div className="sparkline">⌁</div>
      )}
    </div>
  );
}

function SystemItem({ icon, label, value, note }) {
  return (
    <div className="system-item">
      <div className="system-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </div>
  );
}

function PanelHeader({ title, action, onAction }) {
  return (
    <div className="panel-header">
      <h3>{title}</h3>
      <button onClick={onAction}>
        {action}
        {Icon.arrow}
      </button>
    </div>
  );
}

function PageTitle({ title, subtitle, icon }) {
  return (
    <div className="page-title">
      {icon && <div className="page-title-icon">{icon}</div>}
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}


export default DashboardHome;
