import React from "react";

/**
 * Tiêu đề trang cho các màn dạng danh sách.
 *
 * Bản `dh-*` của `PageHeader` trong `components/CommonUI.jsx`: cùng cấu trúc
 * (tiêu đề + phụ đề + slot hành động) nhưng ăn theo token `--dh-*` nên đổi tông
 * cùng dashboard khi bấm nút sáng/tối.
 *
 * @param title    Tiêu đề trang
 * @param subtitle Dòng phụ — thường là tổng số bản ghi
 * @param children Node hiển thị ở mép phải (nút Thêm, Xuất file…)
 */
export function DashPageHeader({ title, subtitle, children }) {
  return (
    <div className="dh-page-head">
      <div className="dh-page-head__text">
        <h1 className="dh-page-head__title">{title}</h1>
        {subtitle && <p className="dh-page-head__sub">{subtitle}</p>}
      </div>
      {children && <div className="dh-page-head__actions">{children}</div>}
    </div>
  );
}

export default DashPageHeader;
