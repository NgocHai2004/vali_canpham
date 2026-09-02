// Helper xử lý ảnh + chọn camera. Tách từ DataCapturePage.jsx, nội dung giữ nguyên.
import { apiT } from "../i18n";
import { PREFERRED_CAMERA_LABEL } from "./constants";

export async function cropPortraitFromCCCD(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error(apiT("capture.err.no_file")));
    r.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error(apiT("capture.err.bad_image")));
    i.src = dataUrl;
  });
  const targetRatio = (22.5 * 1024) / (55 * 596);
  const imgRatio = img.width / img.height;
  let cropW, cropH;
  if (imgRatio > targetRatio) {
    cropH = img.height;
    cropW = Math.round(cropH * targetRatio);
  } else {
    cropW = img.width;
    cropH = Math.round(cropW / targetRatio);
  }
  const cropX = Math.round((img.width - cropW) / 2);
  const cropY = Math.round((img.height - cropH) / 2);
  const outW = 300;
  const outH = Math.round(outW / targetRatio);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  return new File([blob], "portrait_from_cccd.jpg", { type: "image/jpeg" });
}

export async function resizeImageFile(file, maxW, maxH, mime = "image/jpeg", quality = 0.9) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error(apiT("capture.err.read_file")));
    r.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error(apiT("capture.err.bad_image")));
    i.src = dataUrl;
  });
  const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
  const ext = mime === "image/png" ? "png" : "jpg";
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + "." + ext, { type: mime });
}

export async function pickPreferredCamera() {
  if (!PREFERRED_CAMERA_LABEL) return null;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    const wanted = PREFERRED_CAMERA_LABEL.toLowerCase();
    const match = cams.find((c) => (c.label || "").toLowerCase().includes(wanted));
    return match ? match.deviceId : null;
  } catch {
    return null;
  }
}
