import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { usbApi } from "../api";

/* Chọn USB rồi chọn gói .vcpkg nằm trên USB đó — một màn, không chia 2 bước.
 *
 * Một màn chứ không phải "chọn USB" rồi "chọn gói": luồng thật của người dùng là
 * xuất ra USB -> RÚT RA -> cắm lại -> bấm Thêm. Lúc cắm lại, danh sách USB và
 * danh sách gói đều phải quét mới; nếu tách 2 modal thì modal chọn gói không có
 * chỗ nào để quét lại danh sách USB. Nút "Quét lại" ở đây quét lại cả hai.
 */
const EXT = ".vcpkg";

function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return "?";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export default function UsbPackagePickerModal({ busy = false, onPick, onCancel }) {
  const { t, formatDateTime } = useI18n();
  const [drives, setDrives] = useState([]);
  const [drive, setDrive] = useState("");
  const [files, setFiles] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadFiles = useCallback(async (path) => {
    if (!path) { setFiles([]); setName(""); return; }
    try {
      const r = await usbApi.listFiles(path, EXT);
      setFiles(r.files || []);
      setName((r.files || [])[0]?.name || "");
    } catch (e) {
      setFiles([]); setName(""); setError(e.message);
    }
  }, []);

  const scan = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const info = await usbApi.listWritable();
      const list = info.drives || [];
      setDrives(list);
      const first = list[0]?.path || "";
      setDrive(first);
      if (!first) {
        // Phân biệt "không có USB nào" với "chỉ có USB dongle": người dùng cần
        // biết là phải cắm USB thường, chứ không phải cắm lại cùng cái dongle.
        setError((info.dongle_drives || []).length > 0
          ? t("usb.export.err.only_dongle")
          : t("sync.pkg.pick.no_drive"));
        setFiles([]); setName("");
        return;
      }
      await loadFiles(first);
    } catch (e) {
      setDrives([]); setDrive(""); setFiles([]); setName("");
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [t, loadFiles]);

  useEffect(() => { scan(); }, [scan]);

  const chooseDrive = async (path) => {
    setDrive(path);
    setError("");
    await loadFiles(path);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!drive || !name || busy) return;
    onPick({ drive, name });
  };

  return (
    <div
      className="session-modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel && onCancel()}
    >
      <form className="session-modal" onSubmit={submit}>
        <div className="session-modal-head">
          <h3>{t("sync.pkg.pick.title")}</h3>
          <button
            type="button"
            className="session-modal-close"
            onClick={onCancel}
            disabled={busy}
            aria-label={t("common.close")}
          >×</button>
        </div>

        <div className="session-modal-body">
          <p style={{ margin: 0, color: "var(--muted, #666)", fontSize: 13 }}>
            {t("sync.pkg.pick.hint")}
          </p>

          {error && (
            <div style={{ color: "#ef4444", fontSize: 13 }} role="alert">{error}</div>
          )}

          {loading && (
            <div style={{ color: "var(--muted, #666)", fontSize: 13 }}>
              {t("common.loading")}
            </div>
          )}

          {!loading && drives.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted, #666)", marginBottom: 6 }}>
                {t("sync.pkg.pick.drive_label")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {drives.map((d) => (
                  <label
                    key={d.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      border: "1px solid var(--border, rgba(53, 216, 255, 0.18))",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: drive === d.path ? "var(--selected-bg, rgba(22, 139, 255, 0.14))" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="sync-usb-drive"
                      value={d.path}
                      checked={drive === d.path}
                      onChange={() => chooseDrive(d.path)}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>
                        {d.label ? `${d.label} (${d.path})` : d.path}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted, #666)" }}>
                        {t("usb.export.picker.free", {
                          free: formatBytes(d.free_bytes),
                          total: formatBytes(d.total_bytes),
                        })}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {!loading && drive && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted, #666)", marginBottom: 6 }}>
                {t("sync.pkg.pick.file_label")}
              </div>
              {files.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--muted, #666)" }}>
                  {t("sync.pkg.pick.no_file")}
                </div>
              ) : (
                <div
                  style={{
                    display: "flex", flexDirection: "column", gap: 8,
                    // USB nhieu goi thi danh sach phai tu cuon, khong day footer
                    // ra khoi man hinh.
                    maxHeight: "min(38vh, 17rem)", overflowY: "auto",
                  }}
                >
                  {files.map((f) => (
                    <label
                      key={f.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        border: "1px solid var(--border, rgba(53, 216, 255, 0.18))",
                        borderRadius: 6,
                        cursor: "pointer",
                        background: name === f.name ? "var(--selected-bg, rgba(22, 139, 255, 0.14))" : "transparent",
                      }}
                    >
                      <input
                        type="radio"
                        name="sync-usb-package"
                        value={f.name}
                        checked={name === f.name}
                        onChange={() => setName(f.name)}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{f.name}</div>
                        <div style={{ fontSize: 12, color: "var(--muted, #666)" }}>
                          {formatBytes(f.bytes)} · {formatDateTime(new Date(f.mtime * 1000).toISOString())}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="session-modal-actions">
          <button type="button" className="btn-secondary" onClick={scan} disabled={loading || busy}>
            {t("sync.pkg.pick.rescan")}
          </button>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={!drive || !name || busy || loading}>
              {t("sync.pkg.pick.confirm")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
