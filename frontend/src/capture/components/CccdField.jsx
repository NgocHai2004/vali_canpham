import { useRef } from "react";

export function CccdField({ value, onChange, className, ...rest }) {
  // Ô hiển thị thông tin trên ảnh CCCD, sửa tại chỗ. Click vào ô KHÔNG mở upload
  // (stopPropagation). onBlur mới ghi giá trị về form để tránh re-render mỗi ký tự.
  const ref = useRef(null);
  return (
    <div
      ref={ref}
      className={className}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => onChange(e.currentTarget.textContent)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
      }}
      {...rest}
    >
      {value}
    </div>
  );
}
