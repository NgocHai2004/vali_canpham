import { useI18n } from "./i18n";

// Modal cảnh báo "hồ sơ có thể trùng" — hiện khi bấm Lưu, sau khi gộp kết quả
// check-cccd + check-duplicate. Officer tự quyết: vẫn lưu / mở hồ sơ cũ / huỷ.
//
// Props:
//   open          : bool — hiển thị hay không
//   matches       : [{ source, detainee, score?, finger? }] đã dedup theo detainee.id
//   onProceed     : () => void — "Vẫn lưu bản mới"
//   onOpenProfile : (detainee) => void — "Mở hồ sơ đã đăng ký" (chỉ khi đúng 1 match)
//   onCancel      : () => void — "Huỷ, kiểm tra lại"
export default function DuplicateWarnModal({ open, matches = [], onProceed, onOpenProfile, onCancel }) {
  const { t } = useI18n();
  if (!open) return null;

  const badgeText = (m) =>
    m.source === "cccd" ? t("capture.alert.badge_cccd") : t("capture.alert.badge_info");

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal confirm-del-modal dup-warn-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{t("capture.dup_modal.title")}</h3>
          <button className="close-x" onClick={onCancel} aria-label={t("common.close")}>×</button>
        </div>

        <div className="dup-warn-body">
          <p className="dup-warn-subtitle">
            {t("capture.dup_modal.subtitle", { n: matches.length })}
          </p>

          <ul className="dup-warn-list">
            {matches.map((m, i) => {
              const d = m.detainee || {};
              const photo = d.photos?.portrait_front || d.photos?.cccd_front || "";
              return (
                <li key={d.id || d._id || i} className="dup-warn-item">
                  <div className="dup-warn-photo">
                    {photo ? (
                      <img src={photo} alt={d.full_name || ""} />
                    ) : (
                      <span className="dup-warn-nophoto">{t("capture.alert.no_photo")}</span>
                    )}
                  </div>
                  <div className="dup-warn-info">
                    <div className="dup-warn-name">
                      {d.full_name || "—"}
                      <span className="dup-warn-badge">{badgeText(m)}</span>
                    </div>
                    <div className="dup-warn-meta">
                      {d.cccd_number ? `CCCD: ${d.cccd_number}` : ""}
                      {d.dob ? ` · ${d.dob}` : ""}
                      {d.cell_code ? ` · ${t("capture.dup_modal.cell", { code: d.cell_code })}` : ""}
                    </div>
                    {d.created_by ? (
                      <div className="dup-warn-by">
                        {t("capture.alert.registered_by", { user: d.created_by })}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="session-modal-actions dup-warn-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {t("capture.dup_modal.cancel")}
          </button>
          {matches.length === 1 && onOpenProfile ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onOpenProfile(matches[0].detainee)}
            >
              {t("capture.dup_modal.open_profile")}
            </button>
          ) : null}
          <button type="button" className="btn-primary dup-warn-proceed" onClick={onProceed}>
            {t("capture.dup_modal.proceed")}
          </button>
        </div>
      </div>
    </div>
  );
}
