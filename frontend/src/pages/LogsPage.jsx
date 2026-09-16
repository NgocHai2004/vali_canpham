import React, { useState, useEffect } from "react";
import api from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icons";
import { formatDateTime } from "../lib/formatters";
import { PageHeader, StateBox, ReportStat } from "../components/CommonUI";
import { notify } from "../notifications";
import DetailModal from "../components/DetailModal";
import DetaineeForm from "../DetaineeForm";

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
        <div style={{ color: "var(--muted)", fontSize: 12, paddingLeft: 8 }}>—</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
          {list.map((x, i) => (
            <li key={i} style={{
              display: "grid",
              gridTemplateColumns: "92px 1fr 168px",
              gap: 10,
              alignItems: "baseline",
            }}>
              <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.code || "—"}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.full_name || ""}</span>
              <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.cccd_number ? `CCCD ${x.cccd_number}` : ""}</span>
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
              <div style={{ color: "var(--muted)", fontSize: 12 }}>{t("logs.col.time")}</div>
              <div>{formatDateTime(log.at)}</div>
            </div>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>{t("logs.col.officer")}</div>
              <div><strong>{officer.full_name || log.actor}</strong> {officer.full_name ? <small style={{ color: "var(--muted)" }}>@{log.actor}</small> : null}</div>
            </div>
            <div>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>{t("logs.col.session")}</div>
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


export default LogsPage;
