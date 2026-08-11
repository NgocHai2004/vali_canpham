import { useEffect, useState } from "react";
import { api, exportToUsb } from "./api";
import { notify } from "./notifications";
import SessionOpenModal from "./SessionOpenModal";
import { CellForm } from "./Dashboard";
import UsbDrivePickerModal from "./UsbDrivePickerModal";
import { toast } from "./Toast";
import { useI18n } from "./i18n";

const STAT_ICONS = {
  blue: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" />
    </svg>
  ),
  orange: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6v5h-5M4 18v-5h5" /><path d="M6.1 9A7 7 0 0 1 18 6l2 5M4 13l2 5a7 7 0 0 0 11.9-3" />
    </svg>
  ),
  purple: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  ),
  green: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 18a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.34 8.05 4.5 4.5 0 0 0 7 18" /><path d="m8 14 4-4 4 4M12 10v9" />
    </svg>
  ),
};

function StatCard({ tone, label, value, note }) {
  return (
    <div className={`report-stat ${tone}`}>
      <div className="report-stat-icon">{STAT_ICONS[tone]}</div>
      <div className="report-stat-body">
        <span className="report-stat-label">{label}</span>
        <strong className="report-stat-value">{value}</strong>
        <small className="report-stat-note">{note}</small>
      </div>
    </div>
  );
}

export default function SessionListPage({ role, username, fullName, onOpenSession }) {
  const { t, formatDateTime } = useI18n();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [mineOnly, setMineOnly] = useState(role !== "admin");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [cellFormOpen, setCellFormOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [stats, setStats] = useState({ create: 0, update: 0, delete: 0, import: 0 });
  const [deletingId, setDeletingId] = useState(null);
  const [exportingId, setExportingId] = useState(null);
  const [usbPicker, setUsbPicker] = useState({ open: false, drives: [], resolve: null });
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const removeSession = (s) => setConfirmDel(s);

  const doDeleteSession = async () => {
    const s = confirmDel;
    if (!s) return;
    setDeletingId(s.id);
    setConfirmDel(null);
    try {
      await api.deleteSession(s.id);
      notify.add();
      await load();
    } catch (ex) {
      alert(ex.message || t("session.err.delete"));
    } finally {
      setDeletingId(null);
    }
  };

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const [resp, cur, logsResp] = await Promise.all([
        api.listSessions({
          status: statusFilter,
          mine_only: mineOnly ? "true" : "",
          date_from: dateFrom,
          date_to: dateTo,
          skip: String((page - 1) * pageSize),
          limit: String(pageSize),
        }),
        api.getCurrentSession().catch(() => null),
        api.listLogs({ resource: "detainee" }).catch(() => ({ counts: {} })),
      ]);
      setItems(resp.items || []);
      setTotal(resp.total || 0);
      setCurrent(cur);
      const c = logsResp.counts || {};
      setStats({
        create: c.create || 0,
        update: c.update || 0,
        delete: c.delete || 0,
        import: c.import || 0,
      });
    } catch (ex) {
      setErr(ex.message || t("session.err.load"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter, mineOnly, dateFrom, dateTo, page]);
  useEffect(() => { setPage(1); }, [statusFilter, mineOnly, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const hasOpenSession = Boolean(current);

  const openNew = () => {
    if (hasOpenSession) return;
    setModalOpen(true);
  };

  const handleCreated = (s) => {
    setModalOpen(false);
    setCurrent(s);
    notify.add();
    if (onOpenSession) onOpenSession(s.id);
  };

  const pickDrive = (drives) => new Promise((resolve) => {
    setUsbPicker({ open: true, drives, resolve });
  });

  const downloadReport = async (s) => {
    setExportingId(s.id);
    try {
      const res = await exportToUsb(
        `/api/sessions/${s.id}/report`,
        s.report_filename || `session_${s.code}.xlsx`,
        pickDrive,
      );
      if (!res.cancelled) {
        const msg = t("usb.export.success", { path: res.path });
        toast.success(msg);
        notify.add(msg);
      }
    } catch (ex) {
      toast.error(ex.message || t("session.err.report"));
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="session-list-page">
      <div className="report-stat-grid session-list-stats">
        <StatCard tone="blue" label={t("session.stat.create")} value={stats.create} note={t("session.stat.create_note")} />
        <StatCard tone="orange" label={t("session.stat.update")} value={stats.update} note={t("session.stat.update_note")} />
        <StatCard tone="purple" label={t("session.stat.delete")} value={stats.delete} note={t("session.stat.delete_note")} />
        <StatCard tone="green" label={t("session.stat.import")} value={stats.import} note={t("session.stat.import_note")} />
      </div>

      {current && (
        <div className="session-list-current neon-active">
          <span className="badge badge-open">{t("session.status.open_dot")}</span>
          <span className="mono">{current.code}</span>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>
            {t("session.banner.current", { officer: current.officer_full_name || current.officer, n: current.detainee_count || 0 })}
          </span>
          <button
            type="button"
            className="btn-link"
            style={{ marginLeft: "auto" }}
            onClick={() => onOpenSession && onOpenSession(current.id)}
          >
            {t("session.banner.enter")}
          </button>
        </div>
      )}

      <div className="session-list-head">
        <h2>{t("session.title")}</h2>
        <div className="session-list-head-actions">
          <button
            type="button"
            className="btn-add-cell"
            onClick={() => setCellFormOpen(true)}
            title={t("session.open.add_cell_hint")}
          >
            {t("session.open.add_cell")}
          </button>
          <div
            className="session-list-newwrap"
            title={hasOpenSession ? t("session.open_hint", { code: current.code }) : ""}
          >
            <button
              type="button"
              className="btn-primary"
              onClick={openNew}
              disabled={hasOpenSession}
            >
              {t("session.new")}
            </button>
          </div>
        </div>
      </div>

      <div className="session-list-filters">
        <label>
          {t("session.status")}
          <select className="control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{t("common.all")}</option>
            <option value="open">{t("session.status.open")}</option>
            <option value="closed">{t("session.status.closed")}</option>
          </select>
        </label>
        <label className="chk">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            disabled={role !== "admin"}
          />
          {t("session.filter.mine")}
        </label>
        <label>
          {t("common.from")}
          <input type="date" className="control" value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label>
          {t("common.to")}
          <input type="date" className="control" value={dateTo}
            onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <button type="button" className="btn-secondary" onClick={load}>{t("common.refresh")}</button>
      </div>

      {err && <div className="error-box">{err}</div>}

      <div className="session-list-table-wrap">
        <table className="session-list-table">
          <thead>
            <tr>
              <th>{t("session.status")}</th>
              <th>{t("session.col.code")}</th>
              <th>{t("session.col.officer")}</th>
              <th>{t("session.col.opened_at")}</th>
              <th>{t("session.col.closed_at")}</th>
              <th>{t("session.col.location")}</th>
              <th style={{ textAlign: "right" }}>{t("session.col.detainees")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="session-list-empty">{t("common.loading")}</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={8} className="session-list-empty">{t("session.empty")}</td></tr>
            )}
            {!loading && items.map((s) => {
              const canDelete = role === "admin" || s.officer === username;
              const exporting = exportingId === s.id;
              return (
                <tr key={s.id} onClick={() => onOpenSession && onOpenSession(s.id)} className="session-list-row">
                  <td>
                    {s.status === "open"
                      ? <span className="badge badge-open">{t("session.status.open_dot")}</span>
                      : <span className="badge badge-closed">{t("session.status.closed_dot")}</span>}
                  </td>
                  <td className="mono">{s.code}</td>
                  <td>{s.officer_full_name || s.officer}</td>
                  <td>{formatDateTime(s.opened_at)}</td>
                  <td>{formatDateTime(s.closed_at)}</td>
                  <td>{s.location || "—"}</td>
                  <td style={{ textAlign: "right" }}>{s.detainee_count || 0}</td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                      {canDelete && (
                        <button
                          type="button"
                          className="btn-link btn-link-danger"
                          disabled={deletingId === s.id}
                          onClick={(e) => { e.stopPropagation(); removeSession(s); }}
                          title={s.detainee_count ? t("session.delete.title", { n: s.detainee_count }) : t("session.delete.title_simple")}
                        >
                          {deletingId === s.id ? t("common.deleting") : t("session.delete.title_simple")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-link"
                        disabled={exporting}
                        onClick={(e) => { e.stopPropagation(); downloadReport(s); }}
                        title={t("session.export.title")}
                      >
                        {exporting ? t("session.exporting") : t("session.export")}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="session-list-toolbar">
          <div className="session-list-total">{t("common.total", { n: total })}</div>
          <div className="pagination">
            <button disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t("common.prev")}</button>
            <span>{t("common.page_of", { page, total: totalPages })}</span>
            <button disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{t("common.next")}</button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <SessionOpenModal
          officerName={username}
          officerFullName={fullName}
          role={role}
          onCancel={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {cellFormOpen && (
        <CellForm
          initial={null}
          onClose={() => setCellFormOpen(false)}
          onSaved={() => setCellFormOpen(false)}
        />
      )}

      {confirmDel && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setConfirmDel(null)}
        >
          <div className="modal-panel confirm-del-modal">
            <div className="modal-head">
              <h3>{t("session.delete.title_simple")}</h3>
            </div>
            <div style={{ padding: "14px 20px", whiteSpace: "pre-line", lineHeight: 1.5 }}>
              {(confirmDel.detainee_count || 0) > 0
                ? t("session.delete.confirm_multi", { code: confirmDel.code, n: confirmDel.detainee_count })
                : t("session.delete.confirm_empty", { code: confirmDel.code })}
            </div>
            <div className="modal-actions" style={{ padding: "10px 20px 16px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn-secondary" onClick={() => setConfirmDel(null)}>
                {t("common.cancel")}
              </button>
              <button type="button" className="btn-danger" onClick={doDeleteSession}>
                {t("common.delete")}
              </button>
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
