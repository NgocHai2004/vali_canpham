// Xem truoc CHI BAN — do theo anh mau CHI BAN giay (2026-09-07 21.23.14.jpg),
// la MAU SO 205 (Thong tu 119/2021/TT-BCA). To nay chi co DUNG cac thanh phan
// sau, khong them bot gi:
//   - Goc tren phai: "Mẫu số 205" + 2 dong thong tu (in nghieng).
//   - MOT khung vien ngoai bao ca to.
//   - Hang tren trong khung: cot trai (tieu de CHI BAN + So + Lap ngay + Tai +
//     ĐP + TW) | cot phai (nhan than: ho ten + Nam/nu, ten goi khac, sinh ngay +
//     so CMND/CCCD, que quan, noi thuong tru, noi o hien nay).
//   - Dong "Lập về việc" + "C/T vân tay" tran ngang.
//   - Bang 10 o van LAN: 2 hang x 5 cot, hang TREN = tay PHAI.
//   - Khoi van CHUM duoi: 4 ngon trai | 2 ngon cai | 4 ngon phai.
//   - Chu thich (1) duoi khung.
//
// KHAC ban truoc (da bo het, vi mau giay KHONG co): quoc hieu/tieu ngu, 3 o so
// hieu (so danh ban/chi ban/AK), cac dong Gioi tinh - Quoc tich - Dan toc -
// Nghe nghiep - Chieu cao - Ho ten cha - Ho ten me, cac tieu de khoi van tay,
// dai he so phan loai duoi moi hang, va khoi ky ten cuoi to.
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
// Nhan la TEN NGON KEM BEN TAY ngay trong o ("Cái phải", "Trỏ phải"...), dung y
// mau giay: khong co cot "TAY TRAI/PHAI" doc ben trai, khong so thu tu 1..10.
const ROLL_ROWS = [
  {
    hand: "right",
    codes: ["right_thumb", "right_index", "right_middle", "right_ring", "right_little"],
  },
  {
    hand: "left",
    codes: ["left_thumb", "left_index", "left_middle", "left_ring", "left_little"],
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
  { form, photos = {}, unitName = "" },
  ref,
) {
  const { t } = useI18n();
  // To DIEN TAY duoc sau khi in: o trong khong ghi "…" ma de net ke lien
  // (border-bottom) cho can bo viet bu.
  const val = (v) => (v && String(v).trim() ? String(v) : "");
  // Mau giay in san "Nam/nữ" de KHOANH TRON, khong phai o dien => ben duoc chon
  // in dam co vong tron, ben con lai de mo.
  const isMale = form.gender === "male";
  const isFemale = form.gender === "female";

  // Mot dong "nhan: ....gia tri...." — gia tri nam tren net ke lien.
  const L = ({ label, value, grow = 1, sub }) => (
    <div className="fps-line" style={{ flexGrow: grow }}>
      <span className="fps-lab">
        {label}
        {sub ? <sup>{sub}</sup> : null}
      </span>
      <span className="fps-val">{value}</span>
    </div>
  );

  return (
    <div ref={ref} className="preview-a4 preview-a4-portrait fps-sheet">
      {/* ===== Goc tren phai: so hieu mau + thong tu ===== */}
      <div className="fps-formno">
        <div>{t("fpsheet.form_no")}</div>
        <div className="fps-formno-it">{t("fpsheet.form_circular")}</div>
        <div className="fps-formno-it">{t("fpsheet.form_date")}</div>
      </div>

      {/* ===== Khung vien ngoai bao ca to ===== */}
      <div className="fps-box">
        {/* Hang tren: cot trai (chi ban + so hieu) | cot phai (nhan than) */}
        <div className="fps-top">
          <div className="fps-top-l">
            <div className="fps-title">{t("fpsheet.title")}</div>
            <L label={t("fpsheet.no.record")} value={val(form.fp_sheet_no)} />
            <L label={t("fpsheet.made_on")} value={val(form.record_date)} />
            <L label={t("fpsheet.at")} value={val(unitName)} />
            {/* DP / TW: mau giay co HAI dong rieng, tick vao dong tuong ung. */}
            <L label={t("namesheet.field.dp")}
              value={form.record_scope === "local" ? "X" : ""} />
            <L label={t("namesheet.field.tw")}
              value={form.record_scope === "central" ? "X" : ""} />
          </div>
          <div className="fps-top-r">
            <div className="fps-row">
              <L label={t("fpsheet.field.full_name")} sub="(1)"
                value={val(form.full_name).toUpperCase()} grow={4} />
              <span className="fps-sex">
                <b className={isMale ? "on" : ""}>{t("namesheet.male")}</b>
                <span>/</span>
                <b className={isFemale ? "on" : ""}>{t("namesheet.female")}</b>
              </span>
            </div>
            <L label={t("fpsheet.field.alias")} value={val(form.alias)} />
            <div className="fps-row">
              <L label={t("fpsheet.field.dob")} value={val(form.dob)} grow={1} />
              <L label={t("namesheet.field.id_doc")} value={val(form.cccd_number)} grow={1} />
            </div>
            <L label={t("fpsheet.field.hometown")} value={val(form.hometown)} />
            <L label={t("fpsheet.field.address")} value={val(form.address)} />
            {/* Noi tam tru: mau giay CO dong nay, truoc day to in thieu. */}
            <L label={t("namesheet.field.temp_address")} value={val(form.temp_address)} />
            <L label={t("fpsheet.field.current_address")} value={val(form.current_address)} />
          </div>
        </div>

        {/* Dong "Lap ve viec" + "C/T van tay" tran ngang ca khung */}
        <div className="fps-mid">
          <L label={t("fpsheet.field.case_about")} value={val(form.case_about)} />
          {/* Mau giay chua 3 dong cho noi dung vu viec: dong dau co nhan "Lap ve
              viec", 2 dong sau la net ke TRONG de can bo viet tiep. */}
          <div className="fps-blank" />
          <div className="fps-blank" />
          {/* C/T van tay: da co o nhap (fp_formula) o muc II nen in gia tri that;
              con trong thi van la net ke de viet tay. */}
          <L label={t("fpsheet.fp_formula")} value={val(form.fp_formula)} />
        </div>

        {/* ===== Khoi CAN BO + o ma vach — do theo mau giay =====
             VI TRI: TRONG khung vien, ngay duoi "Lap ve viec"/"C/T van tay" va
             TRUOC bang van lan. Truoc day khoi nay nam NGOAI khung, cuoi to (sau
             chu thich) — sai cho.
             HINH THUC: 2 cot x 2 dong ke CHAM (dung .fps-line nhu cac dong khac),
             khong phai 4 o ke khung. Ben phai la o "Mau so 209 / Noi dan ma vach"
             ke vien, mau giay co o nay. */}
        <div className="fps-officer-band">
          <div className="fps-officer-lines">
            <div className="fps-row">
              <L label={t("fpsheet.officer.maker")} value={val(form.officer_name)} />
              <L label={t("fpsheet.officer.classifier")} value={val(form.officer_classifier)} />
            </div>
            <div className="fps-row">
              <L label={t("fpsheet.officer.sorter")} value={val(form.officer_sorter)} />
              <L label={t("fpsheet.officer.checker")} value={val(form.officer_class_checker)} />
            </div>
          </div>
          {/* O dan ma vach: chi la khung trong + 2 dong chu, khong co du lieu.
              Can bo dan ma vach that vao day sau khi in. */}
          <div className="fps-barcode">
            <div className="fps-barcode-no">{t("fpsheet.barcode.form_no")}</div>
            <div className="fps-barcode-cap">{t("fpsheet.barcode.caption")}</div>
          </div>
        </div>

        {/* ===== Van LAN 10 ngon: bang ke lien 2 hang x 5 o (hang tren = tay
             PHAI). Khong co dai he so phan loai — mau giay khong in. ===== */}
        {ROLL_ROWS.map((row) => (
          <div key={row.hand} className="fps-roll-table">
            {row.codes.map((code) => {
              const src = photos[FP_CODE_TO_KEY[code]];
              const label = t(FINGER_LABEL[code]);
              return (
                <div key={code} className="fps-cell">
                  <div className="fps-cell-box">
                    {src ? <img src={src} alt={label} /> : null}
                    <span className="fps-cell-name">{label}</span>
                  </div>
                </div>
              );
            })}
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
                // Anh van CHUM cua rieng ngon cai do (2 layer cua o "2 ngon cai").
                // KHONG doc photos[FP_CODE_TO_KEY[code]] = fp_l1/fp_r1 — do la anh
                // van LAN, in vao day la in trung anh o bang 10 o phia tren.
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
      </div>

      {/* Chu thich (1) duoi khung */}
      <div className="fps-foot">{t("fpsheet.footnote")}</div>

      {/* Khoi 4 o CAN BO DA CHUYEN vao TRONG khung (xem .fps-officer-band phia
          tren, ngay truoc bang van lan) — dung vi tri mau giay. Truoc day no nam
          o day, ngoai khung va sau chu thich: sai cho. */}

      {/* ===== Khoi ky ten cuoi to: nguoi duoc lap chi ban | can bo lap chi ban.
           Ca hai cot deu chi la tieu de + "(Ky, ghi ro ho ten)" roi CHUA MOT
           KHOANG TRONG de ky tay sau khi in — khong dien du lieu vao. ===== */}
      <div className="fps-sign-row">
        <div className="fps-sign">
          <div className="fps-sign-role">{t("fpsheet.sign.subject")}</div>
          <div className="fps-sign-note">{t("fpsheet.sign.note")}</div>
          <div className="fps-sign-space" />
        </div>
        <div className="fps-sign">
          <div className="fps-sign-role">{t("fpsheet.sign.officer")}</div>
          <div className="fps-sign-note">{t("fpsheet.sign.note")}</div>
          <div className="fps-sign-space" />
        </div>
      </div>
    </div>
  );
});

// Modal xem truoc chi ban. Dung y khuon ProfilePreviewModal: toolbar xuat PDF ra
// USB + dong, vung cuon o giua.
export function FpSheetPreviewModal({ form, photos = {}, unitName = "", onClose }) {
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
          <FpSheetPreviewContent ref={a4Ref} form={form} photos={photos} unitName={unitName} />
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
