import { useI18n } from "../../i18n";
import { InfoField } from "../components/fields";

// I. THONG TIN NHAN THAN — dung 14 truong theo chi ban giay: ho ten, ten goi
// khac, gioi tinh, sinh ngay, so giay to, quoc tich, dan toc, que quan, noi
// thuong tru, noi tam tru, noi o hien nay, nghe nghiep, ho ten cha, ho ten me.
//
// Truoc day 7 truong dau chi sua duoc bang cach bam thang vao anh the CCCD o
// cot phai; khoi anh the da bo nen day la duong nhap duy nhat. Dau doc the van
// chay: cham the => applyCccdData ghi thang vao form nay.
export function SectionPersonal({ form, setField, disabled = false }) {
  const { t } = useI18n();
  return (
    <div className="cap-grid cap-grid--personal">
      <InfoField label={t("detainee.field.full_name")} className="span-3col">
        <input className="control control-sm" value={form.full_name} disabled={disabled}
          maxLength={100} placeholder={t("capture.form.full_name_ph")}
          onChange={(e) => setField("full_name", e.target.value)} />
      </InfoField>
      {/* "Ten goi khac" gom ca bi danh — can pham thuong khai nhieu ten. */}
      <InfoField label={t("capture.personal.alias")}>
        <input className="control control-sm" value={form.alias} disabled={disabled}
          onChange={(e) => setField("alias", e.target.value)} />
      </InfoField>
      <InfoField label={t("detainee.field.gender")}>
        <div className="radio-group radio-group-sm">
          <label className="radio-option">
            <input type="radio" name="capture-gender" value="male" disabled={disabled}
              checked={form.gender === "male"}
              onChange={(e) => setField("gender", e.target.value)} />
            <span>{t("common.male")}</span>
          </label>
          <label className="radio-option">
            <input type="radio" name="capture-gender" value="female" disabled={disabled}
              checked={form.gender === "female"}
              onChange={(e) => setField("gender", e.target.value)} />
            <span>{t("common.female")}</span>
          </label>
        </div>
      </InfoField>
      <InfoField label={t("capture.personal.dob")}>
        <input className="control control-sm" value={form.dob} disabled={disabled}
          placeholder={t("capture.form.date_ph")}
          onChange={(e) => setField("dob", e.target.value)} />
      </InfoField>
      {/* Backend rang buoc cccd_number = dung 12 chu so (main.py: pattern
          ^\d{12}$) nen o nay loc phi so. So ho chieu KHONG nhap duoc vao day —
          neu can, phai noi rong pattern o backend truoc. */}
      <InfoField label={t("capture.personal.id_doc")}>
        <input className="control control-sm" value={form.cccd_number} disabled={disabled}
          inputMode="numeric" maxLength={12} placeholder={t("capture.form.cccd_ph")}
          onChange={(e) => setField("cccd_number", e.target.value.replace(/\D/g, "").slice(0, 12))} />
      </InfoField>
      <InfoField label={t("detainee.field.nationality")}>
        <input className="control control-sm" value={form.nationality} disabled={disabled}
          placeholder={t("detainee.field.nationality_default")}
          onChange={(e) => setField("nationality", e.target.value)} />
      </InfoField>
      <InfoField label={t("detainee.field.ethnicity")}>
        <input className="control control-sm" value={form.ethnicity} disabled={disabled}
          placeholder={t("capture.form.ethnicity_ph")}
          onChange={(e) => setField("ethnicity", e.target.value)} />
      </InfoField>
      <InfoField label={t("detainee.field.occupation")}>
        <input className="control control-sm" value={form.occupation} disabled={disabled}
          placeholder={t("capture.field.occupation_ph")}
          onChange={(e) => setField("occupation", e.target.value)} />
      </InfoField>
      <InfoField label={t("detainee.field.hometown")} className="span-3col">
        <input className="control control-sm" value={form.hometown} disabled={disabled}
          placeholder={t("capture.form.hometown_ph")}
          onChange={(e) => setField("hometown", e.target.value)} />
      </InfoField>
      <InfoField label={t("detainee.field.address")} className="span-3col">
        <input className="control control-sm" value={form.address} disabled={disabled}
          placeholder={t("capture.field.address_ph")}
          onChange={(e) => setField("address", e.target.value)} />
      </InfoField>
      <InfoField label={t("detainee.field.temp_address")} className="span-3col">
        <input className="control control-sm" value={form.temp_address} disabled={disabled}
          placeholder={t("capture.field.address_ph")}
          onChange={(e) => setField("temp_address", e.target.value)} />
      </InfoField>
      <InfoField label={t("detainee.field.current_address")} className="span-3col">
        <input className="control control-sm" value={form.current_address} disabled={disabled}
          placeholder={t("capture.field.address_ph")}
          onChange={(e) => setField("current_address", e.target.value)} />
      </InfoField>
      {/* Cha / me: chi ban giay co 2 dong CO DINH. Bang family[] (vo/chong, con,
          anh chi em) da bo khoi trang theo spec 5 muc. */}
      <InfoField label={t("detainee.field.father_name")}>
        <input className="control control-sm" value={form.father_name} disabled={disabled}
          placeholder={t("capture.form.full_name_ph")}
          onChange={(e) => setField("father_name", e.target.value)} />
      </InfoField>
      <InfoField label={t("detainee.field.mother_name")}>
        <input className="control control-sm" value={form.mother_name} disabled={disabled}
          placeholder={t("capture.form.full_name_ph")}
          onChange={(e) => setField("mother_name", e.target.value)} />
      </InfoField>
    </div>
  );
}
