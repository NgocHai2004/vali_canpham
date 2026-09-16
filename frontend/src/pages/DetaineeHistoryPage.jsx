import React, { useState, useEffect, useMemo } from "react";
import api from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icons";
import { PageHeader, StateBox, ReportStat } from "../components/CommonUI";
import DetailModal from "../components/DetailModal";

function DetaineeHistoryPage({ onEdit }) {
  const { t, formatDateTime } = useI18n();
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
                <th style={{ width: "12%" }}>{t("logs.col.time")}</th>
                <th style={{ width: "13%" }}>{t("logs.col.session")}</th>
                <th style={{ width: "18%" }}>{t("logs.col.officer")}</th>
                <th style={{ width: "11%" }}>{t("logs.col.action")}</th>
                <th style={{ width: "12%" }}>{t("history.col.code")}</th>
                <th style={{ width: "12%" }}>{t("logs.col.detainee_name")}</th>
                <th style={{ width: "12%" }}>{t("logs.col.detainee_cccd")}</th>
                <th style={{ width: "10%" }}>{t("logs.col.actions")}</th>
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
                        <span style={{ color: "var(--muted)" }}>—</span>
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
                    <td>{log.detainee?.full_name || log.data?.full_name || "—"}</td>
                    <td>{log.detainee?.cccd_number || "—"}</td>
                    <td>
                      {canAct ? (
                        <div className="row-actions">
                          <button disabled={busy} onClick={() => onView(log)}>{t("common.view")}</button>
                          {onEdit && (
                            <button disabled={busy} onClick={() => onEditLog(log)}>{t("history.open_edit")}</button>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!pagedLogs.length && (
                <tr><td colSpan={8}><div className="empty">{t("common.empty")}</div></td></tr>
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

      {viewing && <DetailModal detainee={viewing} onClose={() => setViewing(null)} onEdit={onEdit} />}
    </div>
  );
}


export default DetaineeHistoryPage;
