import { useEffect, useState } from "react";
import { api } from "./api";
import { notify } from "./notifications";
import SessionOpenModal from "./SessionOpenModal";

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

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SessionListPage({ role, username, fullName, onOpenSession }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [mineOnly, setMineOnly] = useState(role !== "admin");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [stats, setStats] = useState({ create: 0, update: 0, delete: 0, import: 0 });
  const [deletingId, setDeletingId] = useState(null);
  const [exportingId, setExportingId] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const removeSession = async (s) => {
    const n = s.detainee_count || 0;
    const warn = n > 0
      ? `⚠ Xoá phiên ${s.code} sẽ XOÁ VĨNH VIỄN ${n} hồ sơ can phạm trong phiên.\n\nKhông thể hoàn tác. Bạn chắc chắn?`
      : `Xoá phiên ${s.code}?`;
    if (!window.confirm(warn)) return;
    setDeletingId(s.id);
    try {
      await api.deleteSession(s.id);
      notify.add();
      await load();
    } catch (ex) {
      alert(ex.message || "Không xoá được phiên");
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
      setErr(ex.message || "Không tải được danh sách phiên");
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

  const downloadReport = async (s) => {
    setExportingId(s.id);
    try {
      await api.downloadSessionReport(s.id, s.report_filename || `session_${s.code}.xlsx`);
      notify.add();
    } catch (ex) {
      alert(ex.message || "Không tải được báo cáo");
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="session-list-page">
      <div className="report-stat-grid session-list-stats">
        <StatCard tone="blue" label="Đăng ký mới" value={stats.create} note="Can phạm được tạo" />
        <StatCard tone="orange" label="Đã sửa" value={stats.update} note="Lượt cập nhật" />
        <StatCard tone="purple" label="Đã xoá" value={stats.delete} note="Hồ sơ đã xoá" />
        <StatCard tone="green" label="Nhập Excel" value={stats.import} note="Lượt import" />
      </div>

      {current && (
        <div className="session-list-current">
          <span className="badge badge-open">● Đang mở</span>
          <span className="mono">{current.code}</span>
          <span style={{ color: "#6b7280", fontSize: 13 }}>
            · Cán bộ {current.officer_full_name || current.officer}
            · {current.detainee_count || 0} hồ sơ
          </span>
          <button
            type="button"
            className="btn-link"
            style={{ marginLeft: "auto" }}
            onClick={() => onOpenSession && onOpenSession(current.id)}
          >
            Vào phiên →
          </button>
        </div>
      )}

      <div className="session-list-head">
        <h2>PHIÊN LÀM VIỆC</h2>
        <div
          className="session-list-newwrap"
          title={hasOpenSession ? `Bạn đang có phiên ${current.code} đang mở` : ""}
        >
          <button
            type="button"
            className="btn-primary"
            onClick={openNew}
            disabled={hasOpenSession}
          >
            + Mở phiên mới
          </button>
        </div>
      </div>

      <div className="session-list-filters">
        <label>
          Trạng thái
          <select className="control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="open">Đang mở</option>
            <option value="closed">Đã đóng</option>
          </select>
        </label>
        <label className="chk">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            disabled={role !== "admin"}
          />
          Của tôi
        </label>
        <label>
          Từ
          <input type="date" className="control" value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label>
          Đến
          <input type="date" className="control" value={dateTo}
            onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <button type="button" className="btn-secondary" onClick={load}>Làm mới</button>
      </div>

      {err && <div className="error-box">{err}</div>}

      <div className="session-list-table-wrap">
        <table className="session-list-table">
          <thead>
            <tr>
              <th>Trạng thái</th>
              <th>Mã phiên</th>
              <th>Cán bộ</th>
              <th>Mở lúc</th>
              <th>Đóng lúc</th>
              <th>Địa điểm</th>
              <th style={{ textAlign: "right" }}>Hồ sơ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="session-list-empty">Đang tải...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={8} className="session-list-empty">Chưa có phiên nào.</td></tr>
            )}
            {!loading && items.map((s) => {
              const canDelete = s.status === "open" && (role === "admin" || s.officer === username);
              const exporting = exportingId === s.id;
              return (
                <tr key={s.id} onClick={() => onOpenSession && onOpenSession(s.id)} className="session-list-row">
                  <td>
                    {s.status === "open"
                      ? <span className="badge badge-open">● Đang mở</span>
                      : <span className="badge badge-closed">✓ Đã đóng</span>}
                  </td>
                  <td className="mono">{s.code}</td>
                  <td>{s.officer_full_name || s.officer}</td>
                  <td>{fmtDateTime(s.opened_at)}</td>
                  <td>{fmtDateTime(s.closed_at)}</td>
                  <td>{s.location || "—"}</td>
                  <td style={{ textAlign: "right" }}>{s.detainee_count || 0}</td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="btn-link"
                        disabled={exporting}
                        onClick={(e) => { e.stopPropagation(); downloadReport(s); }}
                        title="Xuất báo cáo phiên (.xlsx)"
                      >
                        {exporting ? "Đang xuất..." : "Xuất báo cáo"}
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          className="btn-link btn-link-danger"
                          disabled={deletingId === s.id}
                          onClick={(e) => { e.stopPropagation(); removeSession(s); }}
                          title={s.detainee_count ? `Xoá phiên (sẽ xoá ${s.detainee_count} hồ sơ)` : "Xoá phiên"}
                        >
                          {deletingId === s.id ? "Đang xoá..." : "Xoá"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="session-list-toolbar">
          <div className="session-list-total">Tổng: {total}</div>
          <div className="pagination">
            <button disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Trước</button>
            <span>Trang {page} / {totalPages}</span>
            <button disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Sau →</button>
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
    </div>
  );
}
