import { useI18n } from "../i18n";

/* Tiến trình nhận gói đồng bộ. THUẦN TRÌNH BÀY — không tự chạy gì.
 *
 * Việc chạy nằm ở SyncPage (trong onClick), không nằm trong useEffect của modal:
 * StrictMode của React 18 chạy effect 2 lần ở dev, nhập gói là thao tác GHI DB,
 * chạy 2 lần là ghi 2 lần.
 *
 * Năm bước ở đây là 5 bước thật, không phải hoạt ảnh: bước 1 đọc file khỏi USB,
 * bước 2-4 ứng với 1 lần gọi /import-package/validate của máy chủ (validate mở
 * gói, giải mã, kiểm checksum, kiểm schema trong cùng một request — nên khi nó
 * đang chạy thì chỉ bước 2 hiện "đang chạy", qua được thì cả 3 chuyển "xong"),
 * bước 5 là /import-package/apply. Khi máy chủ báo hỏng ở bước nào
 * (PackageError.step: format/decrypt/manifest/version/checksum/schema), SyncPage
 * gắn lỗi đúng vào bước tương ứng nên không bao giờ báo chung chung "gói hỏng".
 */

const ICON = { pending: "○", running: "◌", done: "✓", failed: "✕" };
const COLOR = {
  pending: "var(--muted, #666)",
  running: "#168bff",
  done: "#22c55e",
  failed: "#ef4444",
};

export default function SyncPackageProgressModal({
  drive, filename, steps, phase, summary, error, onClose,
}) {
  const { t } = useI18n();
  const running = phase === "running";

  return (
    <div
      className="session-modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !running && onClose && onClose()}
    >
      <div className="session-modal" role="dialog" aria-modal="true">
        <div className="session-modal-head">
          <h3>{running ? t("sync.pkg.progress.title") : (phase === "done" ? t("sync.pkg.progress.title_done") : t("sync.pkg.progress.title_failed"))}</h3>
          <button
            type="button"
            className="session-modal-close"
            onClick={onClose}
            disabled={running}
            aria-label={t("common.close")}
          >×</button>
        </div>

        <div className="session-modal-body">
          <div style={{ fontSize: 13, color: "var(--muted, #666)", overflowWrap: "anywhere" }}>
            {filename}
            {drive ? ` — ${drive}` : ""}
          </div>

          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {steps.map((s) => (
              <li key={s.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: COLOR[s.status], width: 16, textAlign: "center", lineHeight: "20px" }}>
                  {ICON[s.status]}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: s.status === "running" ? 600 : 400,
                    color: s.status === "failed" ? COLOR.failed : "inherit",
                  }}>
                    {t(`sync.pkg.step.${s.id}`)}
                  </div>
                  {s.detail && (
                    <div style={{ fontSize: 12, color: s.status === "failed" ? COLOR.failed : "var(--muted, #666)", overflowWrap: "anywhere" }}>
                      {s.detail}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {error && phase === "failed" && (
            <div style={{ color: COLOR.failed, fontSize: 13, overflowWrap: "anywhere" }}>
              {error}
            </div>
          )}

          {phase === "done" && summary && (
            <div style={{ fontSize: 13, borderTop: "1px solid var(--border, rgba(53,216,255,0.18))", paddingTop: 10 }}>
              <div>
                {t("sync.pkg.progress.written", {
                  sessions: summary.written?.sessions || 0,
                  detainees: summary.written?.detainees || 0,
                })}
              </div>
              {(summary.skipped?.sessions > 0 || summary.skipped?.detainees > 0) && (
                <div style={{ color: "var(--muted, #666)", marginTop: 4 }}>
                  {t("sync.pkg.progress.skipped", {
                    sessions: summary.skipped?.sessions || 0,
                    detainees: summary.skipped?.detainees || 0,
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="session-modal-actions">
          <button type="button" className="btn-primary" onClick={onClose} disabled={running}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
