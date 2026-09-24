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
import DataCapturePage from "./DataCapturePage";
import SessionListPage from "./SessionListPage";
import SessionDetailPage from "./SessionDetailPage";
import DashboardHome from "./pages/DashboardHome";
import DetaineesPage from "./pages/DetaineesPage";
import CellsPage, { CellForm } from "./pages/CellsPage";
import DetaineeHistoryPage from "./pages/DetaineeHistoryPage";
import SyncPage from "./pages/SyncPage";
import LogsPage from "./pages/LogsPage";
import UsersPage from "./pages/UsersPage";
import SettingsPage from "./pages/SettingsPage";
import { FieldRow } from "./components/FieldRow";
import "./dashboard.css";
// Phải import SAU "./dashboard.css": CSS của DashboardHome được phát ra trước
// (vì dòng import nó ở trên), nên nếu đặt import này trong DashboardHome.jsx
// thì dashboardHome.css sẽ đứng TRƯỚC dashboard.css và thua mọi xung đột.
import "./dashboardHome.css";

// Re-export for components importing from Dashboard
export { CellForm, FieldRow };

const NAV_BASE = [
  { key: "dashboard", labelKey: "nav.dashboard", icon: Icon.dashboard },
  { key: "sessions", labelKey: "nav.sessions", icon: Icon.clipboard },
  { key: "detainees", labelKey: "nav.detainees", icon: Icon.folder },
  // Sidebar chỉ có icon, KHÔNG có chữ → hai mục dùng chung một icon là không
  // phân biệt được. Trước đây `cells` dùng Icon.sync (trùng `sync`) và `logs`
  // dùng Icon.clipboard (trùng `sessions`). Đổi sang icon đúng nghĩa hơn:
  // Cơ sở giam giữ = toà nhà, Nhật ký = trang tài liệu.
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
 * Các trang đã chuyển sang bố cục `dh-*` (thiết kế theo mockup 1280x720).
 *
 * Danh sách này điều khiển `data-dash-zoom` — tức `zoom: 1.5` và header gọn 50px
 * ở dashboardHome.css. CHỈ thêm trang vào đây sau khi đã port sang primitive
 * `dh-*`: trang chưa port (Nhập liệu, Cài đặt, Đồng bộ…) được thiết kế theo bề
 * ngang 1920 thật, bị phóng 1.5 lần là tràn ngang.
 */
const DH_PAGES = new Set([
  "dashboard",
  "detainees",
  "cells",
  "sessions",
  "detainee_history",
  "logs",
  "users",
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
  // Trang đã đứng trước khi vào form thu nhận, để nút Quay lại trả về đúng chỗ:
  // vào từ Danh sách can phạm thì về danh sách, vào từ chi tiết phiên thì về phiên.
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

  // Vào form thu nhận: ghi lại trang hiện tại trước khi đổi để nút Quay lại của
  // form biết đường về. `page` lúc này vẫn là trang xuất phát.
  const goCapture = () => {
    setCaptureFrom(page);
    setPage("session_capture");
  };

  // Rời form thu nhận mà KHÔNG lưu. Về đúng trang đã vào từ đó; mặc định về
  // danh sách phiên như hành vi cũ nếu không rõ nguồn.
  const leaveCapture = () => {
    setEditingDetainee(null);
    setSessionCtx(null);
    const back = captureFrom && captureFrom !== "session_capture" ? captureFrom : "sessions";
    if (back !== "sessions_detail") setActiveSessionId(null);
    setCaptureFrom(null);
    setPage(back);
  };

  const editDetainee = async (detainee) => {
    // Admin không có phiên của riêng mình nên getCurrentSession() luôn 404.
    // Vẫn giữ quyền SỬA hồ sơ → mở form trực tiếp, không gắn phiên.
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
      /* dùng dữ liệu có sẵn nếu không nạp được */
    }
    setEditingDetainee(full);
    setSessionCtx(null);
    setActiveSessionId(null);
    goCapture();
  };

  // Đăng ký can phạm từ màn danh sách. Thu nhận hồ sơ PHẢI gắn vào một phiên
  // đang mở (backend gắn detainee vào session), nên đây chỉ là đường tắt: tìm
  // phiên hiện tại của cán bộ rồi vào thẳng form thu nhận, không có thì đẩy về
  // màn Phiên làm việc để mở phiên trước. Cùng cách xử lý với `editDetainee`.
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
    // HAI thuộc tính, HAI vai trò — đừng gộp lại:
    //   data-dash-theme: MÀU SẮC, luôn có → mọi trang đổi tông theo nút sáng/tối.
    //   data-dash-zoom:  HÌNH HỌC (zoom 1.5 + header gọn 50px), chỉ các trang đã
    //     port sang bố cục dh-* (DH_PAGES). Trang chưa port được thiết kế theo bề
    //     ngang 1920 thật, bị phóng 1.5 lần là tràn ngang.
    // React bỏ hẳn attribute khi giá trị là undefined.
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
        theme={dashTheme.theme}
        onToggleTheme={dashTheme.toggle}
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

      {/* Sidebar chỉ còn icon (cột 56px). Nhãn chữ hiện qua tooltip khi hover
          (data-tip + CSS ::after) — không dùng title= để tránh tooltip hệ thống
          chậm và lệch tông màu. aria-label giữ cho trình đọc màn hình. */}
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
