// Xem truoc CHI BAN — dung theo mau chi ban giay (image.png):
// khoi tieu de + so danh ban/chi ban, khoi nhan than, 10 o van LAN chia 2 hang
// (tay trai 1-5, tay phai 6-10), hang van CHUM 4-2-4, khoi ky ten.
//
// Tach RIENG khoi ProfilePreviewContent (DataCapturePage.jsx): ho so nghi pham la
// mot to A4 khac han — chi ban chi in van tay + nhan than toi thieu de doi chieu,
// khong co dien giam giu / suc khoe / vu an.
//
// Dung chung ha tang xem truoc voi ho so: .preview-backdrop / .preview-toolbar /
// .preview-scroll + buildProfilePdfBlob(node) nen xuat PDF ra USB y het.
import { forwardRef, useRef, useState } from "react";
import { FP_CODE_TO_KEY, FP_SHEET_NO, FP_PLAIN_SLOTS } from "./constants";
import { useI18n, apiT } from "../i18n";
import { toast } from "../Toast";
import { usbApi } from "../api";
import UsbDrivePickerModal from "../UsbDrivePickerModal";
import { buildProfilePdfBlob, makePdfFileName } from "../lib/exportProfilePdf";
import { notify } from "../notifications";

// Hai hang o van lan tren to giay. Thu tu = so IN tren chi ban (FP_SHEET_NO):
// tay trai cai->ut (1..5), tay phai ut->cai (6..10).
const ROLL_ROWS = [
  {
    labelKey: "fpsheet.hand.left",
    codes: ["left_thumb", "left_index", "left_middle", "left_ring", "left_little"],
  },
  {
    labelKey: "fpsheet.hand.right",
    codes: ["right_little", "right_ring", "right_middle", "right_index", "right_thumb"],
  },
];

const FINGER_LABEL = {
  left_thumb: "fpsheet.finger.thumb",
  left_index: "fpsheet.finger.index",
  left_middle: "fpsheet.finger.middle",
  left_ring: "fpsheet.finger.ring",
  left_little: "fpsheet.finger.little",
  right_thumb: "fpsheet.finger.thumb",
  right_index: "fpsheet.finger.index",
  right_middle: "fpsheet.finger.middle",
  right_ring: "fpsheet.finger.ring",
  right_little: "fpsheet.finger.little",
};

export const FpSheetPreviewContent = forwardRef(function FpSheetPreviewContent(
  { form, photos = {} },
  ref,
) {
  const { t } = useI18n();
  // Dong ke trong thay cho "…" cua ho so: chi ban la to DIEN TAY duoc, o trong
  // phai la net ke lien de can bo viet bu vao sau khi in.
  const val = (v) => (v && String(v).trim() ? String(v) : "");
  const genderVi = form.gender === "female"
    ? t("common.female")
    : form.gender === "male" ? t("common.male") : "";

  // Mot dong "nhan: ....gia tri...." — gia tri nam tren net ke lien.
  const Line = ({ label, value, grow = 1 }) => (
    <div className="fps-line" style={{ flexGrow: grow }}>
      <span className="fps-line-lab">{label}</span>
      <span className="fps-line-val">{value}</span>
    </div>
  );

  return (
    <div ref={ref} className="preview-a4 preview-a4-portrait fps-sheet">
      {/* ===== Dau trang: quoc hieu + so danh ban / so chi ban ===== */}
      <div className="fps-top">
        <div className="fps-top-left">
          <div className="fps-org1">{t("pdf.emblem")}</div>
          <div className="fps-org2">{t("pdf.motto")}</div>
          <div className="fps-org-underline" />
        </div>
        <div className="fps-top-right">
          <div className="fps-nobox">
            <span>{t("fpsheet.no.record")}</span>
            <b>{val(form.record_sheet_no)}</b>
          </div>
          <div className="fps-nobox">
            <span>{t("fpsheet.no.fp")}</span>
            <b>{val(form.fp_sheet_no)}</b>
          </div>
          <div className="fps-nobox">
            <span>{t("fpsheet.no.ak")}</span>
            <b>{val(form.ak_no)}</b>
          </div>
        </div>
      </div>

      <div className="fps-title-row">
        <h1 className="fps-title">{t("fpsheet.title")}</h1>
        <div className="fps-title-sub">
          {t("fpsheet.times", { n: val(form.record_times) || "…" })}
          {"  "}
          {t("fpsheet.on_date", { d: val(form.record_date) || "…" })}
        </div>
      </div>

      {/* ===== Nhan than: chi cac dong CO tren chi ban giay ===== */}
      <div className="fps-info">
        <div className="fps-row">
          <Line label={t("pdf.field.full_name")} value={val(form.full_name)} grow={3} />
          <Line label={t("fpsheet.field.gender")} value={genderVi} grow={1} />
        </div>
        <div className="fps-row">
          <Line label={t("capture.personal.alias")} value={val(form.alias)} grow={2} />
          <Line label={t("pdf.field.dob")} value={val(form.dob)} grow={1} />
        </div>
        <div className="fps-row">
          <Line label={t("fpsheet.field.id_doc")} value={val(form.cccd_number)} grow={2} />
          <Line label={t("pdf.field.nationality")} value={val(form.nationality)} grow={1} />
          <Line label={t("pdf.field.ethnicity")} value={val(form.ethnicity)} grow={1} />
        </div>
        <div className="fps-row">
          <Line label={t("pdf.field.hometown")} value={val(form.hometown)} />
        </div>
        <div className="fps-row">
          <Line label={t("fpsheet.field.address")} value={val(form.address)} />
        </div>
        <div className="fps-row">
          <Line label={t("fpsheet.field.occupation")} value={val(form.occupation)} grow={2} />
          <Line label={t("fpsheet.field.height")} value={val(form.height_cm)} grow={1} />
        </div>
        <div className="fps-row">
          <Line label={t("fpsheet.field.father")} value={val(form.father_name)} />
          <Line label={t("fpsheet.field.mother")} value={val(form.mother_name)} />
        </div>
        <div className="fps-row">
          <Line label={t("fpsheet.field.case_about")} value={val(form.case_about)} />
        </div>
      </div>

      {/* ===== Van LAN 10 ngon: 2 hang x 5 o ===== */}
      <div className="fps-block-title">{t("fpsheet.roll_title")}</div>
      {ROLL_ROWS.map((row) => (
        <div key={row.labelKey} className="fps-roll-row">
          <div className="fps-hand-tag">{t(row.labelKey)}</div>
          <div className="fps-roll-cells">
            {row.codes.map((code) => {
              const src = photos[FP_CODE_TO_KEY[code]];
              return (
                <div key={code} className="fps-cell">
                  <div className="fps-cell-head">
                    <b>{FP_SHEET_NO[code]}</b>
                    <span>{t(FINGER_LABEL[code])}</span>
                  </div>
                  <div className="fps-cell-box">
                    {src ? <img src={src} alt={t(FINGER_LABEL[code])} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ===== Van CHUM 4-2-4 ===== */}
      <div className="fps-block-title">{t("fpsheet.plain_title")}</div>
      <div className="fps-plain-row">
        {FP_PLAIN_SLOTS.map((slot) => (
          <div key={slot.key} className={"fps-plain " + slot.step}>
            <div className="fps-plain-box">
              {photos[slot.key]
                ? <img src={photos[slot.key]} alt={t(slot.labelKey)} />
                : null}
            </div>
            <div className="fps-plain-cap">{t(slot.labelKey)}</div>
          </div>
        ))}
      </div>

      {/* ===== Ky ten: nguoi duoc lap chi ban | can bo lap ===== */}
      <div className="fps-sign-row">
        <div className="fps-sign">
          <div className="fps-sign-role">{t("fpsheet.sign.subject")}</div>
          <div className="fps-sign-note">{t("fpsheet.sign.note")}</div>
          <div className="fps-sign-space" />
          <div className="fps-sign-name">{val(form.full_name)}</div>
        </div>
        <div className="fps-sign">
          <div className="fps-sign-role">{t("fpsheet.sign.officer")}</div>
          <div className="fps-sign-note">{t("fpsheet.sign.note")}</div>
          <div className="fps-sign-space" />
          <div className="fps-sign-name" />
        </div>
      </div>
    </div>
  );
});

// Modal xem truoc chi ban. Dung y khuon ProfilePreviewModal: toolbar xuat PDF ra
// USB + dong, vung cuon o giua.
export function FpSheetPreviewModal({ form, photos = {}, onClose }) {
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
      // Tien to "chiban-" de khong ghi de file ho so cung mot nghi pham tren USB.
      const filename = "chiban-" + makePdfFileName(
        form.fp_sheet_no || form.personal_id || form.cccd_number, form.full_name);
      const saved = await usbApi.saveExport(chosen.path, filename, blob);
      const okMsg = t("usb.export.success", { path: saved?.path || chosen.path });
      notify.add(okMsg);
      toast.success(okMsg);
    } catch (ex) {
      console.error("[Export chi ban] error:", ex);
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
          <FpSheetPreviewContent ref={a4Ref} form={form} photos={photos} />
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
