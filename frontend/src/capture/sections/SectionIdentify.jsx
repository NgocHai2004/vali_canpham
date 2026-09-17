import { useI18n } from "../../i18n";
import { InfoField } from "../components/fields";

// III. DAC DIEM NHAN DANG — 7 dong theo chi ban giay, dung thu tu spec:
// khuon mat, chieu cao, song mui, nep tai duoi, dai tai, dau vet rieng, di hinh.
//
// Chieu cao van do tu ANH CHAN DUNG (thuoc do trong LiveCamShot ->
// applyMeasuredHeight) nen giu kieu input number. Can nang / nhom mau da bo:
// chi ban khong co hai dong do.
export function SectionIdentify({ form, setField, disabled = false }) {
  const { t } = useI18n();
  return (
    <div className="cap-grid cap-grid--identify">
      <InfoField label={t("capture.identify.face")}>
        <input className="control control-sm" value={form.face_shape} disabled={disabled}
          onChange={(e) => setField("face_shape", e.target.value)} />
      </InfoField>
      <InfoField label={t("detainee.field.height_cm")}>
        <input className="control control-sm" type="number" min="50" max="250"
          value={form.height_cm} disabled={disabled} placeholder="---"
          onChange={(e) => setField("height_cm", e.target.value)} />
      </InfoField>
      <InfoField label={t("capture.identify.nose")}>
        <input className="control control-sm" value={form.nose} disabled={disabled}
          onChange={(e) => setField("nose", e.target.value)} />
      </InfoField>
      {/* ear_features (cu: "Dac diem tai") duoc dung lai cho "Nep tai duoi" —
          khong doi ten truong DB de ho so cu khong mat du lieu. */}
      <InfoField label={t("capture.identify.ear_fold")}>
        <input className="control control-sm" value={form.ear_features} disabled={disabled}
          onChange={(e) => setField("ear_features", e.target.value)} />
      </InfoField>
      <InfoField label={t("capture.identify.earlobe")}>
        <input className="control control-sm" value={form.earlobe} disabled={disabled}
          onChange={(e) => setField("earlobe", e.target.value)} />
      </InfoField>
      <InfoField label={t("capture.identify.abnormal")}>
        <input className="control control-sm" value={form.physical_abnormalities} disabled={disabled}
          onChange={(e) => setField("physical_abnormalities", e.target.value)} />
      </InfoField>
      {/* O "Can nang" DA BO khoi trang: ca danh ban (204/208) lan chi ban (205)
          deu khong in can nang. Truong `weight_kg` van di qua form nhu du lieu
          an de khong ghi None len ho so cu. Chieu cao thi GIU: mau 208 co dong
          "Chieu cao: 1m__". */}
      {/* Luoi muc III la 4 cot: hang 1 = khuon mat / chieu cao / song mui / nep
          tai duoi, hang 2 = dai tai / di hinh + o nay chiem 2 cot cuoi. */}
      <InfoField label={t("capture.identify.marks")} className="span-2col">
        <textarea className="control control-sm cap-textarea" rows={2}
          value={form.scars} disabled={disabled} placeholder={t("capture.scars_ph")}
          onChange={(e) => setField("scars", e.target.value)} />
      </InfoField>

      {/* Vo (chong) + Cho o DA CHUYEN sang muc I, dat canh Ho ten cha / Ho ten me:
          chung la THONG TIN THAN NHAN, khong phai dac diem nhan dang.
          Khoi 4 o CAN BO DA TACH ra muc rieng (SectionOfficers), nam cung hang voi
          muc II. Chi doi cho o nhap — cac truong (spouse_name / spouse_residence /
          officer_*) va cho in tren mau 205/208 giu nguyen. */}
    </div>
  );
}
