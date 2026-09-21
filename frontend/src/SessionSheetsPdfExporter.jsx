import { useEffect, useRef } from "react";
import { NameSheetPreviewContent } from "./capture/NameSheetPreview";
import { FpSheetPreviewContent } from "./capture/FpSheetPreview";
import { buildSheetsPdfBlob } from "./lib/exportProfilePdf";
import { usbApi } from "./api";
import { toast } from "./Toast";
import { notify } from "./notifications";
import { useI18n } from "./i18n";

// Xuất toàn bộ Chỉ bản (295) + Danh bản (204) của danh sách can phạm trong một phiên thành file PDF
export default function SessionSheetsPdfExporter({
  detainees,
  session,
  unitName = "",
  pickDrive,
  onDone,
}) {
  const { t } = useI18n();
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const runExport = async () => {
      try {
        if (!detainees || detainees.length === 0) {
          toast.warning(t("session.detail.empty_closed"));
          if (onDone) onDone();
          return;
        }

        toast.info(t("session.detail.exporting_pdf"));

        // 1. Chờ ảnh tải xong
        const imgs = containerRef.current ? Array.from(containerRef.current.querySelectorAll("img")) : [];
        const pending = imgs
          .filter((img) => img && !img.complete)
          .map((img) => new Promise((res) => {
            img.addEventListener("load", res, { once: true });
            img.addEventListener("error", res, { once: true });
          }));
        await Promise.race([
          Promise.all(pending),
          new Promise((r) => setTimeout(r, 4000)),
        ]);
        if (cancelled) return;

        // 2. Thu thập danh sách nodes .sheet-page
        const pages = containerRef.current ? Array.from(containerRef.current.querySelectorAll(".sheet-page")) : [];
        if (pages.length === 0) throw new Error("No sheet pages found to export");

        const blob = await buildSheetsPdfBlob(pages);
        if (cancelled) return;

        const filename = `session_${session.code || session.id || "sheets"}_chi_ban_danh_ban.pdf`;

        // 3. Xuất ra USB nếu có, hoặc tải về trình duyệt
        let savedPath = "";
        let isUsbSaved = false;
        try {
          const info = await usbApi.listWritable();
          const drives = info.drives || [];
          if (drives.length > 0) {
            const chosen = drives.length === 1 ? drives[0] : await pickDrive(drives);
            if (chosen) {
              const saved = await usbApi.saveExport(chosen.path, filename, blob);
              savedPath = saved?.path || chosen.path;
              isUsbSaved = true;
            }
          }
        } catch (e) {
          console.warn("[PDF Exporter] USB check/save fallback to browser download:", e);
        }

        if (!isUsbSaved) {
          // Direct browser download
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          savedPath = filename;
        }

        const msg = isUsbSaved
          ? t("usb.export.success", { path: savedPath })
          : (t("session.detail.pdf_download_success", { name: filename }) || `Đã xuất file PDF: ${filename}`);
        toast.success(msg);
        notify.add(msg);
      } catch (ex) {
        console.error("[PDF Exporter] Failed:", ex);
        toast.error(t("capture.pdf.err_export", { message: ex.message || ex }));
      } finally {
        if (!cancelled && onDone) onDone();
      }
    };

    runExport();

    return () => {
      cancelled = true;
    };
  }, [detainees, session, unitName, pickDrive, onDone, t]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        left: -99999,
        top: 0,
        width: "210mm",
        zIndex: -1000,
        background: "#ffffff",
        color: "#000000",
        pointerEvents: "none",
      }}
    >
      {detainees.map((d, i) => (
        <div key={i}>
          <div className="sheet-page">
            <NameSheetPreviewContent form={d} photos={d.photos || {}} unitName={unitName} />
          </div>
          <div className="sheet-page">
            <FpSheetPreviewContent form={d} photos={d.photos || {}} unitName={unitName} />
          </div>
        </div>
      ))}
    </div>
  );
}
