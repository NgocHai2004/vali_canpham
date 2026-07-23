import { useEffect, useState } from "react";
import { api } from "./api";

function fmtNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SessionOpenModal({ officerName, officerFullName, role, onCreated, onCancel }) {
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isAdmin = role === "admin";
  const [officer, setOfficer] = useState(
    officerFullName || officerName || ""
  );

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const body = { location: location.trim(), note: note.trim() };
      if (isAdmin) {
        const name = officer.trim();
        if (!name) { setErr("Vui lòng nhập tên cán bộ."); setBusy(false); return; }
        body.officer = name;
      }
      const s = await api.createSession(body);
      if (onCreated) onCreated(s);
    } catch (ex) {
      setErr(ex.message || "Không thể mở phiên");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="session-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel && onCancel()}>
      <form className="session-modal" onSubmit={submit}>
        <div className="session-modal-head">
          <h3>MỞ PHIÊN LÀM VIỆC MỚI</h3>
          <button type="button" className="session-modal-close" onClick={onCancel} aria-label="Đóng">×</button>
        </div>
        <div className="session-modal-body">
          <div className="session-modal-row">
            <label htmlFor="sm-officer">Cán bộ</label>
            {isAdmin ? (
              <input
                id="sm-officer"
                className="control"
                value={officer}
                onChange={(e) => setOfficer(e.target.value)}
                placeholder="Nhập tên cán bộ ghi vào phiên"
                maxLength={64}
                disabled={busy}
              />
            ) : (
              <div className="session-modal-static">{officerName}{officerFullName ? ` (${officerFullName})` : ""}</div>
            )}
          </div>
          <div className="session-modal-row">
            <label>Thời điểm mở</label>
            <div className="session-modal-static">{fmtNow()}</div>
          </div>
          <div className="session-modal-row">
            <label htmlFor="sm-location">Địa điểm</label>
            <input id="sm-location" className="control" value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="VD: Buồng tiếp nhận 2" maxLength={200} />
          </div>
          <div className="session-modal-row">
            <label htmlFor="sm-note">Ghi chú</label>
            <textarea id="sm-note" className="control" value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="(tuỳ chọn)" rows={3} maxLength={500} />
          </div>
          {err && <div className="error-box">{err}</div>}
        </div>
        <div className="session-modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Huỷ</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Đang mở..." : "Mở phiên"}
          </button>
        </div>
      </form>
    </div>
  );
}
