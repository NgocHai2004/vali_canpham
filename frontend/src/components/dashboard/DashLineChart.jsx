import React from "react";

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
  yMax = 20,
  ticks = [20, 15, 10, 5, 0],
  highlightIndex,
}) {
  const VB_W = 650;
  const VB_H = 140;
  const X0 = 30;      // mép trái vùng vẽ
  const X1 = 630;     // mép phải vùng vẽ
  const Y_TOP = 12;   // y của yMax
  const Y_BASE = 128; // y của 0

  const n = values.length;
  if (!n) return <div className="dh-empty">—</div>;

  const xOf = (i) => (n === 1 ? X0 : X0 + (i * (X1 - X0)) / (n - 1));
  const yOf = (v) => Y_BASE - (Math.max(0, Math.min(v, yMax)) / yMax) * (Y_BASE - Y_TOP);

  const points = values.map((v, i) => [xOf(i), yOf(v)]);
  const line = points.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L ${X1},${Y_BASE} L ${X0},${Y_BASE} Z`;

  const peak = highlightIndex != null
    ? highlightIndex
    : values.reduce((best, v, i) => (v > values[best] ? i : best), 0);

  return (
    <div className="dh-chart">
      <div className="dh-chart__plot">
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
        </svg>

        {/* Chấm dữ liệu cũng là HTML: <circle> trong SVG bị kéo giãn thành hình
            ellipse (scale x .94 / y .5) nên không còn là chấm tròn. */}
        <div className="dh-chart__points" aria-hidden="true">
          {points.map(([x, y], i) => (
            <span
              key={`pt-${i}`}
              className={"dh-chart__dot" + (i === peak ? " is-peak" : "")}
              style={{ left: `${(x / VB_W) * 100}%`, top: `${(y / VB_H) * 100}%` }}
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
      </div>

      <div className="dh-chart__xaxis">
        {labels.map((l, i) => (
          <span
            key={l + i}
            className={i === peak ? "is-active" : undefined}
            style={{ left: `${(xOf(i) / VB_W) * 100}%` }}
          >
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

export default DashLineChart;
