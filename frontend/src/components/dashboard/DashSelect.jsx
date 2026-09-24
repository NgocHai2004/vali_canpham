import React from "react";
import { DashIcon } from "../Icons";

/**
 * Dropdown nhỏ trên thanh tiêu đề panel (mockup: "Hồ sơ mới", "Hôm nay").
 * Là <select> thật để bàn phím và trình đọc màn hình dùng được bình thường.
 */
export function DashSelect({ value, onChange, options, label }) {
  return (
    <span className="dh-select">
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span className="dh-select__chevron" aria-hidden="true">{DashIcon.chevronDown}</span>
    </span>
  );
}

export default DashSelect;
