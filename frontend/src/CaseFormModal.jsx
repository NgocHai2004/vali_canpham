import { useState } from "react";
import { api, auth } from "./api";
import { useI18n } from "./i18n";

// Form tạo / sửa vụ án. Dùng chung 2 chế độ: có `initial` là sửa, không có là tạo.
// Mã vụ án không cho sửa: sinh tự động qua counter, là khoá tra cứu trong _log
// và báo cáo Excel.

const COMMON_RANKS = [
  "Đại tá", "Thượng tá", "Trung tá", "Thiếu tá",
  "Đại uý", "Thượng uý", "Trung uý", "Thiếu uý",
  "Thượng sĩ", "Trung sĩ", "Hạ sĩ",
];

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
  const currentOfficer = auth.getFullName() || auth.getUser() || "";
  const [name, setName] = useState(initial?.name || "");
  const [officerName, setOfficerName] = useState(initial?.officer_name || (editing ? "" : currentOfficer));
  const [officerRank, setOfficerRank] = useState(initial?.officer_rank || "");
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
        officer_name: officerName.trim(),
        officer_rank: officerRank.trim(),
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
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
            <div className="session-modal-row" style={{ marginBottom: 0 }}>
              <label htmlFor="cf-officer-name">{t("case.form.officer_name")}</label>
              <input
                id="cf-officer-name"
                className="control"
                value={officerName}
                onChange={(e) => setOfficerName(e.target.value)}
                placeholder={t("case.form.officer_name_ph")}
                maxLength={100}
              />
            </div>
            <div className="session-modal-row" style={{ marginBottom: 0 }}>
              <label htmlFor="cf-officer-rank">{t("case.form.officer_rank")}</label>
              <input
                id="cf-officer-rank"
                className="control"
                list="rank-suggestions"
                value={officerRank}
                onChange={(e) => setOfficerRank(e.target.value)}
                placeholder={t("case.form.officer_rank_ph")}
                maxLength={50}
              />
              <datalist id="rank-suggestions">
                {COMMON_RANKS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
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
