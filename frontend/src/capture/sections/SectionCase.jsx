import { useI18n } from "../../i18n";
import { InfoField } from "../components/fields";

// II. THONG TIN VU VIEC — gom 3 nhom vao mot muc:
//   a) Vu viec: bat ngay, don vi bat, lap ve viec, C/T van tay
//   b) Can bo (4 o cuoi to chi ban mau 205): lap CB, sap xep, phan loai, KT
//   c) Ghi chu: trai ca 2 cot o hang cuoi
// Toi danh / so quyet dinh / ngay nhap trai da bo khoi trang: chi ban khong co
// cac dong do, va phan ket luan phap ly khong thuoc buoc thu nhan.
//
// KHOI CAN BO truoc day la mot muc rieng (III) nam canh muc nay. Da gop vao day:
// cung la thong tin LAP HO SO cho vu viec nay, khong dang mot muc so La Ma rieng.
// Nho gop lai ma cac muc duoi tro ve so cu (nhan dang III, anh IV, van tay V).
//
// "Can bo lap CB" KHONG co truong rieng: dung chung `officer_name` voi dong
// "Can bo lap" cua mau 208 (danh ban), vi cung la nguoi lap ho so. Khong tao hai
// truong cho cung mot thong tin. Ba o con lai (sap xep / phan loai / KT phan
// loai) la cong doan LUU TRU - TRA CUU sau khi lap, thuong do nguoi khac lam,
// nen moi o mot truong rieng. Ten in san tren to, can bo van ky tay khi in.
//
// BO CUC: luoi 2 cot mac dinh cua .cap-flat .cap-grid => 8 o dau chia thanh 4
// hang doi, Ghi chu trai ca hang (span-3col = grid-column 1/-1).
const OFFICERS = [
  { key: "officer_name", labelKey: "fpsheet.officer.maker" },
  { key: "officer_sorter", labelKey: "fpsheet.officer.sorter" },
  { key: "officer_classifier", labelKey: "fpsheet.officer.classifier" },
  { key: "officer_class_checker", labelKey: "fpsheet.officer.checker" },
];

export function SectionCase({ form, setField, disabled = false }) {
  const { t } = useI18n();
  return (
    <div className="cap-grid cap-grid--case">
      <InfoField label={t("capture.case.arrest_date")}>
        <input className="control control-sm" value={form.arrest_date} disabled={disabled}
          placeholder={t("capture.form.date_ph")}
          onChange={(e) => setField("arrest_date", e.target.value)} />
      </InfoField>
      {/* Don vi bat thuong dai ("Cong an phuong ... quan ...") nen o nua hang bi
          cat chu khi o trong — noi dung go vao van cuon trong o. */}
      <InfoField label={t("capture.case.arrest_unit")}>
        <input className="control control-sm" value={form.arrest_agency} disabled={disabled}
          placeholder={t("capture.arrest_agency_ph")}
          onChange={(e) => setField("arrest_agency", e.target.value)} />
      </InfoField>
      {/* "Lap ve viec" = noi dung vu viec / ly do lap ho so, ghi tren chi ban.
          Giu textarea 2 dong: noi dung dai nhat cua muc nay. */}
      <InfoField label={t("capture.case.about")}>
        <textarea className="control control-sm cap-textarea" rows={2}
          value={form.case_about} disabled={disabled}
          placeholder={t("capture.case_about_ph")}
          onChange={(e) => setField("case_about", e.target.value)} />
      </InfoField>
      {/* C/T van tay = cong thuc van tay. Truoc day CA HAI to (danh ban + chi
          ban) in dong nay TRONG vi khong co truong nao mang du lieu; gio can bo
          tra cuu duoc roi nhap vao day. Dat sau "Lap ve viec" vi tren mau giay
          no nam ngay duoi dong do. */}
      <InfoField label={t("namesheet.field.fp_formula")}>
        <input className="control control-sm" value={form.fp_formula} disabled={disabled}
          placeholder={t("capture.fp_formula_ph")}
          onChange={(e) => setField("fp_formula", e.target.value)} />
      </InfoField>

      {/* ---- Khoi 4 o CAN BO cua mau 205 ---- */}
      {OFFICERS.map(({ key, labelKey }) => (
        <InfoField key={key} label={t(labelKey)}>
          <input className="control control-sm" value={form[key]} disabled={disabled}
            placeholder={t("capture.form.full_name_ph")}
            onChange={(e) => setField(key, e.target.value)} />
        </InfoField>
      ))}

      {/* GHI CHU — hang cuoi, trai ca 2 cot. Truong `note` von da di qua form
          nhu du lieu an (khong co o nhap tu khi don muc I); gio co lai cho nhap.
          Khong in tren mau 204/205/208 — la ghi chu noi bo cua ho so. */}
      <InfoField label={t("detainee.field.note")} className="span-3col">
        <textarea className="control control-sm cap-textarea" rows={2}
          value={form.note} disabled={disabled}
          onChange={(e) => setField("note", e.target.value)} />
      </InfoField>
    </div>
  );
}
