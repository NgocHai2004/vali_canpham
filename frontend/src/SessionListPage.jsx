import { useEffect, useState } from "react";
import { api } from "./api";
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

  useEffect(() => { load(); }, [statusFilter, mineOnly, dateFrom, dateTo]);

  const hasOpenSession = Boolean(current);

  const openNew = () => {
    if (hasOpenSession) return;
    setModalOpen(true);
  };

  const handleCreated = (s) => {
    setModalOpen(false);
    setCurrent(s);
    if (onOpenSession) onOpenSession(s.id);
  };

  const downloadReport = async (s) => {
    try {
      await api.downloadSessionReport(s.id, s.report_filename || `session_${s.code}.xlsx`);
    } catch (ex) {
      alert(ex.message || "Không tải được báo cáo");
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
            · Cán bộ {current.officer}
            {current.officer_full_name ? ` (${current.officer_full_name})` : ""}
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
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="session-list-empty">Đang tải...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={7} className="session-list-empty">Chưa có phiên nào.</td></tr>
            )}
            {!loading && items.map((s) => (
              <tr key={s.id} onClick={() => onOpenSession && onOpenSession(s.id)} className="session-list-row">
                <td>
                  {s.status === "open"
                    ? <span className="badge badge-open">● Đang mở</span>
                    : <span className="badge badge-closed">✓ Đã đóng</span>}
                </td>
                <td className="mono">{s.code}</td>
                <td>{s.officer}{s.officer_full_name ? ` (${s.officer_full_name})` : ""}</td>
                <td>{fmtDateTime(s.opened_at)}</td>
                <td>{fmtDateTime(s.closed_at)}</td>
                <td>{s.location || "—"}</td>
                <td style={{ textAlign: "right" }}>{s.detainee_count || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="session-list-footer">Tổng: {total}</div>
      </div>

      {modalOpen && (
        <SessionOpenModal
          officerName={username}
          officerFullName={fullName}
          onCancel={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
