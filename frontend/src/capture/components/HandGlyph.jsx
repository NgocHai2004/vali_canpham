import { HAND_FINGERS } from "../constants";

export function HandGlyph({ side = "left", active = [], blink = [], className = "" }) {
  const cls = (n) =>
    "hg-finger" + (active.includes(n) ? " on" : "") + (blink.includes(n) ? " blink" : "");
  const lit = { fill: "currentColor", fillOpacity: 0.9, stroke: "currentColor" };
  const dim = { fill: "none", fillOpacity: 0, stroke: "currentColor", strokeOpacity: 0.75 };
  const skin = (n) => (active.includes(n) ? lit : dim);
  return (
    <svg
      className={"hand-glyph " + className}
      /* viewBox bo sat hinh (x 2->39, y 7->45; da tinh ca ngon cai xoay 38do
         va nua do day vien). Cu la "0 0 40 48" => ti le 0.83, cao thua nhieu
         cho trong nen hinh bi co lai. Gio ti le ~0.97 (gan vuong) => cung 1
         khung render, hinh to hon ro ret. */
      viewBox="2 7 37 38"
      aria-hidden="true"
      style={side === "right" ? { transform: "scaleX(-1)" } : undefined}
    >
      <g strokeWidth="1.6" strokeLinejoin="round">
        {/* long ban tay */}
        <rect className="hg-palm" x="3" y="27" width="28" height="17" rx="5" {...dim} />
        {/* 4 ngon */}
        {HAND_FINGERS.map((f) => (
          <rect
            key={f.name}
            className={cls(f.name)}
            x={f.x}
            y={f.y}
            width="5.5"
            height={31 - f.y}
            rx="2.7"
            {...skin(f.name)}
          />
        ))}
        {/* ngon cai — nghieng ra phia ngoai long ban tay */}
        <rect
          className={cls("thumb")}
          x="29"
          y="26"
          width="5.5"
          height="14"
          rx="2.7"
          transform="rotate(38 31.7 33)"
          {...skin("thumb")}
        />
      </g>
    </svg>
  );
}
