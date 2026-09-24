import React, { useState } from "react";
import { useI18n } from "../../i18n";

/**
 * Line/area chart 14 ngày.
 *
 * Hình học lấy đúng theo mockup: viewBox 650x140, 5 đường lưới dashed ở
 * y = 10/35/60/85/110 ứng với 50/40/30/20/10, đường 0 ở y = 135.
 * Path được TÍNH từ dữ liệu, không hardcode như file mockup.
 *
 * Lưu ý: `preserveAspectRatio="none"` nên viewBox bị kéo giãn phi tuyến theo
 * container. Vì vậy nhãn trục x đặt bằng % (khớp tỉ lệ viewBox), không đặt theo px.
 *
 * @param labels    Nhãn trục x, cùng độ dài với values
 * @param values    Số liệu
 * @param yMax      Đỉnh trục y (mockup dùng 50 cho đỉnh 20)
 * @param ticks     Các mốc trục y, giảm dần
 * @param highlightIndex  Vị trí đánh dấu điểm nhấn (mặc định: điểm lớn nhất)
 */
export function DashLineChart({
  labels = [],
  values = [],
  yMax = 50,
  ticks = [50, 40, 30, 20, 10, 0],
  highlightIndex,
}) {
  const { t } = useI18n();
  // Ngày đang trỏ tới. `null` = không hover → không có tooltip.
  const [hover, setHover] = useState(null);

  const VB_W = 650;
  const VB_H = 140;
  const X0 = 30;      // mép trái vùng vẽ
  const X1 = 630;     // mép phải vùng vẽ
  const Y_TOP = 10;   // y của yMax
  const Y_BASE = 135; // y của 0

  const n = values.length;
  if (!n) return <div className="dh-empty">—</div>;

  const xOf = (i) => (n === 1 ? X0 : X0 + (i * (X1 - X0)) / (n - 1));
  const yOf = (v) => Y_BASE - (Math.max(0, Math.min(v, yMax)) / yMax) * (Y_BASE - Y_TOP);
  const pct = (v) => `${(v / VB_W) * 100}%`;

  const points = values.map((v, i) => [xOf(i), yOf(v)]);
  const line = points.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L ${X1},${Y_BASE} L ${X0},${Y_BASE} Z`;

  const peak = highlightIndex != null
    ? highlightIndex
    : values.reduce((best, v, i) => (v > values[best] ? i : best), 0);

  /* Biên của dải bắt hover cho ngày i: nửa đường tới ngày kề. Hai đầu lấy hết
     mép viewBox để lề trái (trục y) và lề phải cũng bắt được chuột — nếu để
     đúng X0..X1 thì hover ở rìa panel rơi vào khoảng chết. */
  const bandEdge = (i) => {
    if (i <= 0) return 0;
    if (i >= n) return VB_W;
    return (xOf(i - 1) + xOf(i)) / 2;
  };

  /* Bàn phím: cả vùng vẽ là MỘT điểm dừng tab (không phải 14) rồi mũi trái/phải
     đi từng ngày — 14 tab stop trong kiosk là quá nhiều để đi qua. */
  const onKeyDown = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      setHover((h) => Math.max(0, Math.min(n - 1, (h == null ? peak : h) + step)));
    } else if (e.key === "Escape") {
      setHover(null);
    }
  };

  /* Neo tooltip: ở giữa thì căn giữa điểm, sát hai rìa thì bám cạnh để không
     tràn ra ngoài panel. */
  const tipAlign = (i) => {
    const p = (xOf(i) / VB_W) * 100;
    return p < 12 ? "start" : p > 88 ? "end" : "mid";
  };

  return (
    <div className="dh-chart">
      <div
        className="dh-chart__plot"
        tabIndex={0}
        role="group"
        aria-label={t("dashboard.panel.activity14")}
        onFocus={() => setHover((h) => (h == null ? peak : h))}
        onBlur={() => setHover(null)}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHover(null)}
      >
        {/* Lưới ô: mỗi ô là giao của một NGÀY (cột dọc) và một MỐC GIÁ TRỊ
            (hàng ngang). Cột dọc chạy từ mốc cao nhất xuống mốc 0 để các ô
            khép kín thành bảng. */}
        <svg
          className="dh-chart__svg"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="dhLineFill" x1="0" y1="0" x2="0" y2="1">
              {/* opacity đặt bằng CSS (.dh-chart__stop) chứ không qua thuộc
                  tính: Chromium KHÔNG resolve var() trong presentation
                  attribute, nên `stopOpacity="var(--dh-chart-fill)"` bị bỏ qua. */}
              <stop className="dh-chart__stop" offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>

          <g className="dh-chart__grid">
            {ticks.map((t) => {
              const y = yOf(t);
              return <line key={`row-${t}`} x1={X0} x2={X1} y1={y} y2={y} />;
            })}
            {values.map((_, i) => {
              const x = xOf(i);
              return <line key={`col-${i}`} className="dh-chart__col" x1={x} x2={x} y1={yOf(yMax)} y2={Y_BASE} />;
            })}
          </g>

          <path className="dh-chart__area" d={area} fill="url(#dhLineFill)" />
          <path className="dh-chart__line" d={line} />

          {/* Đường dọc chỉ ngày đang hover. Vẽ trong SVG (không phải HTML) để
              nằm dưới lớp chấm và trên vùng tô. */}
          {hover != null && (
            <line
              className="dh-chart__cursor"
              x1={xOf(hover)}
              x2={xOf(hover)}
              y1={Y_TOP}
              y2={Y_BASE}
            />
          )}
        </svg>

        {/* Chấm dữ liệu cũng là HTML: <circle> trong SVG bị kéo giãn thành hình
            ellipse (scale x .94 / y .5) nên không còn là chấm tròn. */}
        <div className="dh-chart__points" aria-hidden="true">
          {points.map(([x, y], i) => (
            <span
              key={`pt-${i}`}
              className={
                "dh-chart__dot"
                + (i === peak ? " is-peak" : "")
                + (i === hover ? " is-hover" : "")
              }
              style={{ left: pct(x), top: `${(y / VB_H) * 100}%` }}
            />
          ))}
        </div>

        {/* Nhãn trục y đặt bằng HTML, KHÔNG dùng <text> trong SVG: viewBox bị
            kéo giãn phi tuyến (preserveAspectRatio="none", 140 -> 70px) nên chữ
            trong SVG bị bóp dọc còn một nửa, các mốc chồng lên nhau. */}
        <div className="dh-chart__yaxis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={`y-${t}`} style={{ top: `${(yOf(t) / VB_H) * 100}%` }}>{t}</span>
          ))}
        </div>

        {/* Dải bắt hover: phủ TRÊN mọi lớp vẽ, mỗi ngày một dải chạy hết chiều
            cao nên không cần trỏ đúng vào chấm. */}
        <div className="dh-chart__hit">
          {values.map((_, i) => (
            <span
              key={`hit-${i}`}
              style={{ left: pct(bandEdge(i)), width: pct(bandEdge(i + 1) - bandEdge(i)) }}
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </div>

        {/* Tooltip: chỉ ngày + số hồ sơ. `role="status"` để trình đọc màn hình
            đọc lại khi đi bằng mũi trái/phải. */}
        {hover != null && (
          <div
            className="dh-chart__tip"
            data-align={tipAlign(hover)}
            /* Điểm nằm cao thì tooltip đặt phía DƯỚI, không thì nó trèo lên
               tiêu đề panel (vùng vẽ chỉ cao 100px). */
            data-flip={(yOf(values[hover]) / VB_H) * 100 < 42 ? "down" : "up"}
            style={{ left: pct(xOf(hover)), top: `${(yOf(values[hover]) / VB_H) * 100}%` }}
            role="status"
          >
            <span className="dh-chart__tip-day">{labels[hover]}</span>
            <strong className="dh-chart__tip-val">
              {t("dashboard.chart.tooltip.records", { n: values[hover] })}
            </strong>
          </div>
        )}
      </div>

      <div className="dh-chart__xaxis">
        {labels.map((l, i) => (
          <span
            key={l + i}
            className={
              (i === peak ? "is-active" : "")
              + (i === hover ? " is-hover" : "")
            }
            style={{ left: pct(xOf(i)) }}
          >
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

export default DashLineChart;
