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

export async function buildProfilePdfBlob(node) {
  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
  });
  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pageW) / canvas.width;
  if (imgH <= pageH) {
    pdf.addImage(imgData, "JPEG", 0, 0, pageW, imgH);
  } else {
    let remaining = imgH;
    let y = 0;
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
    }
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
