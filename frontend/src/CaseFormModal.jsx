import { useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n";

// Form tạo / sửa vụ án. Dùng chung 2 chế độ: có `initial` là sửa, không có là tạo.
// Vụ án không còn 4 trường nơi giam giữ như form mở phiên cũ — chúng chưa dùng
// thật lần nào và hồ sơ can phạm tự chọn buồng trong DataCapturePage.
// Mã vụ án không cho sửa: sinh tự động qua counter, là khoá tra cứu trong _log
// và báo cáo Excel.

// <input type="datetime-local"> cần "YYYY-MM-DDTHH:mm" — cắt đuôi giây/zone của
// ISO backend trả về. Rỗng thì để trống, backend tự lấy giờ hiện tại.
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CaseFormModal({ initial = null, onSaved, onCancel }) {
  const { t } = useI18n();
  const editing = Boolean(initial?.id);
  const [name, setName] = useState(initial?.name || "");
  const [location, setLocation] = useState(initial?.location || "");
  const [occurredAt, setOccurredAt] = useState(toLocalInput(initial?.occurred_at));
  const [note, setNote] = useState(initial?.note || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const nm = name.trim();
    if (!nm) { setErr(t("case.form.err.name_required")); return; }
    setBusy(true);
    setErr("");
    try {
      const body = {
        name: nm,
        location: location.trim(),
        note: note.trim(),
        occurred_at: occurredAt || null,
      };
      const saved = editing
        ? await api.updateCase(initial.id, body)
        : await api.createCase(body);
      if (onSaved) onSaved(saved);
    } catch (ex) {
      setErr(ex.message || t("case.form.err.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="session-modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel && onCancel()}
    >
      <form className="session-modal" onSubmit={submit}>
        <div className="session-modal-head">
          <h3>{t(editing ? "case.form.title_edit" : "case.form.title_new")}</h3>
          <button
            type="button"
            className="session-modal-close"
            onClick={onCancel}
            aria-label={t("common.close")}
          >×</button>
        </div>
        <div className="session-modal-body">
          {/* Vụ đang sửa thì cho thấy mã, nhưng chỉ đọc. */}
          {editing && (
            <div className="session-modal-row">
              <label>{t("case.col.code")}</label>
              <div className="session-modal-static mono">{initial.code}</div>
            </div>
          )}
          <div className="session-modal-row">
            <label htmlFor="cf-name">{t("case.form.name")}</label>
            <input
              id="cf-name"
              className="control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("case.form.name_ph")}
              maxLength={200}
              required
              autoFocus
            />
          </div>
          <div className="session-modal-row">
            <label htmlFor="cf-location">{t("case.form.location")}</label>
            <input
              id="cf-location"
              className="control"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t("case.form.location_ph")}
              maxLength={200}
            />
          </div>
          <div className="session-modal-row">
            <label htmlFor="cf-occurred">{t("case.form.occurred_at")}</label>
            <input
              id="cf-occurred"
              className="control"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>
          <div className="session-modal-row">
            <label htmlFor="cf-note">{t("case.form.note")}</label>
            <textarea
              id="cf-note"
              className="control"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={1000}
            />
          </div>
          {err && <div className="lg-err" role="alert">{err}</div>}
        </div>
        <div className="session-modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t("common.saving") : t(editing ? "common.save" : "case.form.submit_new")}
          </button>
        </div>
      </form>
    </div>
  );
}
