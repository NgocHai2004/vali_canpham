import React, { useState, useEffect, useMemo } from "react";
import api from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icons";
import DetailModal from "../components/DetailModal";
import DashPageHeader from "../components/dashboard/DashPageHeader";
import DashStatCard from "../components/dashboard/DashStatCard";
import DashFilterBar, { DashFilterSelect, DashFilterField } from "../components/dashboard/DashFilterBar";
import DashDataTable from "../components/dashboard/DashDataTable";

/**
 * Modal hiển thị chi tiết nhật ký cho các bản ghi không phải hoặc không còn hồ sơ can phạm
 */
function LogDetailModal({ log, onClose, formatDateTime }) {
  if (!log) return null;
  const officer = log.officer || {};
  const officerName = officer.full_name || log.actor || "Hệ thống";

  const actionLabels = {
    create: "Tạo mới",
    update: "Cập nhật",
    delete: "Xoá",
    import: "Nhập file",
    sync: "Đồng bộ dữ liệu",
    login: "Đăng nhập",
    transfer: "Chuyển buồng",
  };

  const resourceLabels = {
    detainee: "Hồ sơ can phạm",
    work_session: "Phiên làm việc",
    cell: "Cơ sở / Buồng giam",
    user: "Tài khoản cán bộ",
    auth: "Xác thực hệ thống",
    setting: "Cấu hình hệ thống",
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: "36rem", width: "95%", background: "var(--dh-panel-bg, #1e293b)", color: "var(--dh-ink, #fff)", border: "1px solid var(--dh-panel-border, rgba(255,255,255,0.1))", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--dh-inset-border, rgba(255,255,255,0.1))", paddingBottom: "0.75rem", marginBottom: "1rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 800, color: "var(--dh-ink)" }}>
            Chi tiết nhật ký hoạt động
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "var(--dh-ink-3)", fontSize: "1.25rem", cursor: "pointer", padding: "0.25rem 0.5rem" }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
          <div style={{ background: "var(--dh-inset-bg, rgba(0,0,0,0.2))", padding: "0.625rem", borderRadius: "8px", border: "1px solid var(--dh-inset-border, rgba(255,255,255,0.05))" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--dh-ink-4)", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.25rem" }}>Thời gian</div>
            <strong style={{ color: "var(--dh-ink)" }}>{formatDateTime(log.at)}</strong>
          </div>

          <div style={{ background: "var(--dh-inset-bg, rgba(0,0,0,0.2))", padding: "0.625rem", borderRadius: "8px", border: "1px solid var(--dh-inset-border, rgba(255,255,255,0.05))" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--dh-ink-4)", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.25rem" }}>Cán bộ thực hiện</div>
            <strong style={{ color: "var(--dh-ink)" }}>{officerName}</strong> {log.actor && <span style={{ color: "var(--dh-ink-3)", fontSize: "0.8125rem" }}>({log.actor})</span>}
          </div>

          <div style={{ background: "var(--dh-inset-bg, rgba(0,0,0,0.2))", padding: "0.625rem", borderRadius: "8px", border: "1px solid var(--dh-inset-border, rgba(255,255,255,0.05))" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--dh-ink-4)", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.25rem" }}>Hành động</div>
            <span className={`status-badge ${log.action}`} style={{ display: "inline-block" }}>
              {actionLabels[log.action] || log.action}
            </span>
          </div>

          <div style={{ background: "var(--dh-inset-bg, rgba(0,0,0,0.2))", padding: "0.625rem", borderRadius: "8px", border: "1px solid var(--dh-inset-border, rgba(255,255,255,0.05))" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--dh-ink-4)", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.25rem" }}>Phân hệ</div>
            <strong style={{ color: "var(--dh-ink)" }}>{resourceLabels[log.resource] || log.resource || "Hệ thống"}</strong>
          </div>

          <div style={{ background: "var(--dh-inset-bg, rgba(0,0,0,0.2))", padding: "0.625rem", borderRadius: "8px", border: "1px solid var(--dh-inset-border, rgba(255,255,255,0.05))" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--dh-ink-4)", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.25rem" }}>Mã / Đối tượng</div>
            <strong style={{ fontFamily: "monospace", color: "var(--dh-ink)" }}>{log.ref || "—"}</strong>
          </div>

          <div style={{ background: "var(--dh-inset-bg, rgba(0,0,0,0.2))", padding: "0.625rem", borderRadius: "8px", border: "1px solid var(--dh-inset-border, rgba(255,255,255,0.05))" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--dh-ink-4)", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.25rem" }}>Phiên làm việc</div>
            <strong style={{ fontFamily: "monospace", color: "var(--dh-ink)" }}>{log.session?.code || "Ngoài phiên"}</strong>
          </div>
        </div>

        {log.data && Object.keys(log.data).length > 0 && (
          <div style={{ background: "var(--dh-inset-bg, rgba(0,0,0,0.2))", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--dh-inset-border, rgba(255,255,255,0.05))", marginBottom: "1rem" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--dh-ink-4)", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.5rem" }}>Dữ liệu thao tác</div>
            <pre style={{ margin: 0, fontSize: "0.8125rem", color: "var(--dh-ink)", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "monospace" }}>
              {JSON.stringify(log.data, null, 2)}
            </pre>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="dh-filter__submit"
            onClick={onClose}
            style={{ padding: "0.5rem 1.25rem" }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

function DetaineeHistoryPage() {
  const { t, formatDateTime } = useI18n();
  const [activeTab, setActiveTab] = useState("all"); // "all" | "detainee" | "sync"
  const [logs, setLogs] = useState([]);
  const [counts, setCounts] = useState({ create: 0, update: 0, delete: 0, import: 0, sync: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [q, setQ] = useState("");
  const [viewingDetainee, setViewingDetainee] = useState(null);
  const [viewingLog, setViewingLog] = useState(null);
  const [busyRef, setBusyRef] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeOk, setNoticeOk] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (activeTab === "detainee") {
        params.resource = "detainee";
      } else if (activeTab === "sync") {
        params.action = "sync";
      }

      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (actionFilter) params.action = actionFilter;

      const res = await api.listLogs(params);
      setLogs(res.items || []);
      setCounts(res.counts || { create: 0, update: 0, delete: 0, import: 0, sync: 0 });
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
  }, [activeTab]);

  useEffect(() => { setPage(1); }, [q, dateFrom, dateTo, actionFilter, logs]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return logs;
    return logs.filter((l) => {
      const officer = l.officer || {};
      const detainee = l.detainee || l.data || {};
      return (
        (l.ref || "").toLowerCase().includes(kw) ||
        (l.actor || "").toLowerCase().includes(kw) ||
        (officer.full_name || "").toLowerCase().includes(kw) ||
        (detainee.full_name || "").toLowerCase().includes(kw) ||
        (detainee.cccd_number || "").toLowerCase().includes(kw) ||
        (l.session && (l.session.code || "").toLowerCase().includes(kw))
      );
    });
  }, [logs, q]);

  const totalRows = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const pagedLogs = filtered.slice((page - 1) * pageSize, page * pageSize);

  const labels = {
    create: "Tạo mới",
    update: "Cập nhật",
    delete: "Xoá",
    import: "Nhập file",
    sync: "Đồng bộ",
    login: "Đăng nhập",
    transfer: "Chuyển buồng",
  };

  const resolveDetainee = async (log) => {
    if (log.ref_id) {
      try { return await api.getDetainee(log.ref_id); } catch { /* fallback */ }
    }
    if (log.ref) return await api.getDetaineeByPersonalId(log.ref);
    throw new Error("Không tìm thấy hồ sơ liên kết");
  };

  const handleView = async (log) => {
    setBusyRef(log.id);
    setNotice("");
    if (log.resource === "detainee" && (log.ref_id || log.ref) && log.action !== "delete") {
      try {
        const d = await resolveDetainee(log);
        setViewingDetainee(d);
        return;
      } catch {
        /* nếu không lấy được hồ sơ đầy đủ, chuyển sang mở modal chi tiết nhật ký */
      } finally {
        setBusyRef("");
      }
    }
    setViewingLog(log);
    setBusyRef("");
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setActionFilter("");
    setQ("");
  };

  const getRefText = (log) => {
    if (log.ref && log.ref.trim()) return log.ref;
    if (log.resource === "detainee") return log.detainee?.cccd_number || "Hồ sơ can phạm";
    if (log.resource === "work_session") return log.session?.code || "Phiên thu nhận";
    if (log.resource === "cell") return "Cơ sở giam giữ";
    if (log.resource === "user") return "Tài khoản cán bộ";
    if (log.resource === "auth") return "Hệ thống";
    return "Hệ thống";
  };

  const getDetailText = (log) => {
    const detName = log.detainee?.full_name || log.data?.full_name;
    const cccd = log.detainee?.cccd_number || log.data?.cccd_number;
    if (detName) return `${detName}${cccd ? ` · ${cccd}` : ""}`;
    if (log.action === "sync") return `Đồng bộ phiên ${log.session?.code || log.ref || "làm việc"}`;
    if (log.action === "create" && log.resource === "work_session") return `Mở phiên làm việc ${log.ref || ""}`;
    if (log.action === "delete" && log.resource === "work_session") return `Đóng / Xoá phiên làm việc ${log.ref || ""}`;
    if (log.action === "login") return "Đăng nhập hệ thống";
    if (log.data?.full_name) return log.data.full_name;
    if (log.details?.reason) return log.details.reason;
    if (log.resource === "detainee") return `Hồ sơ can phạm ${log.ref || ""}`;
    return `Thao tác ${labels[log.action] || log.action}`;
  };

  const columns = [
    {
      key: "at",
      label: "Thời gian",
      width: "14%",
      render: (log) => (
        <span style={{ fontWeight: 600, color: "var(--dh-ink)" }}>
          {formatDateTime(log.at)}
        </span>
      ),
    },
    {
      key: "session",
      label: "Phiên làm việc",
      width: "14%",
      render: (log) => (log.session?.code ? (
        <span className="session-code-chip">
          <span className={`badge ${log.session.status === "open" ? "badge-open" : "badge-closed"}`}>
            {log.session.status === "open" ? "●" : "✓"}
          </span>
          <span className="dh-cell-mono">{log.session.code}</span>
        </span>
      ) : (
        <span className="dh-cell-mono" style={{ color: "var(--dh-ink-3)", fontSize: "0.8125rem", background: "var(--dh-inset-bg)", padding: "0.15rem 0.5rem", borderRadius: "4px" }}>
          Hệ thống
        </span>
      )),
    },
    {
      key: "actor",
      label: "Cán bộ thực hiện",
      width: "18%",
      render: (log) => {
        const officer = log.officer || {};
        const name = officer.full_name || log.actor || "Hệ thống";
        const initials = (name.trim()[0] || "H").toUpperCase();
        return (
          <div className="officer-cell">
            {officer.avatar_url
              ? <img className="officer-avatar" src={officer.avatar_url} alt="" />
              : <span className="officer-avatar officer-avatar-fallback">{initials}</span>}
            <div className="officer-name">
              <strong>{name}</strong>
              {log.actor ? <small>@{log.actor}</small> : null}
            </div>
          </div>
        );
      },
    },
    {
      key: "action",
      label: "Hành động",
      width: "11%",
      render: (log) => (
        <span className={`status-badge ${log.action}`}>
          {labels[log.action] || log.action}
        </span>
      ),
    },
    {
      key: "ref",
      label: "Đối tượng / Mã",
      width: "14%",
      className: "dh-cell-mono",
      render: (log) => (
        <span style={{ fontWeight: 700, color: "var(--dh-ink)" }}>
          {getRefText(log)}
        </span>
      ),
    },
    {
      key: "detail",
      label: "Nội dung chi tiết",
      width: "20%",
      render: (log) => (
        <span style={{ color: "var(--dh-ink-2)", fontWeight: 500 }}>
          {getDetailText(log)}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Thao tác",
      width: "9%",
      align: "center",
      render: (log) => (
        <span className="dh-rowbtns" style={{ justifyContent: "center" }}>
          <button
            type="button"
            className="dh-rowbtn"
            disabled={busyRef === log.id}
            onClick={() => handleView(log)}
            title="Xem chi tiết nhật ký"
          >
            Xem
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="page dh-page">
      <DashPageHeader
        title="Nhật ký & Lịch sử hoạt động"
        subtitle={`Tổng số ${filtered.length} bản ghi nhật ký`}
      >
        <div className="dh-tabs" style={{ display: "inline-flex", gap: "0.25rem", background: "var(--dh-inset-bg)", padding: "0.2rem", borderRadius: "8px", border: "1px solid var(--dh-inset-border)" }}>
          <button
            type="button"
            className={`dh-tab-btn ${activeTab === "all" ? "is-active" : ""}`}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "6px",
              border: "none",
              fontSize: "0.8125rem",
              fontWeight: 700,
              cursor: "pointer",
              background: activeTab === "all" ? "var(--dh-panel-bg)" : "transparent",
              color: activeTab === "all" ? "var(--dh-blue-ink)" : "var(--dh-ink-3)",
              boxShadow: activeTab === "all" ? "0 1px 2px rgba(0,0,0,0.1)" : "none"
            }}
            onClick={() => setActiveTab("all")}
          >
            Tất cả
          </button>
          <button
            type="button"
            className={`dh-tab-btn ${activeTab === "detainee" ? "is-active" : ""}`}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "6px",
              border: "none",
              fontSize: "0.8125rem",
              fontWeight: 700,
              cursor: "pointer",
              background: activeTab === "detainee" ? "var(--dh-panel-bg)" : "transparent",
              color: activeTab === "detainee" ? "var(--dh-blue-ink)" : "var(--dh-ink-3)",
              boxShadow: activeTab === "detainee" ? "0 1px 2px rgba(0,0,0,0.1)" : "none"
            }}
            onClick={() => setActiveTab("detainee")}
          >
            Hồ sơ can phạm
          </button>
          <button
            type="button"
            className={`dh-tab-btn ${activeTab === "sync" ? "is-active" : ""}`}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "6px",
              border: "none",
              fontSize: "0.8125rem",
              fontWeight: 700,
              cursor: "pointer",
              background: activeTab === "sync" ? "var(--dh-panel-bg)" : "transparent",
              color: activeTab === "sync" ? "var(--dh-blue-ink)" : "var(--dh-ink-3)",
              boxShadow: activeTab === "sync" ? "0 1px 2px rgba(0,0,0,0.1)" : "none"
            }}
            onClick={() => setActiveTab("sync")}
          >
            Lịch sử đồng bộ
          </button>
        </div>

        <button type="button" className="dh-filter__submit" onClick={load} disabled={loading} style={{ marginLeft: "0.5rem" }}>
          {loading ? "Đang tải..." : "Làm mới"}
        </button>
      </DashPageHeader>

      <div className="dh-statline">
        <DashStatCard tone="blue" icon={Icon.file} label="Tạo mới" value={counts.create || 0} note="Hồ sơ tạo mới" />
        <DashStatCard tone="amber" icon={Icon.sync} label="Cập nhật" value={counts.update || 0} note="Hồ sơ chỉnh sửa" />
        <DashStatCard tone="emerald" icon={Icon.sync} label="Đồng bộ phiên" value={counts.sync || 0} note="Lần đồng bộ thành công" />
        <DashStatCard tone="purple" icon={Icon.log} label="Xoá / Nhập" value={(counts.delete || 0) + (counts.import || 0)} note="Thao tác khác" />
      </div>

      <DashFilterBar
        value={q}
        onChange={setQ}
        onSubmit={load}
        placeholder="Tìm theo mã, cán bộ, tên can phạm, số CCCD..."
        submitLabel={loading ? "Đang lọc..." : "Lọc"}
        busy={loading}
      >
        <DashFilterField label="Từ">
          <input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </DashFilterField>
        <DashFilterField label="Đến">
          <input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </DashFilterField>
        <DashFilterSelect
          label="Hành động"
          value={actionFilter}
          onChange={setActionFilter}
          options={[
            { value: "", label: "Tất cả" },
            { value: "create", label: "Tạo mới" },
            { value: "update", label: "Cập nhật" },
            { value: "delete", label: "Xoá" },
            { value: "import", label: "Nhập file" },
            { value: "sync", label: "Đồng bộ" },
          ]}
        />
        <button type="button" className="dh-rowbtn" onClick={clearFilters}>
          Xoá lọc
        </button>
      </DashFilterBar>

      {notice && <div className={noticeOk ? "success-box" : "error-box"}>{notice}</div>}

      <DashDataTable
        columns={columns}
        rows={pagedLogs}
        loading={loading}
        error={error}
        empty="Không có bản ghi nào"
        pager={{
          page,
          totalPages,
          total: totalRows,
          onPrev: () => setPage((p) => Math.max(1, p - 1)),
          onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
        }}
      />

      {viewingDetainee && (
        <DetailModal
          detainee={viewingDetainee}
          onClose={() => setViewingDetainee(null)}
        />
      )}

      {viewingLog && (
        <LogDetailModal
          log={viewingLog}
          onClose={() => setViewingLog(null)}
          formatDateTime={formatDateTime}
        />
      )}
    </div>
  );
}

export default DetaineeHistoryPage;
