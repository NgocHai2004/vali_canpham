import React from "react";
import { useI18n } from "../../i18n";
import { DashIcon } from "../Icons";

/** Ô đo nhỏ: icon + nhãn + giá trị + thanh mini (thanh chỉ có ở theme tối —
 *  CSS token `--dh-gauge-bar` quyết định, component không cần biết theme). */
export function DashGaugeTile({ tone = "blue", icon, label, value, pct }) {
  return (
    <div className={`dh-gauge dh-gauge--${tone}`}>
      <span className="dh-gauge__icon" aria-hidden="true">{icon}</span>
      <span className="dh-gauge__text">
        <span className="dh-gauge__label">{label}</span>
        <strong className="dh-gauge__value">{value}%</strong>
        <span className="dh-gauge__track">
          <span className="dh-gauge__fill" style={{ width: `${pct}%` }} />
        </span>
      </span>
    </div>
  );
}

/**
 * Một dòng thanh đo.
 *
 * Với `gradient` (nhiệt độ): gradient trải hết chiều dài thanh rồi bị che phần
 * bên phải, để MÀU tương ứng với giá trị tuyệt đối (47°C luôn ra cùng một màu
 * dù thanh dài bao nhiêu). Đây là cách bản mockup tối làm, và đúng nghĩa hơn
 * cách bản sáng làm (gradient co theo bề rộng phần đã tô).
 */
export function DashMeter({ label, value, pct, gradient = false }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="dh-meter">
      <span className="dh-meter__label">{label}</span>
      <span className="dh-meter__track">
        {gradient ? (
          <>
            <span className="dh-meter__gradient" />
            <span className="dh-meter__mask" style={{ width: `${100 - clamped}%` }} />
          </>
        ) : (
          <span className="dh-meter__fill" style={{ width: `${clamped}%` }} />
        )}
      </span>
      <span className="dh-meter__value">{value}</span>
    </div>
  );
}

/** Một ô số liệu nhỏ ở chân panel. */
export function DashSpec({ label, value, tone }) {
  return (
    <div className="dh-spec">
      <span className="dh-spec__label">{label}</span>
      <strong className={tone ? `dh-spec__value dh-spec__value--${tone}` : "dh-spec__value"}>
        {value}
      </strong>
    </div>
  );
}

/**
 * Cụm "Trạng thái vali thu nhận": 4 ô đo + 2 thanh + 4 số liệu chân.
 * Ghép sẵn vì 3 phần này luôn đi cùng nhau trong cả hai mockup.
 */
export function DashTelemetry({ hardware }) {
  const { t } = useI18n();
  const hw = hardware;
  const tempPct = Math.round((hw.temp / hw.tempMax) * 100);

  return (
    <div className="dh-telemetry">
      <div className="dh-gauge-grid">
        <DashGaugeTile tone="emerald" icon={DashIcon.cpu} label={t("hw.cpu")} value={hw.cpu} pct={hw.cpu} />
        <DashGaugeTile tone="blue" icon={DashIcon.memory} label={t("hw.ram")} value={hw.ram} pct={hw.ram} />
        <DashGaugeTile tone="purple" icon={DashIcon.disk} label={t("hw.disk")} value={hw.disk} pct={hw.disk} />
        <DashGaugeTile tone="fuchsia" icon={DashIcon.chip} label={t("hw.chip")} value={hw.chip} pct={hw.chip} />
      </div>

      <div className="dh-meter-box">
        <DashMeter label={t("hw.temp")} value={`${hw.temp}°C`} pct={tempPct} gradient />
        <DashMeter label={t("hw.battery")} value={`${hw.battery}%`} pct={hw.battery} />
      </div>

      <div className="dh-specs">
        <DashSpec label={t("hw.power_in")} value={hw.powerIn} />
        <DashSpec label={t("hw.fan")} value={hw.fan} />
        <DashSpec label={t("hw.uptime")} value={hw.uptime} />
        <DashSpec
          label={t("hw.status")}
          value={
            <span className="dh-spec__ready">
              <span className="dh-spec__dot" aria-hidden="true" />
              {t("dashboard.hw.ready_label")}
            </span>
          }
          tone="ok"
        />
      </div>
    </div>
  );
}

export default DashTelemetry;
