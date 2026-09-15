import { forwardRef, useEffect, useRef, useState } from "react";
import { usbApi } from "./api";
import UsbDrivePickerModal from "./UsbDrivePickerModal";
import { buildProfilePdfBlob } from "./lib/exportProfilePdf";
import { useI18n } from "./i18n";

// Báo cáo đối sánh dấu vết hiện trường -> PDF (xem trước + lưu ra USB).
// Định dạng chuẩn xác theo mẫu xem trước (preview card .stf-doc) & quy chuẩn văn bản C09.

function seqLabel(n) {
  return String(n ?? 0).padStart(3, "0");
}

export function reportFileName(sessionCode) {
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
export const SceneReportContent = forwardRef(function SceneReportContent(
  { session, items = [], scope = "local", singleMatch = null },
  ref,
) {
  const { t, formatDateTime, formatDateLong } = useI18n();
  const blank = t("pdf.blank") || "—";
  const now = new Date();

  const reportItems = items && items.length > 0
    ? items
    : (singleMatch ? [{ id: "single", seq: 1, url: singleMatch.latent_url }] : []);

  return (
    <div ref={ref} className="preview-a4 preview-a4-portrait scene-report">
      {/* Quốc hiệu & Tiêu ngữ */}
      <div className="sr-doc-nation">{t("scene.c09.nation") || "CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM"}</div>
      <div className="sr-doc-motto">{t("scene.c09.motto") || "Độc lập - Tự do - Hạnh phúc"}</div>
      <div className="sr-doc-underline" />

      {/* Tiêu đề báo cáo */}
      <div className="sr-doc-title">{t("scene.report.title")}</div>
      <div className="sr-doc-sub">{t("scene.report.subtitle")}</div>

      {/* Thông tin vụ án (Grid 2 cột đúng 100% format preview) */}
      <div className="sr-doc-grid">
        <div className="sr-doc-cell">
          <span className="sr-doc-lb">{t("scene.report.case")}</span>
          <span className="sr-doc-val">{session?.case_name || t("scene.no_case_name")}</span>
        </div>
        <div className="sr-doc-cell">
          <span className="sr-doc-lb">{t("scene.report.code")}</span>
          <span className="sr-doc-val">{singleMatch?.report_code || session?.code || blank}</span>
        </div>
        <div className="sr-doc-cell">
          <span className="sr-doc-lb">{t("scene.report.scope")}</span>
          <span className="sr-doc-val">{singleMatch ? (reportItems[0]?.trace_type || t("scene.report.latent")) : t(`scene.match.scope.${scope}`)}</span>
        </div>
        <div className="sr-doc-cell">
          <span className="sr-doc-lb">{t("scene.report.trace_count")}</span>
          <span className="sr-doc-val">{singleMatch?.trace_code || reportItems.length}</span>
        </div>
        <div className="sr-doc-cell">
          <span className="sr-doc-lb">{t("scene.report.created_at")}</span>
          <span className="sr-doc-val">{singleMatch?.report_at || (formatDateTime ? formatDateTime(now) : String(now))}</span>
        </div>
        <div className="sr-doc-cell sr-doc-blank" />
      </div>

      {/* Mỗi dấu vết 1 khối đối sánh: latent (trái) vs hồ sơ ứng viên (phải) */}
      {reportItems.length === 0 ? (
        <div className="sr-none">{t("scene.report.no_trace")}</div>
      ) : (
        reportItems.map((it) => {
          const matchData = singleMatch;
          return (
            <div className="sr-doc-pair" key={it.id || it._id || "item"}>
              <div className="sr-doc-pair-h">
                {t("scene.report.pair", { n: seqLabel(it.seq) })}
              </div>
              <div className="sr-doc-pair-body">
                <div className="sr-doc-col">
                  <div className="sr-doc-col-h">{t("scene.report.latent")}</div>
                  <div className="sr-doc-img-wrap">
                    <img
                      src={matchData?.latent_url || it.url}
                      crossOrigin="anonymous"
                      alt={`${t("scene.image")} ${seqLabel(it.seq)}`}
                    />
                  </div>
                  <div className="sr-doc-cap">
                    {matchData?.trace_code || `${t("scene.image")} ${seqLabel(it.seq)}`}
                    {it.note ? ` — ${it.note}` : ""}
                  </div>
                </div>
                <div className="sr-doc-col">
                  <div className="sr-doc-col-h">{t("scene.report.candidate")}</div>
                  <div className="sr-doc-img-wrap">
                    {matchData?.candidate_url ? (
                      <img
                        src={matchData.candidate_url}
                        crossOrigin="anonymous"
                        alt={matchData.subject || "Ứng viên"}
                      />
                    ) : (
                      <div className="sr-doc-empty">{t("scene.report.candidate_empty")}</div>
                    )}
                  </div>
                  <div className="sr-doc-cap">
                    {matchData ? `${t(matchData.finger)} — ${matchData.subject}` : blank}
                  </div>
                </div>
              </div>

              {/* Bảng kết quả đối sánh chi tiết */}
              <table className="sr-doc-result">
                <tbody>
                  <tr>
                    <th>{t("scene.report.score")}</th>
                    <td className="sr-val-score">{matchData ? `${matchData.found}/${matchData.total} (${matchData.percent}%)` : blank}</td>
                    <th>{t("scene.report.conclusion")}</th>
                    <td>
                      {matchData ? (
                        matchData.verdict === "match" ? (
                          <span className="sr-verdict-match">{t("scene.match.verdict.match") || "Trùng khớp"}</span>
                        ) : (
                          <span className="sr-verdict-nomatch">{t("scene.match.verdict.no_match") || "Không trùng khớp"}</span>
                        )
                      ) : (
                        t("scene.report.undetermined")
                      )}
                    </td>
                  </tr>
                  <tr>
                    <th>{t("scene.report.subject")}</th>
                    <td>{matchData?.name || matchData?.subject || blank}</td>
                    <th>{t("scene.report.finger")}</th>
                    <td>{matchData ? t(matchData.finger) : blank}</td>
                  </tr>
                  <tr>
                    <th>{t("scene.report.birth_year")}</th>
                    <td>{matchData?.birth_year || matchData?.dob || blank}</td>
                    <th>{t("scene.report.cccd")}</th>
                    <td>{matchData?.cccd || matchData?.cccd_number || blank}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })
      )}

      {/* Ghi chú */}
      <div className="sr-doc-notice">{t("scene.report.notice")}</div>

      {/* Chữ ký */}
      <div className="sr-doc-sign">
        <div className="sr-doc-sign-col">
          <div className="sr-doc-sign-role">{t("scene.report.sign_officer")}</div>
          <div className="sr-doc-sign-sub">{t("pdf.sign_note")}</div>
          <div className="sr-doc-sign-space" />
          <div className="sr-doc-sign-name">{singleMatch?.analyst || "Phạm Văn Hùng"}</div>
        </div>
        <div className="sr-doc-sign-col">
          <div className="sr-doc-sign-date">
            {t("scene.report.sign_date", { d: formatDateLong ? formatDateLong(now) : `ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}` })}
          </div>
          <div className="sr-doc-sign-role">{t("scene.report.sign_leader")}</div>
          <div className="sr-doc-sign-sub">{t("pdf.sign_note")}</div>
          <div className="sr-doc-sign-space" />
          <div className="sr-doc-sign-name">(Ký, đóng dấu)</div>
        </div>
      </div>
    </div>
  );
});

// ---------- Modal xem trước + lưu USB ----------
export default function SceneMatchReportModal({
  session,
  items = [],
  scope = "local",
  singleMatch = null,
  initialAction = "view",
  onClose,
}) {
  const { t } = useI18n();
  const a4Ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [picker, setPicker] = useState({ open: false, drives: [], resolve: null });

  const pickDrive = (drives) => new Promise((resolve) => {
    setPicker({ open: true, drives, resolve });
  });

  const downloadPdf = async () => {
    const node = a4Ref.current;
    if (!node) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const blob = await buildProfilePdfBlob(node);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = reportFileName(session?.code || singleMatch?.report_code || "bao_cao_doisanh");
      a.click();
      URL.revokeObjectURL(url);
      setMsg(t("pdf.download_success") || "Đã tải file PDF thành công!");
    } catch (ex) {
      setErr(ex?.message || "Lỗi tải file PDF");
    } finally {
      setBusy(false);
    }
  };

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
      const saved = await usbApi.saveExport(chosen.path, reportFileName(session?.code || singleMatch?.report_code), blob);
      setMsg(t("usb.export.success", { path: saved?.path || chosen.path }));
    } catch (ex) {
      setErr(ex?.message || t("scene.report.err_export"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialAction === "download") {
      const tm = setTimeout(() => {
        downloadPdf();
      }, 350);
      return () => clearTimeout(tm);
    }
    if (initialAction === "usb") {
      const tm = setTimeout(() => {
        saveToUsb();
      }, 350);
      return () => clearTimeout(tm);
    }
  }, [initialAction]);

  return (
    <div className="preview-backdrop">
      <div className="preview-toolbar no-print">
        <button type="button" className="preview-btn" onClick={downloadPdf} disabled={busy}>
          {busy ? t("scene.report.saving") : (t("scene.report.pdf") || "Tải PDF")}
        </button>
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
        <SceneReportContent ref={a4Ref} session={session} items={items} scope={scope} singleMatch={singleMatch} />
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
