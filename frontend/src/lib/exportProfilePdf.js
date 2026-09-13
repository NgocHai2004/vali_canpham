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
  return html2canvas(node, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
  });
}

// Vẽ một canvas lên trang PDF hiện tại. Nếu canvas cao hơn một trang A4 thì cắt
// thành nhiều trang (dùng cho node cao bất thường). Trả về số trang đã dùng.
function addCanvasToPdf(pdf, canvas) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pageW) / canvas.width;
  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  if (imgH <= pageH) {
    pdf.addImage(imgData, "JPEG", 0, 0, pageW, imgH);
    return 1;
  }
  let remaining = imgH;
  let y = 0;
  let pages = 0;
  const ratio = canvas.width / pageW;
  const sliceHeightPx = pageH * ratio;
  while (remaining > 0) {
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = Math.min(sliceHeightPx, canvas.height - y * ratio);
    const ctx = sliceCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    ctx.drawImage(
      canvas,
      0, y * ratio, canvas.width, sliceCanvas.height,
      0, 0, canvas.width, sliceCanvas.height,
    );
    const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.95);
    const sliceHmm = sliceCanvas.height / ratio;
    if (y > 0) pdf.addPage();
    pdf.addImage(sliceData, "JPEG", 0, 0, pageW, sliceHmm);
    y += pageH;
    remaining -= pageH;
    pages += 1;
  }
  return pages;
}

export async function buildProfilePdfBlob(node) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  addCanvasToPdf(pdf, await nodeToCanvas(node));
  return pdf.output("blob");
}

// Gộp nhiều tờ (Chỉ bản / Danh bản của danh sách can phạm) thành một PDF nhiều
// trang, mỗi node một trang. Dùng để in toàn bộ phiên khi phiên đã đóng.
export async function buildSheetsPdfBlob(nodes) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  for (let i = 0; i < nodes.length; i++) {
    if (i > 0) pdf.addPage();
    addCanvasToPdf(pdf, await nodeToCanvas(nodes[i]));
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
