import { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n";
import { ProfilePreviewContent } from "./DataCapturePage";
import { exportProfilePdf, makePdfFileName } from "./lib/exportProfilePdf";
import { PREVIEW_CHANNEL_NAME } from "./lib/dualMonitorPreview";

const HEARTBEAT_MS = 1500;

export default function PreviewWindow() {
  const { t } = useI18n();
  const [payload, setPayload] = useState(null);
  const [exporting, setExporting] = useState(false);
  const a4Ref = useRef(null);

  useEffect(() => {
    const channel = new BroadcastChannel(PREVIEW_CHANNEL_NAME);
    channel.onmessage = (ev) => {
      const data = ev?.data;
      if (data?.type === "payload" && data.payload) setPayload(data.payload);
      else if (data?.type === "clear") setPayload(null);
    };
    const beat = () => channel.postMessage({ type: "heartbeat" });
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => { clearInterval(timer); channel.close(); };
  }, []);

  useEffect(() => {
    document.title = t("capture.pdf.window_title");
  }, [t]);

  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === "Escape") setPayload(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  if (!payload) {
    return <div className="preview-blank" />;
  }

  return (
    <div className="preview-window-root">
      <div className="preview-toolbar no-print">
        <button type="button" className="preview-btn" onClick={handlePrint} disabled={exporting}>
          {exporting ? t("capture.pdf.exporting") : t("capture.pdf.export")}
        </button>
        <button type="button" className="preview-btn preview-close" onClick={() => setPayload(null)}>
          {t("common.close")}
        </button>
      </div>
      <div className="preview-scroll">
        <ProfilePreviewContent ref={a4Ref} form={payload.form} photos={payload.photos} />
      </div>
    </div>
  );
}
