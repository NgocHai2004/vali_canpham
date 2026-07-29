import { useEffect, useState } from "react";
import { api, exportToUsb } from "./api";
import { notify } from "./notifications";
import { useI18n } from "./i18n";
import UsbDrivePickerModal from "./UsbDrivePickerModal";
import { toast } from "./Toast";

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SessionDetailPage({ sessionId, onBack, onAddDetainee, onEditDetainee, onSessionClosed }) {
  const { t, formatDate, formatDateTime } = useI18n();
  const openEditFull = async (d, session) => {
    if (!onEditDetainee) return;
    try {
      const full = await api.getDetainee(d.id);
      onEditDetainee(full, session);
    } catch {
      onEditDetainee(d, session);
    }
  };
  const [session, setSession] = useState(null);
  const [officer, setOfficer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDeleteSess, setConfirmDeleteSess] = useState(false);
  const [confirmDelRow, setConfirmDelRow] = useState(null);
  const [usbPicker, setUsbPicker] = useState({ open: false, drives: [], resolve: null });

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const s = await api.getSession(sessionId);
      setSession(s);
      if (s?.officer) {
        try {
          const users = await api.listUsers();
          setOfficer(users.find((u) => u.username === s.officer) || null);
        } catch {
          setOfficer(null);
        }
      }
    } catch (ex) {
      setErr(ex.message || t("session.detail.err.load"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [sessionId]);

  const doClose = () => setConfirmClose(true);
  const runClose = async () => {
    setConfirmClose(false);
    if (!session) return;
    setClosing(true);
    setErr("");
    try {
      await api.closeSession(sessionId);
      notify.add();
      if (onSessionClosed) onSessionClosed(session);
      await load();
    } catch (ex) {
      setErr(ex.message || t("session.detail.err.close"));
    } finally {
      setClosing(false);
    }
  };

  const doDelete = () => setConfirmDeleteSess(true);
  const runDelete = async () => {
    setConfirmDeleteSess(false);
    if (!session) return;
    setClosing(true);
    setErr("");
    try {
      await api.deleteSession(sessionId);
      notify.add();
      if (onSessionClosed) onSessionClosed(session);
    } catch (ex) {
      setErr(ex.message || t("session.detail.err.delete_full"));
    } finally {
      setClosing(false);
    }
  };

  const pickDrive = (drives) => new Promise((resolve) => {
    setUsbPicker({ open: true, drives, resolve });
  });

  const doDownload = async () => {
    if (!session) return;
    try {
      const res = await exportToUsb(
        `/api/sessions/${sessionId}/report`,
        session.report_filename || `session_${session.code || sessionId}.xlsx`,
        pickDrive,
      );
      if (!res.cancelled) {
        const msg = t("usb.export.success", { path: res.path });
        toast.success(msg);
        notify.add(msg);
      }
    } catch (ex) {
      toast.error(ex.message || t("session.detail.err.report"));
    }
  };

  const removeDetainee = (d) => setConfirmDelRow(d);
  const runRemoveDetainee = async () => {
    const d = confirmDelRow;
    setConfirmDelRow(null);
    if (!d) return;
    try {
      await api.deleteDetainee(d.id);
      notify.add();
      await load();
    } catch (ex) {
      alert(ex.message || t("session.detail.err.delete_row"));
    }
  };

  if (loading) return <div className="session-detail-page"><div>{t("common.loading")}</div></div>;
  if (err && !session) return (
    <div className="session-detail-page">
      <button className="btn-link" onClick={onBack}>{t("common.back")}</button>
      <div className="error-box">{err}</div>
    </div>
  );
  if (!session) return null;

  const isOpen = session.status === "open";

  return (
    <div className="session-detail-page">
      <button className="btn-link session-detail-back" onClick={onBack}>{t("common.back_to_list")}</button>

      <div className={"session-detail-head " + (isOpen ? "open" : "closed")}>
        <div className="session-detail-title">
          {isOpen ? <span className="badge badge-open">{t("session.status.open_dot")}</span> : <span className="badge badge-closed">{t("session.status.closed_dot")}</span>}
          <span className="session-detail-code mono">{session.code}</span>
        </div>
        <div className="session-detail-officer">
          {(() => {
            const displayName = (officer?.full_name || session.officer_full_name || session.officer || "?").trim();
            const initials = (displayName[0] || "?").toUpperCase();
            const avatarUrl = officer?.avatar_url;
            return (
              <>
                {avatarUrl ? (
                  <img className="officer-avatar officer-avatar-lg" src={avatarUrl} alt="" />
                ) : (
                  <span className="officer-avatar officer-avatar-lg officer-avatar-fallback">{initials}</span>
                )}
                <div className="officer-name">
                  <strong>{displayName}</strong>
                  <small>@{session.officer}</small>
                </div>
              </>
            );
          })()}
        </div>
        <div className="session-detail-meta">
          <span>{t("session.detail.opened")}: <strong>{formatDateTime(session.opened_at)}</strong></span>
          {!isOpen && <span>{t("session.detail.closed")}: <strong>{formatDateTime(session.closed_at)}</strong></span>}
          {session.location && <span>{t("session.detail.location")}: <strong>{session.location}</strong></span>}
        </div>
        {session.note && <div className="session-detail-note">{t("session.detail.note")}: {session.note}</div>}
      </div>

      {err && <div className="error-box">{err}</div>}

      <div className="session-detail-toolbar">
        <div className="session-detail-toolbar-title">{t("session.detail.detainees_header", { n: session.detainee_count || 0 })}</div>
        <div className="session-detail-toolbar-actions">
          {isOpen ? (
            <>
              <button className="btn-primary" onClick={() => onAddDetainee && onAddDetainee(session.id)}>{t("session.detail.add_new")}</button>
              <button className="btn-danger-outline" onClick={doClose} disabled={closing}>
                {closing ? t("session.detail.closing") : t("session.detail.close")}
              </button>
              <button className="btn-danger-outline" onClick={doDelete} disabled={closing}>
                {closing ? t("session.detail.deleting") : t("session.detail.delete")}
              </button>
            </>
          ) : (
            <>
              <button className="btn-danger-outline" onClick={doDelete} disabled={closing}>
                {closing ? t("session.detail.deleting") : t("session.detail.delete")}
              </button>
              <button className="btn-primary" onClick={doDownload}>{t("session.detail.download_report")}</button>
            </>
          )}
        </div>
      </div>

      <div className="session-list-table-wrap">
        <table className="session-list-table">
          <thead>
            <tr>
              <th>{t("detainee.field.personal_id")}</th>
              <th>{t("session.col.name")}</th>
              <th>{t("detainee.field.gender")}</th>
              <th>{t("detainee.field.dob")}</th>
              <th>{t("session.col.cccd")}</th>
              <th>{t("session.col.cell")}</th>
              <th>{t("session.col.time")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(session.detainees || []).length === 0 && (
              <tr>
                <td colSpan={8} className="session-list-empty">
                  {isOpen ? t("session.detail.empty_open") : t("session.detail.empty_closed")}
                </td>
              </tr>
            )}
            {(session.detainees || []).map((d) => (
              <tr key={d.id} className="session-list-row" onClick={() => openEditFull(d, session)}>
                <td className="mono">{d.personal_id || d.code || "—"}</td>
                <td>{d.full_name}</td>
                <td>{d.gender === "female" ? t("common.female") : t("common.male")}</td>
                <td>{d.dob ? formatDate(d.dob) : "—"}</td>
                <td className="mono">{d.cccd_number || "—"}</td>
                <td>{d.cell_code || "—"}</td>
                <td>{fmtTime(d.created_at)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {isOpen && (
                    <button type="button" className="btn-link btn-link-danger" onClick={() => removeDetainee(d)}>{t("common.delete")}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmClose && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConfirmClose(false)}>
          <div className="modal-panel confirm-del-modal">
            <div className="modal-head"><h3>{t("session.detail.close")}</h3></div>
            <div style={{ padding: "14px 20px", whiteSpace: "pre-line", lineHeight: 1.5 }}>
              {t("session.detail.confirm.close", { code: session.code, n: session.detainee_count || 0 })}
            </div>
            <div className="modal-actions" style={{ padding: "10px 20px 16px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn-secondary" onClick={() => setConfirmClose(false)}>{t("common.cancel")}</button>
              <button type="button" className="btn-danger" onClick={runClose}>{t("common.confirm")}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteSess && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConfirmDeleteSess(false)}>
          <div className="modal-panel confirm-del-modal">
            <div className="modal-head"><h3>{t("session.detail.delete")}</h3></div>
            <div style={{ padding: "14px 20px", whiteSpace: "pre-line", lineHeight: 1.5 }}>
              {(session.detainee_count || 0) > 0
                ? t("session.detail.confirm.delete_warn", { code: session.code, n: session.detainee_count })
                : t("session.detail.confirm.delete_empty", { code: session.code })}
            </div>
            <div className="modal-actions" style={{ padding: "10px 20px 16px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn-secondary" onClick={() => setConfirmDeleteSess(false)}>{t("common.cancel")}</button>
              <button type="button" className="btn-danger" onClick={runDelete}>{t("common.delete")}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelRow && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConfirmDelRow(null)}>
          <div className="modal-panel confirm-del-modal">
            <div className="modal-head"><h3>{t("common.delete")}</h3></div>
            <div style={{ padding: "14px 20px", whiteSpace: "pre-line", lineHeight: 1.5 }}>
              {t("session.detail.confirm.delete_row", { code: confirmDelRow.code, name: confirmDelRow.full_name })}
            </div>
            <div className="modal-actions" style={{ padding: "10px 20px 16px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn-secondary" onClick={() => setConfirmDelRow(null)}>{t("common.cancel")}</button>
              <button type="button" className="btn-danger" onClick={runRemoveDetainee}>{t("common.delete")}</button>
            </div>
          </div>
        </div>
      )}

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
