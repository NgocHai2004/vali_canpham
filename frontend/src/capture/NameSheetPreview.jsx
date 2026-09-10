// Xem truoc DANH BAN — do theo anh mau giay (2026-09-07 21.23.19.jpg), gom
// HAI khoi theo dung thu tu tren to:
//  - Mau so 204 (khoi tren): khung vien, cot trai = DANH BAN (chu dam, GACH
//    CHAN) / So / Lap ngay …/…/… / Tai / DP / TW; cot phai = Ho ten(1) +
//    Nam/nu, Ten goi khac, Sinh ngay …/…/… + CMND(2), Que quan, Noi thuong tru,
//    (1 dong trong), Noi tam tru; roi cac dong tran ngang (Noi o hien nay |
//    Quoc tich | Dan toc | Nghe nghiep | Ho ten cha | Me | Bat ngay …/…/… +
//    Don vi bat | Lap ve viec + 2 dong trong | C/T van tay — net ke DUT);
//    goc duoi phai la 2 o van tay "Tro trai | Tro phai" nen trang.
//  - Chu thich (1)(2) duoi khung 204.
//  - Mau so 208 (khoi duoi): Ho so AK so / Ho ten vo,chong / Cho o / [o phai:
//    Mau so: 208 + BH theo TT so …/20…/TT-BCA + ngay …/…/20… + (Noi dan ma
//    vach) — in NGHIENG canh giua]; Khuan mat / Chieu cao: 1m + Nep tai duoi /
//    Song mui + Dai tai / Dau vet rieng; hang duoi: 3 anh 3x4 (nhan TRONG
//    khung: "Ảnh 3x4" dong 1, ten goc dong 2 in nghieng — thu tu Nghieng phai
//    2/3, Chinh dien, Nghieng trai 2/3) | Di hinh + 1 dong trong + Can bo lap.
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

// Ngay tren mau giay in 3 o ke cham cach nhau boi "/" ("Lập ngày: …/…/…").
// Chap nhan ca dang ISO (YYYY-MM-DD) va dang da hien thi (DD/MM/YYYY). Khong co
// du lieu thi de net ke de can bo viet tay.
function dateParts(v) {
  const raw = String(v ?? "").trim();
  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return [iso[3], iso[2], iso[1]];
  const parts = raw.split(/[^\d]+/).filter(Boolean);
  return [parts[0] || "", parts[1] || "", parts[2] || ""];
}

// Hang ngay "nhan: …/…/…": nhan + 3 o ke cham ngan cach boi gach cheo, dung y
// mau giay ("Lập ngày:   …/…/…", "Sinh ngày: …/…/…", "Bắt ngày:  …/…/…").
const DatedLine = ({ label, value, grow = 1, sub }) => {
  const [d, m, y] = dateParts(value);
  return (
    <div className="nsb-line" style={{ flexGrow: grow }}>
      <span className="nsb-lab">
        {label}
        {sub ? <sup>{sub}</sup> : null}
      </span>
      <span className="nsb-date">
        <span className="nsb-dobseg">{d}</span>
        <span className="nsb-dobslash">/</span>
        <span className="nsb-dobseg">{m}</span>
        <span className="nsb-dobslash">/</span>
        <span className="nsb-dobseg nsb-dobseg-year">{y}</span>
      </span>
    </div>
  );
};

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
  // nhieu dong nam cung mot hang. noColon: mot so nhan mau giay KHONG co hai
  // cham ("ĐP", "TW").
  const L = ({ label, value, grow = 1, sub, noColon }) => (
    <div className="nsb-line" style={{ flexGrow: grow }}>
      <span className={"nsb-lab" + (noColon ? " no-colon" : "")}>
        {label}
        {sub ? <sup>{sub}</sup> : null}
      </span>
      <span className="nsb-val">{value}</span>
    </div>
  );

  return (
    <div ref={ref} className="preview-a4 preview-a4-portrait nsb-sheet">
      {/* ===== Mau so 204: goc tren phai — CA 3 DONG IN NGHIENG ===== */}
      <div className="nsb-formno">
        <div className="nsb-formno-it">{t("namesheet.form_no_204")}</div>
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
            {/* Mau giay: "Lập ngày:   …/…/…" — 3 o ke cham ngan cach boi "/". */}
            <DatedLine label={t("namesheet.field.made_on")} value={val(form.record_date)} />
            <L label={t("namesheet.field.at")} value={val(unitName)} />
            {/* DP / TW: mau giay co HAI dong rieng, KHONG hai cham, tick vao
                dong tuong ung. */}
            <L label={t("namesheet.field.dp")}
              value={form.record_scope === "local" ? "X" : ""} noColon />
            <L label={t("namesheet.field.tw")}
              value={form.record_scope === "central" ? "X" : ""} noColon />
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
              <DatedLine label={t("namesheet.field.dob")} value={val(form.dob)} grow={1} />
              <L label={t("namesheet.field.id_doc")} sub="(2)"
                value={val(form.cccd_number)} grow={1} />
            </div>
            <L label={t("namesheet.field.hometown")} value={val(form.hometown)} />
            <L label={t("namesheet.field.address")} value={val(form.address)} />
            {/* Mau giay co 1 dong ke trong giua "Nơi thường trú" va "Nơi tạm trú". */}
            <div className="nsb-blank" />
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
            <L label={t("namesheet.field.mother")} value={val(form.mother_name)} grow={0.8} />
          </div>
          <div className="nsb-row">
            <DatedLine label={t("namesheet.field.arrest_date")}
              value={val(form.arrest_date)} grow={1} />
            <L label={t("namesheet.field.arrest_agency")} value={val(form.arrest_agency)} grow={2} />
          </div>
        </div>

        {/* Hang duoi: "Lap ve viec" + "C/T van tay" ben trai, 2 o van tro ben phai.
            Mau giay: 2 o "Trỏ trái | Trỏ phải" nen TRANG (khong to), dai ten
            ngon o DINH moi o, phan duoi de trong cho anh van. */}
        <div className="nsb-bot">
          <div className="nsb-bot-l">
            <L label={t("namesheet.field.case_about")} value={val(form.case_about)} />
            {/* Mau giay co 2 dong trong de viet tiep noi dung vu viec. */}
            <div className="nsb-blank" />
            <div className="nsb-blank" />
            {/* C/T van tay: nhan + net ke DUT (mau giay in net dut ro rang). */}
            <div className="nsb-ct">
              <span>{t("namesheet.field.fp_formula")}</span>
              <span className="nsb-ct-line nsb-ct-solid">{val(form.fp_formula)}</span>
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
                nen in duoc du lieu that. */}
            <L label={t("namesheet.field.spouse")} value={val(form.spouse_name)} />
            <L label={t("namesheet.field.residence")} value={val(form.spouse_residence)} />
            <div className="nsb-blank" />
          </div>
          {/* O dan ma vach: 4 dong chu IN NGHIENG canh giua — "Mẫu số: 208" /
              "BH theo TT số …/20…/TT-BCA" / "ngày …/…/20…" / "(Nơi dán mã vạch)".
              Khong co du lieu — can bo dan ma vach that vao day sau khi in. */}
          <div className="nsb-barcode">
            <div className="nsb-formno-it">{t("namesheet.form_no_208")}</div>
            <div className="nsb-formno-it">{t("namesheet.barcode.circular")}</div>
            <div className="nsb-formno-it">{t("namesheet.barcode.date")}</div>
            <div className="nsb-barcode-note nsb-formno-it">{t("namesheet.barcode")}</div>
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

        {/* Hang duoi: 3 anh 3x4 | Di hinh + 1 dong trong + Can bo lap.
            Nhan TRONG khung anh theo mau: dong 1 "Ảnh 3x4" (thuong), dong 2 ten
            goc in NGHIENG ("Nghiêng phải 2/3", "Chính diện", "Nghiêng trái 2/3")
            — thu tu anh lay tu PORTRAITS (dung thu tu tren mau). */}
        <div className="nsb-208-bot">
          <div className="nsb-photos">
            {PORTRAITS.map((p) => (
              <div key={p.key} className="nsb-photo">
                <div className="nsb-photo-box">
                  {/* Nhan in san TRONG khung theo mau: dong 1 "Ảnh 3x4", dong 2
                      ten goc in nghieng. Anh (neu co) nam phia duoi. */}
                  <div className="nsb-photo-head">{t("namesheet.photo_3x4")}</div>
                  <div className="nsb-photo-name">{t(p.labelKey)}</div>
                  {photos[p.key]
                    ? <img src={photos[p.key]} alt={t(p.labelKey)} />
                    : null}
                </div>
              </div>
            ))}
          </div>
          <div className="nsb-208-right">
            <L label={t("namesheet.field.abnormal")} value={val(form.physical_abnormalities)} />
            {/* Mau giay: 1 dong trong giua "Di hình" va "Cán bộ lập". */}
            <div className="nsb-blank" />
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