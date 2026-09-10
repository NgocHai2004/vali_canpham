// Xem truoc CHI BAN — do theo anh mau CHI BAN giay (2026-09-07 21.23.14.jpg),
// la MAU SO 205 (Thong tu 119/2021/TT-BCA). To nay chi co DUNG cac thanh phan
// sau, khong them bot gi:
//   - Goc tren phai (ngoai khung): "Mẫu số: 205" + "BH theo TT số
//     119/2021/TT-BCA" + "ngày 08/12/2021" (ca 3 dong in nghieng).
//   - MOT khung vien ngoai bao ca to (padding 0 — cac hang ke lien voi vien).
//   - Hang tren trong khung: cot trai (tieu de CHI BAN + So + Lap ngay + Tai +
//     DP + TW) | cot phai (Cong thuc van tay — net ke DUT, ho ten + Nam/nu,
//     sinh ngay …/…/…, CMND/CCCD/Ho chieu so, noi thuong tru, noi tam tru,
//     noi o hien nay, Lap ve viec).
//   - Hang CAN BO: 4 dong ke cham xep 2 cot (lap CB / sap xep | phan loai /
//     KT phan loai) + o ben phai "Mẫu số: 209 / BH theo TT số …/20…/TT-BCA /
//     ngày …/…/20… / (Nơi dán mã vạch)" — canh boi vien TRAI, chu nghieng.
//   - Bang 10 o van LAN: 2 hang x 5 cot, hang TREN = tay PHAI, kem HAI DAI HE
//     SO PHAN LOAI in san giua/duoi cac hang dung y mau giay:
//       dai giua 2 hang : 16 | _ | 8 | _ | 4
//       dai duoi hang 2 : _  | 2 | _ | 1 | _
//     va he so IN TRONG O: Trỏ phải 16, Nhẫn phải 8, Cái trái 4, Giữa trái 2,
//     Út trái 1 (so nam goc trai-trên, ten ngon canh giua).
//   - Khoi van CHUM duoi: 4 ngon trai | 2 ngon cai (Cái trái | Cái phải) |
//     4 ngon phai.
//
// KHAC ban truoc (da bo het, vi mau giay KHONG co): dong "Tên gọi khác",
// dong "Quê quán", khoi "Lập về việc + C/T vân tay" tran ngang (2 noi dung nay
// da dua vao dung vi tri trong cot phai), chu thich (1) duoi khung, khoi ky
// ten cuoi to.
//
// Dung chung ha tang xem truoc voi ho so: .preview-backdrop / .preview-toolbar /
// .preview-scroll + buildProfilePdfBlob(node) nen xuat PDF ra USB y het.
import { forwardRef, Fragment, useRef, useState } from "react";
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

// He so phan loai IN SAN TRONG O (goc trai-tren), doc truc tiep tu mau giay:
// hang tay PHAI co 16 (tro) va 8 (nhan); hang tay TRAI co 4 (cai), 2 (giua),
// 1 (ut). Cac o con lai khong co so.
const CELL_NUM = {
  right_index: "16",
  right_ring: "8",
  left_thumb: "4",
  left_middle: "2",
  left_little: "1",
};

// HAI DAI HE SO PHAN LOAI in san giua 2 hang va duoi hang tay trai — dung y mau
// giay (so nam le trai trong tung o cua dai):
//   dai giua (sau hang PHAI): 16 | _ | 8 | _ | 4
//   dai duoi (sau hang TRAI): _  | 2 | _ | 1 | _
const STRIP_AFTER_RIGHT = ["16", "", "8", "", "4"];
const STRIP_AFTER_LEFT = ["", "2", "", "1", ""];

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

  // Sinh ngay: mau giay in 3 o ke cham cach nhau boi "/" (…/…/…). Co du lieu thi
  // dien ngay/thang/nam, khong thi de net ke de viet tay. Chap nhan ca dang
  // ISO (YYYY-MM-DD) va dang da hien thi (DD/MM/YYYY).
  const dobRaw = String(form.dob || "").trim();
  const dobIso = dobRaw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const dobParts = dobIso
    ? [dobIso[3], dobIso[2], dobIso[1]]
    : dobRaw.split(/[^\d]+/).filter(Boolean);
  const dobDay = dobParts[0] || "";
  const dobMonth = dobParts[1] || "";
  const dobYear = dobParts[2] || "";

  // Mot dong "nhan: ....gia tri...." — gia tri nam tren net ke lien.
  // noColon: mot so dong mau giay KHONG co hai cham ("Tại", "ĐP", "TW",
  // "Công thức vân tay") — tat ::after cua .fps-lab.
  // solid: gia tri ke net DUT thay vi net cham (dong "Công thức vân tay").
  const L = ({ label, value, grow = 1, noColon, solid }) => (
    <div className="fps-line" style={{ flexGrow: grow }}>
      <span className={"fps-lab" + (noColon ? " no-colon" : "")}>{label}</span>
      <span className={"fps-val" + (solid ? " fps-val-solid" : "")}>{value}</span>
    </div>
  );

  return (
    <div ref={ref} className="preview-a4 preview-a4-portrait fps-sheet">
      {/* ===== Goc tren phai: so hieu mau + thong tu (ca 3 dong in nghieng) ===== */}
      <div className="fps-formno">
        <div className="fps-formno-it">{t("fpsheet.form_no")}</div>
        <div className="fps-formno-it">{t("fpsheet.form_circular")}</div>
        <div className="fps-formno-it">{t("fpsheet.form_date")}</div>
      </div>

      {/* ===== Khung vien ngoai bao ca to (padding 0 — hang nao cung ke lien vien) ===== */}
      <div className="fps-box">
        {/* Hang tren: cot chi ban | cot nhan than */}
        <div className="fps-top">
          <div className="fps-top-l">
            <div className="fps-title">{t("fpsheet.title")}</div>
            <L label={t("fpsheet.no.record")} value={val(form.fp_sheet_no)} />
            <L label={t("fpsheet.made_on")} value={val(form.record_date)} />
            <L label={t("fpsheet.at")} value={val(unitName)} noColon />
            {/* DP / TW: mau giay co HAI dong rieng, tick vao dong tuong ung. */}
            <L label={t("namesheet.field.dp")}
              value={form.record_scope === "local" ? "X" : ""} noColon />
            <L label={t("namesheet.field.tw")}
              value={form.record_scope === "central" ? "X" : ""} noColon />
          </div>
          <div className="fps-top-r">
            {/* Cong thuc van tay: dong DAU TIEN cua cot phai, gia tri ke net DUT
                (mau giay in net dut sau nhan nay). */}
            <L label={t("fpsheet.fp_formula")} value={val(form.fp_formula)} noColon solid />
            <div className="fps-row">
              <L label={t("fpsheet.field.full_name")}
                value={val(form.full_name).toUpperCase()} grow={3.2} />
              <span className="fps-sexdob">
                <span className="fps-sex">
                  <b className={isMale ? "on" : ""}>{t("namesheet.male")}</b>
                  <span>/</span>
                  <b className={isFemale ? "on" : ""}>{t("namesheet.female")}</b>
                </span>
                <span className="fps-lab no-colon">{t("fpsheet.born_on")}</span>
                <span className="fps-dobseg">{dobDay}</span>
                <span className="fps-dobslash">/</span>
                <span className="fps-dobseg">{dobMonth}</span>
                <span className="fps-dobslash">/</span>
                <span className="fps-dobseg fps-dobseg-year">{dobYear}</span>
              </span>
            </div>
            <L label={t("fpsheet.field.id_doc")} value={val(form.cccd_number)} />
            <L label={t("fpsheet.field.address")} value={val(form.address)} />
            <L label={t("namesheet.field.temp_address")} value={val(form.temp_address)} />
            <L label={t("fpsheet.field.current_address")} value={val(form.current_address)} />
            <L label={t("fpsheet.field.case_about")} value={val(form.case_about)} />
          </div>
        </div>

        {/* ===== Khoi CAN BO + o ma vach — dung vi tri mau giay =====
             NAM TRONG khung vien, ngay duoi hang thong tin va TRUOC bang van lan.
             Ben trai: 4 dong ke cham xep 2 cot x 2 hang. Ben phai: o "Mẫu số: 209
             / BH theo TT số …/20…/TT-BCA / ngày …/…/20… / (Nơi dán mã vạch)" —
             chi ke vien TRAI (vi tren/duoi la net ngang cua hang), chu nghieng. */}
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
          {/* O dan ma vach: 4 dong chu nghieng canh giua, khong co du lieu —
              can bo dan ma vach that vao day sau khi in. */}
          <div className="fps-barcode">
            <div>{t("fpsheet.barcode.form_no")}</div>
            <div>{t("fpsheet.barcode.circular")}</div>
            <div>{t("fpsheet.barcode.date")}</div>
            <div className="fps-barcode-cap">{t("fpsheet.barcode.caption")}</div>
          </div>
        </div>

        {/* ===== Van LAN 10 ngon: bang ke lien 2 hang x 5 o (hang tren = tay
             PHAI), xen giua la HAI DAI HE SO PHAN LOAI in san dung y mau giay.
             Nhan ngon canh GIUA dau o; he so (neu co) nam goc trai-tren. ===== */}
        {ROLL_ROWS.map((row, ri) => (
          <Fragment key={row.hand}>
            <div className="fps-roll-row">
              {row.codes.map((code) => {
                const src = photos[FP_CODE_TO_KEY[code]];
                const label = t(FINGER_LABEL[code]);
                const num = CELL_NUM[code];
                return (
                  <div key={code} className="fps-cell">
                    <div className="fps-cell-box">
                      {src ? <img src={src} alt={label} /> : null}
                      {num ? <span className="fps-cell-num">{num}</span> : null}
                      <span className="fps-cell-name">{label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="fps-strip">
              {(ri === 0 ? STRIP_AFTER_RIGHT : STRIP_AFTER_LEFT).map((n, ci) => (
                <div key={ci} className="fps-strip-cell">{n}</div>
              ))}
            </div>
          </Fragment>
        ))}

        {/* ===== Khoi duoi: van chum trai | 2 o ngon cai | van chum phai ===== */}
        <div className="fps-plain-row">
          <div className="fps-plain">
            <div className="fps-plain-cap"><span>{t("fpsheet.plain.left")}</span></div>
            <div className="fps-plain-box">
              {photos.fp_plain_left
                ? <img src={photos.fp_plain_left} alt={t("fpsheet.plain.left")} />
                : null}
            </div>
          </div>
          {/* 2 o ngon cai: dai TREN gop lam MOT o "In 2 ngón cái" trai het be
              rong ca hai cot, ten ngon xuong dai duoi cua tung cot. */}
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
            <div className="fps-plain-cap"><span>{t("fpsheet.plain.right")}</span></div>
            <div className="fps-plain-box">
              {photos.fp_plain_right
                ? <img src={photos.fp_plain_right} alt={t("fpsheet.plain.right")} />
                : null}
            </div>
          </div>
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