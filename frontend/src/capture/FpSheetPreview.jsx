// Xem truoc CHI BAN — do theo anh mau chi ban giay (2026-09-07 21.23.14.jpg):
// khoi tieu de + so danh ban/chi ban, khoi nhan than, 10 o van LAN la BANG KE LIEN
// 2 hang x 5 cot (hang TREN = tay PHAI), khoi duoi 4 cot (chum trai | 2 o ngon cai
// | chum phai), khoi ky ten.
//
// Tach RIENG khoi ProfilePreviewContent (DataCapturePage.jsx): ho so can pham la
// mot to A4 khac han — chi ban chi in van tay + nhan than toi thieu de doi chieu,
// khong co dien giam giu / suc khoe / vu an.
//
// Dung chung ha tang xem truoc voi ho so: .preview-backdrop / .preview-toolbar /
// .preview-scroll + buildProfilePdfBlob(node) nen xuat PDF ra USB y het.
import { forwardRef, useRef, useState } from "react";
import { FP_CODE_TO_KEY, FP_PLAIN_LAYERS_BY_STEP } from "./constants";
import { useI18n, apiT } from "../i18n";
import { toast } from "../Toast";
import { usbApi } from "../api";
import UsbDrivePickerModal from "../UsbDrivePickerModal";
import { buildProfilePdfBlob, makePdfFileName } from "../lib/exportProfilePdf";
import { notify } from "../notifications";

// Hai hang o van lan — DO TRUC TIEP tu mau chi ban giay:
//   hang TREN = tay PHAI (cai -> ut), hang DUOI = tay TRAI (cai -> ut).
// Nhan la TEN NGON KEM BEN TAY ngay trong o ("Cái phải", "Trỏ phải"...), KHONG co
// cot "TAY TRAI/PHAI" doc ben trai va KHONG co so thu tu 1..10 — dung y mau giay.
//
// `coefTop` la he so PHAN LOAI in san o goc tren-phai cua o, `coefBot` la so in
// san trong dai he so duoi hang. Tren mau: hang phai 16/8/4 (o 1,3,5 cua dai) va
// hang trai 4 o dinh + 2/1 trong dai. O nao khong co so thi de trong cho can bo ghi.
const ROLL_ROWS = [
  {
    hand: "right",
    codes: ["right_thumb", "right_index", "right_middle", "right_ring", "right_little"],
    coefTop: ["", "16", "", "8", ""],
    coefBot: ["16", "", "8", "", "4"],
  },
  {
    hand: "left",
    codes: ["left_thumb", "left_index", "left_middle", "left_ring", "left_little"],
    coefTop: ["4", "", "2", "", "1"],
    coefBot: ["", "2", "", "1", ""],
  },
];

// Nhan o van lan: ten ngon + ben tay, dung y chu tren mau giay.
const FINGER_LABEL = {
  right_thumb: "fpsheet.cell.thumb_r",
  right_index: "fpsheet.cell.index_r",
  right_middle: "fpsheet.cell.middle_r",
  right_ring: "fpsheet.cell.ring_r",
  right_little: "fpsheet.cell.little_r",
  left_thumb: "fpsheet.cell.thumb_l",
  left_index: "fpsheet.cell.index_l",
  left_middle: "fpsheet.cell.middle_l",
  left_ring: "fpsheet.cell.ring_l",
  left_little: "fpsheet.cell.little_l",
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

      {/* ===== Van LAN 10 ngon: bang ke lien 2 hang x 5 o (hang tren = tay PHAI).
           Moi hang = 5 o anh + 5 o he so ngay duoi, cung mot grid de duong ke
           thang tap tu tren xuong nhu mau giay. ===== */}
      {ROLL_ROWS.map((row) => (
        <div key={row.hand} className="fps-roll-table">
          {row.codes.map((code, i) => {
            const src = photos[FP_CODE_TO_KEY[code]];
            const label = t(FINGER_LABEL[code]);
            return (
              <div key={code} className="fps-cell">
                <div className="fps-cell-box">
                  {src ? <img src={src} alt={label} /> : null}
                  <span className="fps-cell-name">{label}</span>
                  {row.coefTop[i] ? <span className="fps-cell-num">{row.coefTop[i]}</span> : null}
                </div>
              </div>
            );
          })}
          {row.codes.map((code, i) => (
            <div key={code + "-coef"} className="fps-cell">
              <div className="fps-coef">{row.coefBot[i]}</div>
            </div>
          ))}
        </div>
      ))}

      {/* ===== Khoi duoi: 4 cot — van chum trai | 2 o ngon cai | van chum phai ===== */}
      <div className="fps-plain-row">
        <div className="fps-plain">
          <div className="fps-plain-cap"><span>{t("capture.fp.plain_left")}</span></div>
          <div className="fps-plain-box">
            {photos.fp_plain_left
              ? <img src={photos.fp_plain_left} alt={t("capture.fp.plain_left")} />
              : null}
          </div>
        </div>
        {/* 2 o ngon cai: dai TREN gop lam MOT o "In 2 ngon" trai het be rong ca
            hai cot, ten ngon xuong dai duoi cua tung cot. */}
        <div className="fps-thumbs">
          <div className="fps-thumbs-head"><span>{t("fpsheet.plain.thumbs_head")}</span></div>
          <div className="fps-thumbs-cells">
            {(FP_PLAIN_LAYERS_BY_STEP.thumbs || []).map((ly) => {
              const code = ly.code;
              // Anh van CHUM cua rieng ngon cai do (2 layer cua o "2 ngon cai" o
              // trang thu). TRUOC DAY doc photos[FP_CODE_TO_KEY[code]] = fp_l1/fp_r1,
              // do la anh van LAN - sai loai: ca khoi nay la khoi van CHUM (chum trai
              // | 2 ngon cai | chum phai), in anh lan vao day la in trung anh da co o
              // bang 10 o van lan phia tren.
              const src = photos[ly.key];
              const label = t(FINGER_LABEL[code]);
              return (
                <div key={code} className="fps-thumb-cell">
                  <div className="fps-plain-cap"><span>{label}</span></div>
                  <div className="fps-plain-box">
                    {src ? <img src={src} alt={label} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="fps-plain">
          <div className="fps-plain-cap"><span>{t("capture.fp.plain_right")}</span></div>
          <div className="fps-plain-box">
            {photos.fp_plain_right
              ? <img src={photos.fp_plain_right} alt={t("capture.fp.plain_right")} />
              : null}
          </div>
        </div>
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
      // Tien to "chiban-" de khong ghi de file ho so cung mot can pham tren USB.
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
