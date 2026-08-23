import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n";

function fmtNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const UNIT_GROUP_KEY = {
  phuong: "session.open.commune_group_phuong",
  xa: "session.open.commune_group_xa",
  dac_khu: "session.open.commune_group_dac_khu",
};

export default function SessionOpenModal({ officerName, officerFullName, onCreated, onCancel }) {
  const { t } = useI18n();
  const [caseName, setCaseName] = useState("");
  const [officer, setOfficer] = useState(officerFullName || officerName || "");
  const [location, setLocation] = useState(t("session.open.location_default"));
  const [note, setNote] = useState("");
  const [province, setProvince] = useState(null);
  const [units, setUnits] = useState([]);
  const [communeCode, setCommuneCode] = useState("");
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [dep, list] = await Promise.all([
          api.getDeployment(),
          api.listAdminUnits(),
        ]);
        if (!alive) return;
        setProvince(dep);
        setUnits(list || []);
      } catch (ex) {
        if (alive) setErr(ex.message || t("session.open.err.units_failed"));
      } finally {
        if (alive) setLoadingUnits(false);
      }
    })();
    return () => { alive = false; };
  }, [t]);

  // Nhóm theo unit_type để render optgroup. Backend đã sort sẵn theo
  // (unit_type, name) nên chỉ cần gom lại theo thứ tự gặp.
  const grouped = useMemo(() => {
    const out = [];
    for (const u of units) {
      const key = UNIT_GROUP_KEY[u.unit_type] || UNIT_GROUP_KEY.xa;
      let g = out.find((x) => x.key === key);
      if (!g) { g = { key, items: [] }; out.push(g); }
      g.items.push(u);
    }
    return out;
  }, [units]);

  const submit = async (e) => {
    e.preventDefault();
    const cname = caseName.trim();
    const name = officer.trim();
    if (!cname) { setErr(t("session.open.err.case_name_required")); return; }
    if (!name) { setErr(t("session.open.err.officer_required")); return; }
    if (!communeCode) { setErr(t("session.open.err.commune_required")); return; }
    setBusy(true);
    setErr("");
    try {
      const body = {
        case_name: cname,
        commune_code: communeCode,
        location: location.trim(),
        note: note.trim(),
        officer_full_name: name,
      };
      const s = await api.createSession(body);
      if (onCreated) onCreated(s);
    } catch (ex) {
      setErr(ex.message || t("session.open.err.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="session-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel && onCancel()}>
      <form className="session-modal" onSubmit={submit}>
        <div className="session-modal-head">
          <h3>{t("session.open.title")}</h3>
          <button type="button" className="session-modal-close" onClick={onCancel} aria-label={t("common.close")}>×</button>
        </div>
        <div className="session-modal-body">
          <div className="session-modal-row">
            <label htmlFor="sm-case">{t("session.open.case_name")}</label>
            <input
              id="sm-case"
              className="control"
              value={caseName}
              onChange={(e) => setCaseName(e.target.value)}
              placeholder={t("session.open.case_name_ph")}
              maxLength={200}
              disabled={busy}
              required
              autoFocus
            />
          </div>
          <div className="session-modal-row">
            <label htmlFor="sm-officer">{t("session.open.officer")}</label>
            <input
              id="sm-officer"
              className="control"
              value={officer}
              onChange={(e) => setOfficer(e.target.value)}
              placeholder={t("session.open.officer_ph")}
              maxLength={100}
              disabled={busy}
              required
            />
          </div>
          <div className="session-modal-row">
            <label>{t("session.open.time_open")}</label>
            <div className="session-modal-static">{fmtNow()}</div>
          </div>
          <div className="session-modal-row">
            <label>{t("session.open.province")}</label>
            <div className="session-modal-static">{province ? province.province_name : "—"}</div>
          </div>
          <div className="session-modal-row">
            <label htmlFor="sm-commune">{t("session.open.commune")}</label>
            <select
              id="sm-commune"
              className="control"
              value={communeCode}
              onChange={(e) => setCommuneCode(e.target.value)}
              disabled={busy || loadingUnits}
              required
            >
              <option value="">{t("session.open.commune_ph")}</option>
              {grouped.map((g) => (
                <optgroup key={g.key} label={t(g.key)}>
                  {g.items.map((u) => (
                    <option key={u.code} value={u.code}>{u.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="session-modal-row">
            <label htmlFor="sm-location">{t("session.open.location")}</label>
            <input id="sm-location" className="control" value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t("session.open.location_ph")} maxLength={200} />
          </div>
          <div className="session-modal-row">
            <label htmlFor="sm-note">{t("session.open.note")}</label>
            <textarea id="sm-note" className="control" value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("common.optional")} rows={3} maxLength={500} />
          </div>
          {err && <div className="error-box">{err}</div>}
        </div>
        <div className="session-modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>{t("common.cancel")}</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t("session.open.opening") : t("session.open.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
