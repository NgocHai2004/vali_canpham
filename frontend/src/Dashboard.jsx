import React, { useState, useEffect } from "react";
import api from "./api";
import { useI18n } from "./i18n";
import { setLastLocale } from "./lib/formatters";
import { Icon } from "./components/Icons";
import Header from "./components/Header";
import ProfileEditModal from "./components/ProfileEditModal";
import useDeviceConnections from "./hooks/useDeviceConnections";
import useNotifState from "./hooks/useNotifState";
import useDashboardTheme from "./hooks/useDashboardTheme";
import DashThemeToggle from "./components/dashboard/DashThemeToggle";
import DataCapturePage from "./DataCapturePage";
import SessionListPage from "./SessionListPage";
import SessionDetailPage from "./SessionDetailPage";
import DashboardHome from "./pages/DashboardHome";
import DetaineesPage from "./pages/DetaineesPage";
import CellsPage, { CellForm } from "./pages/CellsPage";
import SearchPage from "./pages/SearchPage";
import DetaineeHistoryPage from "./pages/DetaineeHistoryPage";
import SyncPage from "./pages/SyncPage";
import LogsPage from "./pages/LogsPage";
import UsersPage from "./pages/UsersPage";
import SettingsPage from "./pages/SettingsPage";
import { FieldRow } from "./components/FieldRow";
// Thứ tự nạp: dashboard.css trước, dashboardHome.css sau để các rule dh-* ghi đè
// đúng độ ưu tiên.
import "./dashboard.css";
import "./dashboardHome.css";

// Re-export for components importing from Dashboard
export { CellForm, FieldRow };

const NAV_BASE = [
  { key: "dashboard", labelKey: "nav.dashboard", icon: Icon.dashboard },
  { key: "sessions", labelKey: "nav.sessions", icon: Icon.clipboard },
  { key: "detainees", labelKey: "nav.detainees", icon: Icon.folder },
  { key: "cells", labelKey: "nav.cells", icon: Icon.building },
  { key: "detainee_history", labelKey: "nav.detainee_history", icon: Icon.log },
  { key: "sync", labelKey: "nav.sync", icon: Icon.sync },
  { key: "logs", labelKey: "nav.logs", icon: Icon.file },
];

const NAV_ADMIN = [
  { key: "users", labelKey: "nav.users", icon: Icon.users },
  { key: "settings", labelKey: "nav.settings", icon: Icon.gear },
];

/**
 * Các trang đã chuyển sang bố cục `dh-*` (thiết kế theo mockup).
 */
const DH_PAGES = new Set([
  "dashboard",
  "detainees",
  "cells",
  "sessions",
  "detainee_history",
  "sync",
  "logs",
  "users",
  "settings",
]);

export default function Dashboard({
  username = "admin",
  role = "user",
  fullName = "",
  onFullNameChange,
  onLogout,
}) {
  const { t, locale } = useI18n();
  useEffect(() => {
    setLastLocale(locale);
  }, [locale]);

  const [page, setPage] = useState("dashboard");
  const [editingDetainee, setEditingDetainee] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionCtx, setSessionCtx] = useState(null);
  const [captureFrom, setCaptureFrom] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const isAdmin = role === "admin";
  const NAV = isAdmin ? [...NAV_BASE, ...NAV_ADMIN] : NAV_BASE;
  const deviceStatus = useDeviceConnections();
  const notifState = useNotifState();
  const dashTheme = useDashboardTheme();

  const goPage = async (key, opts = {}) => {
    if (key !== "session_capture") {
      setEditingDetainee(null);
      setSessionCtx(null);
      setCaptureFrom(null);
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

  const goCapture = () => {
    setCaptureFrom(page);
    setPage("session_capture");
  };

  const leaveCapture = () => {
    setEditingDetainee(null);
    setSessionCtx(null);
    const back = captureFrom && captureFrom !== "session_capture" ? captureFrom : "sessions";
    if (back !== "sessions_detail") setActiveSessionId(null);
    setCaptureFrom(null);
    setPage(back);
  };

  const editDetainee = async (detainee) => {
    if (isAdmin) {
      await openEditForm(detainee);
      return;
    }
    setEditingDetainee(detainee);
    try {
      const cur = await api.getCurrentSession();
      setSessionCtx({ sessionId: cur.id, sessionCode: cur.code, sessionReadOnly: false });
      setActiveSessionId(cur.id);
      goCapture();
    } catch (ex) {
      alert(t("session.open.err.officer_required_alt") || t("session.open.err.officer_required"));
      setEditingDetainee(null);
      setPage("sessions");
    }
  };

  const openEditForm = async (detainee) => {
    let full = detainee;
    try {
      if (detainee?.id) full = await api.getDetainee(detainee.id);
    } catch {
      /* dùng dữ liệu có sẵn */
    }
    setEditingDetainee(full);
    setSessionCtx(null);
    setActiveSessionId(null);
    goCapture();
  };

  const registerDetainee = async () => {
    setEditingDetainee(null);
    try {
      const cur = await api.getCurrentSession();
      setSessionCtx({ sessionId: cur.id, sessionCode: cur.code, sessionReadOnly: false });
      setActiveSessionId(cur.id);
      goCapture();
    } catch {
      alert(t("session.open.err.officer_required_alt") || t("session.open.err.officer_required"));
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
    goCapture();
  };

  const editDetaineeInSession = (detainee, session) => {
    setEditingDetainee(detainee);
    setSessionCtx({
      sessionId: session.id,
      sessionCode: session.code,
      sessionReadOnly: session.status !== "open",
    });
    goCapture();
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
    <div
      className="app"
      data-dash-theme={dashTheme.theme}
      data-dash-zoom={DH_PAGES.has(page) ? "on" : undefined}
    >
      <Header
        username={username}
        fullName={fullName}
        devices={deviceStatus}
        notif={notifState}
        onLogout={onLogout}
        isAdmin={isAdmin}
        onEditProfile={() => setShowProfileModal(true)}
        onEditDetainee={openEditForm}
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

      {/* Sidebar menu bên trái */}
      <aside className="sidebar">
        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${page === item.key ? "active" : ""}`}
              onClick={() => goPage(item.key)}
              data-tip={t(item.labelKey)}
              aria-label={t(item.labelKey)}
              aria-current={page === item.key ? "page" : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
            </button>
          ))}
        </nav>

        {/* Nút đổi theme sáng/tối */}
        <DashThemeToggle theme={dashTheme.theme} onToggle={dashTheme.toggle} />

        <div
          className="security-card"
          data-tip={`${t("nav.security_title")} — ${t("nav.security_desc")}`}
          aria-label={t("nav.security_title")}
        >
          <div className="security-icon">{Icon.shield}</div>
        </div>
      </aside>

      <main className="content">
        {page === "dashboard" && (
          <DashboardHome go={goPage} fullName={fullName} />
        )}
        {page === "detainees" && (
          <DetaineesPage onEdit={editDetainee} onRegister={registerDetainee} isAdmin={isAdmin} />
        )}
        {page === "cells" && <CellsPage />}
        {page === "search" && <SearchPage />}
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
            role={role}
            onBack={backToSessionList}
            onAddDetainee={addDetaineeToSession}
            onEditDetainee={editDetaineeInSession}
            onSessionClosed={handleSessionClosed}
          />
        )}
        {page === "session_capture" && (
          <DataCapturePage
            go={goPage}
            initial={editingDetainee}
            onDone={() => setEditingDetainee(null)}
            sessionId={sessionCtx?.sessionId}
            sessionCode={sessionCtx?.sessionCode}
            sessionReadOnly={sessionCtx?.sessionReadOnly}
            onSavedInSession={doneSessionCapture}
            onEditProfile={editDetainee}
            onBack={leaveCapture}
          />
        )}
        {page === "detainee_history" && <DetaineeHistoryPage onEdit={editDetainee} />}
        {page === "sync" && <SyncPage />}
        {page === "logs" && <LogsPage />}
        {page === "users" && isAdmin && <UsersPage currentUser={username} />}
        {page === "settings" && isAdmin && <SettingsPage />}
      </main>
    </div>
  );
}
