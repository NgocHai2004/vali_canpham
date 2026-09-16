import React, { useState } from "react";
import api, { exportToUsb } from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icons";
import { PageHeader } from "../components/CommonUI";
import { toast } from "../Toast";
import { notify } from "../notifications";
import UsbDrivePickerModal from "../UsbDrivePickerModal";

function ImportExportPage() {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [usbPicker, setUsbPicker] = useState({ open: false, drives: [], resolve: null });

  const pickDrive = (drives) => new Promise((resolve) => {
    setUsbPicker({ open: true, drives, resolve });
  });

  const doExport = async () => {
    setExporting(true);
    setError("");
    try {
      const res = await exportToUsb(
        "/api/detainees/export/xlsx",
        "can_pham.xlsx",
        pickDrive,
      );
      if (!res.cancelled) {
        const msg = t("usb.export.success", { path: res.path });
        toast.success(msg);
        notify.add(msg);
      }
    } catch (ex) {
      toast.error(ex.message);
      setError(ex.message);
    } finally {
      setExporting(false);
    }
  };

  const importFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setResult(null);
    setError("");

    try {
      const data = new FormData();
      data.append("file", file);
      const r = await api.importXlsx(data);
      setResult(r);
      notify.add(t("import.notify_done", { n: r.inserted || 0 }));
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="page">
      <PageHeader title={t("import.title")} subtitle={t("import.subtitle")} />

      <div className="feature-grid">
        <section className="feature-card">
          <div className="feature-icon">{Icon.file}</div>
          <h3>{t("import.export_title")}</h3>
          <p>{t("import.export_desc")}</p>
          <button className="button primary" onClick={doExport} disabled={exporting}>
            {exporting ? t("session.exporting") : t("import.export_btn")}
          </button>
        </section>

        <section className="feature-card">
          <div className="feature-icon">{Icon.file}</div>
          <h3>{t("import.import_title")}</h3>
          <p>{t("import.import_desc")}</p>

          <div className="feature-actions">
            <button className="button secondary" onClick={() => api.downloadTemplate()}>
              {t("import.template")}
            </button>

            <label className="button primary">
              {uploading ? t("import.importing") : t("import.choose")}
              <input type="file" accept=".xlsx" onChange={importFile} hidden disabled={uploading} />
            </label>
          </div>

          {error && <div className="error-box">{error}</div>}
          {result && (
            <div className="success-box">
              {t("import.done", { n: result.inserted })}
              {result.errors?.length ? t("import.done_err", { n: result.errors.length }) : ""}
            </div>
          )}
        </section>
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


export default ImportExportPage;
