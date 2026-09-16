import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "./i18n";
import { demoFiles, demoMatch, minutiae } from "./sceneDemo";
import { traceCode } from "./SceneTracesPage";
import { IcChevDown, IcClose, IcDownload, IcExport, IcEye, IcPagePrev } from "./sceneMatchIcons";
import SceneMatchReportModal, { SceneReportContent, reportFileName } from "./SceneMatchReportModal";
import { buildProfilePdfBlob } from "./lib/exportProfilePdf";
import { usbApi } from "./api";
import UsbDrivePickerModal from "./UsbDrivePickerModal";

// Trang chi tiet 1 dau vet — mo tu 1 dong bang KET QUA DOI SANH.
// Bo cuc 1:1 design D:\Downloads\Phan tich doi sanh:
//   breadcrumb + chip -> grid 300px|1fr|1fr (anh latent | thong tin | ket qua)
//   -> grid 1.05fr|1fr (4.1 folder 4 the | 4.2 bao cao C09) -> dai verification.
//
// Field co that lay tu scene_traces (ma, dia diem, thoi gian, can bo, anh, ghi chu).
// So lieu doi sanh (diem minutiae, ngon tay, C09, chat luong, do tin cay) la
// DEMO — he thong chua co engine trich minutiae. Xem sceneDemo.js.

export default function SceneTraceFull({ item, row, session, onBack }) {
  const { t, formatDateTime } = useI18n();
  const [zoom, setZoom] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [busyPdf, setBusyPdf] = useState(false);
  const [busyUsb, setBusyUsb] = useState(false);
  const [picker, setPicker] = useState({ open: false, drives: [], resolve: null });
  const printRef = useRef(null);

  if (!item || !row) return null;

  const m = demoMatch(item, row);
  // Cham minutiae: CUNG bo toa do cho anh 03 va 04 => cham thu k tren 2 anh la
  // 1 cap diem khop. So cham = so diem tim duoc (18/22) cho khop bang ket qua.
  const dots = minutiae(item.seq ?? 1, m.found);
  const Dots = () => (
    <span className="stf-dots" aria-hidden="true">
      {dots.map((d, i) => (
        <span className="stf-dot-m" key={i} style={{ left: `${d.x}%`, top: `${d.y}%` }}>
          <i>{i + 1}</i>
        </span>
      ))}
    </span>
  );
  const files = demoFiles(item);
  const matched = m.verdict === "match";
  const code = traceCode(item);
  const fmt = (v) => (formatDateTime ? formatDateTime(v) : v);

  // Thong tin dau vet: 6 field dau tu DB, Trang thai la chip nen render rieng.
  const info = [
    [t("scene.col.code"), code],
    [t("scene.col.type"), item.trace_type || "—"],
    [t("scene.col.source"), item.collection_source || "—"],
    [t("scene.col.place"), m.place],
    [t("scene.col.time"), fmt(item.captured_at)],
    [t("scene.detail.officer"), item.created_by || item.device_id || "—"],
  ];

  // Ty le + dia diem lap lai so lieu da co o dai verification / panel thong tin
  // dau vet — de o day de doc het ket luan trong 1 panel.
  // Chat luong anh + do tin cay CO Y khong dua vao day: da co o dai verification
  // duoi cung, dua len nua la hien 2 lan tren cung 1 trang.
  const result = [
    [t("scene.match.points"), `${m.found}/${m.total}`],
    [t("scene.match.percent"), `${m.percent}%`],
    [t("scene.match.finger"), t(m.finger)],
    [t("scene.match.subject"), m.subject],
    [t("scene.match.place"), m.place],
    [t("scene.match.at"), m.analyzed_at],
    [t("scene.match.by"), m.analyst],
  ];

  const singleMatchData = {
    ...m,
    name: row.name,
    cccd: row.cccd,
    birth_year: row.birth_year || row.dob || "1988",
    latent_url: files[0]?.url,
    candidate_url: files[1]?.url,
    trace_code: code,
  };

  const pickDrive = (drives) => new Promise((resolve) => {
    setPicker({ open: true, drives, resolve });
  });

  const handleDownloadPdf = async () => {
    const node = printRef.current;
    if (!node) return;
    setBusyPdf(true);
    try {
      const blob = await buildProfilePdfBlob(node);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = reportFileName(m.report_code || code);
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err?.message || "Lỗi khi tải file PDF");
    } finally {
      setBusyPdf(false);
    }
  };

  const handleSaveUsb = async () => {
    const node = printRef.current;
    if (!node) return;
    setBusyUsb(true);
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
      const saved = await usbApi.saveExport(chosen.path, reportFileName(m.report_code || code), blob);
      alert(t("usb.export.success", { path: saved?.path || chosen.path }));
    } catch (err) {
      alert(err?.message || t("scene.report.err_export"));
    } finally {
      setBusyUsb(false);
    }
  };

  return (
    <div className="stf">
      {/* Breadcrumb + chip trang thai + nut quay lai */}
      <div className="stf-crumbbar">
        <div className="stf-crumb-main">
          <div className="stf-crumb">
            <span>{session?.case_name || t("scene.no_case")}</span>
            <span className="stf-sep">/</span>
            <span>{t("scene.crumb.traces")}</span>
            <span className="stf-sep">/</span>
            <span className="stf-crumb-cur">{code}</span>
          </div>
          <div className="stf-chips">
            <span className="stf-chip stf-chip-ok">
              <span className="stf-dot" />
              {t("scene.tag.analyzed")}
            </span>
            <span className="stf-chip stf-chip-fill">{t("scene.tag.files", { n: files.length })}</span>
            <span className="stf-chip">{t("scene.tag.report", { n: 1 })}</span>
          </div>
        </div>
        <div className="stf-crumb-act">
          <button type="button" className="smp-btn-ghost" onClick={onBack}>
            <IcPagePrev />
            {t("scene.back")}
          </button>
          {/* Menu Hanh dong chua co muc nao -> disabled, khong lam nut chet. */}
          <button type="button" className="smp-btn-ghost" disabled>
            {t("scene.detail.actions")}
            <IcChevDown />
          </button>
        </div>
      </div>

      <p className="stf-notice">{t("scene.demo.notice")}</p>

      {/* Anh latent | Thong tin dau vet | Ket qua doi sanh */}
      <div className="stf-top">
        <div className="stf-latent">
          <button type="button" className="stf-latent-btn" onClick={() => setZoom({ url: item.url })}>
            <img src={item.url} alt={code} loading="lazy" />
          </button>
        </div>

        <section className="stf-card">
          <h3 className="stf-h">{t("scene.detail.title")}</h3>
          <div className="stf-kv">
            {info.map(([k, v]) => (
              <div className="stf-kv-row" key={k}>
                <span className="stf-k">{k}</span>
                <span className="stf-v">{v}</span>
              </div>
            ))}
            <div className="stf-kv-row">
              <span className="stf-k">{t("scene.col.status")}</span>
              <span>
                <span className="stf-chip stf-chip-ok">{t("scene.tag.analyzed")}</span>
              </span>
            </div>
            <div className="stf-kv-row">
              <span className="stf-k">{t("scene.detail.note")}</span>
              <span className="stf-k">{item.note || "—"}</span>
            </div>
          </div>
        </section>

        <section className="stf-card">
          <h3 className="stf-h">{t("scene.match.title")}</h3>
          <div className="stf-kv stf-kv-spread">
            <div className="stf-kv-row">
              <span className="stf-k">{t("scene.match.verdict")}</span>
              <strong className={matched ? "stf-verdict ok" : "stf-verdict warn"}>
                {matched ? t("scene.match.v_match") : t("scene.match.v_review")}
              </strong>
            </div>
            {result.map(([k, v]) => (
              <div className="stf-kv-row" key={k}>
                <span className="stf-k">{k}</span>
                <span className="stf-v">{v}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 4.1 Folder matching | 4.2 Bao cao C09 */}
      <div className="stf-mid">
        <section className="stf-card stf-folder">
          <h3 className="stf-h">
            {t("scene.folder.title")}{" "}
            <span className="stf-h-sub">{t("scene.folder.count", { n: files.length })}</span>
          </h3>
          <div className="stf-files">
            {files.map((f) => (
              <div className="stf-file" key={f.n}>
                <div className="stf-file-head">
                  <span className="stf-file-n">{f.n}</span>
                  <span className="stf-file-title">
                    {t(f.groupKey)}
                    <span className="stf-file-sub">{t(f.kindKey)}</span>
                  </span>
                </div>
                <button
                  type="button"
                  className="stf-file-img"
                  onClick={() => setZoom({ url: f.url, dots: f.dots, title: `${t(f.groupKey)} - ${t(f.kindKey)} (${f.name})` })}
                >
                  <img src={f.url} alt={f.name} loading="lazy" />
                  {f.dots && <Dots />}
                </button>
                <div className="stf-file-name">{f.name}</div>
                <div className="stf-file-meta">
                  <span>PNG</span>
                  <span>{f.size.toFixed(1)} MB</span>
                </div>
                <div className="stf-file-act">
                  <button
                    type="button"
                    className="smp-btn-line"
                    onClick={() => setZoom({ url: f.url, dots: f.dots, title: `${t(f.groupKey)} - ${t(f.kindKey)} (${f.name})` })}
                  >
                    {t("scene.file.view")}
                  </button>
                  <a className="smp-btn-line" href={f.url} download target="_blank" rel="noreferrer">
                    {t("scene.file.dl")}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="stf-card stf-c09">
          <h3 className="stf-h">{t("scene.c09.title")}</h3>

          {/* Khung xem trước thu nhỏ chuẩn format báo cáo HTI (Full width, không bị lệch) */}
          <div
            className="stf-doc-card-preview"
            onClick={() => setShowReport(true)}
            title="Nhấn để xem toàn bộ báo cáo"
          >
            <div className="sr-sec-banner" style={{ fontSize: "7pt", marginBottom: "8px", paddingBottom: "4px" }}>
              Thông báo bảo mật: Báo cáo này được lập nhằm phục vụ trao đổi kỹ thuật chuyên môn và đánh giá kết quả hệ thống. Nội dung được xây dựng trên cơ sở danh sách kết quả và các ảnh điện tử do HTI GROUP tiếp nhận từ đơn vị cung cấp. Việc nộp chứng cứ chính thức, xác nhận chuỗi bảo quản chứng cứ (chain of custody), thẩm định độc lập và xác lập giá trị pháp lý của chứng cứ phải được thực hiện theo quy trình nghiệp vụ của Bộ Công an.
            </div>

            <div className="sr-header-top" style={{ marginBottom: "8px" }}>
              <div className="sr-org-title" style={{ fontSize: "10pt", margin: "0 0 2px 0" }}>HTI GROUP</div>
              <div className="sr-header-line" style={{ height: "3px" }} />
            </div>

            <div className="sr-title-block" style={{ margin: "6px 0 8px 0" }}>
              <div className="sr-main-title" style={{ fontSize: "12pt", margin: "0 0 2px 0" }}>BÁO CÁO KẾT QUẢ SO SÁNH KĨ THUẬT HÌNH SỰ</div>
              <div className="sr-eng-title" style={{ fontSize: "8.5pt", margin: "0 0 4px 0" }}>HTI-HABIS&AFIS Latent Fingerprint Search & Identification</div>
              <div className="sr-date-loc" style={{ fontSize: "8pt", margin: "0 0 6px 0" }}>Hà Nội, ngày 16 tháng 09 năm 2026</div>
            </div>

            <div className="sr-section" style={{ margin: "0 0 4px 0" }}>
              <div className="sr-section-h" style={{ fontSize: "9.5pt", margin: "4px 0 2px 0" }}>1. OVERVIEW:</div>
              <div className="sr-field-line" style={{ fontSize: "8.5pt", lineHeight: "1.4", margin: "0 0 2px 0" }}>
                <strong>Đơn vị:</strong> C09
              </div>
              <div className="sr-field-line" style={{ fontSize: "8.5pt", lineHeight: "1.4", margin: "0 0 2px 0" }}>
                <strong>Người lập báo cáo:</strong> HTI GROUP HABIS Professional Technical Team
              </div>
              <div className="sr-field-line" style={{ fontSize: "8.5pt", lineHeight: "1.4", margin: "0 0 2px 0" }}>
                <strong>Subject:</strong> Tổng hợp kết quả đối sánh dấu vân hiện trường với dữ liệu dấu vân tham chiếu kỹ thuật số
              </div>
              <div className="sr-field-line" style={{ fontSize: "8.5pt", lineHeight: "1.4", margin: "0 0 2px 0" }}>
                <strong>Result summary:</strong> 1 bản ghi đối sánh ({code} — {m.subject}, {m.percent || 82}%) đã được xác nhận trùng khớp
              </div>
            </div>

            <div className="stf-doc-card-overlay">
              <span className="stf-doc-card-hint">
                <IcEye s={13} /> Nhấn để phóng to toàn bộ báo cáo
              </span>
            </div>
          </div>

          <div className="stf-c09-act">
            <button
              type="button"
              className="smp-btn-ghost"
              onClick={() => setShowReport(true)}
              title={t("scene.report.view")}
            >
              <IcEye s={15} />
              {t("scene.report.view")}
            </button>
            <button
              type="button"
              className="smp-btn-ghost"
              onClick={handleDownloadPdf}
              disabled={busyPdf}
              title={t("scene.report.pdf")}
            >
              <IcDownload />
              {busyPdf ? (t("scene.report.saving") || "Đang tải...") : (t("scene.report.pdf") || "Tải PDF")}
            </button>
            <button
              type="button"
              className="stf-btn-usb"
              onClick={handleSaveUsb}
              disabled={busyUsb}
              title={t("scene.report.usb")}
            >
              <IcExport />
              {busyUsb ? (t("scene.report.saving") || "Đang lưu...") : (t("scene.report.usb") || "Lưu USB")}
            </button>
          </div>
        </section>
      </div>

      {/* Dai verification */}

      {zoom && createPortal(
        <div className="scene-zoom-backdrop" onClick={() => setZoom(null)}>
          <div className="scene-zoom-modal" onClick={(e) => e.stopPropagation()}>
            <div className="scene-zoom-head">
              <span className="scene-zoom-title">{zoom.title || code}</span>
              <button
                type="button"
                className="scene-zoom-close"
                onClick={() => setZoom(null)}
                title={t("common.close") || "Đóng"}
                aria-label={t("common.close") || "Đóng"}
              >
                <IcClose s={18} />
              </button>
            </div>
            <div className="scene-zoom-body">
              <div className="stf-zoom-wrap">
                <img src={zoom.url} alt={zoom.title || code} />
                {zoom.dots && <Dots />}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Khung nội dung A4 ẩn để xuất PDF / Lưu USB trực tiếp mà không cần mở popup */}
      <div
        style={{
          position: "fixed",
          left: "-9999px",
          top: 0,
          width: "210mm",
          zIndex: -999,
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        <SceneReportContent
          ref={printRef}
          session={session}
          items={[item]}
          singleMatch={singleMatchData}
        />
      </div>

      {showReport && (
        <SceneMatchReportModal
          session={session}
          items={[item]}
          singleMatch={singleMatchData}
          onClose={() => setShowReport(false)}
        />
      )}

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
