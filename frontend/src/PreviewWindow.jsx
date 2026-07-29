import { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n";
import { ProfilePreviewContent } from "./DataCapturePage";
import { exportProfilePdf, makePdfFileName } from "./lib/exportProfilePdf";
import { PREVIEW_CHANNEL_NAME } from "./lib/dualMonitorPreview";

export default function PreviewWindow() {
  const { t } = useI18n();
  const [payload, setPayload] = useState(null);
  const [exporting, setExporting] = useState(false);
  const a4Ref = useRef(null);
  const requestedFullscreenRef = useRef(false);

  useEffect(() => {
    const channel = new BroadcastChannel(PREVIEW_CHANNEL_NAME);
    channel.onmessage = (ev) => {
      const data = ev?.data;
      if (data?.type === "payload" && data.payload) {
        setPayload(data.payload);
      }
    };
    channel.postMessage({ type: "ready" });
    return () => channel.close();
  }, []);

  useEffect(() => {
    document.title = t("capture.pdf.window_title");
  }, [t]);

  useEffect(() => {
    if (!payload || requestedFullscreenRef.current) return;
    requestedFullscreenRef.current = true;
    try {
      const req = document.documentElement.requestFullscreen?.bind(document.documentElement);
      if (req) req().catch(() => { /* browser denied — ignore */ });
    } catch { /* noop */ }
  }, [payload]);

  const handlePrint = async () => {
    const node = a4Ref.current;
    if (!node || !payload) return;
    setExporting(true);
    try {
      await exportProfilePdf(node, {
        fileName: makePdfFileName(
          payload.form.personal_id || payload.form.cccd_number,
          payload.form.full_name,
        ),
      });
    } catch (ex) {
      console.error("[Export PDF] error:", ex);
      alert(t("capture.pdf.err_export", { message: ex?.message || ex }));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="preview-window-root">
      <div className="preview-toolbar no-print">
        <button
          type="button"
          className="preview-btn"
          onClick={handlePrint}
          disabled={exporting || !payload}
        >
          {exporting ? t("capture.pdf.exporting") : t("capture.pdf.export")}
        </button>
        <button
          type="button"
          className="preview-btn preview-close"
          onClick={() => window.close()}
        >
          {t("common.close")}
        </button>
      </div>

      <div className="preview-scroll">
        {payload ? (
          <ProfilePreviewContent ref={a4Ref} form={payload.form} photos={payload.photos} />
        ) : (
          <div className="preview-window-loading">{t("capture.pdf.preview_loading")}</div>
        )}
      </div>
    </div>
  );
}
