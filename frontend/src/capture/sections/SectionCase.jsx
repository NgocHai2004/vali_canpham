import { useI18n } from "../../i18n";
import { InfoField } from "../components/fields";

// II. THONG TIN VU VIEC — dung 3 dong theo chi ban giay: bat ngay, don vi bat,
// lap ve viec. Toi danh / so quyet dinh / ngay nhap trai da bo khoi trang: chi
// ban khong co cac dong do, va phan ket luan phap ly khong thuoc buoc thu nhan.
export function SectionCase({ form, setField, disabled = false }) {
  const { t } = useI18n();
  return (
    <div className="cap-grid cap-grid--case">
      <InfoField label={t("capture.case.arrest_date")}>
        <input className="control control-sm" value={form.arrest_date} disabled={disabled}
          placeholder={t("capture.form.date_ph")}
          onChange={(e) => setField("arrest_date", e.target.value)} />
      </InfoField>
      <InfoField label={t("capture.case.arrest_unit")}>
        <input className="control control-sm" value={form.arrest_agency} disabled={disabled}
          placeholder={t("capture.arrest_agency_ph")}
          onChange={(e) => setField("arrest_agency", e.target.value)} />
      </InfoField>
      {/* "Lap ve viec" = noi dung vu viec / ly do lap ho so, ghi tren chi ban. */}
      <InfoField label={t("capture.case.about")} className="span-3col">
        <textarea className="control control-sm cap-textarea" rows={2}
          value={form.case_about} disabled={disabled}
          placeholder={t("capture.case_about_ph")}
          onChange={(e) => setField("case_about", e.target.value)} />
      </InfoField>
    </div>
  );
}
