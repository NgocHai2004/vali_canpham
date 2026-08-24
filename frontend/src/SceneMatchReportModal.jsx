import { forwardRef, useRef, useState } from "react";
import { usbApi } from "./api";
import UsbDrivePickerModal from "./UsbDrivePickerModal";
import { buildProfilePdfBlob } from "./lib/exportProfilePdf";
import { useI18n } from "./i18n";

// Báo cáo đối sánh dấu vết hiện trường -> PDF (xem trước + lưu ra USB).
// Engine đối sánh vân tay latent CHƯA có, nên mọi ô kết quả (điểm, kết luận,
// thông tin đối tượng) để trống kèm ghi chú. Bố cục dựng sẵn theo mẫu AFIS để
// khi có engine chỉ cần đổ dữ liệu vào, không phải làm lại layout.

function seqLabel(n) {
  return String(n ?? 0).padStart(3, "0");
}

function reportFileName(sessionCode) {
  const code = String(sessionCode || "vuan")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "")
    .trim() || "vuan";
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
    + `_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `doisanh_${code}_${stamp}.pdf`;
}

// ---------- Nội dung A4 (node được html2canvas chụp) ----------
const SceneReportContent = forwardRef(function SceneReportContent(
  { session, items, scope },
  ref,
) {
  const { t, formatDateTime, formatDateLong } = useI18n();
  const blank = t("pdf.blank");
  const now = new Date();

  return (
    <div ref={ref} className="preview-a4 preview-a4-portrait scene-report">
      <div className="sr-head">
        <div className="sr-org1">{t("pdf.emblem")}</div>
        <div className="sr-org2">{t("pdf.motto")}</div>
        <div className="sr-org-underline" />
        <div className="sr-title">{t("scene.report.title")}</div>
        <div className="sr-subtitle">{t("scene.report.subtitle")}</div>
      </div>

      {/* Thông tin vụ án */}
      <table className="sr-info">
        <tbody>
          <tr>
            <th>{t("scene.report.case")}</th>
            <td>{session?.case_name || blank}</td>
            <th>{t("scene.report.code")}</th>
            <td>{session?.code || blank}</td>
          </tr>
          <tr>
            <th>{t("scene.report.scope")}</th>
            <td>{t(`scene.match.scope.${scope}`)}</td>
            <th>{t("scene.report.trace_count")}</th>
            <td>{items.length}</td>
          </tr>
          <tr>
            <th>{t("scene.report.created_at")}</th>
            <td colSpan={3}>{formatDateTime ? formatDateTime(now) : String(now)}</td>
          </tr>
        </tbody>
      </table>

      {/* Mỗi dấu vết 1 khối đối sánh: latent (trái) vs hồ sơ ứng viên (phải) */}
      {items.length === 0 ? (
        <div className="sr-none">{t("scene.report.no_trace")}</div>
      ) : (
        items.map((it) => (
          <div className="sr-block" key={it.id}>
            <div className="sr-block-head">
              {t("scene.report.pair", { n: seqLabel(it.seq) })}
            </div>
            <div className="sr-pair">
              <figure className="sr-pane">
                <div className="sr-pane-cap">{t("scene.report.latent")}</div>
                <div className="sr-pane-img">
                  <img src={it.url} alt={`${t("scene.image")} ${seqLabel(it.seq)}`} />
                </div>
                <figcaption>
                  {t("scene.image")} {seqLabel(it.seq)}
                  {it.note ? ` — ${it.note}` : ""}
                </figcaption>
              </figure>
              <figure className="sr-pane">
                <div className="sr-pane-cap">{t("scene.report.candidate")}</div>
                <div className="sr-pane-img sr-pane-empty">
                  {t("scene.report.candidate_empty")}
                </div>
                <figcaption>{blank}</figcaption>
              </figure>
            </div>
            <table className="sr-result">
              <tbody>
                <tr>
                  <th>{t("scene.report.score")}</th>
                  <td>{blank}</td>
                  <th>{t("scene.report.conclusion")}</th>
                  <td>{t("scene.report.undetermined")}</td>
                </tr>
                <tr>
                  <th>{t("scene.report.subject")}</th>
                  <td>{blank}</td>
                  <th>{t("scene.report.finger")}</th>
                  <td>{blank}</td>
                </tr>
                <tr>
                  <th>{t("scene.report.birth_year")}</th>
                  <td>{blank}</td>
                  <th>{t("scene.report.cccd")}</th>
                  <td>{blank}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))
      )}

      <div className="sr-notice">{t("scene.report.notice")}</div>

      <div className="sr-sign">
        <div className="sr-sign-col">
          <div className="sr-sign-role">{t("scene.report.sign_officer")}</div>
          <div className="sr-sign-note">{t("pdf.sign_note")}</div>
        </div>
        <div className="sr-sign-col">
          <div className="sr-sign-date">
            {t("scene.report.sign_date", { d: formatDateLong ? formatDateLong(now) : "" })}
          </div>
          <div className="sr-sign-role">{t("scene.report.sign_leader")}</div>
          <div className="sr-sign-note">{t("pdf.sign_note")}</div>
        </div>
      </div>
    </div>
  );
});

// ---------- Modal xem trước + lưu USB ----------
export default function SceneMatchReportModal({ session, items, scope, onClose }) {
  const { t } = useI18n();
  const a4Ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [picker, setPicker] = useState({ open: false, drives: [], resolve: null });

  const pickDrive = (drives) => new Promise((resolve) => {
    setPicker({ open: true, drives, resolve });
  });

  // Lưu ra USB thường. usb service đã loại dongle khỏi drives (dongle_drives riêng).
  const saveToUsb = async () => {
    const node = a4Ref.current;
    if (!node) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const info = await usbApi.listWritable();
      const drives = info.drives || [];
      if (drives.length === 0) {
        throw new Error(
          (info.dongle_drives || []).length > 0
            ? t("usb.export.err.only_dongle")
            : t("usb.export.err.no_drive"),
        );
      }
      const chosen = drives.length === 1 ? drives[0] : await pickDrive(drives);
      if (!chosen) return;
      const blob = await buildProfilePdfBlob(node);
      const saved = await usbApi.saveExport(chosen.path, reportFileName(session?.code), blob);
      setMsg(t("usb.export.success", { path: saved?.path || chosen.path }));
    } catch (ex) {
      setErr(ex?.message || t("scene.report.err_export"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="preview-backdrop">
      <div className="preview-toolbar no-print">
        <button type="button" className="preview-btn" onClick={saveToUsb} disabled={busy}>
          {busy ? t("scene.report.saving") : t("scene.report.save_usb")}
        </button>
        <button type="button" className="preview-btn preview-close" onClick={onClose} disabled={busy}>
          {t("common.close")}
        </button>
        {msg && <span className="sr-toolbar-ok">{msg}</span>}
        {err && <span className="sr-toolbar-err">{err}</span>}
      </div>

      <div className="preview-scroll">
        <SceneReportContent ref={a4Ref} session={session} items={items} scope={scope} />
      </div>

      {picker.open && (
        <UsbDrivePickerModal
          drives={picker.drives}
          onPick={(d) => {
            const r = picker.resolve;
            setPicker({ open: false, drives: [], resolve: null });
            r && r(d);
          }}
          onCancel={() => {
            const r = picker.resolve;
            setPicker({ open: false, drives: [], resolve: null });
            r && r(null);
          }}
        />
      )}
    </div>
  );
}
