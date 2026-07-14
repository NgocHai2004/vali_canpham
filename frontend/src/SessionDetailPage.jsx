import { useEffect, useState } from "react";
import { api } from "./api";

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SessionDetailPage({ sessionId, onBack, onAddDetainee, onEditDetainee, onSessionClosed }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [closing, setClosing] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const s = await api.getSession(sessionId);
      setSession(s);
    } catch (ex) {
      setErr(ex.message || "Không tải được phiên");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [sessionId]);

  const doClose = async () => {
    if (!session) return;
    const n = session.detainee_count || 0;
    const msg = `Đóng phiên ${session.code} với ${n} hồ sơ? Sau khi đóng, không thể chỉnh sửa hồ sơ trong phiên nữa.`;
    if (!window.confirm(msg)) return;
    setClosing(true);
    setErr("");
    try {
      const res = await api.closeSession(sessionId);
      try {
        await api.downloadSessionReport(sessionId, res.report_filename);
      } catch (dlErr) {
        console.warn("Auto-download report failed:", dlErr);
      }
      if (onSessionClosed) onSessionClosed(session);
      await load();
    } catch (ex) {
      setErr(ex.message || "Không đóng được phiên");
    } finally {
      setClosing(false);
    }
  };

  const doDownload = async () => {
    if (!session) return;
    try {
      await api.downloadSessionReport(sessionId, session.report_filename);
    } catch (ex) {
      alert(ex.message || "Không tải được báo cáo");
    }
  };

  const removeDetainee = async (d) => {
    if (!window.confirm(`Xoá hồ sơ ${d.code} — ${d.full_name}?`)) return;
    try {
      await api.deleteDetainee(d.id);
      await load();
    } catch (ex) {
      alert(ex.message || "Không xoá được hồ sơ");
    }
  };

  if (loading) return <div className="session-detail-page"><div>Đang tải...</div></div>;
  if (err && !session) return (
    <div className="session-detail-page">
      <button className="btn-link" onClick={onBack}>← Quay lại</button>
      <div className="error-box">{err}</div>
    </div>
  );
  if (!session) return null;

  const isOpen = session.status === "open";

  return (
    <div className="session-detail-page">
      <button className="btn-link session-detail-back" onClick={onBack}>← Quay lại danh sách</button>

      <div className={"session-detail-head " + (isOpen ? "open" : "closed")}>
        <div className="session-detail-title">
          {isOpen ? <span className="badge badge-open">● Đang mở</span> : <span className="badge badge-closed">✓ Đã đóng</span>}
          <span className="session-detail-code mono">{session.code}</span>
        </div>
        <div className="session-detail-meta">
          <span>Cán bộ: <strong>{session.officer}{session.officer_full_name ? ` (${session.officer_full_name})` : ""}</strong></span>
          <span>Mở: <strong>{fmtDateTime(session.opened_at)}</strong></span>
          {!isOpen && <span>Đóng: <strong>{fmtDateTime(session.closed_at)}</strong></span>}
          {session.location && <span>Địa điểm: <strong>{session.location}</strong></span>}
        </div>
        {session.note && <div className="session-detail-note">Ghi chú: {session.note}</div>}
      </div>

      {err && <div className="error-box">{err}</div>}

      <div className="session-detail-toolbar">
        <div className="session-detail-toolbar-title">Hồ sơ trong phiên ({session.detainee_count || 0})</div>
        <div className="session-detail-toolbar-actions">
          {isOpen ? (
            <>
              <button className="btn-primary" onClick={() => onAddDetainee && onAddDetainee(session.id)}>+ Thêm hồ sơ mới</button>
              <button className="btn-danger-outline" onClick={doClose} disabled={closing}>
                {closing ? "Đang đóng..." : "Đóng phiên"}
              </button>
            </>
          ) : (
            <button className="btn-primary" onClick={doDownload}>⬇ Tải báo cáo Excel</button>
          )}
        </div>
      </div>

      <div className="session-list-table-wrap">
        <table className="session-list-table">
          <thead>
            <tr>
              <th>Mã HS</th>
              <th>Họ tên</th>
              <th>Giới tính</th>
              <th>Ngày sinh</th>
              <th>CCCD</th>
              <th>Buồng</th>
              <th>Thời điểm</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(session.detainees || []).length === 0 && (
              <tr>
                <td colSpan={8} className="session-list-empty">
                  {isOpen ? "Chưa có hồ sơ nào. Bấm '+ Thêm hồ sơ mới' để bắt đầu." : "Phiên không có hồ sơ."}
                </td>
              </tr>
            )}
            {(session.detainees || []).map((d) => (
              <tr key={d.id} className="session-list-row" onClick={() => onEditDetainee && onEditDetainee(d, session)}>
                <td className="mono">{d.code}</td>
                <td>{d.full_name}</td>
                <td>{d.gender === "female" ? "Nữ" : "Nam"}</td>
                <td>{d.dob ? new Date(d.dob).toLocaleDateString("vi-VN") : "—"}</td>
                <td className="mono">{d.cccd_number || "—"}</td>
                <td>{d.cell_code || "—"}</td>
                <td>{fmtTime(d.created_at)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {isOpen && (
                    <button type="button" className="btn-link btn-link-danger" onClick={() => removeDetainee(d)}>Xoá</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
