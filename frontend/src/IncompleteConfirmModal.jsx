import { useI18n } from "./i18n";

// Modal xác nhận lưu khi hồ sơ đã đủ 2 trường bắt buộc (mã hồ sơ + CCCD 12 số)
// nhưng còn thiếu các thông tin khác (ảnh chân dung, vân tay, nhân thân, vụ việc...)
export default function IncompleteConfirmModal({ open, items = [], onProceed, onCancel }) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal confirm-del-modal incomplete-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="incomplete-modal-head-title">
            <span className="incomplete-modal-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            <h3>{t("capture.incomplete_modal.title")}</h3>
          </div>
          <button className="close-x" onClick={onCancel} aria-label={t("common.close")}>×</button>
        </div>

        <div className="incomplete-modal-body">
          <p className="incomplete-modal-subtitle">
            {t("capture.incomplete_modal.subtitle")}
          </p>

          <div className="incomplete-items-box">
            <div className="incomplete-items-header">
              <span>{t("capture.incomplete_modal.list_header", { count: items.length })}</span>
            </div>
            <ul className="incomplete-items-list">
              {items.map((it) => (
                <li key={it.key} className="incomplete-item">
                  <span className="incomplete-item-bullet">•</span>
                  {it.section && <span className="incomplete-item-section">[{it.section}]</span>}
                  <span className="incomplete-item-text">{it.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="incomplete-modal-hint">
            {t("capture.incomplete_modal.hint")}
          </p>
        </div>

        <div className="session-modal-actions incomplete-modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {t("capture.incomplete_modal.cancel")}
          </button>
          <button type="button" className="btn-primary incomplete-proceed-btn" onClick={onProceed}>
            {t("capture.incomplete_modal.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
