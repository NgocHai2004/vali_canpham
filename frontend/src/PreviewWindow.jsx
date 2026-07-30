import { useEffect, useRef, useState } from "react";
import { useI18n, apiT } from "./i18n";
import { ProfilePreviewContent } from "./DataCapturePage";
import { buildProfilePdfBlob, makePdfFileName } from "./lib/exportProfilePdf";
import { PREVIEW_CHANNEL_NAME } from "./lib/dualMonitorPreview";
import { usbApi } from "./api";
import UsbDrivePickerModal from "./UsbDrivePickerModal";
import { notify } from "./notifications";
import { toast } from "./Toast";

const HEARTBEAT_MS = 1500;

export default function PreviewWindow() {
  const { t } = useI18n();
  const [payload, setPayload] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [usbPicker, setUsbPicker] = useState({ open: false, drives: [], resolve: null });
  const a4Ref = useRef(null);

  const pickDrive = (drives) => new Promise((resolve) => {
    setUsbPicker({ open: true, drives, resolve });
  });

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
      const filename = makePdfFileName(
        payload.form.personal_id || payload.form.cccd_number,
        payload.form.full_name,
      );
      const saved = await usbApi.saveExport(chosen.path, filename, blob);
      const okMsg = t("usb.export.success", { path: saved?.path || chosen.path });
      notify.add(okMsg);
      toast.success(okMsg);
    } catch (ex) {
      console.error("[Export PDF] error:", ex);
      toast.error(t("capture.pdf.err_export", { message: ex?.message || ex }));
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
