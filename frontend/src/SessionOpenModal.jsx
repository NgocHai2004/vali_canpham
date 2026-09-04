import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n";

function fmtNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SessionOpenModal({ officerName, officerFullName, onCreated, onCancel }) {
  const { t } = useI18n();
  const [officer, setOfficer] = useState(officerFullName || officerName || "");
  const [location, setLocation] = useState(t("session.open.location_default"));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Noi giam giu CHOT NGAY o phien: dien -> co so -> (phan trai) -> buong.
  // Ho so tao trong phien lay lai 4 gia tri nay nen can bo khong phai chon lai
  // cho tung can pham.
  const [cells, setCells] = useState([]);
  const [custodyType, setCustodyType] = useState("");
  const [facilityCode, setFacilityCode] = useState("");
  const [subCampCode, setSubCampCode] = useState("");
  const [cellCode, setCellCode] = useState("");

  useEffect(() => {
    let alive = true;
    api.listCells()
      .then((rows) => { if (alive) setCells(Array.isArray(rows) ? rows : []); })
      .catch(() => { /* khong tai duoc danh sach => 3 select rong, van mo duoc phien */ });
    return () => { alive = false; };
  }, []);

  // Co so theo dien da chon. Chua chon dien => chua loc gi (danh sach rong) de
  // can bo di dung thu tu dien -> co so, khong phai doan.
  const facilities = useMemo(
    () => cells.filter((c) => c.level === "facility" && (!custodyType || c.custody_type === custodyType)),
    [cells, custodyType],
  );
  const subCamps = useMemo(
    () => cells.filter((c) => c.level === "sub_camp" && c.parent === facilityCode),
    [cells, facilityCode],
  );
  // Buong: cha la phan trai da chon, hoac chinh co so (Nha tam giu khong co phan
  // trai). Dung dung luat cua backend (_resolve_session_place) de khong bao gio
  // gui len mot buong ma backend se tu choi.
  const cellOptions = useMemo(() => {
    if (!facilityCode) return [];
    const parent = subCampCode || facilityCode;
    return cells.filter((c) => c.level === "cell" && c.parent === parent);
  }, [cells, facilityCode, subCampCode]);

  // Doi cap tren => reset cap duoi, neu khong se con lai lua chon cu khong thuoc
  // nhanh moi (backend tra 400, va can bo khong hieu vi sao).
  const onCustodyChange = (v) => {
    setCustodyType(v);
    setFacilityCode("");
    setSubCampCode("");
    setCellCode("");
  };
  const onFacilityChange = (v) => {
    setFacilityCode(v);
    setSubCampCode("");
    setCellCode("");
  };
  const onSubCampChange = (v) => {
    setSubCampCode(v);
    setCellCode("");
  };

  const submit = async (e) => {
    e.preventDefault();
    const name = officer.trim();
    if (!name) { setErr(t("session.open.err.officer_required")); return; }
    setBusy(true);
    setErr("");
    try {
      const body = {
        location: location.trim(),
        note: note.trim(),
        officer_full_name: name,
        // Gui null thay vi "" cho truong khong chon: backend coi "" la khong co,
        // nhung null ro rang hon khi doc lai document phien.
        custody_type: custodyType || null,
        facility_code: facilityCode || null,
        sub_camp_code: subCampCode || null,
        cell_code: cellCode || null,
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
            <label htmlFor="sm-location">{t("session.open.location")}</label>
            <input id="sm-location" className="control" value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t("session.open.location_ph")} maxLength={200} />
          </div>
          {/* ---- Noi giam giu cua phien: dien -> co so -> (phan trai) -> buong ----
              Chon o day MOT LAN cho ca phien, thay vi chon lai cho tung ho so.
              Ca 4 truong deu tuy chon: phien khong chon noi giam giu van mo duoc
              (backend cho null), luc do form ho so hoi nhu cu.
              MOI select duoi LUON render, chi disable khi cap tren chua chon - giu
              cho san nen chieu cao modal khong doi khi dang chon. */}
          <div className="session-modal-row">
            <label htmlFor="sm-custody">{t("detainee.field.custody_type")}</label>
            <select id="sm-custody" className="control" value={custodyType}
              onChange={(e) => onCustodyChange(e.target.value)} disabled={busy}>
              <option value="">{t("common.optional")}</option>
              <option value="tam_giam">{t("detainee.custody_type.detention")}</option>
              <option value="tam_giu">{t("detainee.custody_type.temporary_hold")}</option>
            </select>
          </div>
          <div className="session-modal-row">
            <label htmlFor="sm-facility">{t("cells.form.facility_parent")}</label>
            <select id="sm-facility" className="control" value={facilityCode}
              onChange={(e) => onFacilityChange(e.target.value)}
              disabled={busy || !custodyType}>
              <option value="">{t("cells.form.select_facility")}</option>
              {facilities.map((f) => (
                <option key={f.code} value={f.code}>{f.name}</option>
              ))}
            </select>
          </div>
          {/* Phan trai: Nha tam giu khong co phan trai => select rong va disable,
              nhung VAN chiem cho de layout khong nhay khi doi giua 2 dien. */}
          <div className="session-modal-row">
            <label htmlFor="sm-subcamp">{t("cells.form.sub_camp_parent")}</label>
            <select id="sm-subcamp" className="control" value={subCampCode}
              onChange={(e) => onSubCampChange(e.target.value)}
              disabled={busy || subCamps.length === 0}>
              <option value="">{t("cells.form.no_sub_camp")}</option>
              {subCamps.map((s) => (
                <option key={s.code} value={s.code}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="session-modal-row">
            <label htmlFor="sm-cell">{t("detainee.field.cell")}</label>
            <select id="sm-cell" className="control" value={cellCode}
              onChange={(e) => setCellCode(e.target.value)}
              disabled={busy || cellOptions.length === 0}>
              <option value="">{t("common.optional")}</option>
              {cellOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}{typeof c.capacity === "number" ? ` (${c.current ?? 0}/${c.capacity})` : ""}
                </option>
              ))}
            </select>
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
