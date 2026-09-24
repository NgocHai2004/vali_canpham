import React from "react";
import { useI18n } from "../../i18n";

/**
 * Thẻ trạng thái thiết bị vali (cột 3 hàng 3 của Dashboard)
 */
export function DashDeviceStatus({ imageSrc = "/device-case.png" }) {
  const { t } = useI18n();

  return (
    <div className="dh-device-status">
      <div className="dh-device-status__badge">
        <span className="dh-device-status__badge-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      </div>
      <div className="dh-device-status__visual">
        <img className="dh-device-status__img" src={imageSrc} alt="Thiết bị vali" />
      </div>
      <div className="dh-device-status__info">
        <h4 className="dh-device-status__title">Hoạt động bình thường</h4>
        <p className="dh-device-status__subtitle">Sẵn sàng thu thập dữ liệu</p>
      </div>
    </div>
  );
}

export default DashDeviceStatus;
