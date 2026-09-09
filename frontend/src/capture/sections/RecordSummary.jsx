import { useI18n } from "../../i18n";

// Thanh tom tat ho so — dai ngang, nhan nho + gia tri dam. KHONG phai the lon:
// day la vung nhan dang ho so, khong phai dashboard, nen moi o chi cao 1 dong.
// So ho so nghi pham / so chi ban / so AK do can bo dien tay (khong sinh tu dong)
// vi chung lay tu so dang ky giay cua don vi.
function SumText({ label, value, onChange, placeholder, disabled, wide = false }) {
  return (
    <label className={"rec-sum-item" + (wide ? " rec-sum-item--wide" : "")}>
      <span className="rec-sum-label">{label}</span>
      <input
        className="rec-sum-input"
        value={value || ""}
        placeholder={placeholder || "—"}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

// O chi doc: ngay lap / don vi / trang thai — suy ra tu du lieu khac, khong sua.
function SumStatic({ label, value, children }) {
  return (
    <div className="rec-sum-item">
      <span className="rec-sum-label">{label}</span>
      {children || <span className="rec-sum-value">{value || "—"}</span>}
    </div>
  );
}

export function RecordSummary({
  form, setField, dateStr, unitName, ready, disabled = false,
}) {
  const { t } = useI18n();
  return (
    <div className="rec-sum" role="group" aria-label={t("capture.summary.record_id")}>
      <SumText label={t("capture.summary.record_id")} value={form.personal_id}
        onChange={(v) => setField("personal_id", v)}
        placeholder={t("capture.form.personal_id_ph")} disabled={disabled} />
      <SumText label={t("capture.summary.record_sheet_no")} value={form.record_sheet_no}
        onChange={(v) => setField("record_sheet_no", v)} disabled={disabled} />
      <SumText label={t("capture.summary.fp_sheet_no")} value={form.fp_sheet_no}
        onChange={(v) => setField("fp_sheet_no", v)} disabled={disabled} />
      {/* "Lan ngay" tren chi ban = lap lan thu N, ngay dd/mm/yyyy. Hai o rieng:
          lan thu N la so thu tu (ho so lap lai nhieu lan), ngay la ngay lap cua
          LAN DO — khac voi "Ngay lap" o duoi (ngay hom nay, chi doc). */}
      <SumText label={t("capture.summary.record_times")} value={form.record_times}
        onChange={(v) => setField("record_times", v.replace(/\D/g, "").slice(0, 3))}
        placeholder="1" disabled={disabled} />
      <SumText label={t("capture.summary.record_date")} value={form.record_date}
        onChange={(v) => setField("record_date", v)}
        placeholder={t("capture.form.date_ph")} disabled={disabled} />
      <SumText label={t("capture.summary.ak_no")} value={form.ak_no}
        onChange={(v) => setField("ak_no", v)} disabled={disabled} />
      <SumStatic label={t("capture.summary.datetime")} value={dateStr} />
      <SumStatic label={t("capture.summary.unit")} value={unitName} />
      <div className="rec-sum-item">
        <span className="rec-sum-label">{t("capture.summary.scope")}</span>
        <select className="rec-sum-input" value={form.record_scope || ""} disabled={disabled}
          onChange={(e) => setField("record_scope", e.target.value)}>
          <option value="">{t("capture.summary.scope_ph")}</option>
          <option value="local">{t("capture.summary.scope_local")}</option>
          <option value="central">{t("capture.summary.scope_central")}</option>
        </select>
      </div>
      {/* Trang thai khong dua vao mau: co chu + dau hieu ky tu di kem. */}
      <SumStatic label={t("capture.summary.status")}>
        <span className={"rec-sum-status" + (ready ? " ok" : "")}>
          {ready ? "✓ " : "● "}
          {ready ? t("capture.status.ready") : t("capture.status.draft")}
        </span>
      </SumStatic>
    </div>
  );
}
