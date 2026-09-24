import React, { useState, useEffect, useMemo } from "react";
import api from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icons";
import DetailModal from "../components/DetailModal";
import DashPageHeader from "../components/dashboard/DashPageHeader";
import DashStatCard from "../components/dashboard/DashStatCard";
import DashFilterBar, { DashFilterSelect, DashFilterField } from "../components/dashboard/DashFilterBar";
import DashDataTable from "../components/dashboard/DashDataTable";

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

  // Tổng % = 100 cho `table-layout: fixed`.
  const columns = [
    { key: "at", label: t("logs.col.time"), width: "12%", render: (log) => formatDateTime(log.at) },
    {
      key: "session",
      label: t("logs.col.session"),
      width: "13%",
      render: (log) => (log.session ? (
        <span className="session-code-chip">
          <span className={`badge ${log.session.status === "open" ? "badge-open" : "badge-closed"}`}>
            {log.session.status === "open" ? "●" : "✓"}
          </span>
          <span className="dh-cell-mono">{log.session.code}</span>
        </span>
      ) : <span className="dh-cell-dim">—</span>),
    },
    {
      key: "actor",
      label: t("logs.col.officer"),
      width: "18%",
      render: (log) => {
        const officer = log.officer || {};
        const initials = ((officer.full_name || officer.username || log.actor || "?").trim()[0] || "?").toUpperCase();
        return (
          <div className="officer-cell">
            {officer.avatar_url
              ? <img className="officer-avatar" src={officer.avatar_url} alt="" />
              : <span className="officer-avatar officer-avatar-fallback">{initials}</span>}
            <div className="officer-name">
              <strong>{officer.full_name || log.actor}</strong>
              {officer.full_name ? <small>@{log.actor}</small> : null}
            </div>
          </div>
        );
      },
    },
    {
      key: "action",
      label: t("logs.col.action"),
      width: "11%",
      render: (log) => (
        <span className={`status-badge ${log.action}`}>{labels[log.action] || log.action}</span>
      ),
    },
    {
      key: "ref",
      label: t("history.col.code"),
      width: "12%",
      className: "dh-cell-mono",
      render: (log) => log.ref || "—",
    },
    {
      key: "name",
      label: t("logs.col.detainee_name"),
      width: "12%",
      render: (log) => log.detainee?.full_name || log.data?.full_name || "—",
    },
    {
      key: "cccd",
      label: t("logs.col.detainee_cccd"),
      width: "12%",
      render: (log) => log.detainee?.cccd_number || "—",
    },
    {
      key: "actions",
      label: t("logs.col.actions"),
      width: "10%",
      align: "center",
      // Log xoá không còn hồ sơ để mở → không vẽ nút, tránh bấm vào là lỗi 404.
      render: (log) => (isActable(log) ? (
        <span className="dh-rowbtns">
          <button
            type="button"
            className="dh-rowbtn"
            disabled={busyRef === log.id}
            onClick={() => onView(log)}
          >{t("common.view")}</button>
          {onEdit && (
            <button
              type="button"
              className="dh-rowbtn"
              disabled={busyRef === log.id}
              onClick={() => onEditLog(log)}
            >{t("history.open_edit")}</button>
          )}
        </span>
      ) : <span className="dh-cell-dim">-</span>),
    },
  ];

  return (
    <div className="page dh-page">
      <DashPageHeader
        title={t("history.title")}
        subtitle={t("history.subtitle", { n: filtered.length })}
      >
        <button type="button" className="dh-filter__submit" onClick={load} disabled={loading}>
          {loading ? t("common.loading") : t("common.refresh")}
        </button>
      </DashPageHeader>

      <div className="dh-statline">
        <DashStatCard tone="blue" icon={Icon.file} label={t("history.action.create")} value={counts.create || 0} note={t("history.stat.note.create")} />
        <DashStatCard tone="amber" icon={Icon.sync} label={t("session.stat.update")} value={counts.update || 0} note={t("logs.stat.note.update")} />
        <DashStatCard tone="purple" icon={Icon.log} label={t("session.stat.delete")} value={counts.delete || 0} note={t("logs.stat.note.delete")} />
        <DashStatCard tone="emerald" icon={Icon.cloudUpload} label={t("history.action.import")} value={counts.import || 0} note={t("logs.stat.note.import")} />
      </div>

      {/* Ô tìm kiếm lọc ở CLIENT (useMemo trên `logs`) nên gõ là thấy ngay; hai ô
          ngày và ô hành động là tham số SERVER → phải submit để gọi lại API. */}
      <DashFilterBar
        value={q}
        onChange={setQ}
        onSubmit={load}
        placeholder={t("history.search_ph")}
        submitLabel={loading ? t("common.applying") : t("common.apply")}
        busy={loading}
      >
        <DashFilterField label={t("common.from")}>
          <input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </DashFilterField>
        <DashFilterField label={t("common.to")}>
          <input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </DashFilterField>
        <DashFilterSelect
          label={t("logs.field.action")}
          value={actionFilter}
          onChange={setActionFilter}
          options={[
            { value: "", label: t("common.all") },
            { value: "create", label: t("history.action.create") },
            { value: "update", label: t("history.action.update") },
            { value: "delete", label: t("history.action.delete") },
            { value: "import", label: t("history.action.import") },
          ]}
        />
        <button type="button" className="dh-rowbtn" onClick={clearFilters}>
          {t("common.clear_filter")}
        </button>
      </DashFilterBar>

      {notice && <div className={noticeOk ? "success-box" : "error-box"}>{notice}</div>}

      <DashDataTable
        columns={columns}
        rows={pagedLogs}
        loading={loading}
        error={error}
        empty={t("common.empty")}
        pager={{
          page,
          totalPages,
          total: totalRows,
          onPrev: () => setPage((p) => Math.max(1, p - 1)),
          onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
        }}
      />

      {viewing && <DetailModal detainee={viewing} onClose={() => setViewing(null)} onEdit={onEdit} />}
    </div>
  );
}


export default DetaineeHistoryPage;
