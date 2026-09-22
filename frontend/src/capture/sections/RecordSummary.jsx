import { useI18n } from "../../i18n";
import { fieldState } from "../components/fields";
import { isValidDateStr, toDobInput } from "../formSchema";

// Thanh tom tat ho so — dai ngang, nhan nho + gia tri dam. KHONG phai the lon:
// day la vung nhan dang ho so, khong phai dashboard, nen moi o chi cao 1 dong.
// So ho so can pham / so chi ban / so AK do can bo dien tay (khong sinh tu dong)
// vi chung lay tu so dang ky giay cua don vi.
//
// BBOX xanh/do: dung chung fieldState() voi cac muc I/II/III de mot quy tac chay
// ca trang (o * con thieu -> do, o da dien -> xanh, o khong bat buoc con trong ->
// giu nguyen). Chi "Ma ho so" mang `required`; 5 o text con lai deu tuy y.
function SumText({ label, value, onChange, onBlur, placeholder, disabled, wide = false, required = false, isValid }) {
  const st = fieldState({ value, required, isValid });
  return (
    <label className={"rec-sum-item" + (wide ? " rec-sum-item--wide" : "") + (st ? " " + st : "")}>
      <span className="rec-sum-label">{label}</span>
      <input
        className="rec-sum-input"
        value={value || ""}
        placeholder={placeholder || "—"}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onBlur && onBlur(e.target.value)}
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
  // O "Pham vi" la <div> tho (co <select> ben trong) chu khong qua SumText, nen
  // tinh bbox o day roi gan tay vao className. Tuy y — khong co dau *.
  const scopeSt = fieldState({ value: form.record_scope });
  return (
    <div className="rec-sum" role="group" aria-label={t("capture.summary.record_id")}>
      {/* Dau * = bat buoc. Noi o day chu KHONG sua chuoi trong locales, vi khoa
          nay con dung lam aria-label cua ca nhom o tren — them * vao locale thi
          trinh doc man hinh doc ca dau sao cho nhom. Cung la quy uoc san co:
          DetaineeForm.jsx dung t(...) + " *". */}
      <SumText label={t("capture.summary.record_id") + " *"} value={form.personal_id} required
        onChange={(v) => setField("personal_id", v)}
        placeholder={t("capture.form.personal_id_ph")} disabled={disabled} />
      <SumText label={t("capture.summary.record_sheet_no")} value={form.record_sheet_no}
        onChange={(v) => setField("record_sheet_no", v)} disabled={disabled} />
      <SumText label={t("capture.summary.fp_sheet_no")} value={form.fp_sheet_no}
        onChange={(v) => setField("fp_sheet_no", v)} disabled={disabled} />
      <SumText label={t("capture.summary.record_date")} value={form.record_date}
        isValid={form.record_date ? isValidDateStr(form.record_date, false) : undefined}
        onChange={(v) => setField("record_date", v)}
        onBlur={(v) => {
          const norm = toDobInput(v);
          if (norm !== v) setField("record_date", norm);
        }}
        placeholder={t("capture.form.date_ph")} disabled={disabled} />
      <SumText label={t("capture.summary.ak_no")} value={form.ak_no}
        onChange={(v) => setField("ak_no", v)} disabled={disabled} />
      <SumStatic label={t("capture.summary.datetime")} value={dateStr} />
      <SumStatic label={t("capture.summary.unit")} value={unitName} />
      <div className={"rec-sum-item" + (scopeSt ? " " + scopeSt : "")}>
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
