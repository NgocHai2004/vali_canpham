import { useEffect, useState } from "react";
import { api } from "./api";
import SessionOpenModal from "./SessionOpenModal";

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

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const [resp, cur] = await Promise.all([
        api.listSessions({
          status: statusFilter,
          mine_only: mineOnly ? "true" : "",
          date_from: dateFrom,
          date_to: dateTo,
        }),
        api.getCurrentSession().catch(() => null),
      ]);
      setItems(resp.items || []);
      setTotal(resp.total || 0);
      setCurrent(cur);
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
                <td onClick={(e) => e.stopPropagation()}>
                  {s.status === "closed" && s.report_url ? (
                    <button type="button" className="btn-link" onClick={() => downloadReport(s)}>
                      ⬇ Tải Excel
                    </button>
                  ) : null}
                </td>
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
