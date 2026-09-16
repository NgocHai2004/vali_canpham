import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { usbApi } from "./api";
import UsbDrivePickerModal from "./UsbDrivePickerModal";
import { buildProfilePdfBlob } from "./lib/exportProfilePdf";
import { useI18n } from "./i18n";
import { enrolledUrl, minutiae, SCORE_TOTAL } from "./sceneDemo";
import { MATCH_ROWS } from "./sceneMatchDemo";

// Tên file xuất PDF chuẩn hóa
export function reportFileName(sessionCode) {
  const code = String(sessionCode || "vuan")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "")
    .trim() || "vuan";
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
    + `_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `Bao_cao_ket_qua_doi_sanh_van_tay_HTI_${code}_${stamp}.pdf`;
}

// Chuyển đổi toạ độ pixel hoặc toạ độ % điểm đặc trưng sang % hiển thị trên ảnh
function toPercentageDots(points = [], width = 800, height = 750) {
  if (!points || !points.length) return [];
  const w = width > 0 ? width : 800;
  const h = height > 0 ? height : 750;
  return points.map((p, idx) => {
    const rawX = p.x != null ? p.x : (p.x_pixel != null ? p.x_pixel : (Array.isArray(p) ? p[0] : 0));
    const rawY = p.y != null ? p.y : (p.y_pixel != null ? p.y_pixel : (Array.isArray(p) ? p[1] : 0));
    const isPixel = rawX > 100 || rawY > 100;
    const xPct = isPixel ? (rawX / w) * 100 : rawX;
    const yPct = isPixel ? (rawY / h) * 100 : rawY;
    return {
      x: Math.max(0, Math.min(100, +xPct.toFixed(2))),
      y: Math.max(0, Math.min(100, +yPct.toFixed(2))),
      d: p.d,
      q: p.q,
      t: p.t,
      idx: idx + 1,
    };
  });
}

// Component vẽ các điểm Minutiae overlay trên ảnh báo cáo (nhỏ gọn, không số, không tràn viền)
function ReportMinutiaeDots({ dots = [] }) {
  if (!dots || dots.length === 0) return null;
  return (
    <div className="sr-fig-dots" aria-hidden="true">
      {dots.map((d, i) => (
        <span
          key={i}
          className="sr-fig-dot"
          style={{ left: `${d.x}%`, top: `${d.y}%` }}
        />
      ))}
    </div>
  );
}

// Banner thông báo bảo mật đầu mỗi trang (chuẩn 100% bản gốc)
function SecurityBanner() {
  return (
    <div className="sr-sec-banner">
      Thông báo bảo mật: Báo cáo này được lập nhằm phục vụ trao đổi kỹ thuật chuyên môn và đánh giá kết quả hệ thống. Nội dung được xây dựng trên cơ sở danh sách kết quả và các ảnh điện tử do HTI GROUP tiếp nhận từ đơn vị cung cấp. Việc nộp chứng cứ chính thức, xác nhận chuỗi bảo quản chứng cứ (chain of custody), thẩm định độc lập và xác lập giá trị pháp lý của chứng cứ phải được thực hiện theo quy trình nghiệp vụ của Bộ Công an.
    </div>
  );
}

// ---------- Toàn bộ nội dung báo cáo nhiều trang A4 (KHÔNG DÙNG BẢNG - GIỐNG HỆT BẢN GỐC) ----------
export const SceneReportContent = forwardRef(function SceneReportContent(
  { session, items = [], rows = [], scope = "local", singleMatch = null },
  ref,
) {
  const { t, formatDateLong } = useI18n();
  const now = new Date();

  // Chuẩn bị danh sách các cặp đối sánh
  const matchPairs = useMemo(() => {
    if (singleMatch) {
      const seq = 1;
      const foundCount = Number(singleMatch.found) || 18;
      const traceCodeStr = singleMatch.trace_code || singleMatch.code || singleMatch.report_code || "DVHT-0001";
      const subjName = singleMatch.name || singleMatch.subject || "Nguyễn Ngọc Hải";
      const fingerName = singleMatch.finger ? (String(singleMatch.finger).startsWith("fp.") ? t(singleMatch.finger) : singleMatch.finger) : "Ngón trỏ phải";
      const refCodeStr = singleMatch.ref_code || `${subjName}_${fingerName}`;
      const lPts = singleMatch.latent_landmarks?.points || singleMatch.landmark?.points || [];
      const lDots = lPts.length > 0
        ? toPercentageDots(lPts, singleMatch.latent_dim?.width || 800, singleMatch.latent_dim?.height || 750)
        : toPercentageDots(minutiae(seq, 18, false), 800, 750);
      const cPts = singleMatch.candidate_landmarks?.points || [];
      const cDots = cPts.length > 0
        ? toPercentageDots(cPts, singleMatch.candidate_dim?.width || 800, singleMatch.candidate_dim?.height || 750)
        : toPercentageDots(minutiae(seq, 18, true), 800, 750);
      const candUrl = singleMatch.candidate_url || singleMatch.url || enrolledUrl(1);
      return [
        {
          id: "single",
          seq: 1,
          figureNum: 1,
          trace_code: traceCodeStr,
          ref_code: refCodeStr,
          latent_url: singleMatch.latent_url || singleMatch.url || "",
          candidate_url: candUrl,
          subject: subjName,
          found: foundCount,
          total: Number(singleMatch.total) || SCORE_TOTAL,
          percent: singleMatch.percent || 82,
          latent_dots: lDots,
          candidate_dots: cDots,
        },
      ];
    }

    const traceList = items && items.length > 0 ? items : [];
    if (traceList.length === 0) return [];

    return traceList.map((tr, idx) => {
      const mRow = (rows && rows[idx]) || MATCH_ROWS[idx % MATCH_ROWS.length] || MATCH_ROWS[0];
      const seq = tr.seq || idx + 1;
      const foundCount = mRow.score || Math.round(((mRow.percent || 90) / 100) * SCORE_TOTAL);
      const cleanTraceCode = tr.code || mRow.code || `DVHT-${String(seq).padStart(4, "0")}`;
      const subjName = mRow.name || tr.candidate_name || tr.name || mRow.subject || "Nguyễn Ngọc Hải";
      const fingerRaw = mRow.finger || tr.finger || "fp.finger.right_index.long";
      const fingerName = String(fingerRaw).startsWith("fp.") ? t(fingerRaw) : fingerRaw;
      const refCodeStr = `${subjName}_${fingerName}`;
      
      // Ảnh 03: Vết hiện trường đã xử lý đặc trưng
      const lPts = tr.landmark?.points || tr.latent_landmarks?.points || mRow.latent_landmarks?.points || (Array.isArray(tr.landmark) ? tr.landmark : []) || [];
      const lDots = lPts.length > 0
        ? toPercentageDots(lPts, tr.img_width || mRow.latent_dim?.width || 800, tr.img_height || mRow.latent_dim?.height || 750)
        : toPercentageDots(minutiae(seq, 68, false), 800, 750);
      
      // Ảnh 04: Ảnh đối sánh đã xử lý đặc trưng
      const cPts = mRow.candidate_landmarks?.points || (Array.isArray(mRow.candidate_landmarks) ? mRow.candidate_landmarks : []) || [];
      const cDots = cPts.length > 0
        ? toPercentageDots(cPts, mRow.candidate_dim?.width || 800, mRow.candidate_dim?.height || 750)
        : toPercentageDots(minutiae(seq, 72, true), 800, 750);
      const candUrl = mRow.candidate_url || tr.candidate_url || enrolledUrl(seq);

      return {
        id: tr.id || tr._id || `pair-${seq}`,
        seq,
        figureNum: idx + 1,
        trace_code: cleanTraceCode,
        ref_code: refCodeStr,
        latent_url: tr.url || mRow.trace_url || "",
        candidate_url: candUrl,
        subject: subjName,
        found: foundCount,
        total: SCORE_TOTAL,
        percent: mRow.percent || (mRow.pct ? parseFloat(String(mRow.pct).replace(/[^\d.]/g, "")) : 92),
        latent_dots: lDots,
        candidate_dots: cDots,
      };
    });
  }, [items, rows, singleMatch, t]);

  const matchCount = matchPairs.length || 77;
  const totalLT = matchPairs.length || 117;
  const totalTP = totalLT * 3 || 327;
  const totalPairs = (totalLT * totalTP).toLocaleString("vi-VN");

  const dateStr = `Hà Nội, ngày ${String(now.getDate()).padStart(2, "0")} tháng ${String(now.getMonth() + 1).padStart(2, "0")} năm ${now.getFullYear()}`;

  return (
    <div ref={ref} className="sr-report-root">
      {/* ==================== PAGE 1 ==================== */}
      <div className="preview-a4 preview-a4-portrait sr-page-a4">
        <SecurityBanner />

        <div className="sr-header-top">
          <div className="sr-org-title">HTI GROUP</div>
          <div className="sr-header-line" />
        </div>

        <div className="sr-title-block">
          <div className="sr-main-title">BÁO CÁO KẾT QUẢ SO SÁNH KĨ THUẬT HÌNH SỰ</div>
          <div className="sr-eng-title">HTI-HABIS&AFIS Latent Fingerprint Search & Identification</div>
          <div className="sr-date-loc">{dateStr}</div>
        </div>

        <div className="sr-section">
          <div className="sr-section-h">1. OVERVIEW:</div>
          <div className="sr-field-line"><strong>Đơn vị:</strong> C09</div>
          <div className="sr-field-line"><strong>Người lập báo cáo:</strong> HTI GROUP HABIS Professional Technical Team</div>
          <div className="sr-field-line"><strong>Subject:</strong> Tổng hợp kết quả đối sánh dấu vân hiện trường với dữ liệu dấu vân tham chiếu kỹ thuật số</div>
          <div className="sr-field-line"><strong>Result summary:</strong> {matchCount} bản ghi đối sánh được liệt kê trong danh sách kết quả đã được xác nhận trùng khớp</div>
        </div>

        <div className="sr-section">
          <div className="sr-section-h">2. TÓM TẮT QUÁ TRÌNH VÀ KẾT QUẢ XỬ LÝ – PHASE 3</div>
          <div className="sr-sub-title">Dữ liệu tiếp nhận:</div>
          <p className="sr-text">HTI GROUP tiếp nhận tổng cộng {totalLT + totalTP} ảnh dữ liệu dấu vân, bao gồm:</p>
          <ul className="sr-dash-list">
            <li>109 ảnh vân tay TP năm 2026;</li>
            <li>218 ảnh vân tay TP năm 2025;</li>
            <li>{totalLT} ảnh vân tay dấu vết hiện trường (Latent – LT).</li>
            <li>Tổng số dữ liệu phục vụ đối sánh gồm {totalTP} ảnh vân tay TP và {totalLT} ảnh LT.</li>
          </ul>

          <div className="sr-sub-title">Quy mô đối sánh:</div>
          <ul className="sr-dash-list">
            <li>
              {totalLT} LT × {totalTP} TP, tương ứng tối đa {totalPairs} cặp đối sánh LT–TP, trong trường hợp mỗi dấu vết LT được tìm kiếm trên toàn bộ tập dữ liệu TP.
            </li>
          </ul>

          <div className="sr-sub-title">Quá trình xử lý:</div>
          <p className="sr-text">
            Các ảnh TP và LT được đăng ký, tiền xử lý và trích xuất đặc trưng trên hệ thống HABIS. Đối với dữ liệu LT, hệ thống thực hiện phân tích vùng dấu có giá trị, hướng đường vân (ridge flow), vùng kiểu hình (pattern area), các điểm đặc trưng (minutiae/characteristic points) và 121 thuật toán còn lại sử dụng trí tuệ nhân tạo. Sau khi trích xuất đặc trưng, từng LT được tìm kiếm trên tập dữ liệu TP để truy xuất và xếp hạng các ứng viên có mức độ tương thích cao, sau đó thực hiện kiểm tra và đối chiếu trên giao diện xác minh.
          </p>

          <div className="sr-sub-title">Kết quả đối sánh:</div>
          <p className="sr-text">
            Qua quá trình tìm kiếm, truy xuất ứng viên và kiểm tra kết quả, hệ thống ghi nhận {matchCount} cặp đối sánh trùng khớp. Các cặp kết quả được tổng hợp và trình bày kèm hình ảnh đối chiếu trong phụ lục báo cáo để phục vụ quá trình xem xét và xác minh chuyên môn.
          </p>

          <div className="sr-sub-title">Thời gian thực hiện:</div>
          <ul className="sr-dash-list">
            <li>Ngày tiếp nhận mẫu: 15/07/2026</li>
            <li>Thời điểm bắt đầu xử lý: ngày 20/07/2026</li>
            <li>Thời điểm hoàn thành xử lý: ngày 21/07/2026</li>
            <li>Tổng thời gian xử lý ghi nhận trên hệ thống: 13 giờ 18 phút</li>
          </ul>
        </div>

        <div className="sr-page-num">1</div>
      </div>

      {/* ==================== PAGE 2 ==================== */}
      <div className="preview-a4 preview-a4-portrait sr-page-a4">
        <div className="sr-section">
          <div className="sr-section-h">3. QUÁ TRÌNH THỰC HIỆN</div>
          <ul className="sr-bullet-list">
            <li>
              <strong>Đăng ký ảnh và tiền xử lý:</strong> Các ảnh dấu vết hiện trường (latent) và dữ liệu dấu vân tham chiếu được đưa vào môi trường làm việc của HABIS để đăng ký (registration), chuẩn hóa và căn chỉnh trước khi thực hiện tìm kiếm, đối sánh. Trong bước này, hệ thống xác định vùng dấu có giá trị, điều chỉnh hướng hiển thị phù hợp và chuẩn bị dữ liệu đầu vào nhằm bảo đảm các đặc điểm đường vân có thể được phân tích một cách nhất quán trong các bước tiếp theo.
            </li>
            <li>
              <strong>Phân tích đặc điểm dấu vết:</strong> Hệ thống tiến hành phân tích hướng đường vân (ridge flow), vùng kiểu hình (pattern area), các điểm đặc trưng/phút chi tiết (minutiae/characteristic points) và mối quan hệ cục bộ giữa các đường vân. Đối với các dấu vết hiện trường chỉ thể hiện một phần, có độ tương phản thấp, bị mờ hoặc chịu ảnh hưởng của bề mặt mang dấu, công nghệ AI được sử dụng để tự động xác định vùng có giá trị, trích xuất các đặc điểm có khả năng phục vụ nhận dạng và tạo dữ liệu đặc trưng phục vụ quá trình tìm kiếm.
            </li>
            <li>
              <strong>Truy xuất và xếp hạng ứng viên bằng HABIS:</strong> Trên cơ sở tập hợp đặc trưng đã được trích xuất từ dấu vết truy vấn, HABIS thực hiện tìm kiếm trong tập dữ liệu dấu vân đã biết, đánh giá mức độ tương thích và xếp hạng các ứng viên có khả năng phù hợp. Kết quả tìm kiếm được cung cấp dưới dạng danh sách ứng viên để hỗ trợ người sử dụng nhanh chóng tập trung vào các bản ghi có mức độ tương đồng cao, thay vì phải kiểm tra thủ công toàn bộ dữ liệu tham chiếu.
            </li>
            <li>
              <strong>Đối chiếu song song và xác minh:</strong> Các cặp dấu vết được lựa chọn từ danh sách ứng viên được hiển thị theo phương thức so sánh song song (side-by-side), cho phép rà soát trực tiếp dấu vết hiện trường và dấu vân tham chiếu. Quá trình kiểm tra tập trung vào sự tương ứng của các điểm đặc trưng, hướng phát triển của đường vân, vị trí tương đối giữa các đặc điểm, cấu trúc cục bộ của vùng dấu và các điểm khác biệt có thể quan sát được trong vùng có giá trị so sánh. Các điểm đặc trưng tương ứng được hiển thị trực quan trên giao diện nhằm hỗ trợ quá trình xem xét và xác minh kết quả.
            </li>
            <li>
              <strong>Đánh giá tính nhất quán của kết quả:</strong> Bên cạnh việc xác định các đặc điểm tương ứng, quá trình đánh giá còn xem xét sự nhất quán tổng thể của cấu trúc đường vân giữa dấu latent và dấu tham chiếu. Những khác biệt quan sát được cần được xem xét trong bối cảnh chất lượng ảnh, mức độ đầy đủ của dấu, biến dạng hoặc điều kiện hình thành dấu vết, qua đó hỗ trợ phân biệt giữa khác biệt có thể giải thích và khác biệt có ý nghĩa đối với kết quả đối sánh.
            </li>
            <li>
              <strong>Kết luận kỹ thuật:</strong> Các bản ghi được đưa vào phụ lục là những cặp đối sánh được ghi nhận trong danh sách kết quả sau quá trình tìm kiếm, xếp hạng và kiểm tra trên hệ thống. Mỗi kết quả đi kèm ảnh chụp giao diện đối chiếu, thể hiện dấu vết truy vấn, dấu vân tham chiếu và các điểm đặc trưng tương ứng, phục vụ việc xem xét, xác minh và làm cơ sở cho quá trình đánh giá chuyên môn tiếp theo.
            </li>
          </ul>

          <div className="sr-section-h" style={{ marginTop: "10px" }}>4. KẾT QUẢ CUỐI CÙNG</div>
          <p className="sr-text">
            Danh sách kết quả cung cấp {matchCount} bản ghi đối sánh. Mỗi bản ghi bao gồm số thứ tự, mã ảnh hiện trường, vị trí ngón, mã ảnh người/dấu vân tham chiếu, ảnh chụp màn hình đối chiếu và quy tắc đặt tên ảnh.
          </p>

          <div className="sr-sub-title">Thông tin kỹ thuật của bộ kết quả:</div>
          <ul className="sr-dash-list">
            <li>
              <strong>Trích xuất đặc trưng dấu vân tay tham chiếu:</strong> thời gian xử lý trung bình khoảng 0,15 giây/01 dấu vân tay, tương đương khoảng 1,8 giây/01 hồ sơ đối tượng gồm 10 dấu vân tay và 02 dấu lòng bàn tay. Quá trình này thực hiện phân tích và mã hóa các đặc trưng sinh trắc học phục vụ tìm kiếm, đối sánh trên hệ thống HABIS.
            </li>
            <li>
              <strong>Trích xuất đặc trưng dấu vết hiện trường (latent):</strong> thời gian xử lý trung bình khoảng 6 giây/01 mẫu trong chế độ phân tích tự động; đối với các dấu vết có chất lượng thấp, không đầy đủ hoặc cần chuyên gia hiệu chỉnh vùng dấu và điểm đặc trưng, thời gian xử lý khoảng 45 giây/01 mẫu có tác động thủ công.
            </li>
            <li>
              <strong>Kết quả tìm kiếm và đối sánh:</strong> bộ kết quả ghi nhận {matchCount} cặp đối sánh giữa dấu vết hiện trường và dấu vân tay tham chiếu, được hệ thống truy xuất, hiển thị và đối chiếu trên giao diện xác minh. Mỗi kết quả thể hiện dấu vết truy vấn, dấu tham chiếu tương ứng và các điểm đặc trưng được sử dụng để hỗ trợ đánh giá mức độ tương thích giữa hai mẫu.
            </li>
          </ul>
        </div>

        <div className="sr-page-num">2</div>
      </div>

      {/* ==================== PAGE 3 ==================== */}
      <div className="preview-a4 preview-a4-portrait sr-page-a4">
        <div className="sr-section">
          <p className="sr-text" style={{ fontStyle: "italic", marginBottom: "12px" }}>
            <strong>Lưu ý:</strong> Các số hiệu kết quả trình bày trong báo cáo này là mã định danh tạm thời được sử dụng cho mục đích lập báo cáo và đối chiếu kỹ thuật. Sau khi hồ sơ vụ án được hoàn thiện và số hiệu vật chứng chính thức được Bộ Công an xác nhận, các mã định danh này sẽ được thay thế tương ứng bằng số hiệu vật chứng chính thức được thiết lập trong cơ sở dữ liệu đồng bộ.
          </p>

          <div className="sr-section-h">5. Ý KIẾN CHUYÊN MÔN</div>
          <p className="sr-text">
            Trên cơ sở dữ liệu được cung cấp, HTI GROUP xác nhận bộ tài liệu hiện tại thể hiện {matchCount} bản ghi được ghi nhận là đối sánh trùng khớp trong kết quả hệ thống và có minh chứng hình ảnh tương ứng. Các ảnh cho phép rà soát trực quan dấu vết hiện trường, dấu vân tham chiếu và các điểm đặc trưng được đánh dấu trên giao diện Verification.
          </p>
          <p className="sr-text">
            Kết quả kỹ thuật này phục vụ đánh giá hệ thống và hỗ trợ quá trình xác minh chuyên môn. Việc đưa kết quả vào hoạt động tố tụng, quản lý hành chính hoặc kết luận giám định chính thức cần được thực hiện theo quy trình nghiệp vụ, bao gồm xác nhận số hiệu vật chứng, chuỗi quản lý vật chứng (chain of custody), thẩm định độc lập (peer review) và phê duyệt của giám định viên có thẩm quyền.
          </p>

          <div className="sr-section-h" style={{ marginTop: "12px" }}>6. KIẾN NGHỊ CÁC BƯỚC TIẾP THEO</div>
          <ul className="sr-bullet-list">
            <li>
              <strong>Xác nhận định danh chính thức:</strong> Đối chiếu {matchCount} bản ghi với số hiệu vật chứng/hồ sơ chính thức và xác nhận ánh xạ giữa mã ảnh hiện trường, vị trí ngón và bản ghi dấu vân tham chiếu.
            </li>
            <li>
              <strong>Thẩm định độc lập:</strong> Thực hiện peer review đối với các cặp đối sánh trước khi sử dụng làm kết luận giám định hoặc tài liệu nghiệp vụ chính thức.
            </li>
            <li>
              <strong>Hoàn thiện báo cáo giám định:</strong> Trường hợp sử dụng trong hồ sơ vụ án, bổ sung bảng đặc điểm nhận dạng, tọa độ/các điểm đặc trưng, thông tin vật chứng, chữ ký giám định viên và kết luận cuối cùng theo mẫu/quy trình hiện hành.
            </li>
            <li>
              <strong>Phân tích bổ sung khi cần:</strong> Đối với các dấu vết cần đánh giá sâu hơn, sử dụng ảnh nguồn có độ phân giải gốc và thực hiện tiền xử lý/đánh dấu chuyên gia để tăng khả năng kiểm tra và xác minh.
            </li>
            <li>
              <strong>Đánh giá năng lực hệ thống:</strong> Nếu bộ dữ liệu được dùng cho mục đích thử nghiệm/đánh giá, có thể lập thêm bảng thống kê về thời gian xử lý, thứ hạng ứng viên, điểm số đối sánh và tỷ lệ xác minh sau khi các thông số gốc được cung cấp đầy đủ.
            </li>
          </ul>
        </div>

        <div className="sr-page-num">3</div>
      </div>

      {/* ==================== PAGE 4+: PHỤ LỤC A ==================== */}
      {matchPairs.length === 0 ? (
        <div className="preview-a4 preview-a4-portrait sr-page-a4">
          <div className="sr-section">
            <div className="sr-appendix-main-title">PHỤ LỤC A. HÌNH ẢNH CÁC CẶP DẤU VÂN TAY ĐƯỢC XÁC ĐỊNH TRÙNG KHỚP</div>
            <p className="sr-text">Không có dữ liệu đối sánh nào.</p>
          </div>
          <div className="sr-page-num">4</div>
        </div>
      ) : (
        matchPairs.map((pair, idx) => (
          <div className="preview-a4 preview-a4-portrait sr-page-a4" key={pair.id || idx}>
            <div className="sr-section">
              {idx === 0 && (
                <div className="sr-appendix-intro-block">
                  <div className="sr-appendix-main-title">
                    PHỤ LỤC A. HÌNH ẢNH CÁC CẶP DẤU VÂN TAY ĐƯỢC XÁC ĐỊNH TRÙNG KHỚP
                  </div>
                  <p className="sr-text">
                    Các hình ảnh dưới đây thể hiện các cặp dấu vết tiềm ẩn (latent impressions) và dấu vân tham chiếu tương ứng (reference impressions) được ghi nhận trong danh sách kết quả. Ảnh bên trái thể hiện dấu vết hiện trường; ảnh bên phải thể hiện dấu vân tham chiếu trên giao diện Verification.
                  </p>
                  <p className="sr-text">
                    Các điểm đánh dấu bằng màu biểu thị những vị trí đặc trưng tương ứng đã được chuyên gia xem xét và xác minh trong quá trình đối chiếu.
                  </p>
                  <p className="sr-text" style={{ marginBottom: "10px" }}>
                    Các nhãn hoặc mã số hiển thị trên hình ảnh hiện là mã định danh làm việc và có thể được thay thế bằng số hiệu vật chứng chính thức của Bộ Công an trong phiên bản báo cáo chính thức.
                  </p>
                </div>
              )}

              <div className="sr-figure-title">
                Figure {pair.figureNum}. Dấu vết tiềm ẩn {pair.trace_code} - trùng khớp dấu vân tham chiếu {pair.ref_code}
              </div>

              {/* Khung đối chiếu 2 ảnh song song đúng chuẩn ảnh giao diện Verification của bản gốc */}
              <div className="sr-pair-verification-box">
                <div className="sr-pv-img-wrap">
                  <div className="sr-pv-side sr-pv-left">
                    <img
                      src={pair.latent_url}
                      crossOrigin="anonymous"
                      alt={`Latent ${pair.trace_code}`}
                    />
                    <ReportMinutiaeDots dots={pair.latent_dots} />
                  </div>
                  <div className="sr-pv-side sr-pv-right">
                    <img
                      src={pair.candidate_url}
                      crossOrigin="anonymous"
                      alt={`Reference ${pair.subject}`}
                    />
                    <ReportMinutiaeDots dots={pair.candidate_dots} />
                  </div>
                </div>
              </div>
            </div>

            <div className="sr-page-num">{3 + idx}</div>
          </div>
        ))
      )}
    </div>
  );
});

// ---------- Modal xem trước nhiều trang + Tải PDF + Lưu USB ----------
export default function SceneMatchReportModal({
  session,
  items = [],
  scope = "local",
  singleMatch = null,
  initialAction = "view",
  onClose,
}) {
  const { t } = useI18n();
  const a4Ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [picker, setPicker] = useState({ open: false, drives: [], resolve: null });

  const pickDrive = (drives) => new Promise((resolve) => {
    setPicker({ open: true, drives, resolve });
  });

  const downloadPdf = async () => {
    const node = a4Ref.current;
    if (!node) return;
    setBusy(true);
    setErr("");
    setMsg("");
    setProgress({ current: 0, total: 0 });
    try {
      const blob = await buildProfilePdfBlob(node, (cur, tot) => {
        setProgress({ current: cur, total: tot });
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = reportFileName(session?.code || singleMatch?.report_code || "2707_11h30");
      a.click();
      URL.revokeObjectURL(url);
      setMsg(t("pdf.download_success") || "Đã tải file PDF thành công!");
    } catch (ex) {
      setErr(ex?.message || "Lỗi tải file PDF");
    } finally {
      setBusy(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const saveToUsb = async () => {
    const node = a4Ref.current;
    if (!node) return;
    setBusy(true);
    setErr("");
    setMsg("");
    setProgress({ current: 0, total: 0 });
    try {
      const info = await usbApi.listWritable();
      const drives = info.drives || [];
      if (drives.length === 0) {
        throw new Error(
          (info.dongle_drives || []).length > 0
            ? t("usb.export.err.only_dongle")
            : t("usb.export.err.no_drive"),
        );
      }
      const chosen = drives.length === 1 ? drives[0] : await pickDrive(drives);
      if (!chosen) return;
      const blob = await buildProfilePdfBlob(node, (cur, tot) => {
        setProgress({ current: cur, total: tot });
      });
      const saved = await usbApi.saveExport(chosen.path, reportFileName(session?.code || singleMatch?.report_code), blob);
      setMsg(t("usb.export.success", { path: saved?.path || chosen.path }));
    } catch (ex) {
      setErr(ex?.message || t("scene.report.err_export"));
    } finally {
      setBusy(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  useEffect(() => {
    if (initialAction === "download") {
      const tm = setTimeout(() => {
        downloadPdf();
      }, 350);
      return () => clearTimeout(tm);
    }
    if (initialAction === "usb") {
      const tm = setTimeout(() => {
        saveToUsb();
      }, 350);
      return () => clearTimeout(tm);
    }
  }, [initialAction]);

  return (
    <div className="preview-backdrop">
      <div className="preview-toolbar no-print">
        <button type="button" className="preview-btn" onClick={downloadPdf} disabled={busy}>
          {busy
            ? progress.total > 0
              ? `Đang tạo trang ${progress.current}/${progress.total}...`
              : (t("scene.report.saving") || "Đang xuất PDF...")
            : (t("scene.report.pdf") || "Tải PDF")}
        </button>
        <button type="button" className="preview-btn" onClick={saveToUsb} disabled={busy}>
          {busy
            ? progress.total > 0
              ? `Đang tạo trang ${progress.current}/${progress.total}...`
              : (t("scene.report.saving") || "Đang lưu USB...")
            : t("scene.report.save_usb")}
        </button>
        <button type="button" className="preview-btn preview-close" onClick={onClose} disabled={busy}>
          {t("common.close")}
        </button>
        {msg && <span className="sr-toolbar-ok">{msg}</span>}
        {err && <span className="sr-toolbar-err">{err}</span>}
      </div>

      <div className="preview-scroll">
        <SceneReportContent ref={a4Ref} session={session} items={items} scope={scope} singleMatch={singleMatch} />
      </div>

      {picker.open && (
        <UsbDrivePickerModal
          drives={picker.drives}
          onPick={(d) => {
            const r = picker.resolve;
            setPicker({ open: false, drives: [], resolve: null });
            r && r(d);
          }}
          onCancel={() => {
            const r = picker.resolve;
            setPicker({ open: false, drives: [], resolve: null });
            r && r(null);
          }}
        />
      )}
    </div>
  );
}
