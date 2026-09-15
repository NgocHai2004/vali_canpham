import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";

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
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    })
  );

  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    throw new Error("Không thể tạo hình ảnh từ tài liệu (kích thước bằng 0)");
  }

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pageW) / canvas.width;

  if (!isFinite(imgH) || imgH <= 0) {
    throw new Error("Kích thước trang PDF không hợp lệ");
  }

  if (imgH <= pageH) {
    pdf.addImage(imgData, "JPEG", 0, 0, pageW, imgH);
  } else {
    let remaining = imgH;
    let y = 0;
    const ratio = canvas.width / pageW;
    const sliceHeightPx = pageH * ratio;

    while (remaining > 1) {
      const currentSliceH = Math.min(sliceHeightPx, canvas.height - y * ratio);
      if (currentSliceH <= 0.5) break;

      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = Math.round(currentSliceH);
      const ctx = sliceCanvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0, y * ratio, canvas.width, currentSliceH,
        0, 0, canvas.width, currentSliceH,
      );

      const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.95);
      const sliceHmm = currentSliceH / ratio;

      if (!isFinite(sliceHmm) || sliceHmm <= 0.5) break;

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
