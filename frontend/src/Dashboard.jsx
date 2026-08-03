
import { useEffect, useMemo, useRef, useState } from "react";
import { api, fpApi, cccdApi, exportToUsb } from "./api";
import { toast } from "./Toast";
import { notify } from "./notifications";
import SyncDiffModal, { buildSyncDiff } from "./SyncDiffModal";
import DetaineeForm from "./DetaineeForm";
import DataCapturePage from "./DataCapturePage";
import SessionListPage from "./SessionListPage";
import SessionDetailPage from "./SessionDetailPage";
import UsbDrivePickerModal from "./UsbDrivePickerModal";
import { useI18n, LanguageSwitch } from "./i18n";

const Icon = {
  dashboard: (
    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
  ),
  users: (
    <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  ),
  building: (
    <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1" /></svg>
  ),
  file: (
    <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
  ),
  cloudUpload: (
    <svg viewBox="0 0 24 24"><path d="M17 18a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.34 8.05 4.5 4.5 0 0 0 7 18" /><path d="m8 14 4-4 4 4M12 10v9" /></svg>
  ),
  sync: (
    <svg viewBox="0 0 24 24"><path d="M20 6v5h-5M4 18v-5h5" /><path d="M6.1 9A7 7 0 0 1 18 6l2 5M4 13l2 5a7 7 0 0 0 11.9-3" /></svg>
  ),
  search: (
    <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
  ),
  log: (
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24"><path d="M20 6v5h-5M4 18v-5h5" /><path d="M6.1 9A7 7 0 0 1 18 6l2 5M4 13l2 5a7 7 0 0 0 11.9-3" /></svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19V3" /></svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>
  ),
  server: (
    <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" /><path d="M7 7h.01M7 17h.01" /></svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
  ),
  clipboard: (
    <svg viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M6 7h12v14H6z" /><path d="M9 12h6M9 16h4" /></svg>
  ),
};

const NAV_BASE = [
  { key: "dashboard", labelKey: "nav.dashboard", icon: Icon.dashboard },
  { key: "sessions", labelKey: "nav.sessions", icon: Icon.clipboard },
  { key: "detainees", labelKey: "nav.detainees", icon: Icon.folder },
  { key: "cells", labelKey: "nav.cells", icon: Icon.sync },
  { key: "search", labelKey: "nav.search", icon: Icon.search },
  { key: "detainee_history", labelKey: "nav.detainee_history", icon: Icon.log },
  { key: "logs", labelKey: "nav.logs", icon: Icon.clipboard },
];
const NAV_ADMIN = [{ key: "users", labelKey: "nav.users", icon: Icon.users }];

export default function Dashboard({ username = "admin", role = "user", fullName = "", onFullNameChange, onLogout }) {
  const { t, locale } = useI18n();
  useEffect(() => { setLastLocale(locale); }, [locale]);
  const [page, setPage] = useState("dashboard");
  const [editingDetainee, setEditingDetainee] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionCtx, setSessionCtx] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const isAdmin = role === "admin";
  const NAV = isAdmin ? [...NAV_BASE, ...NAV_ADMIN] : NAV_BASE;
  const deviceStatus = useDeviceConnections();
  const notifState = useNotifState();

  const goPage = async (key, opts = {}) => {
    if (key !== "session_capture") {
      setEditingDetainee(null);
      setSessionCtx(null);
    }
    if (key === "sessions") {
      if (opts.openSessionId) {
        setActiveSessionId(opts.openSessionId);
        setPage("sessions_detail");
        return;
      }
      setActiveSessionId(null);
      setSessionCtx(null);
    }
    setPage(key);
  };

  const editDetainee = async (detainee) => {
    setEditingDetainee(detainee);
    try {
      const cur = await api.getCurrentSession();
      setSessionCtx({ sessionId: cur.id, sessionCode: cur.code, sessionReadOnly: false });
      setActiveSessionId(cur.id);
      setPage("session_capture");
    } catch (ex) {
      alert(t("session.open.err.officer_required_alt") || t("session.open.err.officer_required"));
      setEditingDetainee(null);
      setPage("sessions");
    }
  };

  const openSession = (sessionId) => {
    setActiveSessionId(sessionId);
    setPage("sessions_detail");
  };
  const backToSessionList = () => {
    setActiveSessionId(null);
    setSessionCtx(null);
    setPage("sessions");
  };
  const addDetaineeToSession = (sessionId) => {
    setEditingDetainee(null);
    setSessionCtx({ sessionId, sessionCode: null, sessionReadOnly: false });
    setPage("session_capture");
  };
  const editDetaineeInSession = (detainee, session) => {
    setEditingDetainee(detainee);
    setSessionCtx({
      sessionId: session.id,
      sessionCode: session.code,
      sessionReadOnly: session.status !== "open",
    });
    setPage("session_capture");
  };
  const doneSessionCapture = () => {
    setEditingDetainee(null);
    if (activeSessionId) {
      setPage("sessions_detail");
    } else {
      setPage("sessions");
    }
  };
  const handleSessionClosed = () => {
    setSessionCtx(null);
    setActiveSessionId(null);
    setPage("sessions");
  };

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <Header
          username={username}
          fullName={fullName}
          devices={deviceStatus}
          notif={notifState}
          onLogout={onLogout}
          isAdmin={isAdmin}
          onEditProfile={() => setShowProfileModal(true)}
        />
        {showProfileModal && (
          <ProfileEditModal
            username={username}
            fullName={fullName}
            onClose={() => setShowProfileModal(false)}
            onSaved={(newName) => {
              setShowProfileModal(false);
              onFullNameChange && onFullNameChange(newName);
            }}
          />
        )}

        <aside className="sidebar">
          <div className="sidebar-title">{t("nav.function_group")}</div>

          <nav className="nav">
            {NAV.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${page === item.key ? "active" : ""}`}
                onClick={() => goPage(item.key)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{t(item.labelKey)}</span>
              </button>
            ))}
          </nav>

          <div className="security-card">
            <div className="security-icon">{Icon.shield}</div>
            <div>
              <strong>{t("nav.security_title")}</strong>
              <p>{t("nav.security_desc")}</p>
            </div>
          </div>
        </aside>

        <main className="content">
          {page === "dashboard" && <DashboardHome go={goPage} />}
          {page === "detainees" && <DetaineesPage onEdit={editDetainee} />}
          {page === "cells" && <SyncPage />}
          {page === "sessions" && (
            <SessionListPage
              role={role}
              username={username}
              fullName={fullName}
              onOpenSession={openSession}
            />
          )}
          {page === "sessions_detail" && activeSessionId && (
            <SessionDetailPage
              sessionId={activeSessionId}
              onBack={backToSessionList}
              onAddDetainee={addDetaineeToSession}
              onEditDetainee={editDetaineeInSession}
              onSessionClosed={handleSessionClosed}
            />
          )}
          {page === "session_capture" && sessionCtx && (
            <DataCapturePage
              go={goPage}
              initial={editingDetainee}
              onDone={() => setEditingDetainee(null)}
              sessionId={sessionCtx.sessionId}
              sessionCode={sessionCtx.sessionCode}
              sessionReadOnly={sessionCtx.sessionReadOnly}
              onSavedInSession={doneSessionCapture}
            />
          )}
          {page === "search" && <SearchPage />}
          {page === "detainee_history" && <DetaineeHistoryPage onEdit={editDetainee} />}
          {page === "logs" && <LogsPage />}
          {page === "users" && isAdmin && <UsersPage currentUser={username} />}
        </main>
      </div>
    </>
  );
}

const DEVICE_CHIPS = [
  { key: "camera", labelKey: "header.device.camera" },
  { key: "cccd", labelKey: "header.device.cccd" },
  { key: "fp", labelKey: "header.device.fp" },
  { key: "scale", labelKey: "header.device.scale" },
];

function Header({ username, fullName, devices, notif, onLogout, isAdmin, onEditProfile }) {
  const { t } = useI18n();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [viewingMatch, setViewingMatch] = useState(null);
  const notifRef = useRef(null);
  const userMenuRef = useRef(null);

  useEffect(() => {
    if (!notifOpen) return;
    const onClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [notifOpen]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [userMenuOpen]);

  const toggleNotif = () => {
    const nextOpen = !notifOpen;
    setNotifOpen(nextOpen);
    if (nextOpen && notif.unread > 0) notify.markAllRead();
  };
  return (
    <header className="header">
      <div className="brand">
        <div className="brand-logo">
          <img src="/pyxis-logo.png" alt={t("header.brand_logo_alt")} />
        </div>
        <div>
          <div className="brand-title">{t("header.brand_title")}</div>
          <div className="brand-subtitle">{t("header.brand_subtitle")}</div>
        </div>
      </div>

      <div className="header-actions">
        <div className="device-chips" role="group" aria-label={t("header.device_group")}>
          {DEVICE_CHIPS.map((d) => {
            const ok = Boolean(devices?.[d.key]);
            const label = t(d.labelKey);
            return (
              <div
                key={d.key}
                className={`device-chip ${ok ? "online" : "offline"}`}
                title={`${label}: ${ok ? t("header.device.connected") : t("header.device.disconnected")}`}
              >
                <span className="device-chip-dot" />
                <span className="device-chip-label">{label}</span>
              </div>
            );
          })}
        </div>

        <LanguageSwitch />

        <div className="notif-wrap" ref={notifRef}>
          <button
            className="icon-button"
            aria-label={t("header.notif.aria")}
            onClick={toggleNotif}
            title={notif.unread > 0 ? t("header.notif.new", { n: notif.unread }) : t("header.notif.none")}
          >
            {Icon.bell}
            {notif.unread > 0 && <b>{notif.unread > 99 ? "99+" : notif.unread}</b>}
          </button>
          {notifOpen && (
            <div className="notif-panel">
              <div className="notif-panel-head">
                <strong>{t("header.notif.aria")}</strong>
                {notif.items.length > 0 && (
                  <button
                    type="button"
                    className="notif-clear"
                    onClick={() => notify.clearAll()}
                  >
                    {t("common.delete")} {t("common.all").toLowerCase()}
                  </button>
                )}
              </div>
              <div className="notif-panel-list">
                {notif.items.length === 0 ? (
                  <div className="notif-empty">{t("header.notif.none")}</div>
                ) : (
                  notif.items.map((it) => {
                    const match = it.meta && (it.meta.kind === "match" || it.meta.kind === "face") && it.meta.detainee;
                    return (
                      <div
                        className={"notif-item" + (match ? " notif-item-match" : "")}
                        key={it.id}
                        onClick={match ? () => { setViewingMatch(it.meta.detainee); setNotifOpen(false); } : undefined}
                        role={match ? "button" : undefined}
                        tabIndex={match ? 0 : undefined}
                        title={match ? t("capture.alert.open_profile") : undefined}
                      >
                        <div className={"notif-item-dot" + (match ? " notif-item-dot-alert" : "")} />
                        <div className="notif-item-body">
                          <div className="notif-item-msg">{it.message}</div>
                          <div className="notif-item-time">{formatDateTime(it.at)}</div>
                          {match && (
                            <div className="notif-item-cta">{t("capture.alert.open_profile")}</div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="user-box-wrap" ref={userMenuRef} style={{ position: "relative" }}>
          <button
            type="button"
            className="user-box"
            onClick={() => setUserMenuOpen((v) => !v)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
          >
            <div className="avatar">{(fullName || username).slice(0, 1).toUpperCase()}</div>
            <div className="user-info">
              <strong>{fullName || username}</strong>
              <span>{isAdmin ? t("common.role.admin") : t("common.role.officer")}</span>
            </div>
          </button>
          {userMenuOpen && (
            <div
              role="menu"
              style={{
                position: "absolute", top: "calc(100% + 8px)", right: 0, minWidth: 200,
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
                boxShadow: "0 8px 24px rgba(15,35,68,.12)", zIndex: 100, padding: 6,
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => { setUserMenuOpen(false); onEditProfile && onEditProfile(); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "8px 12px", border: "none", background: "none",
                  borderRadius: 6, cursor: "pointer", fontSize: 14, color: "#0f2344",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#f5f8fd"}
                onMouseLeave={(e) => e.currentTarget.style.background = "none"}
              >
                {t("profile.edit_menu")}
              </button>
            </div>
          )}
        </div>

        <button className="logout-button" onClick={onLogout}>
          {Icon.logout}
          {t("header.logout")}
        </button>
      </div>
      {viewingMatch && (
        <DetailModal detainee={viewingMatch} onClose={() => setViewingMatch(null)} />
      )}
    </header>
  );
}

function useNotifState() {
  const [state, setState] = useState(() => ({
    items: notify.list(),
    unread: notify.unreadCount(),
  }));
  useEffect(() => {
    return notify.subscribe(() => {
      setState({ items: notify.list(), unread: notify.unreadCount() });
    });
  }, []);
  return state;
}

function useDeviceConnections() {
  const [status, setStatus] = useState({ camera: false, cccd: false, fp: false, scale: false });

  useEffect(() => {
    let cancelled = false;

    const checkCamera = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return false;
        const list = await navigator.mediaDevices.enumerateDevices();
        return list.some((d) => d.kind === "videoinput");
      } catch {
        return false;
      }
    };

    const checkCccd = async () => {
      try {
        const r = await cccdApi.health();
        return Boolean(r && (r.ok === true || r.status === "ok" || r.ready === true));
      } catch {
        return false;
      }
    };

    const checkFp = async () => {
      try {
        const r = await fpApi.health();
        return Boolean(r && (r.ok === true || r.status === "ok" || r.ready === true));
      } catch {
        return false;
      }
    };

    const runAll = async () => {
      const [camera, cccd, fp] = await Promise.all([checkCamera(), checkCccd(), checkFp()]);
      if (cancelled) return;
      setStatus((prev) => ({ ...prev, camera, cccd, fp }));
    };

    runAll();
    const timer = setInterval(runAll, 5000);

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const host = location.port === "5173" ? `${location.hostname}:8000` : location.host;
    const wsUrl = `${proto}//${host}/api/weight/ws`;
    let ws = null;
    let closed = false;
    let retry = 0;
    let retryTimer = null;

    const openWs = () => {
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }
      ws.onopen = () => {
        retry = 0;
        if (!cancelled) setStatus((prev) => ({ ...prev, scale: true }));
      };
      ws.onclose = () => {
        if (!cancelled) setStatus((prev) => ({ ...prev, scale: false }));
        if (closed) return;
        scheduleReconnect();
      };
      ws.onerror = () => { /* handled in onclose */ };
    };

    const scheduleReconnect = () => {
      retry = Math.min(retry + 1, 4);
      const delay = Math.min(1000 * 2 ** (retry - 1), 10000);
      retryTimer = setTimeout(openWs, delay);
    };

    openWs();

    return () => {
      cancelled = true;
      clearInterval(timer);
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      try { ws && ws.close(); } catch { /* noop */ }
    };
  }, []);

  return status;
}

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

function DashboardHome({ go }) {
  const { t, greeting, dayNames, formatNumber } = useI18n();
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
          <h1>{greet}, {stats.open_session?.officer_full_name || t("dashboard.greet_officer_default")}</h1>
          <p>{timeStr} • {dateStr}</p>
        </div>
        {openSession ? (
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

      <div className="stat-grid">
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
        <StatCard
          tone="purple"
          icon={Icon.clipboard}
          label={t("dashboard.stat.open_session")}
          value={openSession ? 1 : 0}
          note={openSession ? openSession.code : t("dashboard.stat.open_session.none")}
        />
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
  const MALE_COLOR = "#2371f4";
  const FEMALE_COLOR = "#ec4899";
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="donut">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#eef2f8" strokeWidth="18" />
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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f2e4e6" strokeWidth="6" />
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
                <span className="hbar-fill" style={{ width: `${pct}%`, background: "#7745db" }} />
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
          style={{ background: `conic-gradient(#2563eb ${ring}%, #e8eef9 0)` }}
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

function DetaineesPage({ onEdit }) {
  const { t, formatDate } = useI18n();
  const [items, setItems] = useState([]);
  const [cells, setCells] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const limit = 10;

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(limit),
      });
      const result = await api.request(`/api/detainees?${params}`);
      setItems(result.items || []);
      setTotal(result.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.listCells().then(setCells).catch(() => { });
  }, []);

  useEffect(() => {
    load();
  }, [skip]);

  const deleteItem = async (item) => {
    if (!window.confirm(t("detainee.confirm.delete", { code: item.code, name: item.full_name }))) return;
    try {
      await api.deleteDetainee(item.id);
      notify.add();
      load();
    } catch (e) {
      window.alert(t("common.error_prefix", { message: e.message }));
    }
  };

  const pages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.floor(skip / limit) + 1;

  return (
    <div className="page">
      <PageHeader title={t("detainee.list.title")} subtitle={t("detainee.list.total", { n: total })}>
      </PageHeader>

      <div className="detainees-table-wrap">
        {loading ? (
          <StateBox>{t("common.loading")}</StateBox>
        ) : error ? (
          <StateBox type="error">{error}</StateBox>
        ) : !items.length ? (
          <StateBox>{t("detainee.empty")}</StateBox>
        ) : (
          <table className="detainees-table">
            <thead>
              <tr>
                <th>{t("detainee.col.photo")}</th>
                <th>{t("detainee.col.code")}</th>
                <th>{t("detainee.col.name")}</th>
                <th>{t("detainee.col.gender")}</th>
                <th>{t("detainee.col.dob")}</th>
                <th>{t("detainee.col.cccd")}</th>
                <th>{t("detainee.col.cell")}</th>
                <th>{t("detainee.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="table-avatar">
                      {item.photo_url ? (
                        <img src={item.photo_url} alt="" />
                      ) : (
                        (item.full_name || "?").slice(0, 1).toUpperCase()
                      )}
                    </div>
                  </td>
                  <td><strong>{item.personal_id || item.code}</strong></td>
                  <td>{item.full_name}</td>
                  <td>{item.gender === "female" ? t("common.female") : t("common.male")}</td>
                  <td>{item.dob ? formatDate(item.dob) : "-"}</td>
                  <td>{item.cccd_number || "-"}</td>
                  <td>{item.cell_code || "-"}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => setViewing(item)}>{t("detainee.action.view")}</button>
                      <button
                        onClick={async () => {
                          try {
                            const full = await api.getDetainee(item.id);
                            onEdit?.(full);
                          } catch {
                            onEdit?.(item);
                          }
                        }}
                      >{t("detainee.action.edit")}</button>
                      <button className="danger-text" onClick={() => deleteItem(item)}>{t("detainee.action.delete")}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="session-list-toolbar">
          <div className="session-list-total">{t("common.total", { n: total })}</div>
          <div className="pagination">
            <button disabled={!skip || loading} onClick={() => setSkip(Math.max(0, skip - limit))}>{t("common.prev")}</button>
            <span>{t("common.page_of", { page: currentPage, total: pages })}</span>
            <button disabled={currentPage >= pages || loading} onClick={() => setSkip(skip + limit)}>{t("common.next")}</button>
          </div>
        </div>
      </div>

      {showForm && (
        <DetaineeForm
          initial={editing}
          cells={cells}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            load();
          }}
        />
      )}

      {viewing && <DetailModal detainee={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

const DetailIcon = {
  cccd: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="12" r="2.2" /><path d="M14 10h5M14 14h5M6.5 16.2c.7-1.4 2-2 2.5-2s1.8.6 2.5 2" />
    </svg>
  ),
  dob: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  ),
  gender: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="10" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  ethnic: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="3.2" /><circle cx="17" cy="10" r="2.6" /><path d="M3 20a6 6 0 0 1 12 0M14 20a5 5 0 0 1 8-1.3" />
    </svg>
  ),
  religion: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3c2 3 5 4 5 8a5 5 0 0 1-10 0c0-4 3-5 5-8z" /><path d="M9 21h6" />
    </svg>
  ),
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" /><circle cx="12" cy="10" r="2.6" />
    </svg>
  ),
  door: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="1" /><circle cx="15" cy="12" r="1" />
    </svg>
  ),
  scale: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18M4 21h16M6 8h12M6 8l-3 7a4 4 0 0 0 6 0zM18 8l-3 7a4 4 0 0 0 6 0z" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  ),
  note: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M8 13h8M8 17h5" />
    </svg>
  ),
};

function DetailModal({ detainee, onClose }) {
  const { t, formatDate } = useI18n();
  const d = detainee;
  const dobText = formatDate(d.dob);
  const dateInText = formatDate(d.date_in);
  const genderText = d.gender === "female" ? t("common.female") : t("common.male");
  const genderSymbol = d.gender === "female" ? "♀" : "♂";
  const avatar = d.photo_url || d.photos?.portrait_front;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal detail-modal-v2" onClick={(e) => e.stopPropagation()}>
        <div className="detail-header">
          <div className="detail-header-left">
            <span className="detail-header-icon">{DetailIcon.cccd}</span>
            <div>
              <h3>{t("detainee.detail.title", { code: d.code || d.personal_id || "" })}</h3>
              <small>{t("detainee.detail.subtitle")}</small>
            </div>
          </div>
          <button className="detail-close" onClick={onClose} aria-label={t("detainee.detail.close_aria")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="detail-body">
          <aside className="detail-card detail-card-simple">
            <div className="detail-avatar">
              {avatar ? <img src={avatar} alt={d.full_name} /> : <span>{t("detainee.detail.no_photo")}</span>}
            </div>
            <div className="detail-name-row">
              <span className="detail-name">{d.full_name || "—"}</span>
            </div>
          </aside>

          <div className="detail-grid-v2 detail-grid-2x4">
            <InfoTile icon={DetailIcon.cccd} label={t("detainee.field.cccd")} value={d.cccd_number || "—"} />
            <InfoTile icon={DetailIcon.note} label={t("detainee.field.personal_id")} value={d.personal_id || "—"} />
            <InfoTile icon={DetailIcon.dob} label={t("detainee.field.dob")} value={dobText} />
            <InfoTile icon={DetailIcon.ethnic} label={t("detainee.field.ethnicity")} value={d.ethnicity || "—"} />
            <InfoTile icon={DetailIcon.door} label={t("detainee.field.cell")} value={d.cell_code || "—"} />
            <InfoTile icon={DetailIcon.pin} label={t("detainee.field.address")} value={d.address || "—"} />
            <InfoTile icon={DetailIcon.gender} label={t("detainee.field.gender")} value={<span><b>{genderSymbol}</b> {genderText}</span>} />
            <InfoTile icon={DetailIcon.flag} label={t("detainee.field.nationality")} value={d.nationality || "—"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoTile({ icon, label, value }) {
  return (
    <div className="info-tile">
      <span className="info-tile-icon">{icon}</span>
      <div className="info-tile-content">
        <span className="info-tile-label">{label}</span>
        <strong className="info-tile-value">{value}</strong>
      </div>
    </div>
  );
}

function SyncPage() {
  const { t, formatDateTime } = useI18n();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [syncingIds, setSyncingIds] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const r = await api.listSessions(params);
      setSessions(r.items || []);
    } catch (e) {
      setError(e.message);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);
  useEffect(() => { setPage(1); }, [statusFilter, q]);

  const filtered = sessions.filter((s) => {
    if (!q.trim()) return true;
    const kw = q.trim().toLowerCase();
    return (
      (s.code || "").toLowerCase().includes(kw) ||
      (s.officer || "").toLowerCase().includes(kw) ||
      (s.officer_full_name || "").toLowerCase().includes(kw) ||
      (s.location || "").toLowerCase().includes(kw)
    );
  });
  const totalRows = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const pagedRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const allChecked = filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtered.map((s) => s.id)));
  };

  const [syncErrors, setSyncErrors] = useState({});
  const [syncSuccess, setSyncSuccess] = useState({});
  const [diffState, setDiffState] = useState(null); // { session, loading, diff }

  const REMOTE = "/api/proxy"; // proxy qua backend để tránh CORS

  const uploadPhoto = async (url) => {
    if (!url) return "";
    try {
      const absUrl = url.startsWith("http") ? url : url;
      const imgRes = await fetch(absUrl);
      if (!imgRes.ok) return "";
      const blob = await imgRes.blob();
      const ext = blob.type.includes("png") ? "png" : "jpg";
      const form = new FormData();
      form.append("file", blob, `photo.${ext}`);
      const j = await api.request(`${REMOTE}/upload-image`, { method: "POST", body: form });
      return j.url || "";
    } catch { return ""; }
  };

  // Tải full detainee của 1 phiên
  const loadSessionDetainees = async (sessionId) => {
    const detail = await api.request(`/api/sessions/${sessionId}`);
    return Promise.all(
      (detail.detainees || []).map((d) => api.getDetainee(d.id).catch(() => d))
    );
  };

  const mapOneToPayload = async (d) => {
    const p = d.photos || {};
    const keys = ["cccd_front", "cccd_back", "portrait_front", "portrait_left", "portrait_right",
      "fp_l1", "fp_l2", "fp_l3", "fp_l4", "fp_l5",
      "fp_r1", "fp_r2", "fp_r3", "fp_r4", "fp_r5",
      "iris_left", "iris_right"];
    const source = {
      cccd_front: p.cccd_front,
      cccd_back: p.cccd_back,
      portrait_front: p.portrait_front || d.photo_url,
      portrait_left: p.portrait_left,
      portrait_right: p.portrait_right,
      fp_l1: p.fp_l1, fp_l2: p.fp_l2, fp_l3: p.fp_l3, fp_l4: p.fp_l4, fp_l5: p.fp_l5,
      fp_r1: p.fp_r1, fp_r2: p.fp_r2, fp_r3: p.fp_r3, fp_r4: p.fp_r4, fp_r5: p.fp_r5,
      iris_left: p.iris_left, iris_right: p.iris_right,
    };
    const uploaded = {};
    await Promise.all(keys.map(async (k) => {
      const url = await uploadPhoto(source[k]);
      uploaded[k] = url || null;
    }));
    return {
      personal_id: d.personal_id || d.code || null,
      full_name: d.full_name || null,
      gender: d.gender || null,
      dob: d.dob || null,
      cccd_number: d.cccd_number || null,
      nationality: d.nationality || null,
      ethnicity: d.ethnicity || null,
      religion: d.religion || null,
      hometown: d.hometown || null,
      address: d.address || null,
      issued_date: d.issued_date || null,
      expiry_date: d.expiry_date || null,
      issued_place: d.issued_place || null,
      height_cm: d.height_cm || null,
      weight_kg: d.weight_kg || null,
      cell_code: d.cell_code || null,
      charge: d.charge || null,
      date_in: d.date_in || null,
      note: d.note || null,
      created_by: d.created_by || null,
      photos: uploaded,
    };
  };

  // Bước 1: so sánh + mở modal xác nhận
  const prepareSync = async (session) => {
    setSyncErrors((prev) => { const n = { ...prev }; delete n[session.id]; return n; });
    setSyncSuccess((prev) => { const n = { ...prev }; delete n[session.id]; return n; });
    setDiffState({ session, loading: true, diff: null });
    try {
      const [localDetainees, remoteResp] = await Promise.all([
        loadSessionDetainees(session.id),
        api.request(`${REMOTE}/pham-nhan`),
      ]);
      const remoteList = Array.isArray(remoteResp?.data) ? remoteResp.data : [];
      const diff = buildSyncDiff(localDetainees, remoteList);
      setDiffState({ session, loading: false, diff });
    } catch (e) {
      setDiffState(null);
      setSyncErrors((prev) => ({ ...prev, [session.id]: e.message }));
    }
  };

  // Bước 2: sau khi user xác nhận trong modal -> đẩy thật
  const doSync = async (selectedTargets) => {
    const session = diffState?.session;
    const diff = diffState?.diff;
    if (!session || !selectedTargets.length) {
      setDiffState(null);
      return;
    }
    setDiffState(null);
    setSyncingIds((prev) => new Set(prev).add(session.id));
    const pickEntry = (x) => ({
      code: x.code || "",
      full_name: x.full_name || "",
      cccd_number: x.cccd_number || "",
    });
    const addSel = selectedTargets.filter((x) => (diff?.toAdd || []).some((a) => a.id === x.id));
    const updSel = selectedTargets.filter((x) => (diff?.toUpdate || []).some((u) => u.id === x.id));
    try {
      const mappedDetainees = await Promise.all(selectedTargets.map((t) => mapOneToPayload(t.local)));
      const payload = {
        total: mappedDetainees.length,
        items: [{
          id: session.code || session.id || null,
          officer: session.officer || null,
          officer_full_name: session.officer_full_name || null,
          location: session.location || null,
          opened_at: session.opened_at || null,
          closed_at: session.closed_at || null,
          detainees: mappedDetainees,
        }],
      };
      await api.request(`${REMOTE}/sync-detainee`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSyncSuccess((prev) => ({ ...prev, [session.id]: true }));
      notify.add();
      try {
        await api.logSessionSync(session.id, {
          added: addSel.length,
          updated: updSel.length,
          duplicated: (diff?.duplicates || []).length,
          failed: 0,
          added_items: addSel.map(pickEntry),
          updated_items: updSel.map(pickEntry),
          duplicate_items: (diff?.duplicates || []).map(pickEntry),
          failed_items: [],
        });
      } catch { /* log-only; không chặn UX */ }
    } catch (e) {
      setSyncErrors((prev) => ({ ...prev, [session.id]: e.message }));
      try {
        await api.logSessionSync(session.id, {
          added: 0,
          updated: 0,
          duplicated: (diff?.duplicates || []).length,
          failed: addSel.length + updSel.length,
          added_items: [],
          updated_items: [],
          duplicate_items: (diff?.duplicates || []).map(pickEntry),
          failed_items: [...addSel, ...updSel].map(pickEntry),
          error: e.message,
        });
      } catch { /* noop */ }
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(session.id);
        return next;
      });
    }
  };

  const syncSelected = async () => {
    const targets = filtered.filter((s) => selected.has(s.id));
    for (const s of targets) {
      // eslint-disable-next-line no-await-in-loop
      await prepareSync(s);
      // prepareSync opens a modal -> wait for the user to resolve it before continuing.
      // Since the modal is interactive, we stop the chain here; the user clicks each session.
      break;
    }
  };

  const fmtDT = (iso) => formatDateTime(iso);

  return (
    <div className="page">
      <PageHeader title={t("sync.title")} subtitle={t("sync.subtitle")} />

      <div className="sync-toolbar">
        <input
          className="control sync-search"
          placeholder={t("sync.search_ph")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{t("sync.status.all")}</option>
          <option value="open">{t("sync.status.open")}</option>
          <option value="closed">{t("sync.status.closed")}</option>
        </select>
        <button className="button" onClick={load} disabled={loading}>{loading ? t("sync.loading") : t("common.refresh")}</button>
        <div className="sync-toolbar-spacer" />
        <button
          className="button primary"
          disabled={selected.size === 0 || syncingIds.size > 0}
          onClick={syncSelected}
          title={selected.size === 0 ? t("sync.tip.select") : t("sync.tip.selected", { n: selected.size })}
        >
          {selected.size > 0 ? t("sync.action_count", { n: selected.size }) : t("sync.action")}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="sync-table-wrap">
        <table className="sync-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label={t("sync.select_all_aria")} />
              </th>
              <th>{t("sync.col.code")}</th>
              <th>{t("sync.col.status")}</th>
              <th>{t("sync.col.officer")}</th>
              <th>{t("sync.col.location")}</th>
              <th>{t("sync.col.opened")}</th>
              <th>{t("sync.col.closed")}</th>
              <th style={{ textAlign: "center" }}>{t("sync.col.count")}</th>
              <th style={{ width: 140 }}>{t("sync.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 && !loading && (
              <tr><td colSpan={9} className="sync-empty">{t("sync.empty")}</td></tr>
            )}
            {pagedRows.map((s) => {
              const busy = syncingIds.has(s.id);
              return (
                <tr key={s.id} className={selected.has(s.id) ? "row-selected" : ""}>
                  <td><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id)} /></td>
                  <td><strong>{s.code}</strong></td>
                  <td>
                    <span className={"sync-badge " + (s.status === "open" ? "open" : "closed")}>
                      {s.status === "open" ? t("sync.status.open") : t("sync.status.closed")}
                    </span>
                  </td>
                  <td>{s.officer_full_name || s.officer}</td>
                  <td>{s.location || "—"}</td>
                  <td>{fmtDT(s.opened_at)}</td>
                  <td>{fmtDT(s.closed_at)}</td>
                  <td style={{ textAlign: "center" }}>{s.detainee_count || 0}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <button className="button small" disabled={busy} onClick={() => prepareSync(s)}>
                        {busy ? t("sync.syncing") : t("sync.action")}
                      </button>
                      {syncErrors[s.id] && (
                        <span style={{ fontSize: 11, color: "#e53e3e" }}>{t("sync.err_prefix", { message: syncErrors[s.id] })}</span>
                      )}
                      {syncSuccess[s.id] && !syncErrors[s.id] && (
                        <span style={{ fontSize: 11, color: "#12af64" }}>{t("sync.success")}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="session-list-toolbar">
          <div className="session-list-total">{t("common.total", { n: totalRows })}</div>
          <div className="pagination">
            <button disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t("common.prev")}</button>
            <span>{t("common.page_of", { page, total: totalPages })}</span>
            <button disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{t("common.next")}</button>
          </div>
        </div>
      </div>

      {diffState && (
        <SyncDiffModal
          session={diffState.session}
          diff={diffState.diff}
          loading={diffState.loading}
          onConfirm={doSync}
          onCancel={() => setDiffState(null)}
        />
      )}
    </div>
  );
}

function CellsPage() {
  const { t } = useI18n();
  const [cells, setCells] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewingCell, setViewingCell] = useState(null);

  const load = async () => {
    try {
      setCells(await api.listCells());
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const deleteCell = async (cell) => {
    if (!window.confirm(t("cells.confirm_delete", { code: cell.code }))) return;
    try {
      await api.deleteCell(cell.id);
      load();
    } catch (e) {
      window.alert(t("common.error_prefix", { message: e.message }));
    }
  };

  return (
    <div className="page">
      <PageHeader title={t("cells.title")} subtitle={t("cells.subtitle", { n: cells.length })}>
        <button
          className="button primary"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          {Icon.plus}
          {t("cells.add")}
        </button>
      </PageHeader>

      {error && <StateBox type="error">{error}</StateBox>}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>{t("cells.col.name")}</th>
              <th>{t("cells.col.capacity")}</th>
              <th>{t("cells.col.current")}</th>
              <th>{t("cells.col.percent")}</th>
              <th>{t("cells.col.note")}</th>
              <th>{t("cells.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((cell) => {
              const percent = cell.capacity
                ? Math.round((cell.current / cell.capacity) * 100)
                : 0;

              return (
                <tr key={cell.id}>
                  <td><strong>{cell.name}</strong></td>
                  <td>{cell.capacity}</td>
                  <td>{cell.current}</td>
                  <td>
                    <div className="mini-progress"><span style={{ width: `${Math.min(100, percent)}%` }} /></div>
                    <small>{percent}%</small>
                  </td>
                  <td>{cell.note || "-"}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => setViewingCell(cell)}>{t("cells.view_detainees")}</button>
                      <button onClick={() => { setEditing(cell); setShowForm(true); }}>{t("common.edit")}</button>
                      <button className="danger-text" onClick={() => deleteCell(cell)}>{t("common.delete")}</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <CellForm
          initial={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            load();
          }}
        />
      )}

      {viewingCell && (
        <CellDetaineesModal
          cell={viewingCell}
          allCells={cells}
          onClose={() => setViewingCell(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function CellDetaineesModal({ cell, allCells, onClose, onChanged }) {
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeOk, setNoticeOk] = useState(false);
  const [transferring, setTransferring] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ cell_code: cell.code, limit: "200" });
      const res = await api.request(`/api/detainees?${params}`);
      setItems(res.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [cell.code]);

  const doTransfer = async (item, newCode) => {
    if (newCode === item.cell_code) return;
    const target = newCode || t("cells.transfer.target_empty");
    if (!window.confirm(t("cells.transfer.confirm", { name: item.full_name, target }))) return;
    setTransferring(item.id);
    try {
      await api.transferDetainee(item.id, newCode);
      setNotice(t("cells.transfer.done", { name: item.full_name }));
      setNoticeOk(true);
      load();
      onChanged && onChanged();
    } catch (e) {
      setNotice(t("common.error_prefix", { message: e.message }));
      setNoticeOk(false);
    } finally {
      setTransferring(null);
    }
  };

  const otherCells = allCells.filter((c) => c.code !== cell.code);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t("cells.transfer.title", { code: cell.code, name: cell.name })}</h3>
          <button onClick={onClose}>×</button>
        </div>

        <div style={{ padding: "16px 24px" }}>
          {notice && <div className={noticeOk ? "success-box" : "error-box"}>{notice}</div>}
          {error && <StateBox type="error">{error}</StateBox>}

          {loading ? (
            <StateBox>{t("common.loading")}</StateBox>
          ) : !items.length ? (
            <StateBox>{t("cells.transfer.empty")}</StateBox>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("cells.transfer.col.code")}</th>
                  <th>{t("cells.transfer.col.name")}</th>
                  <th>{t("cells.transfer.col.gender")}</th>
                  <th>{t("cells.transfer.col.action")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.personal_id || item.code}</strong></td>
                    <td>{item.full_name}</td>
                    <td>{item.gender === "female" ? t("common.female") : t("common.male")}</td>
                    <td>
                      <select
                        className="control"
                        defaultValue=""
                        disabled={transferring === item.id}
                        onChange={(e) => {
                          const v = e.target.value;
                          e.target.value = "";
                          if (v !== "") doTransfer(item, v);
                        }}
                      >
                        <option value="">{t("cells.transfer.select")}</option>
                        {otherCells.map((c) => (
                          <option key={c.code} value={c.code}>
                            {t("cells.transfer.opt", { code: c.code, name: c.name, current: c.current, capacity: c.capacity })}
                          </option>
                        ))}
                        <option value="">{t("cells.transfer.remove")}</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export function CellForm({ initial, onClose, onSaved }) {
  const { t } = useI18n();
  const [name, setName] = useState(initial?.name || "");
  const [capacity, setCapacity] = useState(initial?.capacity ?? 20);
  const [note, setNote] = useState(initial?.note || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        code: initial?.code || "",
        name: name.trim(),
        capacity: Number(capacity),
        note,
      };

      if (initial) await api.updateCell(initial.id, payload);
      else await api.createCell(payload);

      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{initial ? t("cells.form.title.edit") : t("cells.form.title.new")}</h3>
          <button onClick={onClose}>×</button>
        </div>

        <form className="form" onSubmit={submit}>
          {error && <div className="error-box">{error}</div>}

          <FieldRow label={t("cells.form.name")}>
            <input className="control" value={name} onChange={(e) => setName(e.target.value)} required />
          </FieldRow>

          <FieldRow label={t("cells.form.capacity")}>
            <input className="control" type="number" min="0" max="500" value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
          </FieldRow>

          <FieldRow label={t("cells.form.note")}>
            <input className="control" value={note} onChange={(e) => setNote(e.target.value)} />
          </FieldRow>

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose}>{t("common.cancel")}</button>
            <button type="submit" className="button primary" disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportExportPage() {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [usbPicker, setUsbPicker] = useState({ open: false, drives: [], resolve: null });

  const pickDrive = (drives) => new Promise((resolve) => {
    setUsbPicker({ open: true, drives, resolve });
  });

  const doExport = async () => {
    setExporting(true);
    setError("");
    try {
      const res = await exportToUsb(
        "/api/detainees/export/xlsx",
        "can_pham.xlsx",
        pickDrive,
      );
      if (!res.cancelled) {
        const msg = t("usb.export.success", { path: res.path });
        toast.success(msg);
        notify.add(msg);
      }
    } catch (ex) {
      toast.error(ex.message);
      setError(ex.message);
    } finally {
      setExporting(false);
    }
  };

  const importFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setResult(null);
    setError("");

    try {
      const data = new FormData();
      data.append("file", file);
      const r = await api.importXlsx(data);
      setResult(r);
      notify.add(t("import.notify_done", { n: r.inserted || 0 }));
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="page">
      <PageHeader title={t("import.title")} subtitle={t("import.subtitle")} />

      <div className="feature-grid">
        <section className="feature-card">
          <div className="feature-icon">{Icon.file}</div>
          <h3>{t("import.export_title")}</h3>
          <p>{t("import.export_desc")}</p>
          <button className="button primary" onClick={doExport} disabled={exporting}>
            {exporting ? t("session.exporting") : t("import.export_btn")}
          </button>
        </section>

        <section className="feature-card">
          <div className="feature-icon">{Icon.file}</div>
          <h3>{t("import.import_title")}</h3>
          <p>{t("import.import_desc")}</p>

          <div className="feature-actions">
            <button className="button secondary" onClick={() => api.downloadTemplate()}>
              {t("import.template")}
            </button>

            <label className="button primary">
              {uploading ? t("import.importing") : t("import.choose")}
              <input type="file" accept=".xlsx" onChange={importFile} hidden disabled={uploading} />
            </label>
          </div>

          {error && <div className="error-box">{error}</div>}
          {result && (
            <div className="success-box">
              {t("import.done", { n: result.inserted })}
              {result.errors?.length ? t("import.done_err", { n: result.errors.length }) : ""}
            </div>
          )}
        </section>
      </div>

      {usbPicker.open && (
        <UsbDrivePickerModal
          drives={usbPicker.drives}
          onPick={(d) => {
            const r = usbPicker.resolve;
            setUsbPicker({ open: false, drives: [], resolve: null });
            r && r(d);
          }}
          onCancel={() => {
            const r = usbPicker.resolve;
            setUsbPicker({ open: false, drives: [], resolve: null });
            r && r(null);
          }}
        />
      )}
    </div>
  );
}

function formatDateTime(iso) {
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

// shared mutable locale getter for the module-level formatDateTime helper
let _lastLocale = "vi";
function setLastLocale(v) { _lastLocale = v; }

function LogsPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState([]);
  const [counts, setCounts] = useState({ create: 0, update: 0, delete: 0, login: 0, import: 0 });
  const [cells, setCells] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [users, setUsers] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busyRef, setBusyRef] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeOk, setNoticeOk] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = { action: "sync", resource: "work_session" };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (sessionFilter.trim()) params.session_code = sessionFilter.trim();
      if (actorFilter) params.actor = actorFilter;
      const res = await api.listLogs(params);
      setLogs(res.items || []);
      setCounts(res.counts || { sync: 0 });
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api.listCells().then(setCells).catch(() => { });
    api.listUsers().then(setUsers).catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const labels = {
    login: t("logs.action.login"),
    create: t("logs.action.create"),
    update: t("logs.action.update"),
    delete: t("logs.action.delete"),
    import: t("logs.action.import"),
    sync: t("logs.action.sync"),
  };

  const resolveDetainee = async (log) => {
    if (log.ref_id) {
      try {
        return await api.getDetainee(log.ref_id);
      } catch (e) {
        // fall through to code-based lookup
      }
    }
    if (log.ref) return await api.getDetaineeByPersonalId(log.ref);
    throw new Error(t("logs.err.no_ref"));
  };

  const isDetaineeLog = (log) =>
    log.resource === "detainee" &&
    (log.ref || log.ref_id) &&
    log.action !== "delete";

  const isSyncLog = (log) => log.action === "sync";
  const [syncViewing, setSyncViewing] = useState(null);

  const onView = async (log) => {
    if (isSyncLog(log)) {
      setSyncViewing(log);
      return;
    }
    setBusyRef(log.id);
    setNotice("");
    try {
      const d = await resolveDetainee(log);
      setViewing(d);
    } catch (e) {
      setNotice(t("logs.err.open", { message: e.message }));
      setNoticeOk(false);
    } finally {
      setBusyRef("");
    }
  };

  const onEdit = async (log) => {
    setBusyRef(log.id);
    setNotice("");
    try {
      const d = await resolveDetainee(log);
      setEditing(d);
    } catch (e) {
      setNotice(t("logs.err.open", { message: e.message }));
      setNoticeOk(false);
    } finally {
      setBusyRef("");
    }
  };

  const onDelete = async (log) => {
    if (!window.confirm(t("logs.confirm_delete", { ref: log.ref || "" }))) return;
    setBusyRef(log.id);
    setNotice("");
    try {
      const d = await resolveDetainee(log);
      await api.deleteDetainee(d.id);
      notify.add(t("logs.notify.deleted", { code: d.code }));
      setNotice(t("logs.deleted", { code: d.code }));
      setNoticeOk(true);
      load();
    } catch (e) {
      setNotice(t("logs.err.delete", { message: e.message }));
      setNoticeOk(false);
    } finally {
      setBusyRef("");
    }
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSessionFilter("");
    setActorFilter("");
  };

  return (
    <div className="page report-page">
      <div className="report-fixed">
      <PageHeader
        title={t("logs.title_sync")}
        subtitle={t("logs.subtitle_sync", { n: logs.length })}
      >
        <button className="button secondary" onClick={load} disabled={loading}>
          {Icon.refresh}
          {loading ? t("common.loading") : t("common.refresh")}
        </button>
      </PageHeader>

      <div className="report-stat-grid">
        <ReportStat tone="orange" icon={Icon.sync} label={t("logs.stat.sync_total")} value={counts.sync || 0} note={t("logs.stat.note.sync")} />
      </div>

      <form
        className="report-filter"
        onSubmit={(e) => { e.preventDefault(); load(); }}
      >
        <div className="report-filter-head">
          <span className="report-filter-title">{t("logs.filter.title")}</span>
          <span className="report-filter-hint">{t("logs.filter.desc")}</span>
        </div>
        <div className="report-filter-grid">
          <label className="report-field">
            <span>{t("common.from")}</span>
            <input
              className="control"
              type="datetime-local"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="report-field">
            <span>{t("common.to")}</span>
            <input
              className="control"
              type="datetime-local"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <label className="report-field">
            <span>{t("logs.field.session")}</span>
            <input
              className="control"
              type="text"
              placeholder={t("logs.field.session_ph")}
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
            />
          </label>
          <label className="report-field">
            <span>{t("logs.field.officer")}</span>
            <select className="control" value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}>
              <option value="">{t("logs.field.officer_all")}</option>
              {users.map((u) => (
                <option key={u.id} value={u.username}>
                  {u.full_name ? `${u.full_name} (@${u.username})` : u.username}
                </option>
              ))}
            </select>
          </label>
          <div className="report-filter-actions report-filter-actions-inline">
            <button type="button" className="button secondary" onClick={clearFilters}>{t("common.clear_filter")}</button>
            <button type="submit" className="button primary" disabled={loading}>
              {loading ? t("common.applying") : t("common.apply")}
            </button>
          </div>
        </div>
      </form>

      {error && <StateBox type="error">{error}</StateBox>}
      {notice && <div className={noticeOk ? "success-box" : "error-box"}>{notice}</div>}
      </div>

      <div className="report-scroll">
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th style={{ width: "18%" }}>{t("logs.col.time")}</th>
              <th style={{ width: "16%" }}>{t("logs.col.session")}</th>
              <th style={{ width: "22%" }}>{t("logs.col.officer")}</th>
              <th style={{ width: "32%" }}>{t("logs.sync.result")}</th>
              <th style={{ width: "12%" }}>{t("logs.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const busy = busyRef === log.id;
              const officer = log.officer || {};
              const initials = ((officer.full_name || officer.username || log.actor || "?").trim()[0] || "?").toUpperCase();
              const d = log.data || {};
              return (
                <tr key={log.id}>
                  <td>{formatDateTime(log.at)}</td>
                  <td>
                    {log.session ? (
                      <span className="session-code-chip">
                        <span className={`badge ${log.session.status === "open" ? "badge-open" : "badge-closed"}`}>
                          {log.session.status === "open" ? "●" : "✓"}
                        </span>
                        <span className="mono">{log.session.code}</span>
                      </span>
                    ) : (
                      <span className="mono">{log.ref || "—"}</span>
                    )}
                  </td>
                  <td>
                    <div className="officer-cell">
                      {officer.avatar_url ? (
                        <img className="officer-avatar" src={officer.avatar_url} alt="" />
                      ) : (
                        <span className="officer-avatar officer-avatar-fallback">{initials}</span>
                      )}
                      <div className="officer-name">
                        <strong>{officer.full_name || log.actor}</strong>
                        {officer.full_name ? <small>@{log.actor}</small> : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
                      <span className="status-badge create">{t("logs.sync.added")}: {d.added || 0}</span>
                      <span className="status-badge update">{t("logs.sync.updated")}: {d.updated || 0}</span>
                      <span className="status-badge delete">{t("logs.sync.duplicated")}: {d.duplicated || 0}</span>
                      {Number(d.failed || 0) > 0 && (
                        <span className="status-badge delete">{t("logs.sync.failed")}: {d.failed}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button disabled={busy} onClick={() => onView(log)}>{t("common.view")}</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!logs.length && (
              <tr><td colSpan={5}><div className="empty">{t("common.empty")}</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
      </div>

      {viewing && <DetailModal detainee={viewing} onClose={() => setViewing(null)} />}
      {syncViewing && <SyncLogDetailModal log={syncViewing} onClose={() => setSyncViewing(null)} />}
      {editing && (
        <DetaineeForm
          initial={editing}
          cells={cells}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice(t("logs.notice.updated"));
            setNoticeOk(true);
            load();
          }}
        />
      )}
    </div>
  );
}

function PageHeader({ title, subtitle, children }) {
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

function StateBox({ type = "", children }) {
  return <div className={`state-box ${type}`}>{children}</div>;
}

function DetaineeHistoryPage({ onEdit }) {
  const { t } = useI18n();
  const [logs, setLogs] = useState([]);
  const [counts, setCounts] = useState({ create: 0, update: 0, delete: 0, import: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [q, setQ] = useState("");
  const [viewing, setViewing] = useState(null);
  const [busyRef, setBusyRef] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeOk, setNoticeOk] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const load = async () => {
    setLoading(true);
    try {
      const params = { resource: "detainee" };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (actionFilter) params.action = actionFilter;
      const res = await api.listLogs(params);
      setLogs(res.items || []);
      setCounts(res.counts || { create: 0, update: 0, delete: 0, import: 0 });
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { setPage(1); }, [q, dateFrom, dateTo, actionFilter, logs]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return logs;
    return logs.filter((l) => {
      const officer = l.officer || {};
      return (
        (l.ref || "").toLowerCase().includes(kw) ||
        (l.actor || "").toLowerCase().includes(kw) ||
        (officer.full_name || "").toLowerCase().includes(kw) ||
        (l.session && (l.session.code || "").toLowerCase().includes(kw))
      );
    });
  }, [logs, q]);
  const totalRows = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const pagedLogs = filtered.slice((page - 1) * pageSize, page * pageSize);

  const labels = {
    create: t("history.action.create"),
    update: t("history.action.update"),
    delete: t("history.action.delete"),
    import: t("history.action.import"),
  };

  const resolveDetainee = async (log) => {
    if (log.ref_id) {
      try { return await api.getDetainee(log.ref_id); } catch { /* fallback */ }
    }
    if (log.ref) return await api.getDetaineeByPersonalId(log.ref);
    throw new Error(t("logs.err.no_ref"));
  };

  const onView = async (log) => {
    setBusyRef(log.id);
    setNotice("");
    try {
      const d = await resolveDetainee(log);
      setViewing(d);
    } catch (e) {
      setNotice(t("logs.err.open", { message: e.message }));
      setNoticeOk(false);
    } finally {
      setBusyRef("");
    }
  };

  const onEditLog = async (log) => {
    setBusyRef(log.id);
    setNotice("");
    try {
      const d = await resolveDetainee(log);
      if (onEdit) onEdit(d);
    } catch (e) {
      setNotice(t("logs.err.open", { message: e.message }));
      setNoticeOk(false);
    } finally {
      setBusyRef("");
    }
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setActionFilter("");
    setQ("");
  };

  const isActable = (log) => (log.ref || log.ref_id) && log.action !== "delete";

  return (
    <div className="page report-page">
      <div className="report-fixed">
        <PageHeader
          title={t("history.title")}
          subtitle={t("history.subtitle", { n: filtered.length })}
        >
          <button className="button secondary" onClick={load} disabled={loading}>
            {Icon.refresh}
            {loading ? t("common.loading") : t("common.refresh")}
          </button>
        </PageHeader>

        <div className="report-stat-grid">
          <ReportStat tone="blue" icon={Icon.file} label={t("history.action.create")} value={counts.create || 0} note={t("history.stat.note.create")} />
          <ReportStat tone="orange" icon={Icon.sync} label={t("session.stat.update")} value={counts.update || 0} note={t("logs.stat.note.update")} />
          <ReportStat tone="purple" icon={Icon.log} label={t("session.stat.delete")} value={counts.delete || 0} note={t("logs.stat.note.delete")} />
          <ReportStat tone="green" icon={Icon.cloudUpload} label={t("history.action.import")} value={counts.import || 0} note={t("logs.stat.note.import")} />
        </div>

        <form
          className="report-filter"
          onSubmit={(e) => { e.preventDefault(); load(); }}
        >
          <div className="report-filter-head">
            <span className="report-filter-title">{t("history.filter.title")}</span>
            <span className="report-filter-hint">{t("history.filter.desc")}</span>
          </div>
          <div className="report-filter-grid">
            <label className="report-field">
              <span>{t("common.from")}</span>
              <input className="control" type="datetime-local"
                value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="report-field">
              <span>{t("common.to")}</span>
              <input className="control" type="datetime-local"
                value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <label className="report-field">
              <span>{t("logs.field.action")}</span>
              <select className="control" value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}>
                <option value="">{t("common.all")}</option>
                <option value="create">{t("history.action.create")}</option>
                <option value="update">{t("history.action.update")}</option>
                <option value="delete">{t("history.action.delete")}</option>
                <option value="import">{t("history.action.import")}</option>
              </select>
            </label>
            <label className="report-field">
              <span>{t("common.keyword")}</span>
              <input
                className="control"
                type="text"
                placeholder={t("history.search_ph")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <div className="report-filter-actions report-filter-actions-inline">
              <button type="button" className="button secondary" onClick={clearFilters}>{t("common.clear_filter")}</button>
              <button type="submit" className="button primary" disabled={loading}>
                {loading ? t("common.applying") : t("common.apply")}
              </button>
            </div>
          </div>
        </form>

        {error && <StateBox type="error">{error}</StateBox>}
        {notice && <div className={noticeOk ? "success-box" : "error-box"}>{notice}</div>}
      </div>

      <div className="report-scroll">
        <div className="detainees-table-wrap">
          <table className="detainees-table">
            <thead>
              <tr>
                <th style={{ width: "18%" }}>{t("logs.col.time")}</th>
                <th style={{ width: "14%" }}>{t("logs.col.session")}</th>
                <th style={{ width: "22%" }}>{t("logs.col.officer")}</th>
                <th style={{ width: "14%" }}>{t("logs.col.action")}</th>
                <th style={{ width: "16%" }}>{t("history.col.code")}</th>
                <th style={{ width: "16%" }}>{t("logs.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {pagedLogs.map((log) => {
                const busy = busyRef === log.id;
                const officer = log.officer || {};
                const initials = ((officer.full_name || officer.username || log.actor || "?").trim()[0] || "?").toUpperCase();
                const canAct = isActable(log);
                return (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.at)}</td>
                    <td>
                      {log.session ? (
                        <span className="session-code-chip">
                          <span className={`badge ${log.session.status === "open" ? "badge-open" : "badge-closed"}`}>
                            {log.session.status === "open" ? "●" : "✓"}
                          </span>
                          <span className="mono">{log.session.code}</span>
                        </span>
                      ) : (
                        <span style={{ color: "#98a4b8" }}>—</span>
                      )}
                    </td>
                    <td>
                      <div className="officer-cell">
                        {officer.avatar_url ? (
                          <img className="officer-avatar" src={officer.avatar_url} alt="" />
                        ) : (
                          <span className="officer-avatar officer-avatar-fallback">{initials}</span>
                        )}
                        <div className="officer-name">
                          <strong>{officer.full_name || log.actor}</strong>
                          {officer.full_name ? <small>@{log.actor}</small> : null}
                        </div>
                      </div>
                    </td>
                    <td><span className={`status-badge ${log.action}`}>{labels[log.action] || log.action}</span></td>
                    <td>{log.ref || "—"}</td>
                    <td>
                      {canAct ? (
                        <div className="row-actions">
                          <button disabled={busy} onClick={() => onView(log)}>{t("common.view")}</button>
                          {onEdit && (
                            <button disabled={busy} onClick={() => onEditLog(log)}>{t("history.open_edit")}</button>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "#98a4b8" }}>-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!pagedLogs.length && (
                <tr><td colSpan={6}><div className="empty">{t("common.empty")}</div></td></tr>
              )}
            </tbody>
          </table>
          <div className="session-list-toolbar">
            <div className="session-list-total">{t("common.total", { n: totalRows })}</div>
            <div className="pagination">
              <button disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t("common.prev")}</button>
              <span>{t("common.page_of", { page, total: totalPages })}</span>
              <button disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{t("common.next")}</button>
            </div>
          </div>
        </div>
      </div>

      {viewing && <DetailModal detainee={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function SearchPage() {
  const { t, formatDate } = useI18n();
  const [mode, setMode] = useState("text"); // "text" | "cccd" | "fingerprint"
  const [items, setItems] = useState([]);
  const [cells, setCells] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [cccdNumber, setCccdNumber] = useState("");
  const [fpImageB64, setFpImageB64] = useState("");
  const [fpTemplateB64, setFpTemplateB64] = useState("");
  const [fpScanStatus, setFpScanStatus] = useState("");
  const [fpScanning, setFpScanning] = useState(false);
  const [fpMatchScore, setFpMatchScore] = useState(null);
  const [cellCode, setCellCode] = useState("");
  const [gender, setGender] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    api.listCells().then(setCells).catch(() => { });
  }, []);

  const resetResults = () => {
    setItems([]);
    setTotal(0);
    setSearched(false);
    setError("");
    setFpMatchScore(null);
  };

  const switchMode = (m) => {
    setMode(m);
    resetResults();
    setFpImageB64("");
    setFpTemplateB64("");
    setFpScanStatus("");
  };

  const doSearchText = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (q.trim()) params.set("q", q.trim());
      if (cellCode) params.set("cell_code", cellCode);
      if (gender) params.set("gender", gender);
      const res = await api.request(`/api/detainees?${params}`);
      setItems(res.items || []);
      setTotal(res.total || 0);
      setSearched(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const doSearchCccd = async (e) => {
    if (e) e.preventDefault();
    const num = cccdNumber.trim();
    if (!num) {
      setError(t("search.err.empty_cccd"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ q: num, limit: "50" });
      const res = await api.request(`/api/detainees?${params}`);
      // Ưu tiên match chính xác cccd_number trước, rồi partial
      const list = res.items || [];
      const exact = list.filter((it) => it.cccd_number === num);
      const filtered = exact.length ? exact : list;
      setItems(filtered);
      setTotal(filtered.length);
      setSearched(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const doFpScanAndMatch = async () => {
    if (fpScanning) return;
    setFpScanning(true);
    setError("");
    setFpScanStatus(t("search.status.check_fp"));
    setFpImageB64("");
    setFpTemplateB64("");
    setItems([]);
    setSearched(false);
    setFpMatchScore(null);

    let sid = null;
    try {
      const h = await fpApi.health();
      if (!h.ok) {
        throw new Error(h.error || t("search.status.check_fp"));
      }
      const startResp = await fpApi.startSession("__search_query__");
      sid = startResp.session_id;

      setFpScanStatus(t("search.status.place_any"));
      const capRes = await fpApi.capture(sid);
      const tmplB64 = capRes.finger?.template_b64;
      const imgB64 = capRes.finger?.image_b64;
      if (!tmplB64) throw new Error(t("search.err.no_template"));

      setFpImageB64(imgB64 || "");
      setFpTemplateB64(tmplB64);
      setFpScanStatus(t("search.status.matching"));

      // Cleanup session ngay sau khi có template
      try { await fpApi.cancel(sid); } catch { /* noop */ }
      sid = null;

      setLoading(true);
      const res = await api.matchFingerprint(tmplB64);
      let list = [];
      if (Array.isArray(res.items)) list = res.items;
      else if (res.detainee) list = [res.detainee];
      else if (Array.isArray(res)) list = res;
      setItems(list);
      setTotal(list.length);
      if (typeof res.score === "number") setFpMatchScore(res.score);
      setSearched(true);
      setFpScanStatus(list.length ? t("search.status.matched", { n: list.length }) : t("search.status.no_match"));
    } catch (err) {
      setError(err.message || t("search.err.match_fail"));
      setFpScanStatus("");
    } finally {
      if (sid) {
        try { await fpApi.cancel(sid); } catch { /* noop */ }
      }
      setFpScanning(false);
      setLoading(false);
    }
  };

  const clearFp = () => {
    setFpImageB64("");
    setFpTemplateB64("");
    setFpScanStatus("");
    setFpMatchScore(null);
    resetResults();
  };

  const subtitle = searched
    ? t("search.subtitle.results", { n: total, pct: fpMatchScore != null ? (fpMatchScore * 100).toFixed(1) : "-" })
    : t("search.subtitle.desc");

  return (
    <div className="page">
      <PageHeader title={t("search.title")} subtitle={subtitle} />

      <div className="search-tabs" role="tablist" aria-label={t("search.tab.aria")}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "text"}
          className={"search-tab " + (mode === "text" ? "active" : "")}
          onClick={() => switchMode("text")}
        >
          {t("search.tab.text")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "cccd"}
          className={"search-tab " + (mode === "cccd" ? "active" : "")}
          onClick={() => switchMode("cccd")}
        >
          {t("search.tab.cccd")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "fingerprint"}
          className={"search-tab " + (mode === "fingerprint" ? "active" : "")}
          onClick={() => switchMode("fingerprint")}
        >
          {t("search.tab.fp")}
        </button>
      </div>

      {mode === "text" && (
        <form className="filter-bar" onSubmit={doSearchText}>
          <input
            className="control search-control"
            placeholder={t("search.ph.text")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="control" value={cellCode} onChange={(e) => setCellCode(e.target.value)}>
            <option value="">{t("search.cell.all")}</option>
            {cells.map((cell) => (
              <option key={cell.code} value={cell.code}>
                {cell.code} - {cell.name}
              </option>
            ))}
          </select>
          <select className="control" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">{t("search.gender.all")}</option>
            <option value="male">{t("search.gender.male")}</option>
            <option value="female">{t("search.gender.female")}</option>
          </select>
          <button className="button primary" type="submit" disabled={loading}>
            {loading ? t("search.searching") : t("search.submit")}
          </button>
        </form>
      )}

      {mode === "cccd" && (
        <form className="filter-bar" onSubmit={doSearchCccd}>
          <input
            className="control search-control"
            placeholder={t("search.cccd_ph")}
            value={cccdNumber}
            onChange={(e) => setCccdNumber(e.target.value.replace(/\D/g, "").slice(0, 12))}
            inputMode="numeric"
            maxLength={12}
            autoFocus
          />
          <button className="button primary" type="submit" disabled={loading || cccdNumber.length < 6}>
            {loading ? t("search.searching") : t("search.by_cccd")}
          </button>
        </form>
      )}

      {mode === "fingerprint" && (
        <div className="filter-bar filter-bar-fp">
          <div className="fp-search-slot">
            {fpImageB64 ? (
              <div className="fp-search-preview">
                <img src={`data:image/png;base64,${fpImageB64}`} alt={t("search.fp.alt")} />
                <button
                  type="button"
                  className="fp-search-clear"
                  onClick={clearFp}
                  disabled={fpScanning}
                  aria-label={t("search.fp.aria_delete")}
                >×</button>
              </div>
            ) : (
              <div className="fp-search-drop fp-search-drop--live" role="status" aria-live="polite">
                <span className="fp-search-drop-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 11c0-4 3-7 7-7" />
                    <path d="M5 4c4 0 7 3 7 7v6a3 3 0 0 0 3 3" />
                    <path d="M8 11a4 4 0 0 1 8 0v5a2 2 0 0 0 2 2" />
                    <path d="M12 15v1a3 3 0 0 0 3 3" />
                  </svg>
                </span>
                <span>{fpScanStatus || t("search.fp.hint_click")}</span>
                <span className="fp-search-drop-hint">
                  {fpScanning ? t("search.fp.waiting") : t("search.fp.hint_place")}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="button primary"
            onClick={doFpScanAndMatch}
            disabled={fpScanning || loading}
          >
            {fpScanning ? t("search.scanning") : (fpTemplateB64 ? t("search.rescan") : t("search.start_scan"))}
          </button>
        </div>
      )}

      {error && <StateBox type="error">{error}</StateBox>}

      <div className="table-card">
        {!searched ? (
          <StateBox>{t("search.hint_empty")}</StateBox>
        ) : loading ? (
          <StateBox>{t("common.loading")}</StateBox>
        ) : !items.length ? (
          <StateBox>{t("search.empty")}</StateBox>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("search.col.photo")}</th>
                <th>{t("search.col.code")}</th>
                <th>{t("search.col.name")}</th>
                <th>{t("search.col.gender")}</th>
                <th>{t("search.col.dob")}</th>
                <th>{t("search.col.cccd")}</th>
                <th>{t("search.col.cell")}</th>
                <th>{t("search.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="table-avatar">
                      {item.photo_url ? <img src={item.photo_url} alt="" /> : (item.full_name || "?").slice(0, 1).toUpperCase()}
                    </div>
                  </td>
                  <td><strong>{item.personal_id || item.code}</strong></td>
                  <td>{item.full_name}</td>
                  <td>{item.gender === "female" ? t("common.female") : t("common.male")}</td>
                  <td>{item.dob ? formatDate(item.dob) : "-"}</td>
                  <td>{item.cccd_number || "-"}</td>
                  <td>{item.cell_code || "-"}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => setViewing(item)}>{t("common.view")}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {viewing && <DetailModal detainee={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function UsersPage({ currentUser }) {
  const { t } = useI18n();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeOk, setNoticeOk] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await api.listUsers());
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onDelete = async (u) => {
    if (!window.confirm(t("users.confirm_delete", { u: u.username }))) return;
    try {
      await api.deleteUser(u.id);
      setNotice(t("users.deleted", { u: u.username }));
      setNoticeOk(true);
      load();
    } catch (e) {
      setNotice(t("common.error_prefix", { message: e.message }));
      setNoticeOk(false);
    }
  };

  const onUploadAvatar = async (u, file) => {
    if (!file) return;
    try {
      await api.uploadUserAvatar(u.id, file);
      setNotice(t("users.avatar_updated", { u: u.username }));
      setNoticeOk(true);
      load();
    } catch (e) {
      setNotice(t("common.error_prefix", { message: e.message }));
      setNoticeOk(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title={t("users.title")} subtitle={t("users.subtitle", { n: users.length })}>
        <button className="button primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          {Icon.plus}
          {t("users.add")}
        </button>
      </PageHeader>

      {error && <StateBox type="error">{error}</StateBox>}
      {notice && <div className={noticeOk ? "success-box" : "error-box"}>{notice}</div>}

      <div className="table-card">
        {loading ? <StateBox>{t("common.loading")}</StateBox> : (
          <table>
            <thead>
              <tr>
                <th>{t("users.col.photo")}</th>
                <th>{t("users.col.username")}</th>
                <th>{t("users.col.full_name")}</th>
                <th>{t("users.col.role")}</th>
                <th>{t("users.col.created")}</th>
                <th>{t("users.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const initials = ((u.full_name || u.username || "?").trim()[0] || "?").toUpperCase();
                return (
                <tr key={u.id}>
                  <td>
                    <div className="users-avatar-cell">
                      {u.avatar_url ? (
                        <img className="officer-avatar" src={u.avatar_url} alt="" />
                      ) : (
                        <span className="officer-avatar officer-avatar-fallback">{initials}</span>
                      )}
                      <label className="avatar-upload-btn" title={t("users.avatar_title")}>
                        {t("users.change")}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => onUploadAvatar(u, e.target.files?.[0])}
                        />
                      </label>
                    </div>
                  </td>
                  <td><strong>{u.username}</strong></td>
                  <td>{u.full_name || "-"}</td>
                  <td>
                    <span className={`status-badge ${u.role === "admin" ? "delete" : "create"}`}>
                      {u.role === "admin" ? t("common.role.admin") : t("common.role.officer")}
                    </span>
                  </td>
                  <td>{u.created_at ? formatDateTime(u.created_at) : "-"}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => { setEditing(u); setShowForm(true); }}>{t("common.edit")}</button>
                      <button
                        className="danger-text"
                        disabled={u.username === "admin" || u.username === currentUser}
                        onClick={() => onDelete(u)}
                        title={u.username === "admin" ? t("users.cannot_delete_admin") : u.username === currentUser ? t("users.cannot_delete_self") : ""}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {!users.length && (
                <tr><td colSpan={6}><div className="empty">{t("users.empty")}</div></td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <UserForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={(msg) => {
            setShowForm(false); setEditing(null);
            setNotice(msg || t("users.saved"));
            setNoticeOk(true);
            load();
          }}
        />
      )}
    </div>
  );
}

function UserForm({ initial, onClose, onSaved }) {
  const { t } = useI18n();
  const isEdit = Boolean(initial);
  const [username, setUsername] = useState(initial?.username || "");
  const [fullName, setFullName] = useState(initial?.full_name || "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) { setError(t("userform.err.name_required")); return; }
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        const body = { full_name: fullName.trim() };
        if (password) body.password = password;
        await api.updateUser(initial.id, body);
        onSaved(t("userform.updated", { u: initial.username }));
      } else {
        await api.createUser({
          username: username.trim(),
          password,
          role: "user",
          full_name: fullName.trim(),
        });
        onSaved(t("userform.created", { u: username }));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? t("userform.title.edit", { u: initial.username }) : t("userform.title.new")}</h3>
          <button onClick={onClose}>×</button>
        </div>
        <form className="form" onSubmit={submit}>
          {error && <div className="error-box">{error}</div>}
          <FieldRow label={t("userform.field.username")}>
            <input
              className="control"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isEdit}
              required
              minLength={3}
              maxLength={40}
              pattern="[a-zA-Z0-9_.\-]+"
            />
          </FieldRow>
          <FieldRow label={t("userform.field.full_name")}>
            <input className="control" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} required />
          </FieldRow>
          <FieldRow label={isEdit ? t("userform.field.pw_change") : t("userform.field.pw")}>
            <input
              className="control"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!isEdit}
              minLength={isEdit ? 0 : 6}
              maxLength={100}
            />
          </FieldRow>
          <FieldRow label={t("userform.field.role")}>
            <input
              className="control"
              value={isEdit ? (initial.role === "admin" ? t("userform.role.admin") : t("userform.role.user")) : t("userform.role.user")}
              disabled
              readOnly
            />
          </FieldRow>
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose}>{t("common.cancel")}</button>
            <button type="submit" className="button primary" disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function FieldRow({ label, children }) {
  return (
    <label className="field-row">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SyncLogDetailModal({ log, onClose }) {
  const { t, formatDateTime } = useI18n();
  const d = log?.data || {};
  const officer = log?.officer || {};
  const items = {
    added: Array.isArray(d.added_items) ? d.added_items : [],
    updated: Array.isArray(d.updated_items) ? d.updated_items : [],
    duplicated: Array.isArray(d.duplicate_items) ? d.duplicate_items : [],
    failed: Array.isArray(d.failed_items) ? d.failed_items : [],
  };
  const counts = {
    added: Number(d.added || 0),
    updated: Number(d.updated || 0),
    duplicated: Number(d.duplicated || 0),
    failed: Number(d.failed || 0),
  };

  const List = ({ title, tone, list }) => (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span
          className={`status-badge ${tone}`}
          style={{ minWidth: 26, textAlign: "center" }}
        >{list.length}</span>
        <strong style={{ fontSize: 13 }}>{title}</strong>
      </div>
      {list.length === 0 ? (
        <div style={{ color: "#98a4b8", fontSize: 12, paddingLeft: 8 }}>—</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
          {list.map((x, i) => (
            <li key={i}>
              <span className="mono">{x.code || "—"}</span>
              {x.full_name ? <> · {x.full_name}</> : null}
              {x.cccd_number ? <> · CCCD {x.cccd_number}</> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h3>{t("logs.sync.title")}</h3>
          <button onClick={onClose}>×</button>
        </div>
        <div className="form" style={{ paddingTop: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontSize: 13 }}>
            <div>
              <div style={{ color: "#5b6b85", fontSize: 12 }}>{t("logs.col.time")}</div>
              <div>{formatDateTime(log.at)}</div>
            </div>
            <div>
              <div style={{ color: "#5b6b85", fontSize: 12 }}>{t("logs.col.officer")}</div>
              <div><strong>{officer.full_name || log.actor}</strong> {officer.full_name ? <small style={{ color: "#98a4b8" }}>@{log.actor}</small> : null}</div>
            </div>
            <div>
              <div style={{ color: "#5b6b85", fontSize: 12 }}>{t("logs.col.session")}</div>
              <div className="mono">{log.session?.code || log.ref || "—"}</div>
            </div>
          </div>

          <div style={{
            marginTop: 14,
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10,
          }}>
            <div className="report-stat blue" style={{ padding: 12 }}>
              <div className="report-stat-body">
                <span className="report-stat-label">{t("logs.sync.added")}</span>
                <strong className="report-stat-value">{counts.added}</strong>
              </div>
            </div>
            <div className="report-stat orange" style={{ padding: 12 }}>
              <div className="report-stat-body">
                <span className="report-stat-label">{t("logs.sync.updated")}</span>
                <strong className="report-stat-value">{counts.updated}</strong>
              </div>
            </div>
            <div className="report-stat purple" style={{ padding: 12 }}>
              <div className="report-stat-body">
                <span className="report-stat-label">{t("logs.sync.duplicated")}</span>
                <strong className="report-stat-value">{counts.duplicated}</strong>
              </div>
            </div>
            <div className="report-stat green" style={{ padding: 12 }}>
              <div className="report-stat-body">
                <span className="report-stat-label">{t("logs.sync.failed")}</span>
                <strong className="report-stat-value">{counts.failed}</strong>
              </div>
            </div>
          </div>

          {d.error && (
            <div className="error-box" style={{ marginTop: 12 }}>
              {t("logs.sync.error_prefix")} {d.error}
            </div>
          )}

          <List title={t("logs.sync.added_list")} tone="create" list={items.added} />
          <List title={t("logs.sync.updated_list")} tone="update" list={items.updated} />
          <List title={t("logs.sync.duplicated_list")} tone="delete" list={items.duplicated} />
          {items.failed.length > 0 && (
            <List title={t("logs.sync.failed_list")} tone="delete" list={items.failed} />
          )}

          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button type="button" className="button primary" onClick={onClose}>{t("common.close")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileEditModal({ username, fullName, onClose, onSaved }) {
  const { t } = useI18n();
  const [name, setName] = useState(fullName || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPwFields, setShowPwFields] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const trimmed = name.trim();
    if (!trimmed) { setError(t("profile.err.name_required")); return; }
    const nameChanged = trimmed !== (fullName || "").trim();
    const wantsPw = showPwFields && (password || password2);
    if (!nameChanged && !wantsPw) {
      onClose();
      return;
    }
    if (!currentPassword) { setError(t("profile.err.current_required")); return; }
    if (wantsPw) {
      if (password.length < 6) { setError(t("profile.err.password_short")); return; }
      if (password !== password2) { setError(t("profile.err.password_mismatch")); return; }
    }
    setSaving(true);
    try {
      const body = { current_password: currentPassword };
      if (nameChanged) body.full_name = trimmed;
      if (wantsPw) body.password = password;
      const res = await api.updateMe(body);
      onSaved(res.full_name ?? trimmed);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t("profile.title")}</h3>
          <button onClick={onClose}>×</button>
        </div>
        <form className="form" onSubmit={submit}>
          {error && <div className="error-box">{error}</div>}
          <FieldRow label={t("profile.field.username")}>
            <input className="control" value={username} disabled readOnly />
          </FieldRow>
          <FieldRow label={t("profile.field.full_name")}>
            <input
              className="control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              autoFocus
            />
          </FieldRow>
          <FieldRow label={t("profile.field.current_password")}>
            <input
              className="control"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              maxLength={100}
              placeholder={t("profile.current_password_ph")}
              required
            />
          </FieldRow>
          {!showPwFields ? (
            <div style={{ margin: "4px 0 8px" }}>
              <button
                type="button"
                onClick={() => setShowPwFields(true)}
                style={{
                  background: "none", border: "none", padding: 0,
                  color: "#2563eb", cursor: "pointer", fontSize: 13, textDecoration: "underline",
                }}
              >
                {t("profile.change_password_toggle")}
              </button>
            </div>
          ) : (
            <>
              <FieldRow label={t("profile.field.new_password")}>
                <input
                  className="control"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  maxLength={100}
                />
              </FieldRow>
              <FieldRow label={t("profile.field.confirm_password")}>
                <input
                  className="control"
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  autoComplete="new-password"
                  maxLength={100}
                />
              </FieldRow>
            </>
          )}
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose}>{t("common.cancel")}</button>
            <button type="submit" className="button primary" disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = `
  :root {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #0f2344;
    background: #f5f8fd;
    font-synthesis: none;
  }

  * { box-sizing: border-box; }
  body { margin: 0; background: #f5f8fd; }
  button, input, select { font: inherit; }
  button { cursor: pointer; }
  svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .app {
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    grid-template-rows: 55px minmax(0, 1fr);
    background:
      radial-gradient(circle at 75% 10%, rgba(50, 107, 230, .08), transparent 28%),
      #f5f8fd;
  }

  .header {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    color: white;
    background:
      radial-gradient(circle at 45% -140%, rgba(41, 118, 242, .85), transparent 54%),
      linear-gradient(120deg, #0d4dc0 0%, #062a69 100%);
    box-shadow: 0 8px 28px rgba(16, 47, 103, .18);
    z-index: 5;
  }

  .brand, .header-actions, .user-box, .server-status, .logout-button {
    display: flex;
    align-items: center;
  }

  .brand { gap: 14px; }
  .brand-logo {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    overflow: hidden;
    background: transparent;
    flex-shrink: 0;
  }
  .brand-logo img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    filter: drop-shadow(0 2px 6px rgba(0,0,0,.25));
  }

  .brand-title {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: .1px;
  }

  .brand-subtitle {
    margin-top: 5px;
    font-size: 14px;
    color: #d9e8ff;
  }

  .header-actions { gap: 14px; }
  .server-status {
    gap: 9px;
    height: 44px;
    padding: 0 16px;
    border: 1px solid rgba(255,255,255,.18);
    border-radius: 14px;
    background: rgba(2, 28, 79, .28);
    font-size: 14px;
    font-weight: 700;
  }

  .server-status > span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #24d777;
    box-shadow: 0 0 0 5px rgba(36,215,119,.12);
  }

  .server-status.offline > span { background: #ff6b6b; }

  .device-chips {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    height: 44px;
    border: 1px solid rgba(255,255,255,.18);
    border-radius: 14px;
    background: rgba(2, 28, 79, .28);
  }

  .device-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255,255,255,.08);
    font-size: 12.5px;
    font-weight: 600;
    color: #eaf1ff;
    line-height: 1;
  }

  .device-chip-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ff6b6b;
    box-shadow: 0 0 0 3px rgba(255,107,107,.18);
  }

  .device-chip.online .device-chip-dot {
    background: #24d777;
    box-shadow: 0 0 0 3px rgba(36,215,119,.20);
  }

  .device-chip-label { white-space: nowrap; }

  /* Language switch — dark header override (Globe + full names) */
  .header-actions .lang-switch {
    height: 44px;
    padding: 4px 8px 4px 12px;
    border-radius: 14px;
    background: rgba(2, 28, 79, .28);
    border: 1px solid rgba(255,255,255,.18);
    box-shadow: none;
    color: #d9e8ff;
  }
  .header-actions .lang-switch-globe {
    color: #cfe0ff;
    width: 18px;
    height: 18px;
    margin-right: 8px;
  }
  .header-actions .lang-switch-sep {
    color: rgba(255,255,255,.32);
  }
  .header-actions .lang-switch button {
    height: 36px;
    padding: 0 12px;
    color: #d9e8ff;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: .3px;
    border-radius: 10px;
    gap: 6px;
  }
  .header-actions .lang-switch button:hover {
    color: #ffffff;
    background: rgba(255,255,255,.08);
  }
  .header-actions .lang-switch button.active {
    background: #ffffff;
    color: #0d2b6b;
    box-shadow: 0 1px 2px rgba(0,0,0,.25);
  }
  .header-actions .lang-switch button:focus-visible {
    outline: 2px solid #ffd166;
    outline-offset: 2px;
  }
  /* Hide long labels on narrower header widths, fall back to flag+short */
  @media (max-width: 1180px) {
    .header-actions .lang-switch .lang-switch-label { display: none; }
    .header-actions .lang-switch .lang-switch-short { display: inline; }
    .header-actions .lang-switch button { padding: 0 10px; }
  }

  .notif-wrap { position: relative; }

  .notif-panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 340px;
    max-height: 420px;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(15, 25, 50, .28);
    border: 1px solid #e6ecf5;
    display: flex;
    flex-direction: column;
    z-index: 60;
    color: #0f1a32;
    overflow: hidden;
  }

  .notif-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #eef2f8;
    font-size: 14px;
  }

  .notif-clear {
    background: transparent;
    border: 0;
    color: #b91c26;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 6px;
  }
  .notif-clear:hover { background: #fdecec; }

  .notif-panel-list {
    overflow-y: auto;
    flex: 1;
  }

  .notif-empty {
    padding: 28px 16px;
    text-align: center;
    color: #6b7a95;
    font-size: 13px;
  }

  .notif-item {
    display: flex;
    gap: 10px;
    padding: 10px 16px;
    border-bottom: 1px solid #f2f5fa;
    align-items: flex-start;
  }
  .notif-item:last-child { border-bottom: 0; }

  .notif-item-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #12af64;
    margin-top: 6px;
    flex-shrink: 0;
  }

  .notif-item-body { flex: 1; min-width: 0; }

  .notif-item-msg {
    font-size: 13.5px;
    color: #0f1a32;
    line-height: 1.4;
    word-break: break-word;
  }

  .notif-item-time {
    font-size: 11.5px;
    color: #6b7a95;
    margin-top: 2px;
  }

  .notif-item-match { cursor: pointer; }
  .notif-item-match:hover { background: #fef6f6; }
  .notif-item-dot-alert { background: #B91C1C; }
  .notif-item-cta {
    margin-top: 4px;
    font-size: 12px;
    font-weight: 700;
    color: #B91C1C;
  }

  .icon-button {
    position: relative;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 13px;
    color: white;
    background: rgba(255,255,255,.08);
  }

  .icon-button b {
    position: absolute;
    top: -4px;
    right: -2px;
    min-width: 19px;
    height: 19px;
    display: grid;
    place-items: center;
    padding: 0 5px;
    border-radius: 10px;
    background: #ef4444;
    color: white;
    font-size: 11px;
  }

  .user-box { gap: 10px; }
  .avatar {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: linear-gradient(145deg, #4c85e9, #2c5fb7);
    color: #fff;
    font-size: 18px;
    font-weight: 800;
  }

  .user-info { display: flex; flex-direction: column; min-width: 100px; }
  .user-info strong { font-size: 15px; color: #fff; }
  .user-info span { color: #ccdefd; font-size: 12px; margin-top: 3px; }

  .logout-button {
    gap: 8px;
    height: 44px;
    padding: 0 16px;
    border: 1px solid rgba(255,255,255,.2);
    border-radius: 12px;
    color: white;
    background: rgba(255,255,255,.08);
    font-weight: 700;
  }
  .logout-button:hover { background: rgba(255,255,255,.15); }

  .sidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 5px 5px 5px;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% -30%, rgba(60, 130, 255, .18), transparent 55%),
      linear-gradient(180deg, #0c1f47 0%, #061436 100%);
    border-right: 1px solid rgba(255, 255, 255, .04);
    color: #cbd7ec;
  }

  .sidebar-title {
    padding: 0 6px 12px;
    color: rgba(203, 215, 236, .55);
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }

  .nav {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .nav-item {
    width: 100%;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 12px;
    border: 1px solid rgba(255, 255, 255, .06);
    border-radius: 12px;
    background: rgba(255, 255, 255, .03);
    color: #c9d5eb;
    text-align: left;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.25;
    transition: .18s ease;
  }
  .nav-item:hover {
    color: white;
    background: rgba(46, 111, 236, .18);
    border-color: rgba(120, 170, 255, .35);
    transform: translateX(2px);
  }
  .nav-item.active {
    color: white;
    background: linear-gradient(135deg, #1e6cf1 0%, #0c50d0 100%);
    border-color: rgba(120, 170, 255, .5);
    box-shadow:
      0 8px 18px rgba(6, 55, 158, .45),
      inset 0 1px 0 rgba(255, 255, 255, .18);
  }

  .nav-icon {
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: rgba(255, 255, 255, .06);
    color: #7fa6ff;
    transition: .18s ease;
  }
  .nav-icon svg { width: 18px; height: 18px; }
  .nav-item:hover .nav-icon { background: rgba(120, 170, 255, .16); color: white; }
  .nav-item.active .nav-icon {
    background: rgba(255, 255, 255, .18);
    color: white;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .18);
  }

  .security-card {
    margin-top: auto;
    display: flex;
    gap: 12px;
    padding: 14px;
    border: 1px solid rgba(120, 170, 255, .18);
    border-radius: 14px;
    background: linear-gradient(145deg, rgba(30, 108, 241, .22), rgba(12, 80, 208, .10));
    color: #dbe7ff;
  }
  .security-card strong { display: block; margin-bottom: 4px; color: white; font-size: 12.5px; }
  .security-card p { margin: 0; color: rgba(219, 231, 255, .72); font-size: 11px; line-height: 1.5; }
  .security-icon {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: white;
    background: rgba(120, 170, 255, .22);
  }
  .security-icon svg { width: 18px; height: 18px; }

  .content {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 6px 6px;
  }

  .page {
    max-width: 1700px;
    margin: 0 auto;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .page-title {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 0;
    flex-shrink: 0;
  }
  .page-title-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    color: white;
    background: linear-gradient(145deg, #1a68e8, #0e4ebc);
    box-shadow: 0 6px 14px rgba(11, 80, 192, .2);
  }
  .page-title-icon svg { width: 18px; height: 18px; }
  .page-title h1, .page-header h1 {
    margin: 0;
    color: #102441;
    font-size: 22px;
    letter-spacing: -.4px;
  }
  .page-title p, .page-header p {
    margin: 4px 0 0;
    color: #70809a;
    font-size: 13px;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    flex-shrink: 0;
  }

  .stat-card {
    min-height: 96px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border: 1px solid #e4eaf4;
    border-left: 3px solid var(--accent);
    border-radius: 14px;
    background: white;
    box-shadow: 0 4px 14px rgba(18, 52, 97, .05);
  }
  .stat-card.blue { --accent: #2371f4; --soft: #eaf2ff; }
  .stat-card.green { --accent: #12af64; --soft: #e8f9f0; }
  .stat-card.orange { --accent: #ff6b21; --soft: #fff0e7; }
  .stat-card.purple { --accent: #7745db; --soft: #f1ebff; }

  .stat-icon {
    width: 52px;
    height: 52px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--accent);
    background: var(--soft);
  }

  .stat-content {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .stat-content > span {
    color: #6a7891;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .stat-content strong {
    margin-top: 4px;
    color: #071a37;
    font-size: 24px;
    line-height: 1;
  }
  .stat-content small {
    margin-top: 5px;
    color: #75839a;
    font-size: 12px;
  }

  .sparkline {
    margin-left: auto;
    align-self: flex-end;
    color: var(--accent);
    font-size: 38px;
    font-weight: 800;
    transform: rotate(-8deg);
  }

  .stat-ring {
    width: 58px;
    height: 58px;
    margin-left: auto;
    display: grid;
    place-items: center;
    border-radius: 50%;
  }
  .stat-ring span {
    width: 43px;
    height: 43px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: white;
    color: #1d5ccb;
    font-size: 12px;
    font-weight: 800;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: 1.05fr .95fr;
    gap: 14px;
    margin-top: 0;
    flex: 1 1 auto;
    min-height: 0;
  }

  .panel, .table-card, .feature-card, .system-strip {
    border: 1px solid #e2e9f3;
    border-radius: 14px;
    background: white;
    box-shadow: 0 4px 14px rgba(18, 52, 97, .05);
  }

  .panel {
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .panel-header {
    height: 52px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
    border-bottom: 1px solid #e9eef6;
  }
  .panel-header h3 {
    margin: 0;
    color: #102441;
    font-size: 17px;
  }
  .panel-header button {
    display: flex;
    align-items: center;
    gap: 3px;
    border: 0;
    color: #075bea;
    background: transparent;
    font-weight: 700;
  }
  .panel-header button svg { width: 16px; height: 16px; }

  .cell-list {
    padding: 6px 18px 12px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .cell-row {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) 44px;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid #f0f3f8;
  }
  .cell-row:last-child { border-bottom: 0; }
  .cell-symbol {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 10px;
  }
  .cell-symbol svg { width: 16px; height: 16px; }
  .cell-symbol-0 { color: #1267e8; background: #e9f2ff; }
  .cell-symbol-1 { color: #08a860; background: #e8f9f0; }
  .cell-symbol-2 { color: #f26a21; background: #fff0e7; }
  .cell-symbol-3 { color: #7649d6; background: #f1ebff; }

  .cell-line {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 9px;
    color: #2e405a;
    font-size: 14px;
  }
  .cell-line strong { color: #0a1d39; }
  .cell-number {
    padding: 4px 9px;
    border-radius: 8px;
    color: #079452;
    background: #dcf8e9;
    font-size: 12px;
    font-weight: 800;
  }
  .progress, .mini-progress {
    height: 8px;
    overflow: hidden;
    border-radius: 999px;
    background: #e8eef6;
  }
  .progress span, .mini-progress span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #11b865, #2ad57e);
  }
  .cell-percent { color: #6a7890; font-size: 13px; font-weight: 700; }

  .recent-list {
    padding: 4px 18px 12px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .recent-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid #edf1f6;
  }
  .recent-item:last-child { border-bottom: 0; }
  .recent-avatar, .table-avatar {
    overflow: hidden;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #0c61e4;
    background: #e5efff;
    font-weight: 800;
  }
  .recent-avatar { width: 40px; height: 40px; flex: 0 0 auto; font-size: 14px; }
  .recent-avatar img, .table-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .recent-content { min-width: 0; display: flex; flex: 1; flex-direction: column; }
  .recent-content strong { color: #102441; font-size: 13.5px; }
  .recent-content span { margin-top: 3px; color: #6f7f98; font-size: 12px; }
  .recent-time { align-self: flex-start; margin-top: 3px; color: #58708f; font-size: 11px; }

  /* ============ DASHBOARD MỚI ============ */
  .dash-hero {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 20px;
    padding: 18px 22px;
    margin-bottom: 4px;
    border-radius: 16px;
    background:
      radial-gradient(circle at 90% 20%, rgba(35, 113, 244, .10), transparent 45%),
      linear-gradient(135deg, #ffffff 0%, #f4f8ff 100%);
    border: 1px solid #e4ecf7;
    box-shadow: 0 6px 20px rgba(23, 55, 111, .05);
  }
  .dash-hero h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    color: #0f2344;
    letter-spacing: -.2px;
  }
  .dash-hero > div > p {
    margin: 4px 0 0;
    color: #5c6e88;
    font-size: 13.5px;
    font-weight: 500;
  }
  .dash-hero-session {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 12px 10px 16px;
    border-radius: 12px;
    background: white;
    border: 1px solid #dfe7f3;
    box-shadow: 0 3px 10px rgba(23, 55, 111, .04);
  }
  .dash-hero-session-empty {
    background: #fff9f0;
    border-color: #f5d9a8;
  }
  .dash-hero-session-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding-right: 6px;
  }
  .dash-hero-session-info strong { color: #0f2344; font-size: 15px; }
  .dash-hero-session-info small { color: #6a7c95; font-size: 12px; }
  .dash-hero-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 999px;
    background: #e6f7ec;
    color: #0a8a45;
    font-size: 11.5px;
    font-weight: 800;
    letter-spacing: .3px;
    width: fit-content;
  }
  .dash-hero-badge-idle {
    background: #fff2d9;
    color: #a26a09;
  }

  /* StatCard mở rộng */
  .stat-card.clickable { cursor: pointer; }
  .stat-card.clickable:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 24px rgba(23, 55, 111, .10);
    transition: all .18s ease;
  }
  .stat-card.alert {
    border-left-color: #ef4444;
    background: linear-gradient(180deg, #fff, #fff5f5);
  }
  .stat-card .stat-extra {
    grid-column: 1 / -1;
    margin-top: 6px;
  }
  .sparkline-svg { width: 100%; height: 28px; display: block; }

  /* Bar chart 14 ngày */
  .bar-chart { padding: 12px 20px 20px; }
  .bar-chart-body {
    display: grid;
    grid-template-columns: repeat(14, 1fr);
    align-items: end;
    gap: 6px;
    height: 220px;
    padding-top: 22px;
    padding-bottom: 22px;
    border-bottom: 1px solid #eef2f8;
  }
  .bar-col {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    height: 100%;
    cursor: default;
  }
  .bar-fill {
    width: 100%;
    max-width: 32px;
    border-radius: 6px 6px 0 0;
    background: linear-gradient(180deg, #4a95ff 0%, #2371f4 100%);
    transition: opacity .2s;
  }
  .bar-col:hover .bar-fill { opacity: .85; }
  .bar-count {
    position: absolute;
    top: -18px;
    font-size: 11px;
    font-weight: 700;
    color: #47597a;
  }
  .bar-label {
    margin-top: 6px;
    font-size: 11px;
    color: #7d8ca7;
    font-weight: 600;
  }

  /* Donut giới tính */
  .panel-donut .bar-chart { padding: 0; }
  .donut-wrap {
    display: grid;
    grid-template-columns: 180px 1fr;
    align-items: center;
    gap: 24px;
    padding: 18px 22px 22px;
  }
  .donut {
    width: 180px;
    height: 180px;
    max-width: 100%;
    display: block;
    margin: 0 auto;
    overflow: visible;
  }
  .donut-value {
    font-size: 24px;
    font-weight: 800;
    fill: #0f2344;
  }
  .donut-label {
    font-size: 11px;
    fill: #7787a0;
    text-transform: uppercase;
    letter-spacing: .6px;
  }
  .donut-legend {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .donut-legend-row {
    display: grid;
    grid-template-columns: 14px 1fr auto auto;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    background: #f6f9fd;
    color: #47597a;
    font-size: 13px;
    font-weight: 600;
  }
  .donut-legend-row strong { color: #0f2344; font-size: 15px; font-weight: 800; }
  .donut-legend-row small { color: #7787a0; font-size: 12px; font-weight: 700; }
  .donut-dot { width: 12px; height: 12px; border-radius: 50%; display: block; }

  /* Horizontal bar list */
  .hbar-list {
    padding: 8px 20px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .hbar-row {
    display: grid;
    grid-template-columns: 150px 1fr 44px;
    align-items: center;
    gap: 12px;
  }
  .hbar-label {
    color: #47597a;
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hbar-track {
    height: 10px;
    border-radius: 999px;
    background: #eef2f8;
    overflow: hidden;
    display: block;
  }
  .hbar-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: #2371f4;
    transition: width .35s ease;
  }
  .hbar-value {
    color: #0f2344;
    font-size: 14px;
    font-weight: 800;
    text-align: right;
  }

  /* Officer list */
  .officer-list {
    padding: 8px 20px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .officer-row {
    display: grid;
    grid-template-columns: 22px 36px 1fr;
    align-items: center;
    gap: 12px;
  }
  .officer-rank {
    color: #98a5bd;
    font-size: 13px;
    font-weight: 800;
    text-align: center;
  }
  .officer-row .officer-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: #eef2f8;
    color: #47597a;
    font-weight: 800;
    font-size: 13px;
  }
  .officer-row .officer-avatar-fallback {
    background: linear-gradient(145deg, #7b5fe0, #5f42c8);
    color: white;
  }
  .officer-row .officer-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .officer-main { min-width: 0; }
  .officer-name-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 5px;
  }
  .officer-name-row strong {
    color: #0f2344;
    font-size: 13.5px;
    font-weight: 700;
  }
  .officer-count {
    color: #7745db;
    font-size: 14px;
    font-weight: 800;
  }

  /* Session list */
  .session-list {
    padding: 6px 6px 12px;
    display: flex;
    flex-direction: column;
  }
  .session-row {
    display: grid;
    grid-template-columns: 12px 1fr auto;
    align-items: center;
    gap: 14px;
    padding: 12px 18px;
    border-radius: 10px;
  }
  .session-row:hover { background: #f5f8fd; }
  .session-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: block;
  }
  .session-dot.open {
    background: #12af64;
    box-shadow: 0 0 0 4px rgba(18, 175, 100, .18);
  }
  .session-dot.closed {
    background: #98a5bd;
  }
  .session-main { min-width: 0; }
  .session-line {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .session-line strong { color: #0f2344; font-size: 14px; }
  .session-line small { color: #6a7c95; font-size: 12px; }
  .session-meta {
    margin-top: 3px;
    color: #7d8ca7;
    font-size: 12px;
  }
  .session-status {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 800;
    letter-spacing: .3px;
  }
  .session-status.open { background: #e6f7ec; color: #0a8a45; }
  .session-status.closed { background: #eef2f8; color: #6a7c95; }

  /* Activity feed */
  .activity-feed {
    padding: 6px 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .activity-row {
    display: grid;
    grid-template-columns: 12px 1fr;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px dashed #eef2f8;
  }
  .activity-row:last-child { border-bottom: 0; }
  .activity-dot {
    width: 8px;
    height: 8px;
    margin-top: 6px;
    border-radius: 50%;
    background: #2371f4;
  }
  .activity-dot.create { background: #12af64; }
  .activity-dot.update { background: #ff9820; }
  .activity-dot.delete { background: #ef4444; }
  .activity-dot.import { background: #7745db; }
  .activity-dot.login  { background: #2371f4; }
  .activity-line {
    color: #47597a;
    font-size: 13px;
    line-height: 1.5;
  }
  .activity-line strong { color: #0f2344; font-weight: 700; }
  .activity-time {
    margin-top: 2px;
    color: #98a5bd;
    font-size: 11.5px;
  }

  /* ============ HARDWARE + DEVICE STATUS ============ */
  .hw-status {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px 14px;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }
  .hw-rings {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }
  .ring-gauge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px 4px;
    border: 1px solid #eef2f8;
    border-radius: 10px;
    background: #fbfcfe;
  }
  .ring-gauge svg { display: block; }
  .ring-gauge-value {
    font-size: 15px;
    font-weight: 800;
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  }
  .ring-gauge-label {
    color: #6a7c95;
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .4px;
  }
  .hw-bars {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hw-bar-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 4px;
    color: #47597a;
    font-size: 12.5px;
    font-weight: 600;
  }
  .hw-bar-head strong {
    color: #0f2344;
    font-size: 13px;
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-weight: 800;
  }
  .hw-bar-track {
    display: block;
    height: 8px;
    border-radius: 999px;
    background: #eef2f8;
    overflow: hidden;
  }
  .hw-bar-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    transition: width .35s ease;
  }
  .hw-meta {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    padding-top: 8px;
    border-top: 1px dashed #eef2f8;
  }
  .hw-meta-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .hw-meta-item span {
    color: #7787a0;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .3px;
  }
  .hw-meta-item strong {
    color: #0f2344;
    font-size: 13px;
    font-weight: 800;
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  }
  .hw-meta-ok {
    color: #0a8a45 !important;
    font-family: Inter, sans-serif !important;
  }

  .dev-status {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }
  .dev-status-summary {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 10px 18px 8px;
    border-bottom: 1px dashed #eef2f8;
  }
  .dev-status-summary span {
    color: #7787a0;
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .4px;
  }
  .dev-status-summary strong {
    color: #0a8a45;
    font-size: 16px;
    font-weight: 800;
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  }
  .dev-list {
    padding: 4px 12px 10px;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }
  .dev-row {
    display: grid;
    grid-template-columns: 12px 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 8px 6px;
    border-bottom: 1px dashed #f0f3f8;
  }
  .dev-row:last-child { border-bottom: 0; }
  .dev-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #12af64;
    box-shadow: 0 0 0 3px rgba(18, 175, 100, .18);
  }
  .dev-warn .dev-dot {
    background: #e07a1f;
    box-shadow: 0 0 0 3px rgba(224, 122, 31, .2);
  }
  .dev-main { min-width: 0; }
  .dev-line {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  }
  .dev-line strong {
    color: #0f2344;
    font-size: 13.5px;
    font-weight: 700;
  }
  .dev-badge {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .3px;
  }
  .dev-badge-ok { background: #e6f7ec; color: #0a8a45; }
  .dev-badge-warn { background: #fdefdc; color: #a05a10; }
  .dev-meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    color: #7787a0;
    font-size: 11.5px;
    font-weight: 500;
  }
  .dev-port {
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    color: #98a5bd;
    font-size: 11px;
  }
  .dev-latency {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    line-height: 1;
  }
  .dev-latency strong {
    color: #0f2344;
    font-size: 15px;
    font-weight: 800;
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  }
  .dev-latency small {
    margin-top: 2px;
    color: #98a5bd;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: .3px;
  }
  .dev-latency .dev-offline { color: #c05a1a; }

  /* Panel Danh sách buồng giam — nền màu nắng, chữ đen */
  /* Panel Danh sách buồng giam — giống các panel khác (trắng) */
  .cells-status {
    background: transparent;
    border-radius: 0;
    margin: 0;
    color: inherit;
  }
  .cells-status .dev-status-summary {
    border-bottom-color: #eef2f8;
  }
  .cells-status .dev-status-summary span {
    color: #7787a0;
  }
  .cells-status .dev-status-summary strong {
    color: #0a8a45;
  }
  .cells-status .dev-list {
    color: inherit;
  }
  .cells-status .dev-row {
    border-bottom-color: #f0f3f8;
  }
  .cells-status .dev-dot {
    background: #12af64;
    box-shadow: 0 0 0 3px rgba(18, 175, 100, .18);
  }
  .cells-status .dev-warn .dev-dot {
    background: #e07a1f;
    box-shadow: 0 0 0 3px rgba(224, 122, 31, .2);
  }
  .cells-status .dev-line strong {
    color: #0f2344;
  }
  .cells-status .dev-badge-ok {
    background: #e6f7ec;
    color: #0a8a45;
  }
  .cells-status .dev-badge-warn {
    background: #fdefdc;
    color: #a05a10;
  }
  .cells-status .dev-meta {
    color: #7787a0;
  }
  .cells-status .dev-port {
    color: #98a5bd;
  }
  .cells-status .dev-latency strong {
    color: #0f2344;
  }
  .cells-status .dev-latency small {
    color: #98a5bd;
  }

  .dashboard-grid-hw {
    grid-template-columns: 1.15fr .85fr !important;
  }

  .mono { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-weight: 700; letter-spacing: .3px; }

  @media (max-width: 900px) {
    .dash-hero { grid-template-columns: 1fr; }
    .bar-chart-body { grid-template-columns: repeat(7, 1fr); gap: 4px; height: 140px; }
    .bar-chart-body > .bar-col:nth-child(-n+7) { display: none; }
    .donut-wrap { grid-template-columns: 1fr; }
    .hbar-row { grid-template-columns: 110px 1fr 40px; }
  }

  .system-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    margin-top: 0;
    overflow: hidden;
    flex-shrink: 0;
  }
  .system-item {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 70px;
    padding: 12px 16px;
    border-right: 1px solid #e6ecf4;
  }
  .system-item:last-child { border-right: 0; }
  .system-icon {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 50%;
    color: #1666e7;
    background: #eaf2ff;
  }
  .system-icon svg { width: 16px; height: 16px; }
  .system-item span, .system-item strong, .system-item small { display: block; }
  .system-item span { color: #6d7e97; font-size: 11px; text-transform: uppercase; letter-spacing: .3px; }
  .system-item strong { margin-top: 3px; color: #102441; font-size: 15px; }
  .system-item small { margin-top: 2px; color: #0ba45d; font-size: 11px; }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 0;
    flex: 0 0 auto;
  }
  .page-header-actions { display: flex; gap: 10px; }

  .button {
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 16px;
    border-radius: 10px;
    border: 1px solid transparent;
    font-weight: 700;
    text-decoration: none;
  }
  .button svg { width: 16px; height: 16px; }
  .button.primary {
    color: white;
    background: linear-gradient(135deg, #1672ef, #0755d4);
    box-shadow: 0 7px 16px rgba(12, 91, 224, .18);
  }
  .button.secondary {
    color: #23517e;
    border-color: #d9e4f2;
    background: white;
  }
  .button:disabled { opacity: .55; cursor: not-allowed; }

  .filter-bar {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) 210px 180px auto;
    gap: 12px;
    margin-bottom: 18px;
    padding: 18px;
    border: 1px solid #e2e9f3;
    border-radius: 14px;
    background: white;
  }

  /* SearchPage: 3-mode tabs */
  .search-tabs {
    display: inline-flex;
    gap: 4px;
    margin-bottom: 14px;
    padding: 4px;
    background: #f4f6f9;
    border: 1px solid #e2e9f3;
    border-radius: 10px;
  }
  .search-tab {
    height: 34px;
    padding: 0 16px;
    border: 0;
    background: transparent;
    color: #4a5568;
    font-size: 13px;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    transition: background .15s, color .15s;
  }
  .search-tab:hover { color: #8E0000; }
  .search-tab.active {
    background: #8E0000;
    color: #fff;
    box-shadow: 0 1px 2px rgba(142, 0, 0, .18);
  }

  /* Fingerprint search mode: 2 cols (slot + submit) */
  .filter-bar-fp {
    grid-template-columns: minmax(280px, 1fr) auto;
  }
  .fp-search-slot { display: flex; align-items: center; justify-content: flex-start; }
  .fp-search-drop {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 200px;
    height: 140px;
    border: 2px dashed #d9e3f0;
    border-radius: 10px;
    background: #fafcff;
    color: #4a5568;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: border-color .15s, background .15s, color .15s;
    padding: 12px;
    text-align: center;
  }
  .fp-search-drop:hover {
    border-color: #8E0000;
    background: #fff8f8;
    color: #8E0000;
  }
  .fp-search-drop-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 42px; height: 42px;
    border-radius: 50%;
    background: #fde8ea;
    color: #8E0000;
  }
  .fp-search-drop-icon svg { width: 24px; height: 24px; }
  .fp-search-drop-hint {
    font-size: 11px;
    color: #94a3b8;
    font-weight: 400;
  }
  .fp-search-preview {
    position: relative;
    width: 140px;
    height: 140px;
    border: 1px solid #d9e3f0;
    border-radius: 10px;
    overflow: hidden;
    background: #f4f4f4;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .fp-search-preview img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    display: block;
  }
  .fp-search-clear {
    position: absolute;
    top: 4px; right: 4px;
    width: 22px; height: 22px;
    border-radius: 50%;
    border: 0;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .fp-search-clear:hover { background: #8E0000; }
  .control {
    width: 100%;
    height: 42px;
    padding: 0 13px;
    border: 1px solid #d9e3f0;
    border-radius: 9px;
    outline: none;
    color: #233b59;
    background: white;
  }
  .control:focus {
    border-color: #4b8df4;
    box-shadow: 0 0 0 3px rgba(34, 113, 236, .12);
  }

  .table-card {
    overflow: auto;
    flex: 1 1 auto;
    min-height: 0;
  }

  /* Danh sách can phạm — dùng cùng phong cách session-list */
  .detainees-table-wrap {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
  }
  .detainees-table-wrap .detainees-table {
    width: 100%;
    border-collapse: collapse;
  }
  .detainees-table th {
    background: #f3f4f6;
    padding: 9px 14px;
    text-align: left;
    font-size: 12px;
    text-transform: uppercase;
    color: #6b7280;
    font-weight: 600;
  }
  .detainees-table td {
    padding: 10px 14px;
    border-top: 1px solid #f1f5f9;
    font-size: 13.5px;
    vertical-align: middle;
  }
  .detainees-table tbody tr {
    cursor: default;
    transition: background 0.1s;
  }
  .detainees-table tbody tr:hover { background: #fef2f2; }
  .detainees-table-wrap .session-list-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 8px 14px;
    background: #f9fafb;
    border-top: 1px solid #f1f5f9;
  }
  .detainees-table-wrap .session-list-total {
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
  }
  .detainees-table-wrap .pagination {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .detainees-table-wrap .pagination button {
    height: 34px;
    padding: 0 14px;
    border: 1px solid #d1d5db;
    background: #fff;
    color: #374151;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
  }
  .detainees-table-wrap .pagination button:disabled {
    opacity: .5;
    cursor: not-allowed;
  }
  .detainees-table-wrap .pagination span {
    font-size: 13px;
    color: #374151;
    font-weight: 600;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 920px;
  }
  th, td {
    padding: 11px 14px;
    border-bottom: 1px solid #edf1f6;
    color: #344962;
    text-align: left;
    font-size: 13px;
    vertical-align: middle;
  }
  th {
    color: #62738b;
    background: #f8faff;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .2px;
  }
  tbody tr:hover { background: #fbfdff; }
  .table-avatar { width: 38px; height: 38px; }
  .ellipsis {
    max-width: 210px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .row-actions { display: flex; gap: 7px; }
  .row-actions button {
    padding: 6px 9px;
    border: 1px solid #dce5f1;
    border-radius: 7px;
    color: #23517e;
    background: white;
  }
  .row-actions .danger-text { color: #dc3545; }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-top: 20px;
  }
  .pagination button {
    padding: 8px 12px;
    border: 1px solid #dce5f1;
    border-radius: 8px;
    color: #23517e;
    background: white;
  }

  .mini-progress { width: 120px; margin-bottom: 5px; }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 22px;
  }
  .feature-card { padding: 28px; }
  .feature-icon {
    width: 54px;
    height: 54px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    color: #0c61e4;
    background: #eaf2ff;
  }
  .feature-card h3 { margin: 20px 0 8px; color: #102441; }
  .feature-card p { margin: 0 0 22px; color: #697b95; line-height: 1.6; }
  .feature-actions { display: flex; gap: 10px; flex-wrap: wrap; }

  .status-badge {
    display: inline-block;
    padding: 5px 9px;
    border-radius: 999px;
    color: #1458aa;
    background: #e8f1ff;
    font-size: 11px;
    font-weight: 800;
  }
  .status-badge.delete { color: #bd2636; background: #ffeaed; }
  .status-badge.create { color: #07854b; background: #e6f8ef; }

  .state-box, .empty {
    padding: 36px;
    color: #6c7d95;
    text-align: center;
  }
  .state-box.error { color: #d93649; }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(6, 21, 44, .55);
    backdrop-filter: blur(4px);
  }
  .modal {
    width: min(920px, 100%);
    max-height: 90vh;
    overflow: auto;
    border-radius: 17px;
    background: white;
    box-shadow: 0 30px 80px rgba(0,0,0,.28);
  }
  .small-modal { width: min(520px, 100%); }

  .sync-diff-modal {
    width: min(720px, 100%);
    max-height: 88vh;
    display: flex;
    flex-direction: column;
  }
  .sync-diff-modal .modal-header { flex-shrink: 0; }
  .sync-diff-sub {
    padding: 10px 24px;
    color: #4a5b78;
    font-size: 13.5px;
    border-bottom: 1px solid #eef2f8;
    flex-shrink: 0;
  }
  .sync-diff-loading {
    padding: 40px;
    text-align: center;
    color: #6b7a95;
  }
  .sync-diff-summary {
    display: flex;
    gap: 14px;
    padding: 14px 24px;
    background: #f8fafd;
    border-bottom: 1px solid #eef2f8;
    flex-shrink: 0;
  }
  .sd-sum { font-size: 13.5px; font-weight: 600; }
  .sd-sum.add { color: #12af64; }
  .sd-sum.upd { color: #c47a00; }
  .sd-sum.dup { color: #6b7a95; }

  .sync-diff-body {
    overflow-y: auto;
    flex: 1;
    padding: 12px 24px;
  }
  .sync-diff-empty {
    padding: 32px;
    text-align: center;
    color: #6b7a95;
  }
  .sd-group { margin-bottom: 18px; }
  .sd-group-head {
    padding: 6px 0 8px;
    border-bottom: 1px solid #eef2f8;
    margin-bottom: 8px;
  }
  .sd-checkall {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-weight: 700;
    font-size: 14px;
    color: #102441;
  }
  .sd-list { display: flex; flex-direction: column; gap: 4px; }
  .sd-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    border-radius: 8px;
    background: #f8fafd;
  }
  .sd-row-main {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    font-size: 13px;
  }
  .sd-row-line { flex: 1; color: #0f1a32; }
  .sd-diff-toggle {
    background: transparent;
    border: 1px solid #d0d9ea;
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 11.5px;
    color: #4a5b78;
    cursor: pointer;
  }
  .sd-diff-toggle:hover { background: #eef2f8; }
  .sd-diff-list {
    padding-left: 30px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .sd-diff-field {
    display: inline-flex;
    padding: 2px 8px;
    border-radius: 6px;
    background: #fdeec8;
    color: #8a5a00;
    font-size: 11.5px;
  }
  .sd-row-dup { opacity: .65; }
  .sync-diff-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 24px;
    border-top: 1px solid #eef2f8;
    flex-shrink: 0;
  }
  .sync-diff-actions .btn-primary {
    background: #2371f4;
    color: #fff;
    border: 0;
    border-radius: 9px;
    padding: 9px 18px;
    font-weight: 600;
    cursor: pointer;
  }
  .sync-diff-actions .btn-primary:disabled {
    background: #b8c5db;
    cursor: not-allowed;
  }
  .sync-diff-actions .btn-secondary {
    background: #eef2f8;
    color: #0f1a32;
    border: 0;
    border-radius: 9px;
    padding: 9px 18px;
    font-weight: 600;
    cursor: pointer;
  }
  .sync-diff-modal .close-x {
    background: transparent;
    border: 0;
    font-size: 22px;
    color: #6b7a95;
    cursor: pointer;
    line-height: 1;
    padding: 4px 8px;
  }

  .modal-header {
    height: 68px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    border-bottom: 1px solid #e8edf5;
  }
  .modal-header h3 { margin: 0; color: #102441; }
  .modal-header button {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 8px;
    color: #58708f;
    background: #f1f5fa;
    font-size: 23px;
  }

  /* ==================== Detail modal v2 ==================== */
  .detail-modal-v2 {
    width: min(1180px, 100%);
    max-height: 92vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: white;
    border-radius: 18px;
  }
  .detail-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 26px;
    border-bottom: 1px solid #eef2f8;
    flex-shrink: 0;
  }
  .detail-header-left { display: flex; align-items: center; gap: 14px; }
  .detail-header-icon {
    width: 46px; height: 46px;
    display: grid; place-items: center;
    border-radius: 12px;
    background: #eaf2ff;
    color: #0c50d0;
  }
  .detail-header-icon svg { width: 22px; height: 22px; }
  .detail-header h3 {
    margin: 0; color: #0f2344;
    font-size: 20px; font-weight: 800;
    letter-spacing: -.2px;
  }
  .detail-header small {
    display: block; margin-top: 2px;
    color: #7a8ea8; font-size: 12.5px; font-weight: 500;
  }
  .detail-close {
    width: 40px; height: 40px;
    display: grid; place-items: center;
    border: 1px solid #e2e9f3;
    border-radius: 50%;
    background: white;
    color: #4c5c76;
    cursor: pointer;
    transition: .15s;
  }
  .detail-close:hover { background: #f4f7fb; color: #0f2344; }
  .detail-close svg { width: 18px; height: 18px; }

  .detail-body {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 20px;
    padding: 20px 24px 24px;
    overflow-y: auto;
    background: #f7f9fc;
  }

  /* --- Left card: chỉ ảnh + tên (chip đã chuyển sang grid 2x4 bên phải) --- */
  .detail-card {
    background: white;
    border: 1px solid #e5ebf4;
    border-radius: 14px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    box-shadow: 0 3px 10px rgba(18, 52, 97, .04);
    align-self: start;
  }
  .detail-card-simple .detail-avatar {
    width: 250px;
    height: 330px;
  }
  .detail-avatar {
    aspect-ratio: auto;
    border-radius: 12px;
    overflow: hidden;
    background: #eef3f9;
    display: grid; place-items: center;
    color: #8491a4; font-size: 13px;
  }

  /* --- Grid 2 cột 4 hàng bên phải --- */
  .detail-grid-2x4 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: auto;
    gap: 10px;
  }
  .detail-grid-2x4 .info-tile {
    padding: 10px 12px;
    font-size: 12.5px;
  }
  .detail-grid-2x4 .info-tile-label {
    font-size: 11px;
  }
  .detail-grid-2x4 .info-tile-value {
    font-size: 13px;
    word-break: break-word;
  }
  .detail-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .detail-name-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 4px;
    width: 100%;
  }
  .detail-name {
    color: #0f2344;
    font-size: 18px; font-weight: 800;
    letter-spacing: -.1px;
    line-height: 1.2;
  }
  .detail-gender-chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 12px; font-weight: 700;
    background: #eaf2ff;
    color: #0c50d0;
    flex-shrink: 0;
  }
  .detail-gender-chip.female { background: #fdeaf2; color: #b8306b; }
  .detail-gender-chip b { font-size: 13px; line-height: 1; }
  .detail-cccd-chip {
    width: 100%;
    display: flex; align-items: center; gap: 12px;
    padding: 12px 14px;
    margin-top: 6px;
    border-radius: 12px;
    background: #eef4ff;
    border: 1px solid #dbe6ff;
  }
  .detail-cccd-icon {
    width: 38px; height: 38px;
    display: grid; place-items: center;
    border-radius: 10px;
    background: white;
    color: #0c50d0;
    flex-shrink: 0;
  }
  .detail-cccd-icon svg { width: 20px; height: 20px; }
  .detail-cccd-chip small {
    display: block;
    color: #6f7f98;
    font-size: 12px;
    font-weight: 600;
  }
  .detail-cccd-chip strong {
    display: block;
    margin-top: 2px;
    color: #0f2344;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: .3px;
  }

  /* --- Right grid --- */
  .detail-grid-v2 {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    align-content: start;
  }
  .info-tile {
    display: flex; align-items: center; gap: 16px;
    padding: 18px 22px;
    background: white;
    border: 1px solid #e5ebf4;
    border-radius: 14px;
    box-shadow: 0 2px 6px rgba(18, 52, 97, .03);
    min-height: 84px;
  }
  .info-tile-icon {
    width: 44px; height: 44px;
    flex-shrink: 0;
    display: grid; place-items: center;
    border-radius: 11px;
    background: #eaf2ff;
    color: #0c50d0;
  }
  .info-tile-icon svg { width: 22px; height: 22px; }
  .info-tile-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 3px;
    min-width: 0;
  }
  .info-tile-label {
    color: #7a8ea8;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: .1px;
    line-height: 1.2;
  }
  .info-tile-value {
    width: 100%;
    color: #0f2344;
    font-size: 16px;
    font-weight: 800;
    letter-spacing: -.15px;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 900px) {
    .detail-body { grid-template-columns: 1fr; }
    .detail-grid-v2 { grid-template-columns: 1fr; }
    .info-tile-value { max-width: 55%; }
  }

  .form { padding: 24px; }
  .field-row {
    display: block;
    margin-bottom: 16px;
  }
  .field-row > span {
    display: block;
    margin-bottom: 7px;
    color: #40546e;
    font-size: 13px;
    font-weight: 700;
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 22px;
  }
  .error-box, .success-box {
    margin-top: 16px;
    padding: 12px 14px;
    border-radius: 9px;
    font-size: 13px;
  }
  .error-box { color: #c63142; background: #fff0f2; }
  .success-box { color: #087c48; background: #e8f9f1; }

  @media (max-width: 1180px) {
    .app { grid-template-columns: 220px minmax(0, 1fr); }
    .header { padding: 0 20px; }
    .brand-title { font-size: 17px; }
    .user-info { display: none; }
    .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .system-strip { grid-template-columns: repeat(2, 1fr); }
    .system-item:nth-child(2) { border-right: 0; }
    .system-item:nth-child(-n+2) { border-bottom: 1px solid #e6ecf4; }
  }

  @media (max-width: 900px) {
    .app {
      display: block;
      padding-top: 82px;
    }
    .header {
      position: fixed;
      inset: 0 0 auto 0;
      height: 82px;
      z-index: 20;
    }
    .sidebar { display: none; }
    .content { padding: 22px 16px; }
    .brand-subtitle, .server-status, .icon-button { display: none; }
    .logout-button span { display: none; }
    .dashboard-grid, .feature-grid { grid-template-columns: 1fr; }
    .filter-bar { grid-template-columns: 1fr; }
  }

  @media (max-width: 620px) {
    .brand-title { font-size: 13px; }
    .brand-logo { width: 44px; height: 44px; border-width: 5px; }
    .header-actions { gap: 8px; }
    .avatar { width: 40px; height: 40px; }
    .logout-button { width: 40px; padding: 0; justify-content: center; }
    .stat-grid, .system-strip { grid-template-columns: 1fr; }
    .system-item { border-right: 0; border-bottom: 1px solid #e6ecf4; }
    .system-item:last-child { border-bottom: 0; }
    .page-header { align-items: flex-start; flex-direction: column; }
    .detail-layout, .detail-grid { grid-template-columns: 1fr; }
  }

  /* ============================================================
     Thu nhận dữ liệu — bám sát mockup (image copy 15.png)
     ============================================================ */
  /* Host layout: khi có .capture-page thì .content/.main-area chỉ overflow-hidden.
     .app đã lock 100dvh + grid (55px header + 1fr main), nên .content tự có
     chiều cao đúng — KHÔNG được set height: 100dvh cho .content (sẽ vượt grid). */
  .content:has(.capture-page) {
    overflow: hidden !important;
    padding: 6px 8px !important;
    display: flex !important;
    flex-direction: column;
    min-height: 0;
  }
  .main-area:has(.capture-page) {
    overflow: hidden !important;
    padding: 6px 8px !important;
    display: flex !important;
    flex-direction: column;
    min-height: 0;
    height: 100dvh;
  }
  .app-shell:has(.capture-page) {
    height: 100dvh !important;
    min-height: 100dvh !important;
    max-height: 100dvh !important;
    overflow: hidden !important;
  }

  .capture-page {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0;
    max-width: none;
    margin: 0;
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  /* Banner "Đã đọc dữ liệu CCCD" / lỗi — toast dạng dán góc dưới trang thu nhận,
     KHÔNG chiếm chỗ trong flow, hiển thị ~60s rồi tự ẩn (JS xử lý timeout) */
  .capture-banner {
    position: absolute;
    bottom: 12px;
    right: 16px;
    z-index: 20;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: min(420px, 90%);
    animation: capBannerIn 0.22s ease-out;
  }
  @keyframes capBannerIn {
    from { transform: translateY(8px); opacity: 0; }
    to   { transform: translateY(0);   opacity: 1; }
  }
  .capture-banner .error-box,
  .capture-banner .success-box {
    margin: 0;
    padding: 8px 12px;
    font-size: 12px;
    line-height: 1.35;
    border-radius: 10px;
    box-shadow: 0 8px 20px rgba(15, 35, 68, 0.22);
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border: 1px solid transparent;
  }
  .capture-banner .success-box { border-color: #b9ebd0; }
  .capture-banner .error-box   { border-color: #f6bfc6; }
  .banner-link {
    margin-left: 6px; padding: 2px 8px; border-radius: 6px;
    background: rgba(255,255,255,.75); color: inherit; border: 0;
    font-size: 11.5px; font-weight: 700; cursor: pointer;
    pointer-events: auto;
  }
  .capture-page { position: relative; }

  /* --- Card container --- */
  .cap-block {
    background: white;
    border: 1px solid #dfe6f2;
    border-radius: 10px;
    box-shadow: 0 2px 8px rgba(18, 52, 97, .04);
    display: flex; flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }
  .cap-block-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px;
    height: 22px;
    padding: 0 12px;
    background: linear-gradient(180deg, #1e6cf1 0%, #0c50d0 100%);
    color: white;
    flex-shrink: 0;
  }
  .cap-block-title {
    margin: 0;
    font-size: 10.5px; font-weight: 700;
    letter-spacing: .4px;
    text-transform: uppercase;
    line-height: 1;
  }

  .btn-cccd-scan {
    display: inline-flex; align-items: center; gap: 6px;
    height: 28px;
    padding: 0 10px; border-radius: 6px;
    border: 1px solid rgba(255,255,255,.35);
    background: rgba(255,255,255,.15);
    color: white; font-size: 11.5px; font-weight: 700;
    line-height: 1;
    cursor: pointer; transition: .15s;
  }
  .btn-cccd-scan:hover:not(:disabled) { background: rgba(255,255,255,.28); }
  .btn-cccd-scan:disabled { opacity: .55; cursor: not-allowed; }
  .btn-cccd-scan svg { width: 13px; height: 13px; }

  /* Chỉ báo tự lắng nghe đầu đọc CCCD (thay nút "Đọc CCCD") */
  .cccd-listen-badge {
    display: inline-flex; align-items: center; gap: 6px;
    height: 28px;
    padding: 0 10px; border-radius: 6px;
    border: 1px solid rgba(255,255,255,.22);
    background: rgba(255,255,255,.10);
    color: rgba(255,255,255,.72);
    font-size: 11.5px; font-weight: 700;
    line-height: 1;
    white-space: nowrap;
  }
  .cccd-listen-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: rgba(255,255,255,.45);
    flex: none;
  }
  .cccd-listen-badge.on {
    border-color: rgba(18,175,100,.55);
    background: rgba(18,175,100,.18);
    color: #eafff4;
  }
  .cccd-listen-badge.on .cccd-listen-dot {
    background: #12af64;
    animation: cccd-listen-pulse 1.4s ease-in-out infinite;
  }
  @keyframes cccd-listen-pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(18,175,100,.55); }
    50% { opacity: .55; box-shadow: 0 0 0 4px rgba(18,175,100,0); }
  }
  .cccd-listen-badge.locked {
    border-color: rgba(240,180,40,.55);
    background: rgba(240,180,40,.18);
    color: #fff6e0;
  }
  .cccd-listen-badge.locked .cccd-listen-dot {
    background: #f0b428;
    animation: none;
  }

  /* --- Photo slot base --- */
  .photo-slot {
    position: relative;
    width: 100%;
    border-radius: 6px;
    background: #f4f7fb;
    overflow: hidden;
    min-height: 0;
    min-width: 0;
  }
  .photo-slot img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .photo-slot-empty {
    width: 100%; height: 100%;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 2px;
    padding: 3px;
    background: #f8fbff;
    border: 1.2px dashed #c8d5ec;
    border-radius: 6px;
    color: #6f7f98;
    cursor: pointer;
    transition: .15s;
    text-align: center;
    min-height: 0;
  }
  .photo-slot-empty:hover:not(:disabled) {
    border-color: #1e6cf1; background: #eaf2ff; color: #0c50d0;
  }
  .photo-slot-empty:disabled { opacity: .6; cursor: not-allowed; }
  .photo-slot-icon { display: inline-flex; color: currentColor; }
  .photo-slot-icon svg { width: 16px; height: 16px; }
  .photo-slot-label { font-size: 10px; font-weight: 600; line-height: 1.1; }
  .photo-slot-hint { font-size: 9.5px; color: #7a8ea8; }
  .photo-slot-err { font-size: 9.5px; color: #c63142; }
  .ps-compact .photo-slot-empty { padding: 2px; gap: 0; }
  .ps-compact .photo-slot-icon svg { width: 12px; height: 12px; }
  .photo-slot-clear {
    position: absolute; top: 2px; right: 2px;
    width: 16px; height: 16px;
    display: grid; place-items: center;
    border: 0; border-radius: 50%;
    background: rgba(0,0,0,.6); color: white;
    font-size: 12px; line-height: 1;
    cursor: pointer;
  }
  .photo-slot-clear:hover { background: rgba(220,53,69,.9); }

  /* --- Block 1: CCCD (2 form cols + card preview on right) --- */
  .cccd-body,
  .cccd-body-2col {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) minmax(0, 300px) !important;
    gap: 10px 14px !important;
    padding: 6px 10px 8px !important;
    align-items: start !important;
    flex-shrink: 0;
  }
  .cccd-col-form {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
    grid-template-rows: repeat(6, auto) !important;
    grid-auto-flow: column !important;
    gap: 4px 10px !important;
    min-width: 0;
  }
  .cccd-body-2col .cccd-field,
  .cccd-body .cccd-field {
    display: grid !important;
    grid-template-columns: 92px minmax(0, 1fr) !important;
    align-items: center;
    gap: 6px !important;
    padding: 0 !important;
    border-bottom: none !important;
    min-height: 0 !important;
    min-width: 0 !important;
  }
  .cccd-body-2col .cccd-field-label,
  .cccd-body .cccd-field-label {
    font-size: 11px !important;
    color: #40546e !important;
    font-weight: 600 !important;
    text-transform: none !important;
    letter-spacing: 0 !important;
    line-height: 1.15 !important;
  }
  .cccd-body-2col .cccd-field .control,
  .cccd-body .cccd-field .control {
    border: 1px solid #dbe4f0 !important;
    background: #f5f9ff !important;
    padding: 0 8px !important;
    height: 26px !important;
    font-size: 12px !important;
    color: #111827 !important;
    box-shadow: none !important;
    outline: none !important;
    border-radius: 5px !important;
    min-width: 0 !important;
  }
  .cccd-preview-col .cccd-card-mock {
    width: 100% !important;
  }

  /* --- Row 2 & 3: 2-column layout (co-giãn theo chiều dọc) --- */
  .cap-row {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    gap: 8px;
    min-height: 0;
  }
  .cap-row-3 {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .cap-row .cap-block { min-height: 0; }

  /* Block 1 (CCCD) đứng riêng — không co */
  .capture-page > .cap-block:first-of-type,
  .capture-page > .capture-banner + .cap-block { flex: 0 0 auto; }

  /* Row Sinh trắc + Chân dung: chiếm phần lớn không gian còn lại */
  .capture-page > .cap-row:not(.cap-row-3) { flex: 1 1 auto; min-height: 0; }
  /* Row Bổ sung + Validate: cố định thấp */
  .capture-page > .cap-row-3 { flex: 0 0 auto; }
  /* Save block: cố định thấp */
  .capture-page > .save-block { flex: 0 0 auto; }

  /* --- Block 2A: Biometric (fps + iris) --- */
  .bio-body {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 1fr);
    gap: 12px;
    padding: 8px 12px 10px;
    min-height: 0;
    flex: 1 1 0;
    overflow: hidden;
  }
  /* Khi chỉ còn vân tay (đã bỏ mống mắt): vân tay chiếm toàn bộ, 2 tay xếp dọc */
  .bio-body.bio-body-fp-only {
    grid-template-columns: minmax(0, 1fr);
    justify-items: stretch;
  }
  .bio-body.bio-body-fp-only .fp-hands {
    grid-template-columns: 1fr;
    gap: 10px;
    width: 100%;
    max-width: none;
  }
  .bio-body.bio-body-fp-only .fp-hand-row {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }
  /* Ô vân tay vuông: ép tỉ lệ 1/1 bằng aspect-ratio trên khung ảnh */
  .bio-body.bio-body-fp-only .fp-item .photo-slot {
    aspect-ratio: 1 / 1;
    height: auto;
    width: 100%;
    max-width: none;
  }
  .bio-sub-title {
    font-size: 10.5px; font-weight: 800; color: #0f2344;
    text-transform: uppercase; letter-spacing: .4px;
    margin-bottom: 4px;
    flex-shrink: 0;
  }
  .bio-fp { display: flex; flex-direction: column; min-height: 0; min-width: 0; position: relative; }
  /* Sub-row (tiêu đề + nút Thu thập) — chừa chỗ overlay bên trái */
  .bio-fp > .bio-sub-row {
    position: relative;
    z-index: 6;
    margin-bottom: 2px;
  }
  /* Ẩn overlay thông báo vân tay để không đè lên header block */
  .bio-fp > .fp-inline-status {
    display: none;
  }
  /* --- Layout hai bàn tay: trái | phải, đối xứng --- */
  .fp-hands {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
  }
  .fp-hand {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 6px 8px 8px;
    border-radius: 10px;
    background: linear-gradient(180deg, #f5f9ff 0%, #eef4fc 100%);
    border: 1px solid #dbe4f0;
  }
  .fp-hand-title {
    font-size: 10.5px;
    font-weight: 800;
    color: #0f2344;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    text-align: center;
    padding-bottom: 4px;
    margin-bottom: 6px;
    border-bottom: 1px dashed #cdd8e8;
    flex-shrink: 0;
  }
  .fp-hand-row {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
    flex: 1 1 0;
    min-height: 0;
    align-items: stretch;
  }
  .fp-item {
    display: flex; flex-direction: column; align-items: center;
    gap: 3px; min-width: 0; min-height: 0; overflow: hidden;
  }
  .fp-item .photo-slot {
    width: 100%;
    height: 100%;
    flex: 1 1 0;
    min-height: 0;
    aspect-ratio: auto;
    max-width: none;
    background: #fff;
    border: 1px solid #d7e0ee;
    border-radius: 6px;
  }
  .fp-item .photo-slot-empty {
    height: 100%;
    background: #fbfdff;
    border: 1.2px dashed #c6d3e6;
    color: #8595ad;
  }
  .fp-item-done .photo-slot {
    border-color: #7fd5a5;
    box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.12);
  }
  .fp-item-label {
    font-size: 10px; color: #3d4d68; font-weight: 700;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    max-width: 100%; text-align: center; line-height: 1.1;
    letter-spacing: 0.2px;
  }
  .fp-item-active .photo-slot {
    border-color: #f59e0b;
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.22);
  }
  .fp-item-active .fp-item-label { color: #b45309; }
  .bio-iris { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
  .iris-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    flex: 1 1 auto;
    min-height: 0;
  }
  .iris-item {
    display: flex; flex-direction: column; align-items: center;
    gap: 2px; min-height: 0; min-width: 0;
  }
  .iris-item .photo-slot {
    width: 100%;
    height: 100%;
    flex: 1 1 0;
    min-height: 0;
    aspect-ratio: auto;
  }
  .iris-item .photo-slot-empty { height: 100%; }
  .iris-item-label {
    font-size: 10px; color: #4c5c76; font-weight: 700; line-height: 1.1;
    flex-shrink: 0;
  }

  .bio-status {
    margin-top: 4px;
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 10.5px; font-weight: 700;
    align-self: flex-start;
    flex-shrink: 0;
  }
  .bio-status.ok { background: #e6f8ef; color: #087c48; border: 1px solid #b9ebd0; }
  .bio-status.warn { background: #fff4e5; color: #a05a1c; border: 1px solid #ffdcb0; }
  .bio-status.muted { background: #f1f4f8; color: #6a7488; border: 1px solid #e1e6ee; }
  .bio-iris .bio-status { margin-top: 4px; }

  /* --- Block 2B: Portrait with rulers --- */
  .portrait-body {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    padding: 6px 10px 8px;
    align-items: stretch;
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
  }
  .portrait-item {
    display: flex; flex-direction: column; align-items: center;
    gap: 3px; min-width: 0; min-height: 0; overflow: hidden;
  }
  .portrait-frame {
    position: relative;
    width: 100%;
    padding: 0 18px;
    flex: 1 1 0;
    min-height: 0;
    display: flex;
  }
  .portrait-frame .photo-slot {
    width: 100%;
    height: 100%;
    flex: 1 1 0;
    min-height: 0;
    aspect-ratio: auto;
  }
  .portrait-frame .photo-slot-empty { height: 100%; }
  .portrait-frame .photo-slot img { height: 100%; }
  .ruler {
    position: absolute; top: 0; bottom: 0;
    width: 18px;
    display: flex; flex-direction: column;
    justify-content: space-between;
    padding: 2px 0;
    font-size: 7.5px; color: #7a8ea8;
    font-weight: 600;
    text-align: center;
  }
  .ruler-l { left: 0; border-right: 1px dashed #d3ddec; }
  .ruler-r { right: 0; border-left: 1px dashed #d3ddec; }
  .portrait-label {
    font-size: 10.5px; font-weight: 700; color: #0f2344; line-height: 1.1;
  }

  /* --- Block 3A: Extra info --- */
  .extra-body {
    display: flex; flex-direction: column; gap: 6px;
    padding: 6px 10px 8px;
  }
  .extra-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 10px;
  }
  .extra-grid .cccd-field {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    gap: 6px;
  }
  .extra-grid .cccd-field-label {
    font-size: 11px; color: #40546e; font-weight: 600;
  }
  .extra-grid .cccd-field .control {
    height: 26px; padding: 0 8px; font-size: 12px;
    border-radius: 5px; background: #f5f9ff;
    border: 1px solid #dbe4f0;
  }
  .extra-note {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 10px;
    border-radius: 8px;
    background: #eaf2ff;
    border: 1px solid #cfe0ff;
    color: #0c50d0;
    font-size: 10.5px; font-weight: 600;
    line-height: 1.15;
  }
  .info-dot {
    display: inline-grid; place-items: center;
    width: 16px; height: 16px; flex-shrink: 0;
    color: #0c50d0;
  }
  .info-dot svg { width: 14px; height: 14px; }

  /* --- Block 3B: Validate --- */
  .validate-body {
    display: flex; flex-direction: column; gap: 6px;
    padding: 6px 10px 8px;
  }
  .validate-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 5px 8px;
  }
  .validate-cell {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 8px;
    border-radius: 7px;
    border: 1px solid transparent;
    min-width: 0;
  }
  .validate-cell.ok { background: #ecfaef; border-color: #b9ebd0; }
  .validate-cell.warn { background: #fff4e5; border-color: #ffdcb0; }
  .validate-cell.muted { background: #f6f8fb; border-color: #e2e8f2; }
  .validate-cell > div { min-width: 0; }
  .validate-cell strong { display: block; font-size: 10.5px; color: #0f2344; line-height: 1.1; }
  .validate-cell.ok strong { color: #087c48; }
  .validate-cell.warn strong { color: #a05a1c; }
  .validate-cell.muted strong { color: #57647a; }
  .validate-cell .opt-tag { font-size: 9.5px; font-weight: 500; color: #7a8ea8; font-style: normal; }
  .validate-cell span {
    display: block; margin-top: 1px;
    font-size: 9.5px; color: #6f7f98; font-weight: 600;
    line-height: 1.1;
  }
  .validate-note {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 10px;
    border-radius: 8px;
    font-size: 10.5px; font-weight: 700;
    line-height: 1.15;
  }
  .validate-note.ok {
    background: #e6f8ef; color: #087c48;
    border: 1px solid #b9ebd0;
  }
  .validate-note.warn {
    background: #fff4e5; color: #a05a1c;
    border: 1px solid #ffdcb0;
  }
  .validate-note .info-dot { color: inherit; width: 14px; height: 14px; }
  .validate-note .info-dot svg { width: 12px; height: 12px; }

  .chk-dot {
    display: inline-grid; place-items: center;
    width: 16px; height: 16px; flex-shrink: 0;
    border-radius: 50%;
  }
  .chk-dot.ok {
    background: linear-gradient(135deg, #12af64, #16c47a);
    color: white;
  }
  .chk-dot.warn {
    background: white; color: #a05a1c;
    border: 1.5px solid #ffdcb0;
  }
  .chk-dot.muted {
    background: white; color: #94a3b8;
    border: 1.5px solid #dbe4f0;
  }
  .chk-dot svg { width: 9px; height: 9px; }

  /* --- Block 4: Save actions --- */
  .save-block .cap-block-head {
    background: linear-gradient(180deg, #0f4bbf 0%, #062a69 100%);
  }
  .save-actions {
    display: flex; gap: 8px; flex-wrap: nowrap;
    padding: 6px 10px 8px;
  }
  .save-btn {
    display: inline-flex; align-items: center; justify-content: center;
    gap: 6px;
    min-height: 30px;
    padding: 0 14px;
    border: 1px solid transparent;
    border-radius: 7px;
    font-size: 11.5px; font-weight: 700;
    cursor: pointer;
    transition: .15s;
    flex: 1 1 0;
    white-space: nowrap;
  }
  .save-btn svg { width: 14px; height: 14px; }
  .save-btn:disabled { opacity: .55; cursor: not-allowed; filter: grayscale(.3); }
  .save-primary {
    color: white;
    background: linear-gradient(135deg, #16c47a, #12874d);
    box-shadow: 0 3px 10px rgba(18, 135, 77, .22);
    flex: 2 1 0;
  }
  .save-primary:hover:not(:disabled) { transform: translateY(-1px); }
  .save-secondary {
    color: #0c50d0;
    background: white;
    border-color: #cfe0ff;
  }
  .save-secondary:hover:not(:disabled) { background: #eaf2ff; }
  .save-danger {
    color: #c63142;
    background: white;
    border-color: #ffcbd1;
  }
  .save-danger:hover:not(:disabled) { background: #fff0f2; }

  /* --- Responsive: dưới 1280 giữ nguyên tinh thần no-scroll --- */
  @media (max-height: 800px) {
    .capture-page { gap: 4px; }
    .cap-block-head { height: 20px; }
    .cccd-body,
    .cccd-body-2col { padding: 4px 8px 6px !important; gap: 6px 10px !important; }
    .cccd-body .cccd-field .control,
    .cccd-body-2col .cccd-field .control { height: 24px !important; }
    .bio-body,
    .portrait-body,
    .extra-body,
    .validate-body,
    .save-actions { padding: 4px 8px 6px; }
    .save-btn { min-height: 28px; font-size: 11px; }
  }
  @media (max-width: 1180px) {
    .cccd-body,
    .cccd-body-2col { grid-template-columns: minmax(0, 1fr) minmax(0, 260px) !important; }
  }
  @media (max-width: 980px) {
    .cccd-body,
    .cccd-body-2col { grid-template-columns: 1fr !important; }
    .cccd-preview-col { display: none; }
    .cap-row,
    .cap-row-3 { grid-template-columns: 1fr; }
    .validate-grid { grid-template-columns: 1fr 1fr; }
  }

  /* ============================================================
     Báo cáo - Report page layout
     ============================================================ */
  .report-stat-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 4px;
  }
  .report-stat {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
    border-radius: 14px;
    border: 1px solid #e4eaf4;
    background: white;
    box-shadow: 0 4px 14px rgba(18, 52, 97, .05);
    position: relative;
    overflow: hidden;
  }
  .report-stat::before {
    content: "";
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 4px;
    background: var(--accent);
  }
  .report-stat.blue { --accent: #2371f4; --soft: #eaf2ff; }
  .report-stat.green { --accent: #12af64; --soft: #e8f9f0; }
  .report-stat.orange { --accent: #ff6b21; --soft: #fff0e7; }
  .report-stat.purple { --accent: #7745db; --soft: #f1ebff; }
  .report-stat-icon {
    width: 48px; height: 48px;
    flex: 0 0 auto;
    display: grid; place-items: center;
    border-radius: 12px;
    color: var(--accent);
    background: var(--soft);
  }
  .report-stat-icon svg { width: 22px; height: 22px; }
  .report-stat-body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .report-stat-label {
    color: #62738b; font-size: 12px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .3px;
  }
  .report-stat-value {
    color: #071a37; font-size: 26px; line-height: 1; font-weight: 800;
  }
  .report-stat-note { color: #75839a; font-size: 12px; }

  .report-filter {
    display: flex; flex-direction: column;
    border: 1px solid #e2e9f3;
    border-radius: 14px;
    background: white;
    box-shadow: 0 4px 14px rgba(18, 52, 97, .05);
    overflow: hidden;
  }
  .report-filter-head {
    display: flex; align-items: baseline; gap: 10px;
    padding: 12px 18px;
    background: linear-gradient(180deg, #f8fbff 0%, #f2f6fd 100%);
    border-bottom: 1px solid #e6ecf4;
  }
  .report-filter-title {
    color: #0f2344;
    font-size: 12.5px; font-weight: 800;
    letter-spacing: .5px;
    text-transform: uppercase;
  }
  .report-filter-hint { color: #6f7f98; font-size: 12px; }
  .report-filter-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
    align-items: end;
    gap: 12px 14px;
    padding: 14px 18px 16px;
  }
  .report-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .report-field > span {
    color: #40546e; font-size: 12px; font-weight: 700;
  }
  .report-filter-actions {
    display: flex; gap: 8px;
    justify-self: end;
  }
  .report-filter-actions .button {
    min-height: 40px; padding: 0 14px;
  }

  @media (max-width: 1180px) {
    .report-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .report-filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .report-filter-actions { grid-column: 1 / -1; justify-self: stretch; }
    .report-filter-actions .button { flex: 1; }
  }
  @media (max-width: 620px) {
    .report-stat-grid { grid-template-columns: 1fr; }
    .report-filter-grid { grid-template-columns: 1fr; }
  }

  /* Trang Tổng quan cố định, chỉ các panel bên trong scroll riêng */
  .dashboard-page {
    height: 100%;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 4px 6px 0;
  }
  .dashboard-page .dash-hero { flex: 0 0 auto; padding: 12px 18px; }
  .dashboard-page .dash-hero h1 { font-size: 18px; }
  .dashboard-page .dash-hero > div > p { margin-top: 2px; font-size: 12.5px; }
  .dashboard-page .stat-grid {
    flex: 0 0 auto;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 0;
  }
  .dashboard-page .stat-card { padding: 10px 12px; min-height: 74px; }
  .dashboard-page .stat-content > span { font-size: 11.5px; }
  .dashboard-page .stat-content strong { font-size: 20px; }
  .dashboard-page .stat-content small { font-size: 11px; }
  .dashboard-page .stat-icon { width: 42px; height: 42px; }
  .dashboard-page .stat-icon svg { width: 18px; height: 18px; }

  .dashboard-page .dashboard-body {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .dashboard-page .dashboard-body > .panel {
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .dashboard-page .panel-header { height: 40px; padding: 0 14px; flex: 0 0 auto; }
  .dashboard-page .panel-header h3 { font-size: 13.5px; }
  .dashboard-page .bar-chart {
    padding: 6px 14px 8px;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .dashboard-page .bar-chart-body {
    flex: 1 1 auto;
    min-height: 0;
    height: auto;
    padding-top: 16px;
    padding-bottom: 6px;
  }
  .dashboard-page .panel-donut { overflow: hidden; }
  .dashboard-page .donut-wrap {
    grid-template-columns: 120px 1fr;
    padding: 6px 14px 10px;
    gap: 12px;
    align-items: center;
    flex: 1 1 auto;
    min-height: 0;
  }
  .dashboard-page .donut { width: 120px; height: 120px; flex-shrink: 0; }
  .dashboard-page .donut-legend { gap: 6px; }
  .dashboard-page .donut-legend-row { padding: 5px 10px; font-size: 12.5px; }
  .dashboard-page .donut-legend-row strong { font-size: 13.5px; }

  .dashboard-page .session-list,
  .dashboard-page .activity-feed,
  .dashboard-page .hw-status,
  .dashboard-page .dev-list {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }
  .dashboard-page .session-row { padding: 6px 12px; }
  .dashboard-page .activity-row { padding: 6px 0; }
  .dashboard-page .hw-status { padding: 8px 14px 10px; gap: 8px; }
  .dashboard-page .hw-rings { gap: 6px; }
  .dashboard-page .ring-gauge { padding: 4px 2px; }
  .dashboard-page .hw-meta { grid-template-columns: repeat(4, 1fr); gap: 6px; padding-top: 6px; }
  .dashboard-page .hw-meta-item strong { font-size: 12px; }
  .dashboard-page .hw-meta-item span { font-size: 10px; }
  .dashboard-page .dev-row { padding: 6px 6px; }
  .dashboard-page .dev-status-summary { padding: 6px 16px; }

  /* Sticky header + scrollable body cho trang Báo cáo */
  .report-page {
    height: 100%;
    min-height: 0;
    gap: 12px;
    overflow: hidden;
  }
  .report-fixed {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .report-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding-bottom: 4px;
  }
  .report-scroll .table-card { overflow: visible; }
  .report-scroll thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: #f8faff;
  }

  /* =============================================================
     CASE PREVIEW LAYOUT — 2 cột (main + aside) + action bar
     ============================================================= */
  .case-preview {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
    overflow: auto;        /* scroll cả trang theo trục dọc — các tier xếp tuần tự, không đè lên nhau */
    padding-bottom: 8px;
  }
  .case-tier-1,
  .case-tier-2,
  .case-tier-3,
  .case-tier-4 { width: 100%; }
  .case-aside  { width: 100%; }
  .case-action-bar { width: 100%; }
  .case-action-bar {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    padding: 10px;
    background: white;
    border: 1px solid #e6cdd0;
    border-radius: 10px;
  }
  .case-action-bar .button { width: 100%; }
  .case-action-bar .button.danger {
    color: #b91c26;
    border: 1px solid #e6cdd0;
    background: white;
  }
  .case-action-bar .button.danger:hover { background: #fff5f6; }

  .case-tier-1 {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    min-height: 0;
  }
  .case-tier-1 .cap-block { min-height: 0; overflow: visible; display: flex; flex-direction: column; }

  /* Body photos (3 khung ảnh + thước đo) */
  .body-shots {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: 1fr;
    gap: 6px;
    padding: 6px 8px 8px;
    min-height: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }
  .body-shot {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    min-height: 0;
    height: 100%;
  }
  .body-shot-label {
    display: block;
    text-align: center;
    color: #4a0f14;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1px;
  }
  .body-shot-body {
    position: relative;
    display: flex;
    gap: 0;
    flex: 1;
    min-height: 0;
  }
  .body-shot-body--ruler {
    /* Không dùng padding — ruler nổi absolute bên trong khung ảnh, không đẩy frame lệch */
  }
  .ruler {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 2px 0;
    width: 18px;
    flex-shrink: 0;
    font-size: 7px;
    font-weight: 700;
    color: #7f171e;
    text-align: right;
    line-height: 1;
    border-right: 1px solid #d9c3c6;
  }
  .ruler--external {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 20px;
    border-right: 1px solid #d9c3c6;
    background: transparent;
  }
  .ruler span { display: block; }
  .body-shot-frame {
    flex: 1;
    border-radius: 6px;
    overflow: hidden;
    background: #fafafa;
    min-height: 0;
    display: flex;
  }
  /* Đã chụp: chỉ viền khung đổi xanh — nút vẫn là nút chụp đỏ như cũ.
     Dùng outline (offset âm, vẽ đè vào trong) nên không chiếm chỗ,
     khung ảnh không xê dịch và trạng thái chưa chụp không đổi. */
  .body-shot-frame--done {
    outline: 5px solid #12af64;
    outline-offset: -5px;
  }
  .body-shot-frame > * {
    flex: 1;
    min-height: 0;
  }
  .body-shot-frame img { width: 100%; height: 100%; object-fit: cover; }
  .body-shot-frame--measure { position: relative; }
  .height-measure-overlay {
    position: absolute;
    inset: 0;
    z-index: 4;
    pointer-events: none;
  }
  .height-measure-line {
    position: absolute;
    left: 50%;
    width: 0;
    border-left: 3px solid #ffd400;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,.45));
    pointer-events: none;
  }
  .height-measure-line::before,
  .height-measure-line::after {
    content: "";
    position: absolute;
    left: -20px;
    width: 40px;
    border-top: 2px solid #ffd400;
  }
  .height-measure-line::before { top: 0; }
  .height-measure-line::after { bottom: 0; }
  .height-measure-handle {
    position: absolute;
    left: -9px;
    width: 16px;
    height: 16px;
    padding: 0;
    border-radius: 50%;
    background: #ffd400;
    border: 2px solid #7f171e;
    box-shadow: 0 1px 3px rgba(0,0,0,.35);
    pointer-events: auto;
    cursor: ns-resize;
    touch-action: none;
  }
  .height-measure-handle.top { top: -6px; }
  .height-measure-handle.bottom { bottom: -6px; }
  .height-measure-value {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(127, 23, 30, .88);
    color: #fff;
    font-size: 10px;
    font-weight: 800;
    white-space: nowrap;
  }
  .height-measure-range {
    position: absolute;
    left: 8px;
    right: 8px;
    width: calc(100% - 16px);
    height: 18px;
    opacity: .01;
    pointer-events: auto;
    cursor: ns-resize;
  }
  .height-measure-range--top { top: 0; }
  .height-measure-range--bottom { bottom: 0; }
  .body-shot-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: #000;
    display: block;
  }
  .body-shot-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 100%;
    color: #b7a7a9;
    font-size: 10.5px;
    font-weight: 600;
    background: linear-gradient(180deg, #f5efe4 0%, #eadfd3 100%);
  }
  .body-shot-placeholder svg {
    width: 55%;
    max-width: 90px;
    height: auto;
    color: #b7a7a9;
  }
  .body-shot-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 3px 8px;
    margin: 3px auto 0;
    width: fit-content;
    min-height: 22px;
    border: 0;
    border-radius: 5px;
    background: #b91c26;
    color: white;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .2px;
    cursor: pointer;
    transition: .15s;
  }
  .body-shot-btn:hover:not(:disabled) { background: #7f171e; }
  .body-shot-btn:disabled { opacity: .5; cursor: not-allowed; }
  .body-shot-btn svg { width: 10px; height: 10px; }
  /* Nút giữ nguyên kiểu capture đỏ ở cả 2 trạng thái —
     dấu hiệu "đã chụp" nằm ở viền khung ảnh, không ở nút. */
  .body-shot-err {
    padding: 8px;
    color: #b91c26;
    font-size: 10px;
    text-align: center;
    align-self: center;
    width: 100%;
  }

  /* Personal info — 2 cột × 6 hàng, mỗi field: label trên, input dưới */
  .personal-info {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(6, minmax(0, 1fr));
    grid-auto-flow: column;
    align-content: stretch;
    gap: 4px 10px;
    padding: 6px 10px 8px;
    min-height: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }
  /* Biến thể 3 cột cho tier 2 personal-info (có cột 3 = trường mới: đặc điểm, ngày cấp, cơ quan cấp, MRZ) */
  .personal-info--3col {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: repeat(5, minmax(0, 1fr));
  }
  /* Ô MRZ — textarea 2-3 dòng, cao hơn input thường, kéo dài cả ô grid */
  .info-field-mrz { grid-row: span 2; }
  .control-mrz {
    width: 100%;
    height: 100%;
    min-height: 56px;
    resize: vertical;
    font-family: "Cascadia Mono", "Consolas", "Courier New", monospace;
    font-size: 10px;
    line-height: 1.3;
    letter-spacing: .2px;
    white-space: pre;
  }
  .info-field {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    min-width: 0;
    min-height: 0;
  }
  .info-field-label {
    color: #47597a;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .1px;
    line-height: 1;
  }
  .info-field .control-sm {
    width: 100%;
    height: 26px;
    padding: 0 8px;
    border: 1px solid #d9e3f0;
    border-radius: 6px;
    background: white;
    color: #0f2344;
    font-size: 11.5px;
    font-weight: 600;
    outline: none;
  }
  .info-field .control-sm:focus {
    border-color: #b91c26;
    box-shadow: 0 0 0 2px rgba(185, 28, 38, .14);
  }
  .info-field select.control-sm {
    padding-right: 20px;
  }

  /* CCCD wrapper — bo hộp cho gọn */
  .cccd-preview-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .cccd-preview-wrap .cccd-card-mock {
    width: 100%;
    height: auto;
    max-width: 100%;
    box-shadow: 0 4px 14px rgba(74, 15, 20, .12);
    border-radius: 12px;
    overflow: hidden;
  }

  /* Tier 2: Personal info form (đã dời từ tier 1 xuống) — 1 cột fill chiều cao */
  .case-tier-2 {
    min-height: 0;
    overflow: visible;   /* nội dung tràn ra, scroll cả trang */
  }
  .case-tier-2 .cap-block { min-height: 0; overflow: visible; display: flex; flex-direction: column; }

  /* Tier 3: Fingerprints (trên) + CHẤT LƯỢNG (dưới, chiều cao thấp) */
  .case-tier-3 {
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    gap: 10px;
    min-height: 0;
  }
  .case-tier-3 .cap-block { min-height: 0; overflow: visible; }
  .fp-preview-grid {
    display: grid;
    grid-template-columns: 68px repeat(5, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 5px;
    padding: 8px 10px 10px;
    flex: 1 1 auto;
    min-height: 0;
    overflow: visible;
  }
  .fp-preview-cell {
    min-height: 0;
    overflow: hidden;
  }
  .fp-hand-label {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0 4px;
    background: #fde8ea;
    color: #7f171e;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .8px;
    border-radius: 6px;
    line-height: 1.1;
    writing-mode: horizontal-tb;
  }
  /* Single-row variant: label xuống hàng 2, span 5 cột, không nền pill */
  .fp-preview-grid.fp-preview-grid--single-row {
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    grid-template-rows: auto auto;
    gap: 6px;
    padding: 8px 10px 10px;
    align-content: center;
    justify-content: center;
    align-items: center;
  }
  .fp-preview-grid.fp-preview-grid--single-row .fp-preview-cell {
    grid-row: 1;
  }
  .fp-preview-grid.fp-preview-grid--single-row .fp-hand-below {
    grid-row: 2;
    background: transparent;
    color: #8E0000;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .8px;
    padding: 6px 4px 2px;
    border-top: 1px solid #E3E6EC;
    border-radius: 0;
    margin-top: 4px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .fp-preview-grid.fp-preview-grid--single-row .fp-hand-below-left {
    grid-column: 1 / span 5;
  }
  .fp-preview-grid.fp-preview-grid--single-row .fp-hand-below-right {
    grid-column: 6 / span 5;
  }
  .fp-preview-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 4px;
    border: 1px solid #e6cdd0;
    border-radius: 8px;
    background: #fff;
  }
  .fp-preview-cell.done { border-color: #12af64; background: #f0fbf6; }
  .fp-preview-cell.empty { border-style: dashed; background: #fafafa; }
  /* Ô ngón đang chờ đặt: vòng sáng đỏ chạy quanh viền báo đang chờ thu (live) */
  .fp-preview-cell.active {
    border-color: transparent;
    background: #fdf2f3;
    position: relative;
    z-index: 0;
  }
  .fp-preview-cell.active::before {
    content: "";
    position: absolute;
    inset: -2px;
    border-radius: 10px;
    padding: 2px;
    background: conic-gradient(from var(--fp-ring-angle, 0deg),
      rgba(185,28,38,0) 0deg,
      rgba(185,28,38,0) 250deg,
      #e0505a 310deg,
      #b91c26 340deg,
      #e0505a 360deg);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    animation: fp-ring-spin 1.1s linear infinite;
    z-index: -1;
    pointer-events: none;
  }
  @property --fp-ring-angle {
    syntax: "<angle>";
    initial-value: 0deg;
    inherits: false;
  }
  @keyframes fp-ring-spin {
    to { --fp-ring-angle: 360deg; }
  }
  .fp-preview-thumb {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 6px;
    background: #f4f4f4;
    display: grid;
    place-items: center;
    overflow: hidden;
    color: #98a5bd;
  }
  .fp-preview-thumb img {
    width: 100%; height: 100%; object-fit: cover;
    filter: grayscale(1) contrast(1.1);
  }
  .fp-preview-thumb svg { width: 40px; height: 40px; }
  .fp-preview-cell .fp-name {
    font-size: 9.5px;
    font-weight: 800;
    color: #0f2344;
    letter-spacing: .3px;
    text-transform: uppercase;
    text-align: center;
    line-height: 1.1;
  }
  .fp-quality-chip {
    font-size: 8.5px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 999px;
    background: #e6f7ec;
    color: #0a8a45;
  }
  .fp-quality-chip.avg { background: #fff2d9; color: #a26a09; }
  .fp-quality-chip.bad { background: #fde8ea; color: #b91c26; }
  .fp-quality-chip.none { background: #eef2f8; color: #98a5bd; }

  .fp-kpi {
    display: flex;
    flex: 1 1 auto;
    flex-direction: row;
    align-items: center;
    justify-content: space-evenly;
    gap: 12px;
    padding: 6px 14px;
    text-align: center;
    line-height: 1.1;
    min-height: 0;
  }
  .fp-kpi > * { flex-shrink: 0; }
  .fp-kpi-icon {
    width: 36px; height: 36px;
    border-radius: 50%;
    display: grid; place-items: center;
    background: #fde8ea;
    color: #7f171e;
  }
  .fp-kpi-icon svg { width: 22px; height: 22px; }
  .fp-kpi-count {
    color: #7f171e;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: .2px;
    line-height: 1.15;
  }
  .fp-kpi-big {
    color: #7f171e;
    font-size: 26px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -.5px;
  }
  .fp-kpi-caption {
    color: #7d8ca7;
    font-size: 11px;
    font-weight: 600;
  }

  /* Tier 4: 4 cột phụ */
  .case-tier-4 {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    min-height: 0;
  }
  .case-tier-4 .cap-block { min-height: 0; overflow: visible; }
  .tier3-body {
    padding: 6px 10px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
    overflow: visible;
  }
  .tier3-row {
    display: grid;
    grid-template-columns: 16px 1fr auto;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    line-height: 1.25;
    min-height: 0;
  }
  .tier3-row .tier3-icon { color: #7f171e; }
  .tier3-row .tier3-icon svg { width: 12px; height: 12px; }
  .tier3-row .tier3-label { color: #7d8ca7; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tier3-row .tier3-value { color: #0f2344; font-weight: 700; font-family: ui-monospace, Menlo, Consolas, monospace; }
  .tier3-row .tier3-input,
  .tier3-row .control.tier3-input {
    font-size: 11px;
    padding: 2px 6px;
    height: 22px;
    min-width: 0;
  }
  .tier3-row .tier3-input-unit {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .tier3-row .tier3-input-unit .tier3-input {
    flex: 1;
    min-width: 0;
    text-align: right;
  }
  .tier3-row .tier3-unit {
    flex: 0 0 auto;
    color: #7f171e;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .3px;
  }

  .timeline-body {
    padding: 8px 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
  }
  .timeline-item {
    display: grid;
    grid-template-columns: 12px 1fr;
    gap: 8px;
    position: relative;
  }
  .timeline-item::before {
    content: "";
    position: absolute;
    left: 5px; top: 12px; bottom: -14px;
    width: 2px;
    background: #e6cdd0;
  }
  .timeline-item:last-child::before { display: none; }
  .timeline-dot {
    width: 12px; height: 12px;
    border-radius: 50%;
    background: #7f171e;
    margin-top: 3px;
    z-index: 1;
  }
  .timeline-time {
    color: #7d8ca7;
    font-size: 10.5px;
    font-weight: 700;
    font-family: ui-monospace, Menlo, Consolas, monospace;
  }
  .timeline-desc {
    color: #0f2344;
    font-size: 12px;
    font-weight: 600;
    margin-top: 1px;
  }
  .notes-body {
    padding: 8px 12px 10px;
    color: #47597a;
    font-size: 12px;
    line-height: 1.5;
    min-height: 40px;
  }
  .notes-body.empty { color: #b8c1d0; font-style: italic; }

  /* Aside: Case Summary + Data Verification */
  .case-summary { flex-shrink: 0; }
  .summary-body {
    padding: 8px 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    padding: 3px 0;
    border-bottom: 1px dashed #f0e2e4;
    font-size: 11.5px;
  }
  .summary-row:last-child { border-bottom: 0; }
  .summary-row .s-label { color: #7d8ca7; font-weight: 600; }
  .summary-row .s-value {
    color: #0f2344;
    font-weight: 800;
    font-family: ui-monospace, Menlo, Consolas, monospace;
    text-align: right;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .summary-chip {
    margin: 10px 12px 12px;
    display: grid;
    place-items: center;
    height: 40px;
    border-radius: 10px;
    background: #f0c33c;
    color: #4a0f14;
    font-size: 15px;
    font-weight: 900;
    letter-spacing: 1px;
    box-shadow: 0 4px 12px rgba(240, 195, 60, .35);
  }
  .summary-chip.pending { background: #eef2f8; color: #7d8ca7; box-shadow: none; }

  .case-verify {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .verify-body {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .verify-progress-label {
    display: flex;
    justify-content: space-between;
    color: #47597a;
    font-size: 11px;
    font-weight: 700;
  }
  .verify-progress-bar {
    height: 8px;
    border-radius: 999px;
    background: #fde8ea;
    overflow: hidden;
  }
  .verify-progress-bar > span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #b91c26, #7f171e);
    transition: width .3s;
  }
  .verify-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .verify-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px dashed #f0e2e4;
    font-size: 11.5px;
  }
  .verify-item:last-child { border-bottom: 0; }
  .verify-item .v-label { color: #0f2344; font-weight: 600; }
  .verify-item.verify-head { padding: 4px 0; border-bottom: 1px solid #d9c3c6; }
  .verify-item.verify-head .v-label {
    color: #7f171e;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .verify-chip {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .3px;
  }
  .verify-chip.ok { background: #e6f7ec; color: #0a8a45; }
  .verify-chip.miss { background: #fde8ea; color: #b91c26; }
  .verify-banner {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-radius: 8px;
    background: #fff8e0;
    color: #7f5a0e;
    font-size: 11.5px;
    font-weight: 700;
  }
  .verify-banner.warn { background: #fde8ea; color: #b91c26; }
  .verify-banner svg { width: 16px; height: 16px; flex-shrink: 0; }

  /* Preview: content không cần scroll body */
  .content:has(.case-preview) {
    overflow: hidden !important;
    padding: 6px 8px !important;
    display: flex !important;
    flex-direction: column;
  }

  /* =============================================================
     THEME OVERRIDE — CÔNG AN (đỏ maroon + nền phòng họp)
     Chỉ đổi màu & background, không đụng layout/spacing.
     ============================================================= */
  :root {
    --ca-red-900: #4a0f14;
    --ca-red-800: #661319;
    --ca-red-700: #7f171e;
    --ca-red-600: #9a1b23;
    --ca-red-500: #b91c26;
    --ca-red-400: #d33641;
    --ca-red-050: #fde8ea;
    --ca-red-025: #fff5f6;
    --ca-gold:    #f0c33c;
  }

  body,
  :root {
    background: #f5efe4;
  }

  .app {
    background:
      radial-gradient(circle at 80% 10%, rgba(154, 27, 35, .06), transparent 32%),
      #f5efe4 !important;
  }

  /* Header đỏ maroon */
  .header {
    background:
      radial-gradient(circle at 45% -140%, rgba(240, 195, 60, .18), transparent 54%),
      linear-gradient(120deg, var(--ca-red-700) 0%, var(--ca-red-900) 100%) !important;
    box-shadow: 0 8px 28px rgba(74, 15, 20, .28) !important;
  }
  .brand-subtitle { color: #f5d8b6 !important; }
  .server-status { background: rgba(255, 255, 255, .10) !important; border-color: rgba(255,255,255,.22) !important; }
  .avatar { background: linear-gradient(145deg, var(--ca-red-500), var(--ca-red-800)) !important; }
  .user-info span { color: #f5d8b6 !important; }

  /* Sidebar đỏ maroon */
  .sidebar {
    background:
      radial-gradient(circle at 50% -30%, rgba(240, 195, 60, .18), transparent 55%),
      linear-gradient(180deg, var(--ca-red-800) 0%, var(--ca-red-900) 100%) !important;
    border-right: 1px solid rgba(255, 255, 255, .06) !important;
    color: #f6dcbf !important;
  }
  .sidebar-title { color: rgba(246, 220, 191, .60) !important; }
  .nav-item {
    background: rgba(255, 255, 255, .04) !important;
    border-color: rgba(255, 255, 255, .08) !important;
    color: #f2dbc0 !important;
  }
  .nav-item:hover {
    background: rgba(240, 195, 60, .15) !important;
    border-color: rgba(240, 195, 60, .45) !important;
    color: white !important;
  }
  .nav-item.active {
    background: linear-gradient(135deg, var(--ca-red-500), var(--ca-red-700)) !important;
    border-color: rgba(240, 195, 60, .55) !important;
    box-shadow:
      0 8px 18px rgba(74, 15, 20, .55),
      inset 0 1px 0 rgba(255, 255, 255, .18) !important;
    color: white !important;
  }
  .nav-icon { background: rgba(255, 255, 255, .06) !important; color: var(--ca-gold) !important; }
  .nav-item:hover .nav-icon { background: rgba(240, 195, 60, .22) !important; color: white !important; }
  .nav-item.active .nav-icon {
    background: rgba(255, 255, 255, .20) !important;
    color: white !important;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .22) !important;
  }
  .security-card {
    background: linear-gradient(145deg, rgba(240, 195, 60, .20), rgba(154, 27, 35, .10)) !important;
    border-color: rgba(240, 195, 60, .28) !important;
    color: #f6dcbf !important;
  }
  .security-icon { background: rgba(240, 195, 60, .25) !important; color: white !important; }

  /* Nút primary đỏ */
  .button.primary {
    background: linear-gradient(135deg, var(--ca-red-500), var(--ca-red-700)) !important;
    box-shadow: 0 7px 16px rgba(154, 27, 35, .28) !important;
    color: white !important;
  }
  .button.secondary { color: var(--ca-red-800) !important; border-color: #e6cdd0 !important; }

  /* Focus & link accents chuyển sang đỏ */
  .control:focus {
    border-color: var(--ca-red-500) !important;
    box-shadow: 0 0 0 3px rgba(185, 28, 38, .14) !important;
  }
  .panel-header button { color: var(--ca-red-700) !important; }

  /* Bảng: header đỏ nhạt */
  th { background: var(--ca-red-050) !important; color: var(--ca-red-800) !important; }
  tbody tr:hover { background: var(--ca-red-025) !important; }
  .row-actions button { color: var(--ca-red-800) !important; border-color: #e6cdd0 !important; }
  .pagination button { color: var(--ca-red-800) !important; border-color: #e6cdd0 !important; }

  /* Stat card accent */
  .stat-card.blue   { --accent: var(--ca-red-600); --soft: var(--ca-red-050); }
  .stat-card.purple { --accent: #7a1f52;           --soft: #fbe6ef; }

  /* Hero card */
  .dash-hero {
    background:
      radial-gradient(circle at 90% 20%, rgba(154, 27, 35, .10), transparent 45%),
      linear-gradient(135deg, #ffffff 0%, #fff5f6 100%) !important;
    border-color: #f0d8db !important;
  }

  /* Capture page: đầu card sang đỏ */
  .cap-block-head {
    background: linear-gradient(180deg, var(--ca-red-600) 0%, var(--ca-red-800) 100%) !important;
  }

  /* Page-title icon */
  .page-title-icon {
    background: linear-gradient(145deg, var(--ca-red-500), var(--ca-red-800)) !important;
    box-shadow: 0 6px 14px rgba(154, 27, 35, .28) !important;
  }
`;
