// Xem truoc DANH BAN — dung theo mau giay trong image.png, gom HAI khoi:
//  - Mau so 204 (khoi tren): khung vien, cot trai = DANH BAN / So / Lap ngay /
//    Tai / DP / TW, cot phai = nhan than; roi cac dong tran ngang; goc duoi phai
//    la 2 o van tay "Tro trai | Tro phai".
//  - Mau so 208 (khoi duoi): Ho so AK so / vo chong / cho o / dac diem nhan dang,
//    o "Noi dan ma vach" ben phai, 3 anh 3x4 + Di hinh + Can bo lap o duoi.
//
// Khac CHI BAN (FpSheetPreview): danh ban KHONG in 10 o van lan, chi 2 ngon tro.
// Dung chung ha tang xem truoc (.preview-backdrop / .preview-scroll +
// buildProfilePdfBlob) nen xuat PDF ra USB y het hai to kia.
import { forwardRef, useRef, useState } from "react";
import { FP_CODE_TO_KEY, PORTRAITS } from "./constants";
import { useI18n, apiT } from "../i18n";
import { toast } from "../Toast";
import { usbApi } from "../api";
import UsbDrivePickerModal from "../UsbDrivePickerModal";
import { buildProfilePdfBlob, makePdfFileName } from "../lib/exportProfilePdf";
import { notify } from "../notifications";

// Chieu cao tren mau giay in san chu "1m" roi moi den cho dien => 175cm phai ra
// "75", khong phai "175". Duoi 100cm thi in nguyen so (tre nho).
function heightAfter1m(v) {
  const n = parseInt(String(v ?? "").replace(/\D/g, ""), 10);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 100) return String(n);
  return String(n - 100).padStart(2, "0");
}

export const NameSheetPreviewContent = forwardRef(function NameSheetPreviewContent(
  { form, photos = {}, unitName = "" },
  ref,
) {
  const { t } = useI18n();
  const val = (v) => (v && String(v).trim() ? String(v) : "");
  // Mau giay in san "Nam/nu" de KHOANH TRON, khong phai o dien => in dam ben
  // duoc chon, ben con lai de mo.
  const isMale = form.gender === "male";
  const isFemale = form.gender === "female";

  // Mot dong ke: nhan + gia tri nam tren net ke lien. grow chia be rong khi
  // nhieu dong nam cung mot hang.
  const L = ({ label, value, grow = 1, sub }) => (
    <div className="nsb-line" style={{ flexGrow: grow }}>
      <span className="nsb-lab">
        {label}
        {sub ? <sup>{sub}</sup> : null}
      </span>
      <span className="nsb-val">{value}</span>
    </div>
  );

  return (
    <div ref={ref} className="preview-a4 preview-a4-portrait nsb-sheet">
      {/* ===== Mau so 204: goc tren phai ===== */}
      <div className="nsb-formno">
        <div>{t("namesheet.form_no_204")}</div>
        <div className="nsb-formno-it">{t("namesheet.form_circular")}</div>
        <div className="nsb-formno-it">{t("namesheet.form_date")}</div>
      </div>

      {/* ===== KHOI 1 (Mau 204): khung vien ngoai ===== */}
      <div className="nsb-box">
        {/* Hang tren: cot trai (danh ban + so hieu) | cot phai (nhan than) */}
        <div className="nsb-top">
          <div className="nsb-top-l">
            <div className="nsb-title">{t("namesheet.title")}</div>
            <L label={t("namesheet.field.no")} value={val(form.record_sheet_no)} />
            <L label={t("namesheet.field.made_on")} value={val(form.record_date)} />
            <L label={t("namesheet.field.at")} value={val(unitName)} />
            {/* DP / TW: mau giay co HAI dong rieng, tick vao dong tuong ung. */}
            <L label={t("namesheet.field.dp")}
              value={form.record_scope === "local" ? "X" : ""} />
            <L label={t("namesheet.field.tw")}
              value={form.record_scope === "central" ? "X" : ""} />
          </div>
          <div className="nsb-top-r">
            <div className="nsb-row">
              <L label={t("namesheet.field.full_name")} sub="(1)"
                value={val(form.full_name).toUpperCase()} grow={4} />
              <span className="nsb-sex">
                <b className={isMale ? "on" : ""}>{t("namesheet.male")}</b>
                <span>/</span>
                <b className={isFemale ? "on" : ""}>{t("namesheet.female")}</b>
              </span>
            </div>
            <L label={t("namesheet.field.alias")} value={val(form.alias)} />
            <div className="nsb-row">
              <L label={t("namesheet.field.dob")} value={val(form.dob)} grow={1} />
              <L label={t("namesheet.field.id_doc")} sub="(2)"
                value={val(form.cccd_number)} grow={1} />
            </div>
            <L label={t("namesheet.field.hometown")} value={val(form.hometown)} />
            <L label={t("namesheet.field.address")} value={val(form.address)} />
            <L label={t("namesheet.field.temp_address")} value={val(form.temp_address)} />
          </div>
        </div>

        {/* Cac dong tran ngang ca khung */}
        <div className="nsb-mid">
          <L label={t("namesheet.field.current_address")} value={val(form.current_address)} />
          <div className="nsb-row">
            <L label={t("namesheet.field.nationality")} value={val(form.nationality)} />
            <L label={t("namesheet.field.ethnicity")} value={val(form.ethnicity)} />
            <L label={t("namesheet.field.occupation")} value={val(form.occupation)} />
          </div>
          <div className="nsb-row">
            <L label={t("namesheet.field.father")} value={val(form.father_name)} />
            <L label={t("namesheet.field.mother")} value={val(form.mother_name)} />
          </div>
          <div className="nsb-row">
            <L label={t("namesheet.field.arrest_date")} value={val(form.arrest_date)} grow={1} />
            <L label={t("namesheet.field.arrest_agency")} value={val(form.arrest_agency)} grow={2} />
          </div>
        </div>

        {/* Hang duoi: "Lap ve viec" + "C/T van tay" ben trai, 2 o van tro ben phai */}
        <div className="nsb-bot">
          <div className="nsb-bot-l">
            <L label={t("namesheet.field.case_about")} value={val(form.case_about)} />
            {/* Mau giay co 3 dong trong de viet tiep noi dung vu viec. */}
            <div className="nsb-blank" />
            <div className="nsb-blank" />
            {/* C/T van tay: da co o nhap (fp_formula) o muc II nen in duoc gia
                tri that; con trong thi van la net ke de viet tay. */}
            <div className="nsb-ct">
              <span>{t("namesheet.field.fp_formula")}</span>
              <span className="nsb-ct-line">{val(form.fp_formula)}</span>
            </div>
          </div>
          <div className="nsb-fp2">
            {[
              { code: "left_index", labelKey: "namesheet.fp.left_index" },
              { code: "right_index", labelKey: "namesheet.fp.right_index" },
            ].map(({ code, labelKey }) => (
              <div key={code} className="nsb-fp2-cell">
                <div className="nsb-fp2-cap">{t(labelKey)}</div>
                <div className="nsb-fp2-box">
                  {photos[FP_CODE_TO_KEY[code]]
                    ? <img src={photos[FP_CODE_TO_KEY[code]]} alt={t(labelKey)} />
                    : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chu thich (1)(2) duoi khung 204 */}
      <div className="nsb-foot">{t("namesheet.footnote")}</div>

      {/* ===== KHOI 2 (Mau 208) ===== */}
      <div className="nsb-box nsb-box-2">
        <div className="nsb-208-top">
          <div className="nsb-208-l">
            <L label={t("namesheet.field.ak_no")} value={val(form.ak_no)} />
            {/* Vo/chong + cho o: da co o nhap rieng (spouse_name / spouse_residence)
                nen in duoc du lieu that. Truoc day hai dong nay luon la net ke
                trong vi bang family[] bo di ma khong co truong nao thay. */}
            <L label={t("namesheet.field.spouse")} value={val(form.spouse_name)} />
            <L label={t("namesheet.field.residence")} value={val(form.spouse_residence)} />
            <div className="nsb-blank" />
          </div>
          {/* O dan ma vach: in khung de dan tem, khong co du lieu. */}
          <div className="nsb-barcode">
            <div>{t("namesheet.form_no_208")}</div>
            <div className="nsb-formno-it">{t("namesheet.form_circular_208")}</div>
            <div className="nsb-formno-it">{t("namesheet.form_date_208")}</div>
            <div className="nsb-barcode-note">{t("namesheet.barcode")}</div>
          </div>
        </div>

        {/* Dac diem nhan dang: 1 dong don + 3 hang doi */}
        <div className="nsb-208-mid">
          <L label={t("namesheet.field.face")} value={val(form.face_shape)} />
          <div className="nsb-row">
            {/* "Chieu cao: 1m__" — chu 1m in san tren mau. */}
            <div className="nsb-line" style={{ flexGrow: 1 }}>
              <span className="nsb-lab">{t("namesheet.field.height")}</span>
              <span className="nsb-1m">{t("namesheet.one_m")}</span>
              <span className="nsb-val">{heightAfter1m(form.height_cm)}</span>
            </div>
            <L label={t("namesheet.field.ear_fold")} value={val(form.ear_features)} />
          </div>
          <div className="nsb-row">
            <L label={t("namesheet.field.nose")} value={val(form.nose)} />
            <L label={t("namesheet.field.earlobe")} value={val(form.earlobe)} />
          </div>
          <L label={t("namesheet.field.marks")} value={val(form.scars)} />
        </div>

        {/* Hang duoi: 3 anh 3x4 | Di hinh + Can bo lap */}
        <div className="nsb-208-bot">
          <div className="nsb-photos">
            {PORTRAITS.map((p) => (
              <div key={p.key} className="nsb-photo">
                <div className="nsb-photo-box">
                  {photos[p.key]
                    ? <img src={photos[p.key]} alt={t(p.labelKey)} />
                    : <span className="nsb-photo-ph">{t("namesheet.photo_3x4")}</span>}
                </div>
                <div className="nsb-photo-cap">{t(p.labelKey)}</div>
              </div>
            ))}
          </div>
          <div className="nsb-208-right">
            <L label={t("namesheet.field.abnormal")} value={val(form.physical_abnormalities)} />
            <div className="nsb-blank" />
            <div className="nsb-blank" />
            {/* Can bo lap: in san ten (truong officer_name), van ky tay sau khi in. */}
            <L label={t("namesheet.field.officer")} value={val(form.officer_name)} />
          </div>
        </div>
      </div>
    </div>
  );
});

// Modal xem truoc danh ban — cung khuon voi FpSheetPreviewModal.
export function NameSheetPreviewModal({ form, photos = {}, unitName = "", onClose }) {
  const { t } = useI18n();
  const a4Ref = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [usbPicker, setUsbPicker] = useState({ open: false, drives: [], resolve: null });

  const pickDrive = (drives) => new Promise((resolve) => {
    setUsbPicker({ open: true, drives, resolve });
  });

  const handleExport = async () => {
    const node = a4Ref.current;
    if (!node) return;
    setExporting(true);
    try {
      const info = await usbApi.listWritable();
      const drives = info.drives || [];
      const dongles = info.dongle_drives || [];
      if (drives.length === 0) {
        if (dongles.length > 0) throw new Error(apiT("usb.export.err.only_dongle"));
        throw new Error(apiT("usb.export.err.no_drive"));
      }
      const chosen = drives.length === 1 ? drives[0] : await pickDrive(drives);
      if (!chosen) return;
      const blob = await buildProfilePdfBlob(node);
      // Tien to "danhban-" de khong ghi de file ho so / chi ban cua cung nguoi.
      const filename = "danhban-" + makePdfFileName(
        form.record_sheet_no || form.personal_id || form.cccd_number, form.full_name);
      const saved = await usbApi.saveExport(chosen.path, filename, blob);
      const okMsg = t("usb.export.success", { path: saved?.path || chosen.path });
      notify.add(okMsg);
      toast.success(okMsg);
    } catch (ex) {
      console.error("[Export danh ban] error:", ex);
      toast.error(t("capture.pdf.err_export", { message: ex?.message || ex }));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="preview-backdrop" onClick={onClose}>
      <div className="preview-toolbar no-print" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="preview-btn" onClick={handleExport} disabled={exporting}>
          {exporting ? t("capture.pdf.exporting") : t("capture.pdf.export")}
        </button>
        <button type="button" className="preview-btn preview-close" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>

      <div className="preview-scroll" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()}>
          <NameSheetPreviewContent ref={a4Ref} form={form} photos={photos} unitName={unitName} />
        </div>
      </div>

      {usbPicker.open && (
        <UsbDrivePickerModal
          drives={usbPicker.drives}
          onPick={(d) => {
            const r = usbPicker.resolve;
            setUsbPicker({ open: false, drives: [], resolve: null });
            r && r(d);
          }}
          onCancel={() => {
            const r = usbPicker.resolve;
            setUsbPicker({ open: false, drives: [], resolve: null });
            r && r(null);
          }}
        />
      )}
    </div>
  );
}
