import React from "react";
import { Icon } from "../Icons";

/**
 * Thanh filter cho các màn danh sách: ô tìm kiếm + các select + nút submit.
 *
 * Là `<form>` thật nên Enter trong ô tìm kiếm cũng submit — không phải bắt
 * keydown bằng tay. Tìm kiếm chạy theo submit chứ không theo từng ký tự để
 * không bắn request mỗi lần gõ.
 *
 * @param value       Giá trị ô tìm kiếm
 * @param onChange    (text) => void
 * @param onSubmit    () => void — gọi khi bấm Enter hoặc nút submit
 * @param placeholder Placeholder ô tìm kiếm
 * @param submitLabel Nhãn nút submit
 * @param busy        Đang nạp dữ liệu → khoá nút submit
 * @param children    Các select phụ (buồng, giới tính…)
 */
export function DashFilterBar({
  value = "",
  onChange,
  onSubmit,
  placeholder = "",
  submitLabel,
  busy = false,
  children,
}) {
  const submit = (e) => {
    e.preventDefault();
    onSubmit?.();
  };

  // Không truyền `onChange` = màn không có tìm kiếm theo từ khoá (ví dụ Buồng
  // giam chỉ lọc bằng select) → không vẽ ô trống gây tưởng là hỏng.
  const hasSearch = typeof onChange === "function";

  return (
    <form className="dh-filter" onSubmit={submit} role="search">
      {hasSearch && (
      <label className="dh-filter__search">
        {/* svg toàn cục bị dashboard.css:12-19 ép 20x20 + fill:none — bọc trong
            span có kích thước riêng để icon không đè lên chữ. */}
        <span className="dh-filter__search-icon" aria-hidden="true">{Icon.search}</span>
        <input
          type="search"
          className="dh-filter__input"
          placeholder={placeholder}
          aria-label={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      )}

      {children}

      {submitLabel && (
        <button type="submit" className="dh-filter__submit" disabled={busy}>
          {submitLabel}
        </button>
      )}
    </form>
  );
}

/**
 * Select trong thanh filter. Khác `DashSelect` (dùng trên đầu panel, cỡ nhỏ) ở
 * chiều cao và viền — cùng chiều cao với ô tìm kiếm để thanh filter thẳng hàng.
 */
export function DashFilterSelect({ value, onChange, options, label }) {
  return (
    <label className="dh-filter__select">
      <span className="dh-filter__select-label">{label}</span>
      <select value={value} onChange={(e) => onChange?.(e.target.value)} aria-label={label}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/**
 * Ô filter tự do trong thanh filter — dùng cho control không phải `<select>`
 * (ví dụ `datetime-local` ở màn Nhật ký). Dùng lại đúng class của
 * `DashFilterSelect` để mọi ô trong thanh filter cùng chiều cao.
 */
export function DashFilterField({ label, children }) {
  return (
    <label className="dh-filter__select">
      <span className="dh-filter__select-label">{label}</span>
      {children}
    </label>
  );
}

export default DashFilterBar;
