import { useI18n } from "../../i18n";
import { InfoField } from "../components/fields";

// I. THONG TIN NHAN THAN — 16 truong, chia doi tron 8 hang.
//
// THU TU dat theo TRINH TU LAM VIEC THAT, khong theo thu tu tren mau giay:
//   1. Giay to + sinh ngay  -> cham the CCCD la may tu dien (applyCccdData)
//   2. Ho ten + ten goi khac
//   3. Gioi tinh + nhan khau (quoc tich, dan toc, nghe nghiep)
//   4. Dia chi (que quan, thuong tru, tam tru, hien nay)
//   5. Than nhan (cha, me, vo/chong, cho o)
// CMND/CCCD dung dau vi la truong BAT BUOC (*) va la truong dau doc the ghi
// vao — o dau tien cung la o can bo cham the roi kiem tra ngay.
//
// Truoc day 7 truong dau chi sua duoc bang cach bam thang vao anh the CCCD o
// cot phai; khoi anh the da bo nen day la duong nhap duy nhat. Dau doc the van
// chay: cham the => applyCccdData ghi thang vao form nay.
export function SectionPersonal({ form, setField, disabled = false }) {
  const { t } = useI18n();
  return (
    <div className="cap-grid cap-grid--personal">
      {/* ==== 1. GIAY TO: o dau tien, ghep voi Sinh ngay ====
          Backend rang buoc cccd_number = dung 12 chu so (main.py: pattern
          ^\d{12}$) nen o nay loc phi so. So ho chieu KHONG nhap duoc vao day —
          neu can, phai noi rong pattern o backend truoc.
          Dau * = bat buoc (cung quy uoc voi "Ma ho so" o thanh tom tat). */}
      <InfoField label={t("capture.personal.id_doc") + " *"}>
        <input className="control control-sm" value={form.cccd_number} disabled={disabled}
          inputMode="numeric" maxLength={12} placeholder={t("capture.form.cccd_ph")}
          onChange={(e) => setField("cccd_number", e.target.value.replace(/\D/g, "").slice(0, 12))} />
      </InfoField>
      {/* Sinh ngay di cap voi so giay to: ca hai cung do dau doc the dien ra,
          nen can bo doi chieu mot luot ngay hang dau. */}
      <InfoField label={t("capture.personal.dob")}>
        <input className="control control-sm" value={form.dob} disabled={disabled}
          placeholder={t("capture.form.date_ph")}
          onChange={(e) => setField("dob", e.target.value)} />
      </InfoField>

      {/* ==== 2. HO TEN: Ho ten + Ten goi khac GHEP MOT HANG (moi o nua hang) ====
          Truoc day ca hai deu trai ca hang (span-3col) => rieng hai truong nay
          an 2 hang. Ghep lai lay ra mot hang cho "Vo (chong) | Cho o" xuong
          duoi, ma muc I khong cao them.
          NHIP GHEP CAP chan: 16 truong chia doi tron 8 hang, cac cap dung nghia:
            CMND/CCCD | Sinh ngay, Ho ten | Ten goi khac,
            Gioi tinh | Quoc tich, Dan toc | Nghe nghiep,
            Que quan | Thuong tru, Tam tru | Hien nay,
            Cha | Me, Vo (chong) | Cho o. */}
      <InfoField label={t("detainee.field.full_name")}>
        <input className="control control-sm" value={form.full_name} disabled={disabled}
          maxLength={100} placeholder={t("capture.form.full_name_ph")}
          onChange={(e) => setField("full_name", e.target.value)} />
      </InfoField>
      {/* "Ten goi khac" gom ca bi danh — can pham thuong khai nhieu ten. O hep di
          mot nua so voi truoc, noi dung go vao van cuon trong o. */}
      <InfoField label={t("capture.personal.alias")}>
        <input className="control control-sm" value={form.alias} disabled={disabled}
          onChange={(e) => setField("alias", e.target.value)} />
      </InfoField>

      {/* ==== 3. GIOI TINH + NHAN KHAU ==== */}
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

      {/* ==== 4. DIA CHI ====
          4 truong dia chi CHIA DOI, khong span-3col (trai ca hang). Truoc day moi
          truong mot hang => 4 hang chi cho dia chi, day muc I cao len va toan
          trang phai cuon. Chia doi con 2 hang: que quan | thuong tru, tam tru |
          o hien nay - cap doi nhau dung nghia.
          Danh doi: o hep di mot nua nen placeholder dai bi cat bot khi o trong
          ("So nha, duong, phuong/xa, quan/huyen, tinh/thanh"). Chi la goi y luc
          o rong; noi dung go vao van du cho va van cuon trong o. */}
      <InfoField label={t("detainee.field.hometown")}>
        <input className="control control-sm" value={form.hometown} disabled={disabled}
          placeholder={t("capture.form.hometown_ph")}
          onChange={(e) => setField("hometown", e.target.value)} />
      </InfoField>
      <InfoField label={t("detainee.field.address")}>
        <input className="control control-sm" value={form.address} disabled={disabled}
          placeholder={t("capture.field.address_ph")}
          onChange={(e) => setField("address", e.target.value)} />
      </InfoField>
      <InfoField label={t("detainee.field.temp_address")}>
        <input className="control control-sm" value={form.temp_address} disabled={disabled}
          placeholder={t("capture.field.address_ph")}
          onChange={(e) => setField("temp_address", e.target.value)} />
      </InfoField>
      <InfoField label={t("detainee.field.current_address")}>
        <input className="control control-sm" value={form.current_address} disabled={disabled}
          placeholder={t("capture.field.address_ph")}
          onChange={(e) => setField("current_address", e.target.value)} />
      </InfoField>

      {/* ==== 5. THAN NHAN: Cha | Me, Vo (chong) | Cho o ====
          Cha/me: chi ban giay co 2 dong CO DINH. Vo (chong) + Cho o: mau 208 cung
          co 2 dong co dinh, TRUOC DAY dat o muc III (dac diem nhan dang) — sai
          nhom, gio dua ve day cho lien mach thong tin than nhan. Bang family[]
          (con, anh chi em) da bo khoi trang theo spec 5 muc. */}
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
      <InfoField label={t("namesheet.field.spouse")}>
        <input className="control control-sm" value={form.spouse_name} disabled={disabled}
          placeholder={t("capture.form.full_name_ph")}
          onChange={(e) => setField("spouse_name", e.target.value)} />
      </InfoField>
      <InfoField label={t("namesheet.field.residence")}>
        <input className="control control-sm" value={form.spouse_residence} disabled={disabled}
          placeholder={t("capture.field.address_ph")}
          onChange={(e) => setField("spouse_residence", e.target.value)} />
      </InfoField>
      {/* O "Ghi chu" DA BO khoi trang: khong co tren ca danh ban (204/208) lan chi
          ban (205), nen khong con cho nhap. Truong `note` VAN o trong form duoi
          dang du lieu di qua (LEGACY_FORM) — bo han khoi payload la moi lan sua
          ho so cu se ghi None len ghi chu da luu. */}
    </div>
  );
}
