import React from "react";
import { useI18n } from "../i18n";
import { DetailIcon } from "./Icons";

export function InfoTile({ icon, label, value, action }) {
  return (
    <div className="info-tile">
      <span className="info-tile-icon">{icon}</span>
      <div className="info-tile-content">
        <span className="info-tile-label">{label}</span>
        <strong className="info-tile-value">{value}</strong>
      </div>
      {action && <div className="info-tile-action">{action}</div>}
    </div>
  );
}

export function DetailModal({ detainee, onClose, onEdit }) {
  const { t, formatDate } = useI18n();
  const d = detainee;
  const dobText = formatDate(d.dob);
  const dateInText = formatDate(d.date_in);
  const genderText = d.gender === "female" ? t("common.female") : t("common.male");
  const genderSymbol = d.gender === "female" ? "♀" : "♂";
  const avatar = d.photos?.cccd_front || d.photo_url || d.photos?.portrait_front;
  const editMissing = onEdit ? (
    <button className="info-tile-edit-btn" onClick={() => onEdit(d)} title={t("detainee.detail.edit_missing")}>
      {t("detainee.detail.edit_missing")}
    </button>
  ) : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal detail-modal-v2" onClick={(e) => e.stopPropagation()}>
        <div className="detail-header">
          <div className="detail-header-left">
            <span className="detail-header-icon">{DetailIcon.cccd}</span>
            <div>
              <h3>{t("detainee.detail.title", { code: d.code || d.personal_id || "" })}</h3>
              <small>{t("detainee.detail.subtitle")}</small>
            </div>
          </div>
          <button className="detail-close" onClick={onClose} aria-label={t("detainee.detail.close_aria")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="detail-body">
          <aside className="detail-card detail-card-simple">
            <div className="detail-avatar">
              {avatar ? <img src={avatar} alt={d.full_name} /> : <span>{t("detainee.detail.no_photo")}</span>}
            </div>
            <div className="detail-name-row">
              <span className="detail-name">{d.full_name || "—"}</span>
            </div>
          </aside>

          <div className="detail-grid-v2 detail-grid-2x4">
            <InfoTile icon={DetailIcon.cccd} label={t("detainee.field.cccd")} value={d.cccd_number || "—"} />
            <InfoTile icon={DetailIcon.note} label={t("detainee.field.personal_id")} value={d.personal_id || "—"} />
            <InfoTile icon={DetailIcon.dob} label={t("detainee.field.dob")} value={dobText} />
            <InfoTile icon={DetailIcon.ethnic} label={t("detainee.field.ethnicity")} value={d.ethnicity || "Kinh"} action={!d.ethnicity ? editMissing : null} />
            <InfoTile icon={DetailIcon.door} label={t("detainee.field.cell")} value={d.cell_code || "—"} />
            <InfoTile icon={DetailIcon.pin} label={t("detainee.field.address")} value={d.address || "—"} />
            <InfoTile icon={DetailIcon.gender} label={t("detainee.field.gender")} value={<span><b>{genderSymbol}</b> {genderText}</span>} />
            <InfoTile icon={DetailIcon.flag} label={t("detainee.field.nationality")} value={d.nationality || t("detainee.field.nationality_default")} action={!d.nationality ? editMissing : null} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default DetailModal;
