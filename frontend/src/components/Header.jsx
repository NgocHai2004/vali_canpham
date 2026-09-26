import React, { useState, useRef, useEffect } from "react";
import { useI18n, LanguageSwitch } from "../i18n";
import { notify } from "../notifications";
import { Icon } from "./Icons";
import { formatDateTime } from "../lib/formatters";
import DetailModal from "./DetailModal";
import DashThemeToggle from "./dashboard/DashThemeToggle";

const DEVICE_CHIPS = [
  { key: "camera", labelKey: "header.device.camera" },
  { key: "fp", labelKey: "header.device.fp" },
];

export function Header({ username, fullName, devices, notif, onLogout, isAdmin, onEditProfile, onEditDetainee, theme, onToggleTheme }) {
  const { t } = useI18n();
  const chips = DEVICE_CHIPS;
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
          {chips.map((d) => {
            const ok = Boolean(devices?.[d.key]);
            const label = t(d.labelKey);
            return (
              <div
                key={d.key}
                className={`device-chip device-chip--${d.key} ${ok ? "online" : "offline"}`}
                title={`${label}: ${ok ? t("header.device.connected") : t("header.device.disconnected")}`}
              >
                <span className="device-chip-dot" />
                <span className="device-chip-label">{label}</span>
              </div>
            );
          })}
        </div>

        <LanguageSwitch />

        {/* Nút sáng/tối đứng TRƯỚC nút chuông: chuông có badge số đếm tràn ra
            ngoài góc (`.icon-button b` lệch top/right âm), kẹp nút khác vào bên
            phải nó là badge đè lên. Để chuông ở cuối hàng thì badge nhô ra chỗ
            trống. `onToggleTheme` có thể vắng (màn không có theme) → ẩn hẳn nút
            thay vì vẽ một nút bấm không làm gì. */}
        {onToggleTheme && (
          <DashThemeToggle theme={theme} onToggle={onToggleTheme} className="icon-button" />
        )}

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
                            <div className="notif-item-cta">
                              <span className="notif-item-cta-view">{t("capture.alert.open_profile")}</span>
                              {onEditDetainee && (
                                <button
                                  type="button"
                                  className="notif-item-cta-edit"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNotifOpen(false);
                                    onEditDetainee(it.meta.detainee);
                                  }}
                                >
                                  {t("capture.alert.edit_profile")}
                                </button>
                              )}
                            </div>
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
            <div role="menu" className="user-menu">
              {/* Nền panel trước đây là inline style hardcode gradient navy đậm, còn
                  chữ lại dùng `var(--text)` — token này ở theme sáng là #0f172a, nên
                  ra chữ tối trên nền tối, không đọc được. Inline style không có cách
                  nào bám theo `data-dash-theme`, nên phải chuyển sang class. */}
              <button
                type="button"
                role="menuitem"
                className="user-menu-item"
                onClick={() => { setUserMenuOpen(false); onEditProfile && onEditProfile(); }}
              >
                {t("profile.edit_menu")}
              </button>
            </div>
          )}
        </div>

        <button className="logout-button" onClick={onLogout} aria-label={t("header.logout")}>
          {Icon.logout}
          <span className="logout-button__label">{t("header.logout")}</span>
        </button>
      </div>
      {viewingMatch && (
        <DetailModal detainee={viewingMatch} onClose={() => setViewingMatch(null)} />
      )}
    </header>
  );
}

export default Header;
