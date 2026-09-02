import { useI18n } from "../../i18n";

// Thanh meta dau trang to khai: so ho so - ngay lap - don vi - tien do.
// Thay cho cot "kiem tra du lieu" ben phai o layout cu: mockup khong co cot phai,
// nen tien do + so hang muc thieu duoc dua len day.
export function MetaBar({ fileNo, dateStr, unitName, progress, missing = 0 }) {
  const { t } = useI18n();
  return (
    <div className="cap-meta">
      <div className="cap-meta-item">
        <span className="cap-meta-label">{t("capture.meta.file_no")}</span>
        <span className="cap-meta-value">{fileNo || "—"}</span>
      </div>
      <span className="cap-meta-sep" />
      <div className="cap-meta-item">
        <span className="cap-meta-label">{t("capture.meta.date")}</span>
        <span className="cap-meta-value">{dateStr || "—"}</span>
      </div>
      <span className="cap-meta-sep" />
      <div className="cap-meta-item cap-meta-unit">
        <span className="cap-meta-label">{t("capture.meta.unit")}</span>
        <span className="cap-meta-value">{unitName || "—"}</span>
      </div>
      <div className="cap-meta-progress">
        <span className="cap-meta-label">{t("capture.meta.progress")}</span>
        <div className="cap-meta-bar" role="progressbar" aria-valuenow={progress}
          aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <span className={"cap-meta-pct" + (missing > 0 ? " warn" : " ok")}>{progress}%</span>
      </div>
    </div>
  );
}
