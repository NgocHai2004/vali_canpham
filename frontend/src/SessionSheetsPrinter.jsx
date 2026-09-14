import { useEffect, useRef } from "react";
import { NameSheetPreviewContent } from "./capture/NameSheetPreview";
import { FpSheetPreviewContent } from "./capture/FpSheetPreview";

// In toàn bộ Chỉ bản (295) + Danh bản (204) của danh sách can phạm trong một
// phiên ĐÃ ĐÓNG.
//
// Cách in: render tất cả các tờ trong container .preview-backdrop (đúng pattern
// @media print của app — chỉ nội dung trong backdrop là visible khi in), chờ ảnh
// tải xong, rồi gọi window.print() để mở hộp thoại in trình duyệt. Không dùng
// window.open(blob) vì Electron chặn popup từ async context → không thấy gì.
//
// Overlay được giữ nguyên trong lúc hộp thoại in mở (window.print() không chặn),
// đóng lại khi sự kiện afterprint bắn ra — nếu không bắn thì đóng sau 30s.
//
// Mỗi can phạm đóng góp 2 tờ: Danh bản (204) rồi Chỉ bản (295). Dữ liệu thiếu
// thì để trống ô — không chặn in.
export default function SessionSheetsPrinter({ detainees, unitName = "", onDone }) {
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let finished = false;
    const finish = () => {
      if (finished || cancelled) return;
      finished = true;
      clearTimeout(forceClose);
      if (onDone) onDone();
    };

    // Chờ ảnh (nếu có) tải xong trước khi in, tối đa ~4s để không treo lâu.
    const imgs = containerRef.current ? Array.from(containerRef.current.querySelectorAll("img")) : [];
    const pending = imgs
      .filter((img) => img && !img.complete)
      .map((img) => new Promise((res) => {
        img.addEventListener("load", res, { once: true });
        img.addEventListener("error", res, { once: true });
      }));
    const fallback = setTimeout(() => { if (!cancelled) window.print(); }, 4000);
    // Lỡ afterprint không bắn (môi trường lạ) thì vẫn đóng overlay sau 30s.
    const forceClose = setTimeout(finish, 30000);

    window.addEventListener("afterprint", finish, { once: true });
    Promise.all(pending).then(() => {
      if (cancelled) return;
      clearTimeout(fallback);
      window.print();
    });

    return () => {
      cancelled = true;
      clearTimeout(fallback);
      clearTimeout(forceClose);
      window.removeEventListener("afterprint", finish);
    };
  }, [detainees]);

  return (
    <div ref={containerRef} className="preview-backdrop">
      <div className="preview-scroll">
        {detainees.map((d, i) => (
          <div key={i}>
            {/* Mỗi tờ một khung .sheet-page: khi in, khung này cao đúng bằng phần
                nhìn thấy của tờ và có break-after:page, nên 1 tờ = 1 trang giấy
                (xem @media print trong styles.css). Trên màn hình class này không
                có luật nào áp dụng. */}
            <div className="sheet-page">
              <NameSheetPreviewContent form={d} photos={d.photos || {}} unitName={unitName} />
            </div>
            <div className="sheet-page">
              <FpSheetPreviewContent form={d} photos={d.photos || {}} unitName={unitName} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}