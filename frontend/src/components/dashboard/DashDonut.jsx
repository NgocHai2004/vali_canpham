import React from "react";
import { useI18n } from "../../i18n";

const R = 38;                        // bán kính trong viewBox 100x100
const C = 2 * Math.PI * R;           // chu vi vòng

/**
 * Biểu đồ vành khuyên (mockup: cơ cấu giới tính).
 *
 * Kích thước và độ dày vòng do CSS token quyết định (`--dh-donut-size`,
 * `--dh-donut-w`) vì hai theme vẽ vòng dày khác nhau (144px/11 vs 112px/8);
 * component không cần biết theme nào đang bật.
 *
 * Khi tổng bằng 0 thì KHÔNG vẽ cung nào — mockup bản tối vẽ một cung ~16%
 * trong khi chữ giữa ghi "0%", tự mâu thuẫn.
 *
 * @param segments [{ key, label, color, value, pct }]
 */
export function DashDonut({
  segments = [],
  centerValue = "0%",
  centerLabel = "",
  loading = false,
}) {
  const { t, formatNumber } = useI18n();
  const total = segments.reduce((s, x) => s + (x.value || 0), 0);

  let offset = 0;
  const arcs = total
    ? segments.map((s) => {
        const len = ((s.pct || 0) / 100) * C;
        const arc = { ...s, len, offset };
        offset += len;
        return arc;
      })
    : [];

  return (
    <div className="dh-donut">
      <div className={"dh-donut__ring" + (loading ? " is-loading" : "")} aria-busy={loading}>
        <svg viewBox="0 0 100 100" className="dh-donut__svg" aria-hidden="true">
          <circle className="dh-donut__track" cx="50" cy="50" r={R} />
          {loading ? (
            /* Cung quay: 28% vòng, cả SVG quay quanh tâm (xem CSS .is-loading) */
            <circle
              className="dh-donut__spinner"
              cx="50"
              cy="50"
              r={R}
              strokeDasharray={`${C * 0.28} ${C * 0.72}`}
            />
          ) : (
            arcs.map((a) => (
              <circle
                key={a.key}
                className="dh-donut__arc"
                cx="50"
                cy="50"
                r={R}
                stroke={a.color}
                strokeDasharray={`${a.len} ${C - a.len}`}
                strokeDashoffset={-a.offset}
                transform="rotate(-90 50 50)"
              />
            ))
          )}
        </svg>
        {!loading && (
          <div className="dh-donut__center">
            <strong className="dh-donut__value">{centerValue}</strong>
            {centerLabel && <span className="dh-donut__label">{centerLabel}</span>}
          </div>
        )}
        {loading && <span className="dh-sr-only">{t("dashboard.loading")}</span>}
      </div>

      {/* Cột phải là MỘT lưới 3 cột (nhãn | số lượng | tỷ lệ) để hàng tiêu đề
          "Số lượng / Tỷ lệ" thẳng cột với các con số bên dưới — mockup light vẽ
          đúng như vậy. Đặt lưới ở đây (chứ không ở từng hàng) vì các hàng phải
          chia sẻ cùng một track. */}
      <div className="dh-donut__side">
        {/* Chỉ hiện ở theme sáng (mockup tối không có hàng này) — CSS token
            --dh-donut-foot quyết định, không phải prop. */}
        <div className="dh-donut__foot">
          <span />
          <span>{t("dashboard.donut.qty")}</span>
          <span>{t("dashboard.donut.pct")}</span>
        </div>
        {segments.map((s) => (
          <div className="dh-legend" key={s.key}>
            <span className="dh-legend__name">
              <span className="dh-legend__dot" style={{ background: s.color }} />
              <span className="dh-legend__label">{s.label}</span>
            </span>
            <strong className="dh-legend__value">{formatNumber(s.value)}</strong>
            <small className="dh-legend__pct">{s.pct}%</small>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DashDonut;
