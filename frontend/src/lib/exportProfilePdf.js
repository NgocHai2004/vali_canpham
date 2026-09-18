import jsPDF from "jspdf";
import html2canvas from "html2canvas";

function removeVietnameseDiacritics(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export function makePdfFileName(personalId, fullName) {
  const code = removeVietnameseDiacritics(personalId || "hoso")
    .replace(/[^A-Za-z0-9_-]+/g, "")
    .trim() || "hoso";
  const name = removeVietnameseDiacritics(fullName || "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim() || "khongten";
  return `${code}_${name}.pdf`;
}

async function nodeToCanvas(node) {
  if (!node) throw new Error("Element node is missing for PDF generation");
  return html2canvas(node, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });
}

// Vẽ một canvas lên trang PDF hiện tại.
// Nếu canvas xấp xỉ 1 trang A4 (dung sai do subpixel rendering) thì co vừa vặn 1 trang.
// Nếu canvas cao hơn hẳn thì cắt lát an toàn, tránh sinh lát cắt 0px gây lỗi jsPDF.scale.
function addCanvasToPdf(pdf, canvas) {
  if (!canvas || !canvas.width || !canvas.height) return 0;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const ratio = canvas.width / pageW;
  const imgH = canvas.height / ratio;

  // Nếu chiều cao xấp xỉ hoặc nhỏ hơn 1 trang A4 (cho phép dung sai đến 5% do độ phân giải hiển thị)
  if (imgH <= pageH * 1.05) {
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const fitH = Math.min(pageH, imgH);
    pdf.addImage(imgData, "JPEG", 0, 0, pageW, fitH);
    return 1;
  }

  // Nếu vượt quá hẳn 1 trang (tài liệu nhiều trang)
  const sliceHeightPx = pageH * ratio;
  let remainingPx = canvas.height;
  let srcY = 0;
  let pages = 0;

  while (remainingPx > 5) {
    const currentSliceH = Math.min(sliceHeightPx, remainingPx);
    if (currentSliceH <= 1) break;

    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = Math.max(1, Math.round(currentSliceH));

    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    ctx.drawImage(
      canvas,
      0, Math.round(srcY), canvas.width, sliceCanvas.height,
      0, 0, sliceCanvas.width, sliceCanvas.height,
    );

    const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.95);
    const sliceHmm = sliceCanvas.height / ratio;
    if (sliceHmm <= 0 || !Number.isFinite(sliceHmm)) break;

    if (pages > 0) pdf.addPage();
    pdf.addImage(sliceData, "JPEG", 0, 0, pageW, sliceHmm);

    srcY += currentSliceH;
    remainingPx -= currentSliceH;
    pages += 1;
  }
  return pages;
}

export async function buildProfilePdfBlob(node) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const canvas = await nodeToCanvas(node);
  addCanvasToPdf(pdf, canvas);
  return pdf.output("blob");
}

// Gộp nhiều tờ (Chỉ bản / Danh bản của danh sách can phạm) thành một PDF nhiều
// trang, mỗi node một trang. Dùng để in toàn bộ phiên khi phiên đã đóng.
export async function buildSheetsPdfBlob(nodes) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let pagesCount = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (!nodes[i]) continue;
    if (pagesCount > 0) pdf.addPage();
    const canvas = await nodeToCanvas(nodes[i]);
    const added = addCanvasToPdf(pdf, canvas);
    if (added > 0) pagesCount += added;
  }
  return pdf.output("blob");
}

export async function exportProfilePdf(node, { fileName }) {
  const blob = await buildProfilePdfBlob(node);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
