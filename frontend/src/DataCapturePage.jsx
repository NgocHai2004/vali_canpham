import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, fpApi, cccdApi, b64PngToFile, weightApi, usbApi } from "./api";
import { notify } from "./notifications";
import { toast } from "./Toast";
import cccdTemplateBg from "./assets/cccd-template.png";
import cccdBackTemplateBg from "./assets/cccd-back-template.jpg";
import { useI18n, apiT } from "./i18n";
import { buildProfilePdfBlob, makePdfFileName } from "./lib/exportProfilePdf";
import UsbDrivePickerModal from "./UsbDrivePickerModal";
import DuplicateWarnModal from "./DuplicateWarnModal";
import {
  tryOpenOnSecondaryScreen,
  clearSecondaryScreenPreview,
} from "./lib/dualMonitorPreview";
import { getMeasurementHeight } from "./lib/heightMeasurement";

const FINGERS = [
  { key: "fp_l1", code: "left_thumb" },
  { key: "fp_l2", code: "left_index" },
  { key: "fp_l3", code: "left_middle" },
  { key: "fp_l4", code: "left_ring" },
  { key: "fp_l5", code: "left_little" },
  { key: "fp_r1", code: "right_thumb" },
  { key: "fp_r2", code: "right_index" },
  { key: "fp_r3", code: "right_middle" },
  { key: "fp_r4", code: "right_ring" },
  { key: "fp_r5", code: "right_little" },
];

// Hand layout: little → ring → middle → index → thumb (thumb near middle)
const LEFT_HAND = [
  { key: "fp_l5", code: "left_little" },
  { key: "fp_l4", code: "left_ring" },
  { key: "fp_l3", code: "left_middle" },
  { key: "fp_l2", code: "left_index" },
  { key: "fp_l1", code: "left_thumb" },
];
const RIGHT_HAND = [
  { key: "fp_r1", code: "right_thumb" },
  { key: "fp_r2", code: "right_index" },
  { key: "fp_r3", code: "right_middle" },
  { key: "fp_r4", code: "right_ring" },
  { key: "fp_r5", code: "right_little" },
];

const FP_CODE_TO_KEY = {
  left_thumb: "fp_l1",
  left_index: "fp_l2",
  left_middle: "fp_l3",
  left_ring: "fp_l4",
  left_little: "fp_l5",
  right_thumb: "fp_r1",
  right_index: "fp_r2",
  right_middle: "fp_r3",
  right_ring: "fp_r4",
  right_little: "fp_r5",
};

const PORTRAITS = [
  { key: "portrait_left", labelKey: "capture.portrait.left" },
  { key: "portrait_front", labelKey: "capture.portrait.front" },
  { key: "portrait_right", labelKey: "capture.portrait.right" },
];

const EMPTY_FORM = {
  full_name: "",
  cccd_number: "",
  personal_id: "",
  dob: "",
  gender: "",
  nationality: "",
  ethnicity: "",
  religion: "",
  hometown: "",
  address: "",
  issued_date: "",
  expiry_date: "",
  issued_place: "",
  cmnd_old: "",
  distinguishing_features: "",
  mrz: "",
  height_cm: "",
  weight_kg: "",
  cell_code: "",
  custody_type: "",
  facility_code: "",    // cơ sở giam giữ (Trại tạm giam / Nhà tạm giữ)
  sub_camp_code: "",    // phân trại (chỉ khi custody_type = tam_giam)
  note: "",
  // ---- Thông tin can phạm (21 trường string) ----
  cell_block: "",
  status_detainee: "",
  squad: "",
  health_intake: "",
  disease_current: "",
  disease_intake: "",
  alcohol_use: "",
  address_before_arrest: "",
  release_residence: "",
  occupation: "",
  occupation_detail: "",
  file_number: "",
  file_number_sub: "",
  search_index: "",
  disease_current_detail: "",
  disease_intake_detail: "",
  education_level: "",
  professional_level: "",
  study_status: "",
  literacy: "",
  alias: "",
};

async function cropPortraitFromCCCD(file) {
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

function CccdField({ value, onChange, className, ...rest }) {
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

function CccdCardUpload({ form, photos, cardPortrait, onUpload, onClear, onCardPortraitPreview, onFieldChange }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const setF = onFieldChange || (() => {});

  const pick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setErr("");

    if (onCardPortraitPreview) {
      try {
        const portraitFile = await cropPortraitFromCCCD(f);
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = () => reject(new Error("read fail"));
          r.readAsDataURL(portraitFile);
        });
        onCardPortraitPreview(dataUrl);
      } catch (cropEx) {
        console.error("[CCCD crop] error:", cropEx);
      }
    }

    try {
      const res = await api.uploadPhoto(f);
      onUpload(res.url);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const uploaded = photos.cccd_front;

  return (
    <div className="cccd-card-mock" onClick={() => inputRef.current?.click()} style={{ cursor: "pointer" }}>
      <img className="cccd-card-mock-bg" src={cccdTemplateBg} alt="" />
      <div className="cccd-card-mock-photo">
        {cardPortrait && <img src={cardPortrait} alt="" />}
      </div>
      <div className="cccd-card-mock-fields">
        <CccdField className="cccd-mf cccd-mf-no" value={form.cccd_number || ""}
          onChange={(v) => setF("cccd_number", v.replace(/\D/g, "").slice(0, 12))} />
        <CccdField className="cccd-mf cccd-mf-name" value={form.full_name || ""}
          onChange={(v) => setF("full_name", v)} />
        <CccdField className="cccd-mf cccd-mf-dob" value={form.dob || ""}
          onChange={(v) => setF("dob", v)} />
        <CccdField className="cccd-mf cccd-mf-sex"
          value={form.gender ? (form.gender === "female" ? t("common.female") : t("common.male")) : ""}
          onChange={(v) => {
            const s = (v || "").trim().toLowerCase();
            setF("gender", s.startsWith("n") && s.includes("ữ") ? "female"
              : s === "female" || s === "nữ" || s === "nu" ? "female"
              : s ? "male" : "");
          }} />
        <CccdField className="cccd-mf cccd-mf-nat" value={form.nationality || ""}
          onChange={(v) => setF("nationality", v)} />
        <CccdField className="cccd-mf cccd-mf-origin" value={form.hometown || ""}
          onChange={(v) => setF("hometown", v)} />
        <CccdField className="cccd-mf cccd-mf-res" value={form.address || ""}
          onChange={(v) => setF("address", v)} />
        <CccdField className="cccd-mf cccd-mf-exp" value={form.expiry_date || ""}
          onChange={(v) => setF("expiry_date", v)} />
      </div>
      {uploaded && (
        <button
          type="button"
          className="cccd-card-mock-clear"
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          aria-label={t("capture.cccd.aria_delete")}
        >×</button>
      )}
      {(uploading || err) && (
        <div className="cccd-card-mock-hint">
          {uploading ? t("capture.cccd.loading") : err}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
    </div>
  );
}

function CccdCardBackUpload({ form, onFieldChange }) {
  const { t } = useI18n();
  const setF = onFieldChange || (() => {});
  // MRZ chuẩn TD1 = 3 dòng × 30 ký tự. Máy đọc push lên thường là 1 chuỗi
  // liền 90 ký tự (không có \n) — tự chia 30 ký tự/dòng cho giống thẻ thật.
  // Nếu chuỗi đã có sẵn xuống dòng thì tôn trọng nguyên trạng.
  const mrzRaw = (form.mrz || "").trim();
  const mrzLines = mrzRaw.includes("\n")
    ? mrzRaw.split(/\r?\n/).filter((ln) => ln.length > 0)
    : (mrzRaw.match(/.{1,30}/g) || []);
  return (
    <div className="cccd-card-back">
      <img className="cccd-card-mock-bg" src={cccdBackTemplateBg} alt="" />
      <div className="cccd-card-mock-fields">
        {/* Tọa độ căn theo template mặt sau thật (cccd-back-template.jpg, 1024x601) */}
        {/* Đặc điểm nhận dạng — 2 dòng kẻ phía trên */}
        <CccdField className="cccd-mf cccd-mf-back-features" value={form.distinguishing_features || ""}
          onChange={(v) => setF("distinguishing_features", v)} />
        {/* Ngày cấp */}
        <CccdField className="cccd-mf cccd-mf-back-issued" value={form.issued_date || ""}
          onChange={(v) => setF("issued_date", v)} />
        {/* Nơi cấp */}
        <CccdField className="cccd-mf cccd-mf-back-place" value={form.issued_place || ""}
          onChange={(v) => setF("issued_place", v)} />
        {/* MRZ — 3 dòng monospace, chữ to, căn đều hai bên. Sửa tại chỗ: click mở ô nhập,
            các ký tự < biểu diễn khoảng trắng chuẩn MRZ; onBlur ghép lại thành 1 chuỗi. */}
        <div className="cccd-mf cccd-mf-back-mrz"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            // gộp mọi dòng thành 1 chuỗi, bỏ khoảng trắng thừa, viết hoa
            const raw = (e.currentTarget.textContent || "").replace(/\s+/g, "").toUpperCase();
            setF("mrz", raw);
          }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
        >
          {mrzLines.length > 0 ? mrzLines.map((ln, i) => (
            <div className="cccd-mf-mrz-line" key={i}>
              {Array.from(ln).map((ch, j) => (
                <span className="cccd-mf-mrz-char" key={j}>{ch}</span>
              ))}
            </div>
          )) : null}
        </div>
      </div>
    </div>
  );
}

async function resizeImageFile(file, maxW, maxH, mime = "image/jpeg", quality = 0.9) {
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

const PREFERRED_CAMERA_LABEL = (import.meta.env.VITE_CCCD_CAMERA_LABEL || "").trim();

async function pickPreferredCamera() {
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

function CameraCaptureModal({ open, label, onCapture, onClose }) {
  const { t } = useI18n();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setErr("");
    setReady(false);
    setDeviceLabel("");
    (async () => {
      const openStream = async (constraints) => navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
      try {
        // 1) probe permission bằng constraint tối thiểu để enumerateDevices trả về label
        let probe;
        try {
          probe = await openStream({ facingMode: "user" });
        } catch {
          probe = await openStream(true);
        }
        probe.getTracks().forEach((t) => t.stop());

        // 2) chọn camera cố định theo .env
        const preferredId = await pickPreferredCamera();
        let stream;
        if (preferredId) {
          try {
            stream = await openStream({ deviceId: { exact: preferredId }, width: { ideal: 1280 }, height: { ideal: 960 } });
          } catch {
            stream = await openStream({ facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } });
          }
        } else {
          stream = await openStream({ facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } });
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        if (track) setDeviceLabel(track.label || "");
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      } catch (e) {
        if (!cancelled) setErr(e.message || apiT("capture.err.camera_open"));
      }
    })();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open]);

  const snap = () => {
    if (!videoRef.current || busy) return;
    setBusy(true);
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          setErr(t("capture.err.camera_capture"));
          setBusy(false);
          return;
        }
        const file = new File([blob], `portrait_${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
      }, "image/jpeg", 0.92);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal camera-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{t("capture.camera.title", { label: label || t("capture.camera.default_title") })}</h3>
          <button className="close-x" onClick={onClose} aria-label={t("capture.camera.close_aria")}>×</button>
        </div>
        <div className="camera-body">
          {err ? (
            <div className="camera-err">{err}</div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="camera-video"
            />
          )}
        </div>
        <div className="camera-actions">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>{t("common.cancel")}</button>
          <button className="btn-primary" onClick={snap} disabled={!ready || busy || !!err}>
            {busy ? t("common.processing") : t("capture.camera.take")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PhotoSlot({ label, value, onChange, aspect = "1 / 1", size, compact, disabled, resize, useCamera }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);

  const uploadFile = async (f) => {
    setUploading(true);
    setErr("");
    try {
      let toUpload = f;
      if (resize) {
        try {
          toUpload = await resizeImageFile(f, resize.w, resize.h, resize.mime, resize.quality);
        } catch {
          toUpload = f;
        }
      }
      const res = await api.uploadPhoto(toUpload);
      onChange(res.url);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setUploading(false);
    }
  };

  const pick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await uploadFile(f);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleEmptyClick = () => {
    if (useCamera) setCameraOpen(true);
    else inputRef.current?.click();
  };

  const onCameraCaptured = async (file) => {
    setCameraOpen(false);
    await uploadFile(file);
  };

  const style = { aspectRatio: aspect };
  if (size) {
    style.width = size;
    style.height = size;
    style.aspectRatio = undefined;
  }

  return (
    <div className={"photo-slot" + (compact ? " ps-compact" : "")} style={style}>
      {value ? (
        <>
          <img src={value} alt={label} />
          {!disabled && (
            <button
              type="button"
              className="photo-slot-clear"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              aria-label={t("capture.photo.delete_aria")}
            >×</button>
          )}
        </>
      ) : (
        <button
          type="button"
          className="photo-slot-empty"
          onClick={handleEmptyClick}
          disabled={uploading || disabled}
        >
          <span className="photo-slot-icon">
            {useCamera ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="6" width="18" height="14" rx="2" />
                <circle cx="12" cy="13" r="4" />
                <path d="M8 6l1.5-2h5L16 6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            )}
          </span>
          {!compact && <span className="photo-slot-label">{useCamera ? t("capture.photo.take", { label }) : label}</span>}
          {!compact && uploading && <span className="photo-slot-hint">{t("common.loading")}</span>}
          {!compact && err && <span className="photo-slot-err">{err}</span>}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
      {useCamera && (
        <CameraCaptureModal
          open={cameraOpen}
          label={label}
          onCapture={onCameraCaptured}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="cccd-field">
      <span className="cccd-field-label">{label}</span>
      {children}
    </div>
  );
}

function toDobInput(v) {
  if (!v) return "";
  const s = String(v);
  if (s.includes("/")) return s;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  }
  return s;
}

function normalizeInitial(initial) {
  if (!initial) return { form: EMPTY_FORM, photos: {} };
  const photos = initial.photos && typeof initial.photos === "object" ? { ...initial.photos } : {};
  if (initial.photo_url && !photos.portrait_front) photos.portrait_front = initial.photo_url;
  return {
    form: {
      ...EMPTY_FORM,
      full_name: initial.full_name || "",
      cccd_number: initial.cccd_number || "",
      personal_id: initial.personal_id || "",
      dob: toDobInput(initial.dob),
      gender: initial.gender || "",
      nationality: initial.nationality || "",
      ethnicity: initial.ethnicity || "",
      religion: initial.religion || "",
      hometown: initial.hometown || "",
      address: initial.address || "",
      issued_date: toDobInput(initial.issued_date),
      expiry_date: toDobInput(initial.expiry_date),
      issued_place: initial.issued_place || "",
      cmnd_old: initial.cmnd_old || "",
      distinguishing_features: initial.distinguishing_features || "",
      mrz: initial.mrz || "",
      height_cm: initial.height_cm != null ? String(initial.height_cm) : "",
      weight_kg: initial.weight_kg != null ? String(initial.weight_kg) : "",
      cell_code: initial.cell_code || "",
      custody_type: initial.custody_type || "",
      facility_code: initial.facility_code || "",
      sub_camp_code: initial.sub_camp_code || "",
      note: initial.note || "",
      // ---- Thông tin can phạm (21 trường string) ----
      cell_block: initial.cell_block || "",
      status_detainee: initial.status_detainee || "",
      squad: initial.squad || "",
      health_intake: initial.health_intake || "",
      disease_current: initial.disease_current || "",
      disease_intake: initial.disease_intake || "",
      alcohol_use: initial.alcohol_use || "",
      address_before_arrest: initial.address_before_arrest || "",
      release_residence: initial.release_residence || "",
      occupation: initial.occupation || "",
      occupation_detail: initial.occupation_detail || "",
      file_number: initial.file_number || "",
      file_number_sub: initial.file_number_sub || "",
      search_index: initial.search_index || "",
      disease_current_detail: initial.disease_current_detail || "",
      disease_intake_detail: initial.disease_intake_detail || "",
      education_level: initial.education_level || "",
      professional_level: initial.professional_level || "",
      study_status: initial.study_status || "",
      literacy: initial.literacy || "",
      alias: initial.alias || "",
    },
    photos,
  };
}

export default function DataCapturePage({ go, initial, onDone, sessionId, sessionCode, sessionReadOnly = false, onSavedInSession, onEditProfile }) {
  const { t, formatDateLong } = useI18n();
  const isEdit = Boolean(initial && initial.id);
  const seed = useMemo(() => normalizeInitial(initial), [initial]);
  const [form, setForm] = useState(seed.form);
  const [photos, setPhotos] = useState(seed.photos);
  const [cccdCardPortrait, setCccdCardPortrait] = useState(seed.photos?.cccd_front || seed.photos?.portrait_front || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [reading, setReading] = useState(false);
  const cccdSidRef = useRef(null);
  const cccdAbortRef = useRef(null);
  const [cccdLocked, setCccdLocked] = useState(false);   // chốt dữ liệu CCCD: true = chạm thẻ không đổi form
  const cccdLockedRef = useRef(false);                   // ref để đọc trạng thái mới nhất trong vòng lặp nền
  useEffect(() => { cccdLockedRef.current = cccdLocked; }, [cccdLocked]);
  const [fpLocked, setFpLocked] = useState(false);       // chốt vân tay: true = dừng quét, đóng băng 10 ngón
  const fpLockedRef = useRef(false);                     // ref để auto-start effect đọc trạng thái mới nhất
  useEffect(() => { fpLockedRef.current = fpLocked; }, [fpLocked]);
  const fpRunningRef = useRef(false);                    // ref phản chiếu fpRunning cho auto-start effect
  const fpCountRef = useRef(0);                          // ref phản chiếu số ngón đã thu cho auto-start effect
  const [cells, setCells] = useState([]);
  const [fpRunning, setFpRunning] = useState(false);
  const [fpNextCode, setFpNextCode] = useState(null);
  const [fpStatus, setFpStatus] = useState("");
  const [fpError, setFpError] = useState("");
  const fpAbortRef = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewOnSecondary, setPreviewOnSecondary] = useState(false);
  const [heightImage, setHeightImage] = useState(100);
  const [heightOffset, setHeightOffset] = useState(103);

  const lastCheckedCccdRef = useRef("");   // tránh gọi check-cccd lặp lại cùng 1 số
  const [dupModal, setDupModal] = useState({ open: false, matches: [] });  // cảnh báo trùng lúc Lưu
  const [checkingDup, setCheckingDup] = useState(false);   // đang gộp check khi bấm Lưu

  // Cảnh báo "đối tượng đã có trong danh sách" → đẩy vào chuông thông báo header.
  // Click thông báo (kind:"match") sẽ mở hồ sơ đối tượng đã đăng ký.
  const raiseAlert = useCallback((match) => {
    const who = match?.detainee?.full_name || match?.detainee?.cccd_number || "";
    const msg = t("capture.alert.on_list", { name: who });
    try { toast.error(msg, 6000); } catch { /* noop */ }
    try {
      notify.add(msg, {
        kind: "match",
        source: match.source,
        detainee: match.detainee,
        score: match.score,
        finger: match.finger,
      });
    } catch { /* noop */ }
  }, [t]);

  // Dedup đối sánh vân tay: 1 can phạm đã đăng ký = 1 cảnh báo trong 1 phiên chụp.
  const fpMatchedIdsRef = useRef(new Set());
  useEffect(() => { fpMatchedIdsRef.current = new Set(); }, [seed]);

  // (Đã bỏ tra cứu realtime sau mỗi ngón — backend giờ yêu cầu đủ 10 ngón.
  //  Tra cứu được thực hiện 1 lần sau khi thu xong 10 ngón, dùng left_thumb.)

  // Dedup face recognition: 1 người = 1 toast trong 1 phiên chụp (reset khi seed đổi)
  const recognizedIdsRef = useRef(new Set());
  useEffect(() => {
    recognizedIdsRef.current = new Set();
  }, [seed]);

  // Gọi nhận diện sau khi upload 1 ảnh portrait góc. Mỗi người match = 1 toast.
  const raiseFaceAlerts = useCallback(async (portraitUrl) => {
    try {
      const r = await api.faceRecognize(portraitUrl);
      if (!r || !r.ready || !Array.isArray(r.matches)) return;
      for (const m of r.matches) {
        const did = m?.detainee?._id || m?.detainee?.id;
        if (!did || recognizedIdsRef.current.has(did)) continue;
        recognizedIdsRef.current.add(did);
        const who = m?.detainee?.full_name || m?.detainee?.cccd_number || "";
        const msg = t("capture.alert.on_list", { name: who });
        try { toast.error(msg, 6000); } catch { /* noop */ }
        try {
          notify.add(msg, {
            kind: "face",
            source: t("capture.alert.source_face"),
            detainee: m.detainee,
            score: m.score,
          });
        } catch { /* noop */ }
      }
    } catch { /* recognize fail → không hỏng flow chụp */ }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    api.measurementConfig()
      .then((cfg) => {
        const next = Number(cfg?.height_image);
        if (!cancelled && Number.isFinite(next) && next > 0) setHeightImage(next);
        const off = Number(cfg?.height_offset);
        if (!cancelled && Number.isFinite(off) && off > 0) setHeightOffset(off);
      })
      .catch(() => {
        if (!cancelled) { setHeightImage(100); setHeightOffset(103); }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!previewOnSecondary) return;
    const onKey = (ev) => {
      if (ev.key === "Escape") {
        clearSecondaryScreenPreview();
        setPreviewOnSecondary(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOnSecondary]);

  useEffect(() => {
    return () => {
      if (previewOnSecondary) clearSecondaryScreenPreview();
    };
  }, [previewOnSecondary]);

  useEffect(() => {
    setForm(seed.form);
    setPhotos(seed.photos);
    setErr("");
    setOk("");

    const savedUrl = seed.photos?.cccd_front;
    if (!savedUrl) {
      setCccdCardPortrait("");
      return;
    }
    // Hiển thị tạm ảnh CCCD gốc trong khung; re-crop bất đồng bộ ở dưới
    setCccdCardPortrait(savedUrl);

    let cancelled = false;
    (async () => {
      try {
        const img = await new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error(apiT("capture.err.load_cccd_photo")));
          i.src = savedUrl;
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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        if (!cancelled) setCccdCardPortrait(dataUrl);
      } catch {
        // giữ savedUrl làm fallback nếu re-crop lỗi
      }
    })();
    return () => { cancelled = true; };
  }, [seed]);

  useEffect(() => {
    api.listCells().then(setCells).catch(() => setCells([]));
  }, []);

  // ---- Phân cấp cơ sở giam giữ (cây) ----
  // cells từ backend giờ có { code, name, level, parent, custody_type }
  const facilities = cells.filter(
    (c) => c.level === "facility" && c.custody_type === form.custody_type
  );
  const subCamps = cells.filter(
    (c) => c.level === "sub_camp" && c.parent === form.facility_code
  );
  // Buồng con của phân trại (Tạm giam) hoặc con của cơ sở (Tạm giữ)
  const cellParent = form.custody_type === "tam_giam"
    ? form.sub_camp_code
    : form.facility_code;
  const availableCells = cells.filter(
    (c) => c.level === "cell" && c.parent === cellParent
  );

  // Khi đổi Diện → reset cơ sở/phân trại/buồng không còn hợp lệ.
  // Chỉ reset khi cells đã load xong (cells rỗng = chưa load → không xoá giá trị đã lưu).
  useEffect(() => {
    setForm((f) => {
      if (cells.length === 0) return f;
      const validFacilities = cells.filter(
        (c) => c.level === "facility" && c.custody_type === f.custody_type
      );
      if (f.facility_code && !validFacilities.some((c) => c.code === f.facility_code)) {
        return { ...f, facility_code: "", sub_camp_code: "", cell_code: "" };
      }
      return f;
    });
  }, [form.custody_type, cells]);

  // Khi đổi cơ sở → reset phân trại/buồng
  useEffect(() => {
    setForm((f) => {
      if (cells.length === 0) return f;
      const validSub = cells.filter(
        (c) => c.level === "sub_camp" && c.parent === f.facility_code
      );
      if (f.sub_camp_code && !validSub.some((c) => c.code === f.sub_camp_code)) {
        return { ...f, sub_camp_code: "", cell_code: "" };
      }
      return f;
    });
  }, [form.facility_code, cells]);

  // Khi đổi phân trại → reset buồng
  useEffect(() => {
    setForm((f) => {
      if (cells.length === 0) return f;
      const parent = f.custody_type === "tam_giam" ? f.sub_camp_code : f.facility_code;
      const validCells = cells.filter(
        (c) => c.level === "cell" && c.parent === parent
      );
      if (f.cell_code && !validCells.some((c) => c.code === f.cell_code)) {
        return { ...f, cell_code: "" };
      }
      return f;
    });
  }, [form.sub_camp_code, form.facility_code, form.custody_type, cells]);

  // WebSocket lắng nghe cân nặng từ máy cân ngoài (POST /api/weight/push -> broadcast)
  const [weightFlash, setWeightFlash] = useState(false);
  const weightFlashTimerRef = useRef(null);
  useEffect(() => {
    const close = weightApi.connect((payload) => {
      const raw = Number(payload.weight_kg);
      if (!Number.isFinite(raw) || raw < 20 || raw > 200) return;
      const kg = Math.round(raw * 10) / 10;
      setForm((f) => ({ ...f, weight_kg: kg.toFixed(1) }));
      setWeightFlash(true);
      if (weightFlashTimerRef.current) clearTimeout(weightFlashTimerRef.current);
      weightFlashTimerRef.current = setTimeout(() => setWeightFlash(false), 1200);
    });
    return () => {
      close();
      if (weightFlashTimerRef.current) clearTimeout(weightFlashTimerRef.current);
    };
  }, []);

  // Cooldown 10s: banner ok/err tự ẩn sau 10 giây
  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => setOk(""), 10000);
    return () => clearTimeout(t);
  }, [ok]);
  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(""), 10000);
    return () => clearTimeout(t);
  }, [err]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setPhoto = (k, v) =>
    setPhotos((p) => {
      const next = { ...p };
      if (v) next[k] = v;
      else delete next[k];
      return next;
    });

  const applyMeasuredHeight = useCallback(({ linePixelHeight, imageHeight }) => {
    const measured = getMeasurementHeight({ linePixelHeight, imageHeight, heightImage, heightOffset });
    if (!measured || measured < 50 || measured > 250) return;
    setForm((f) => ({ ...f, height_cm: String(measured) }));
  }, [heightImage, heightOffset]);

  const stopFpCollect = () => {
    fpAbortRef.current = true;
    setFpRunning(false);
    setFpNextCode(null);
    setFpStatus("");
  };

  // Khóa ⇄ Thu thập vân tay. Khóa = dừng vòng enroll, đóng băng 10 ngón hiện có,
  // chặn double-click thu lại. Thu thập = mở lại, cho phép auto-start & thu tay.
  const toggleFpLock = () => {
    if (fpLocked) {
      setFpLocked(false);
      fpAutoStoppedRef.current = false;   // cho phép auto-start effect chạy lại
    } else {
      stopFpCollect();
      fpAutoStoppedRef.current = true;    // đã khóa: auto-start không tự bật lại
      setFpLocked(true);
    }
  };

  // Double-click 1 ô vân tay để thu/thu lại ngón đó
  const retryFingerprint = async (photoKey, fingerCode) => {
    if (fpLocked) return;   // đã khóa: không cho thu lại ngón lẻ
    if (fpRunning) {
      setFpError(t("capture.err.fp_running"));
      return;
    }
    if (!photoKey || !fingerCode) {
      setFpError(t("capture.err.unknown_finger", { key: photoKey, code: fingerCode }));
      return;
    }

    // Xóa ảnh + template cũ
    setPhotos((p) => {
      const next = { ...p };
      delete next[photoKey];
      if (next.fp_templates) {
        const tpls = { ...next.fp_templates };
        delete tpls[fingerCode];
        next.fp_templates = tpls;
      }
      return next;
    });

    setFpError("");
    setFpStatus(t("capture.status.check_scanner"));
    fpAbortRef.current = false;

    try {
      const h = await fpApi.health();
      if (!h.ok) {
        setFpError(h.error || t("capture.err.fp_not_ready"));
        setFpStatus("");
        return;
      }
    } catch (e) {
      setFpError(e.message);
      setFpStatus("");
      return;
    }

    setFpRunning(true);
    setFpNextCode(fingerCode);
    const targetName = t(`fp.finger.${fingerCode}.lower`);
    setFpStatus(t("capture.status.place_finger", { name: targetName }));

    let sid = null;
    try {
      const r = await fpApi.startSession("__retry__" + fingerCode);
      sid = r.session_id;

      // fp_service enrolls sequentially. Capture once, force-save into the target finger's slot (ignore whatever code the SDK returns).
      let capRes;
      try {
        capRes = await fpApi.capture(sid);
      } catch (e) {
        throw new Error(e.message + " " + t("capture.err.retry_finger"));
      }
      if (fpAbortRef.current) return;

      const key = photoKey;
      const code = fingerCode; // force-save into the user-selected target finger
      try {
        const file = await b64PngToFile(capRes.finger.image_b64, `${key}.png`);
        const up = await api.uploadPhoto(file);
        const tmplB64 = capRes.finger.template_b64;
        setPhotos((p) => {
          const next = { ...p, [key]: up.url };
          if (tmplB64) {
            next.fp_templates = { ...(p.fp_templates || {}), [code]: tmplB64 };
          }
          return next;
        });
        setFpStatus(t("capture.status.retook", { name: targetName }));
        setOk(t("capture.status.updated", { name: targetName }));
        // (Đã bỏ tra cứu ngay sau thu lại 1 ngón — BE giờ cần đủ 10 ngón.
        //  Tra cứu chỉ chạy sau khi thu đủ 10 ngón ở vòng tự động.)
      } catch (e) {
        setFpError(t("capture.err.save_photo", { message: e.message }));
      }
    } catch (e) {
      setFpError(e.message);
    } finally {
      if (sid) {
        try { await fpApi.cancel(sid); } catch { /* noop */ }
      }
      setFpRunning(false);
      setFpNextCode(null);
    }
  };

  const startFpCollect = async () => {
    if (fpRunning) return;
    setFpError("");
    setFpStatus(t("capture.status.check_scanner"));
    fpAbortRef.current = false;

    try {
      const h = await fpApi.health();
      if (!h.ok) {
        setFpError(h.error || t("capture.err.fp_not_ready"));
        setFpStatus("");
        return;
      }
    } catch (e) {
      setFpError(e.message);
      setFpStatus("");
      return;
    }

    setFpRunning(true);
    let sid = null;
    try {
      const r = await fpApi.startSession(form.full_name.trim() || t("fpenroll.anon"));
      sid = r.session_id;
      let next = r.next_finger;

      while (next && !fpAbortRef.current) {
        setFpNextCode(next.code);
        setFpStatus(t("capture.status.place_finger", { name: t(`fp.finger.${next.code}.lower`) }));
        let capRes;
        try {
          capRes = await fpApi.capture(sid);
        } catch (e) {
          if (fpAbortRef.current) break;
          setFpError(e.message + " " + t("capture.err.retry_finger"));
          continue;
        }
        if (fpAbortRef.current) break;

        const code = capRes.finger.code;
        const key = FP_CODE_TO_KEY[code];
        if (key) {
          try {
            const file = await b64PngToFile(capRes.finger.image_b64, `${key}.png`);
            const up = await api.uploadPhoto(file);
            const tmplB64 = capRes.finger.template_b64;
            setPhotos((p) => {
              const np = { ...p, [key]: up.url };
              if (tmplB64) {
                np.fp_templates = { ...(p.fp_templates || {}), [code]: tmplB64 };
              }
              return np;
            });
          } catch (e) {
            setFpError(t("capture.err.save_photo", { message: e.message }));
          }
        }
        setFpStatus(capRes.message || t("capture.status.collected", { name: t(`fp.finger.${code}.lower`) }));
        next = capRes.next_finger;
      }

      if (!fpAbortRef.current) {
        setFpStatus(t("capture.status.done_10"));
        setOk(t("capture.status.done_10_full"));
        // Sau khi thu đủ 10 ngón: tra cứu dùng left_thumb (theo logic BE mới).
        // BE chỉ so left_thumb với left_thumb của can phạm, khớp nếu score > 80.
        try {
          // Đọc state photos mới nhất qua functional setter (tránh stale closure).
          const latestPhotos = await new Promise((resolve) => {
            setPhotos((p) => { resolve(p); return p; });
          });
          const tpls = latestPhotos?.fp_templates || {};
          // Gửi ĐỦ 10 ngón cho BE. BE tự lấy left_thumb ra so.
          const fingers = {};
          let count = 0;
          for (const [code, b64] of Object.entries(tpls)) {
            if (b64) { fingers[code] = b64; count++; }
          }
          if (count > 0) {
            const r = await api.matchFingerprint(fingers);
            if (r && r.matched && Array.isArray(r.items) && r.items.length > 0) {
              const best = r.items[0];
              const did = best?._id || best?.id;
              if (did && !fpMatchedIdsRef.current.has(did)) {
                fpMatchedIdsRef.current.add(did);
                raiseAlert({
                  source: "fp",
                  detainee: best,
                  score: best.match_score,
                  finger: best.match_finger,
                });
              }
            }
          }
        } catch (e) {
          console.error("[FP] match lookup failed:", e);
        }
      }
    } catch (e) {
      setFpError(e.message);
    } finally {
      if (sid && fpAbortRef.current) {
        try { await fpApi.cancel(sid); } catch { /* noop */ }
      }
      setFpRunning(false);
      setFpNextCode(null);
    }
  };

  const applyCccdData = async (d) => {
    if (!d) return;
    if (cccdLockedRef.current) return;   // đã khóa: chạm thẻ khác không ghi đè form
    setForm((f) => ({
      ...f,
      full_name: d.full_name || f.full_name,
      cccd_number: d.cccd_number || f.cccd_number,
      personal_id: f.personal_id,
      dob: d.dob || f.dob,
      gender: d.gender || f.gender,
      hometown: d.hometown || f.hometown,
      address: d.address || d.hometown || f.address,
      ethnicity: d.ethnicity || f.ethnicity,
      religion: d.religion || f.religion,
      nationality: d.nationality || f.nationality,
      issued_date: d.issued_date || f.issued_date,
      expiry_date: d.expiry_date || f.expiry_date,
      issued_place: d.issued_place || f.issued_place,
      cmnd_old: d.cmnd_old || f.cmnd_old,
      distinguishing_features: d.distinguishing_features || d.personal_identification || f.distinguishing_features,
      mrz: d.mrz || f.mrz,
    }));
    if (d.facePhoto) {
      const fp = d.facePhoto;
      if (fp.startsWith("/uploads/") || fp.startsWith("http://") || fp.startsWith("https://") || fp.startsWith("data:")) {
        setCccdCardPortrait(fp);
        setPhoto("cccd_front", fp);
      } else {
        const dataUrl = `data:image/jpeg;base64,${fp}`;
        setCccdCardPortrait(dataUrl);
        try {
          const file = await b64PngToFile(fp, `cccd_face_${d.cccd_number || Date.now()}.jpg`);
          const jpgFile = new File([file], file.name, { type: "image/jpeg" });
          const res = await api.uploadPhoto(jpgFile);
          setPhoto("cccd_front", res.url);
        } catch (uploadEx) {
          console.error("[CCCD] portrait upload failed:", uploadEx);
          setErr(t("capture.err.cccd_saved_photo", { message: uploadEx.message }));
        }
      }
    }

    // Cảnh báo nếu số CCCD vừa quét đã có trong danh sách (toàn hệ thống).
    const cccd = (d.cccd_number || "").replace(/\D/g, "");
    if (cccd && cccd.length >= 9 && cccd !== lastCheckedCccdRef.current) {
      lastCheckedCccdRef.current = cccd;
      try {
        const r = await api.checkCccd(cccd);
        if (r && r.matched && r.detainee) {
          raiseAlert({ source: "cccd", detainee: r.detainee });
        }
      } catch (e) {
        console.error("[CCCD] check duplicate failed:", e);
      }
    }
  };

  // Tự động lắng nghe đầu đọc CCCD ngay khi vào trang, chạy liên tục.
  // Mỗi lần backend trả thẻ mới, nó tự dời baseline nên vòng lặp chỉ nhận thẻ mới,
  // không lặp lại thẻ cũ. Thẻ mới vào thì chèn dữ liệu lên form.
  useEffect(() => {
    if (sessionReadOnly) return;

    let stopped = false;
    const ac = new AbortController();
    cccdAbortRef.current = ac;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      try {
        const h = await cccdApi.health();
        if (stopped) return;
        if (!h.ok) {
          setErr(apiT("capture.err.cccd_dir", { dir: h.data_dir || "" }));
          return;
        }
      } catch (e) {
        if (!stopped) setErr(e.message);
        return;
      }

      let sid = null;
      while (!stopped && !ac.signal.aborted) {
        // Session hết hạn (TTL backend) hoặc chưa có -> mở phiên mới rồi đọc tiếp
        if (!sid) {
          try {
            const s = await cccdApi.startSession();
            if (stopped) break;
            sid = s.session_id;
            cccdSidRef.current = sid;
            setReading(true);
          } catch {
            if (stopped || ac.signal.aborted) break;
            setReading(false);
            await sleep(3000);
            continue;
          }
        }

        try {
          const r = await cccdApi.wait(sid, ac.signal, 25);
          if (stopped || ac.signal.aborted) break;
          if (r && r.status === "ok" && r.data) {
            applyCccdData(r.data);
            setOk(t("capture.status.cccd_read"));
          }
        } catch (e) {
          if (stopped || ac.signal.aborted || e.name === "AbortError") break;
          // 404 = phiên đã bị GC; mọi lỗi khác cũng thử mở lại phiên
          sid = null;
          cccdSidRef.current = null;
          await sleep(1000);
        }
      }
      if (!stopped) setReading(false);
    })();

    return () => {
      stopped = true;
      try { ac.abort(); } catch { /* noop */ }
      const sid = cccdSidRef.current;
      cccdSidRef.current = null;
      cccdAbortRef.current = null;
      if (sid) {
        cccdApi.cancel(sid).catch(() => { /* noop */ });
      }
    };
  }, [sessionReadOnly]);

  // Tự động bật quét vân tay khi vào trang. Máy quét chưa sẵn sàng thì thử lại
  // âm thầm mỗi 3s (không hiện lỗi đỏ) — giống vòng CCCD, cắm máy vào là tự chạy.
  const fpAutoStoppedRef = useRef(false);   // cán bộ đã bấm Dừng thủ công -> không auto-start lại
  useEffect(() => {
    if (sessionReadOnly) return;
    let stopped = false;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      while (!stopped) {
        // Chỉ auto-start khi: chưa khóa, chưa đủ 10 ngón, không đang chạy, chưa bị dừng tay
        if (!fpLockedRef.current && !fpAutoStoppedRef.current && !fpRunningRef.current && fpCountRef.current < 10) {
          try {
            const h = await fpApi.health();
            if (stopped) return;
            if (h.ok) {
              startFpCollect();   // tự chạy vòng enroll; lỗi bên trong tự xử lý
            }
          } catch { /* máy quét chưa sẵn sàng -> thử lại vòng sau, không báo lỗi */ }
        }
        await sleep(3000);
        if (stopped) return;
      }
    })();

    return () => { stopped = true; };
  }, [sessionReadOnly]);

  const fpCount = FINGERS.filter((f) => photos[f.key]).length;
  const portraitCount = PORTRAITS.filter((p) => photos[p.key]).length;
  useEffect(() => { fpRunningRef.current = fpRunning; }, [fpRunning]);
  useEffect(() => { fpCountRef.current = fpCount; }, [fpCount]);

  const checks = useMemo(() => {
    const personalOk = !!(form.personal_id || "").trim();
    const cccdOk =
      !!form.full_name.trim() &&
      /^\d{12}$/.test(form.cccd_number || "") &&
      !!form.dob;
    return [
      { key: "personal_id", label: t("capture.verify.item.code"), ok: personalOk, required: true },
      { key: "cccd", label: t("capture.verify.item.cccd"), ok: cccdOk, required: true },
      { key: "portrait", label: t("capture.verify.item.portrait"), ok: portraitCount === 3, required: false },
      { key: "fp", label: t("capture.verify.item.fp"), ok: fpCount === 10, required: false },
      { key: "extra", label: t("capture.verify.item.extra"), ok: !!form.height_cm && !!form.weight_kg, required: false },
      { key: "device", label: t("capture.verify.item.devices"), ok: true, required: false },
    ];
  }, [form, fpCount, portraitCount, t]);

  const allRequiredValid = checks.filter((c) => c.required).every((c) => c.ok);
  const allValid = checks.every((c) => c.ok);

  // Thực hiện lưu thật sự (sau khi đã qua bước kiểm tra trùng lúc bấm Lưu).
  const doSave = async () => {
    setSaving(true);
    setErr("");
    setOk("");
    try {
      const strOrNull = (v) => {
        const s = (v ?? "").toString().trim();
        return s === "" ? null : s;
      };
      const digitsOrNull = (v) => {
        const s = (v ?? "").toString().replace(/\D/g, "");
        return /^\d{12}$/.test(s) ? s : null;
      };
      const body = {
        session_id: sessionId || null,
        full_name: form.full_name.trim(),
        gender: form.gender || "male",
        dob: strOrNull(form.dob),
        cccd_number: digitsOrNull(form.cccd_number),
        personal_id: strOrNull(form.personal_id),
        nationality: strOrNull(form.nationality),
        hometown: strOrNull(form.hometown),
        address: strOrNull(form.address),
        ethnicity: strOrNull(form.ethnicity),
        religion: strOrNull(form.religion),
        issued_date: strOrNull(form.issued_date),
        expiry_date: strOrNull(form.expiry_date),
        issued_place: strOrNull(form.issued_place),
        cmnd_old: strOrNull(form.cmnd_old),
        distinguishing_features: strOrNull(form.distinguishing_features),
        mrz: strOrNull(form.mrz),
        height_cm: form.height_cm ? Math.round(Number(form.height_cm)) : null,
        weight_kg: form.weight_kg ? Math.round(Number(form.weight_kg)) : null,
        cell_code: strOrNull(form.cell_code),
        custody_type: strOrNull(form.custody_type),
        facility_code: strOrNull(form.facility_code),
        sub_camp_code: strOrNull(form.sub_camp_code),
        note: strOrNull(form.note),
        // ---- Thông tin can phạm (21 trường string) ----
        cell_block: strOrNull(form.cell_block),
        status_detainee: strOrNull(form.status_detainee),
        squad: strOrNull(form.squad),
        health_intake: strOrNull(form.health_intake),
        disease_current: strOrNull(form.disease_current),
        disease_intake: strOrNull(form.disease_intake),
        alcohol_use: strOrNull(form.alcohol_use),
        address_before_arrest: strOrNull(form.address_before_arrest),
        release_residence: strOrNull(form.release_residence),
        occupation: strOrNull(form.occupation),
        occupation_detail: strOrNull(form.occupation_detail),
        file_number: strOrNull(form.file_number),
        file_number_sub: strOrNull(form.file_number_sub),
        search_index: strOrNull(form.search_index),
        disease_current_detail: strOrNull(form.disease_current_detail),
        disease_intake_detail: strOrNull(form.disease_intake_detail),
        education_level: strOrNull(form.education_level),
        professional_level: strOrNull(form.professional_level),
        study_status: strOrNull(form.study_status),
        literacy: strOrNull(form.literacy),
        alias: strOrNull(form.alias),
        photo_url: photos.portrait_front || null,
        photos,
      };
      if (isEdit) {
        const updated = await api.updateDetainee(initial.id, body);
        notify.add();
        setOk(t("capture.updated", { code: updated.code, name: updated.full_name }));
        if (onDone) onDone();
        if (sessionId && onSavedInSession) {
          setTimeout(() => onSavedInSession(), 600);
        } else if (go) {
          setTimeout(() => go("sessions"), 800);
        }
      } else {
        const created = await api.createDetainee(body);
        notify.add();
        setOk(t("capture.saved", { code: created.code, name: created.full_name }));
        setForm(EMPTY_FORM);
        setPhotos({});
        if (sessionId && onSavedInSession) {
          setTimeout(() => onSavedInSession(), 800);
        }
      }
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  // Bấm Lưu: gộp check-cccd + check-duplicate chạy song song 1 lần. Nếu phát hiện
  // hồ sơ trùng → mở modal xác nhận (officer tự quyết). Không trùng → lưu luôn.
  const submit = async () => {
    if (!allRequiredValid) return;
    const cccd = (form.cccd_number || "").replace(/\D/g, "");
    const dupBody = {
      full_name: form.full_name.trim(),
      gender: form.gender || "male",
      dob: form.dob || null,
    };
    setCheckingDup(true);
    setErr("");
    try {
      const [cccdRes, dupRes] = await Promise.allSettled([
        cccd.length >= 9 ? api.checkCccd(cccd) : Promise.resolve({ matched: false }),
        api.checkDuplicate(dupBody),
      ]);

      const matches = [];
      const seen = new Set();
      if (isEdit && initial?.id) seen.add(initial.id);   // bỏ chính hồ sơ đang sửa

      const pushMatch = (detainee, source) => {
        const id = detainee?.id || detainee?._id;
        if (!id || seen.has(id)) return;
        seen.add(id);
        matches.push({ source, detainee });
      };

      if (cccdRes.status === "fulfilled" && cccdRes.value?.matched && cccdRes.value.detainee) {
        pushMatch(cccdRes.value.detainee, "cccd");
      }
      if (dupRes.status === "fulfilled" && Array.isArray(dupRes.value?.duplicates)) {
        dupRes.value.duplicates.forEach((d) => pushMatch(d, "info"));
      }

      // Cả 2 check đều lỗi mạng → không chặn officer vì lỗi hạ tầng, cho lưu luôn.
      if (cccdRes.status === "rejected" && dupRes.status === "rejected") {
        console.error("[dup-check] cả 2 API lỗi:", cccdRes.reason, dupRes.reason);
      }

      if (matches.length > 0) {
        setDupModal({ open: true, matches });
        return;   // chờ officer quyết định trong modal
      }
      await doSave();
    } catch (e) {
      console.error("[dup-check] lỗi ngoài dự kiến:", e);
      await doSave();   // lỗi bất ngờ vẫn cho lưu, không kẹt
    } finally {
      setCheckingDup(false);
    }
  };

  const onDupProceed = () => {
    setDupModal({ open: false, matches: [] });
    doSave();
  };

  const onDupCancel = () => setDupModal({ open: false, matches: [] });

  const onDupOpenProfile = (detainee) => {
    setDupModal({ open: false, matches: [] });
    // Đẩy vào chuông thông báo (kind:"match") — click thông báo sẽ mở hồ sơ đã đăng ký,
    // dùng chung cơ chế với raiseAlert (Dashboard xử lý điều hướng khi click).
    raiseAlert({ source: "cccd", detainee });
  };

  const onDupEdit = (detainee) => {
    setDupModal({ open: false, matches: [] });
    if (onEditProfile) onEditProfile(detainee);
  };

  const resetAll = () => {
    if (!window.confirm(isEdit ? t("capture.confirm.cancel_edit") : t("capture.confirm.clear_all"))) return;
    if (isEdit && onDone) onDone();
    setForm(EMPTY_FORM);
    setPhotos({});
    setErr("");
    setOk("");
  };

  const backToList = () => {
    if (onDone) onDone();
    if (sessionId && onSavedInSession) {
      onSavedInSession();
    } else if (go) {
      go("sessions");
    }
  };

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const captureTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  const readyState = fpCount === 10 && portraitCount === 3 && !!photos.cccd_front && allRequiredValid;
  const overallProgress = Math.round(checks.reduce((s, c) => s + (c.ok ? 1 : 0), 0) * 100 / checks.length);

  return (
    <div className="page capture-page case-preview">
      {(err || ok) && (
        <div className="capture-banner">
          {err && <div className="error-box">{err}</div>}
          {ok && (
            <div className="success-box">
              {ok}
              <button type="button" className="banner-link" onClick={backToList}>
                {t("capture.view_list")}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="case-main">
        {/* ================ Tier 1: 3 cols — Photo + CCCD front + CCCD back ================ */}
        <div className="case-tier-1">
          <section className="cap-block">
            <div className="cap-block-head">
              <h2 className="cap-block-title">{t("capture.section.body_photo")}</h2>
            </div>
            <div className="body-shots">
              {PORTRAITS.map((p) => (
                <div key={p.key} className="body-shot">
                  <span className="body-shot-label">
                    {t(p.labelKey).toUpperCase()}
                  </span>
                  <LiveCamShot
                    label={t(p.labelKey)}
                    shortLabel={t(p.labelKey).toUpperCase()}
                    value={photos[p.key]}
                    onCapture={(u) => setPhoto(p.key, u)}
                    showRuler={p.key === "portrait_front"}
                    onMeasureHeight={p.key === "portrait_front" ? applyMeasuredHeight : undefined}
                    onPortraitRecognize={raiseFaceAlerts}
                    heightImage={heightImage}
                    heightOffset={heightOffset}
                    useYolo={p.key === "portrait_front"}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="cap-block">
            <div className="cap-block-head">
              <h2 className="cap-block-title">{t("capture.section.cccd_card")}</h2>
              {cccdLocked && (
                <span className="cccd-listen-badge locked">
                  <span className="cccd-listen-dot" />
                  {t("capture.toolbar.locked")}
                </span>
              )}
              <button
                type="button"
                className="btn-cccd-scan"
                onClick={() => setCccdLocked((v) => !v)}
                title={cccdLocked ? t("capture.toolbar.recollect") : t("capture.toolbar.lock")}
              >
                {cccdLocked ? t("capture.toolbar.recollect") : t("capture.toolbar.lock")}
              </button>
            </div>
            <div className="cccd-preview-wrap">
              <CccdCardUpload
                form={form}
                photos={photos}
                cardPortrait={cccdCardPortrait}
                onUpload={(url) => setPhoto("cccd_front", url)}
                onClear={() => { setPhoto("cccd_front", ""); setCccdCardPortrait(""); }}
                onCardPortraitPreview={setCccdCardPortrait}
                onFieldChange={setField}
              />
            </div>
          </section>

          <section className="cap-block">
            <div className="cap-block-head">
              <h2 className="cap-block-title">{t("capture.section.cccd_back")}</h2>
            </div>
            <div className="cccd-preview-wrap">
              <CccdCardBackUpload form={form} onFieldChange={setField} />
            </div>
          </section>
        </div>

        {/* ================ Tier 2: Personal info ================ */}
        <div className="case-tier-2">
          <section className="cap-block">
            <div className="cap-block-head">
              <h2 className="cap-block-title">{t("capture.section.personal")}</h2>
            </div>
            <div className="personal-info personal-info--4col">
              {/* Mã can phạm — giữ lại (nghiệp vụ, không phải trường CCCD) */}
              <InfoField label={t("capture.form.personal_id")}>
                <input className="control control-sm" value={form.personal_id}
                  onChange={(e) => setField("personal_id", e.target.value)}
                  placeholder={t("capture.form.personal_id_ph")} />
              </InfoField>
              {/* ---- 21 trường Thông tin can phạm (string) ---- */}
              <InfoField label={t("detainee.field.search_index")}>
                <input className="control control-sm" value={form.search_index}
                  onChange={(e) => setField("search_index", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.status_detainee")}>
                <input className="control control-sm" value={form.status_detainee}
                  onChange={(e) => setField("status_detainee", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.squad")}>
                <input className="control control-sm" value={form.squad}
                  onChange={(e) => setField("squad", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.health_intake")}>
                <input className="control control-sm" value={form.health_intake}
                  onChange={(e) => setField("health_intake", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.disease_current")}>
                <input className="control control-sm" value={form.disease_current}
                  onChange={(e) => setField("disease_current", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.disease_intake")}>
                <input className="control control-sm" value={form.disease_intake}
                  onChange={(e) => setField("disease_intake", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.alcohol_use")}>
                <input className="control control-sm" value={form.alcohol_use}
                  onChange={(e) => setField("alcohol_use", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.address_before_arrest")}>
                <input className="control control-sm" value={form.address_before_arrest}
                  onChange={(e) => setField("address_before_arrest", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.release_residence")}>
                <input className="control control-sm" value={form.release_residence}
                  onChange={(e) => setField("release_residence", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.occupation")}>
                <input className="control control-sm" value={form.occupation}
                  onChange={(e) => setField("occupation", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.occupation_detail")}>
                <input className="control control-sm" value={form.occupation_detail}
                  onChange={(e) => setField("occupation_detail", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.file_number")}>
                <input className="control control-sm" value={form.file_number}
                  onChange={(e) => setField("file_number", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.file_number_sub")}>
                <input className="control control-sm" value={form.file_number_sub}
                  onChange={(e) => setField("file_number_sub", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.disease_current_detail")}>
                <input className="control control-sm" value={form.disease_current_detail}
                  onChange={(e) => setField("disease_current_detail", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.disease_intake_detail")}>
                <input className="control control-sm" value={form.disease_intake_detail}
                  onChange={(e) => setField("disease_intake_detail", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.education_level")}>
                <input className="control control-sm" value={form.education_level}
                  onChange={(e) => setField("education_level", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.professional_level")}>
                <input className="control control-sm" value={form.professional_level}
                  onChange={(e) => setField("professional_level", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.study_status")}>
                <input className="control control-sm" value={form.study_status}
                  onChange={(e) => setField("study_status", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.literacy")}>
                <input className="control control-sm" value={form.literacy}
                  onChange={(e) => setField("literacy", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.alias")}>
                <input className="control control-sm" value={form.alias}
                  onChange={(e) => setField("alias", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.note")} className="span-2col">
                <input className="control control-sm" value={form.note}
                  onChange={(e) => setField("note", e.target.value)}
                  placeholder={t("capture.field.note_ph")} />
              </InfoField>

              <InfoField label={t("detainee.field.height_cm")}>
                <input className="control control-sm" type="number" min="50" max="250"
                  value={form.height_cm}
                  onChange={(e) => setField("height_cm", e.target.value)}
                  placeholder="---" />
              </InfoField>
              <InfoField label={t("detainee.field.weight_kg")}>
                <input className="control control-sm" type="number" min="20" max="200"
                  value={form.weight_kg}
                  onChange={(e) => setField("weight_kg", e.target.value)}
                  placeholder="---" />
              </InfoField>

              <InfoField label={t("detainee.field.custody_type")}>
                <div className="radio-group radio-group-sm">
                  <label className="radio-option">
                    <input type="radio" name="capture-custody-type" value="tam_giu"
                      checked={form.custody_type === "tam_giu"}
                      onChange={(e) => setField("custody_type", e.target.value)} />
                    <span>{t("detainee.custody_type.temporary_hold")}</span>
                  </label>
                  <label className="radio-option">
                    <input type="radio" name="capture-custody-type" value="tam_giam"
                      checked={form.custody_type === "tam_giam"}
                      onChange={(e) => setField("custody_type", e.target.value)} />
                    <span>{t("detainee.custody_type.detention")}</span>
                  </label>
                </div>
              </InfoField>
              <InfoField label={t("detainee.field.facility_type")}>
                <select className="control control-sm"
                  value={form.facility_code}
                  onChange={(e) => setField("facility_code", e.target.value)}>
                  <option value="">{t("detainee.form.select_facility")}</option>
                  {facilities.map((f) => (
                    <option key={f.code} value={f.code}>{f.name}</option>
                  ))}
                </select>
              </InfoField>
              {form.custody_type === "tam_giam" && (
                <InfoField label={t("detainee.field.sub_camp")}>
                  <select className="control control-sm"
                    value={form.sub_camp_code}
                    onChange={(e) => setField("sub_camp_code", e.target.value)}>
                    <option value="">{t("detainee.form.select_sub_camp")}</option>
                    {subCamps.map((s) => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </select>
                </InfoField>
              )}
              <InfoField label={t("detainee.field.cell")}>
                <select className="control control-sm"
                  value={form.cell_code}
                  onChange={(e) => setField("cell_code", e.target.value)}>
                  <option value="">{t("detainee.form.select_cell")}</option>
                  {availableCells.map((c) => (
                    <option key={c.code} value={c.code}>{c.name || c.code}</option>
                  ))}
                </select>
              </InfoField>
            </div>
          </section>
        </div>

        {/* ================ Tier 3: Fingerprint + KPI ================ */}
        <div className="case-tier-3">
          <section className="cap-block">
            <div className="cap-block-head">
              <h2 className="cap-block-title">{t("capture.section.fp", { n: fpCount })}</h2>
              {fpLocked && (
                <span className="cccd-listen-badge locked">
                  <span className="cccd-listen-dot" />
                  {t("capture.toolbar.locked")}
                </span>
              )}
              <button
                type="button"
                className="btn-cccd-scan"
                onClick={toggleFpLock}
                title={fpLocked ? t("capture.toolbar.recollect") : t("capture.toolbar.lock")}
              >
                {fpLocked ? t("capture.toolbar.recollect") : t("capture.toolbar.lock")}
              </button>
            </div>
            <div className="fp-preview-grid fp-preview-grid--single-row">
              {[...LEFT_HAND, ...RIGHT_HAND].map((f) => {
                const label = t(`fp.finger.${f.code}.long`);
                const filled = !!photos[f.key];
                const fpCode = Object.entries(FP_CODE_TO_KEY).find(([, k]) => k === f.key)?.[0];
                const isActive = fpRunning && fpNextCode === fpCode;
                return (
                  <div
                    key={f.key}
                    className={"fp-preview-cell " + (filled ? "done" : "empty") + (isActive ? " active" : "")}
                    onDoubleClick={() => !fpRunning && retryFingerprint(f.key, fpCode)}
                    title={filled ? t("capture.fp.dbl_retake") : t("capture.fp.dbl_take")}
                    style={{ cursor: fpRunning ? "default" : "pointer" }}
                  >
                    <div className="fp-preview-thumb">
                      {filled ? (
                        <img src={photos[f.key]} alt={label} />
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 10.5c-.9 0-1.6.7-1.6 1.6v2.4c0 1.7.4 3.4 1.1 5" />
                          <path d="M9.2 8.5A4 4 0 0 1 16 11v3.4c0 1.4.2 2.7.6 4" />
                          <path d="M7 7.6A6 6 0 0 1 18 11v3.3c0 1 .1 2 .4 3" />
                          <path d="M5.2 9.8A8 8 0 0 1 20 11" />
                          <path d="M4.5 13.5c-.1-.9-.1-1.8 0-2.7" />
                          <path d="M6 18.5c-.5-1-.8-2.1-.9-3.2" />
                          <path d="M8.7 20.6c-.6-1-1-2-1.3-3.1" />
                          <path d="M15.7 20.7c.7-1.4 1-2.9 1.1-4.4" />
                        </svg>
                      )}
                    </div>
                    <span className="fp-name">{label}</span>
                  </div>
                );
              })}
            </div>
            <div className="fp-kpi fp-kpi-inline fp-kpi-3col">
              <div className="fp-kpi-cell">
                <span className="fp-kpi-num">{fpCount}</span>
                <span className="fp-kpi-divider">/ 10</span>
              </div>
              <div className="fp-kpi-cell">{t("capture.quality.collected", { n: fpCount })}</div>
              <div className="fp-kpi-cell">
                <span className="fp-kpi-percent">{fpCount === 10 ? "100%" : `${Math.round(fpCount * 10)}%`}</span>
              </div>
            </div>
          </section>
        </div>

      </div>

      {/* ================ Aside: Data verification only ================ */}
      <aside className="case-aside">
        <section className="cap-block case-verify">
          <div className="cap-block-head">
            <h2 className="cap-block-title">{t("capture.section.verify")}</h2>
          </div>
          <div className="verify-body">
            <div>
              <div className="verify-progress-label">
                <span>{t("capture.verify.overall")}</span>
                <span>{overallProgress}%</span>
              </div>
              <div className="verify-progress-bar">
                <span style={{ width: `${overallProgress}%` }} />
              </div>
            </div>
            <div className="verify-list">
              <div className="verify-item verify-head">
                <span className="v-label">{t("capture.verify.col.item")}</span>
                <span className="v-label">{t("capture.verify.col.status")}</span>
              </div>
              {checks.map((c) => (
                <div key={c.key} className="verify-item">
                  <span className="v-label">{c.label}</span>
                  <span className={"verify-chip " + (c.ok ? "ok" : c.required ? "miss" : "ok")}>
                    {c.ok ? t("capture.verify.status.ok") : c.required ? t("capture.verify.status.missing") : t("capture.verify.status.optional")}
                  </span>
                </div>
              ))}
            </div>
            <div className={"verify-banner " + (allRequiredValid ? "" : "warn")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15 8.5 22 9.3 17 14.1 18.5 21 12 17.5 5.5 21 7 14.1 2 9.3 9 8.5 12 2" />
              </svg>
              {allRequiredValid ? t("capture.verify.no_issue") : t("capture.verify.missing_required")}
            </div>
          </div>
        </section>
      </aside>

      {/* ================ Action bar ================ */}
      <div className="case-action-bar">
        <button type="button" className="button primary"
          disabled={!allRequiredValid || saving} onClick={submit}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <path d="M17 21v-8H7v8M7 3v5h8" />
          </svg>
          {saving ? t("common.saving") : isEdit ? t("capture.actions.update") : t("capture.actions.save")}
        </button>
        <button type="button" className="button secondary" disabled={saving}
          onClick={async () => {
            const payload = { form, photos, cells };
            const opened = await tryOpenOnSecondaryScreen(payload);
            if (opened) setPreviewOnSecondary(true);
            else setPreviewOpen(true);
          }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M8 13h8M8 17h6" />
          </svg>
          {t("capture.actions.preview")}
        </button>
        <button type="button" className="button danger" disabled={saving} onClick={resetAll}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
          </svg>
          {t("capture.actions.clear")}
        </button>
      </div>

      {previewOpen && (
        <ProfilePreviewModal
          form={form}
          photos={photos}
          cells={cells}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      <DuplicateWarnModal
        open={dupModal.open}
        matches={dupModal.matches}
        onProceed={onDupProceed}
        onOpenProfile={onDupOpenProfile}
        onEditProfile={onEditProfile ? onDupEdit : undefined}
        onCancel={onDupCancel}
      />
    </div>
  );
}

function InfoField({ label, children, className = "" }) {
  return (
    <label className={"info-field " + className}>
      <span className="info-field-label">{label}</span>
      {children}
    </label>
  );
}

function LiveCamShot({ label, shortLabel, value, onCapture, showRuler, onMeasureHeight, onPortraitRecognize, heightImage = 100, heightOffset = 103, useYolo = false }) {
  const { t } = useI18n();
  const videoRef = useRef(null);
  const frameRef = useRef(null);
  const streamRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState(false);
  // head_ratio = y1_đỉnh_đầu / chiều_cao_ảnh (0..1) do YOLO trả về khi upload.
  // Chiều cao tự động = (1 - head_ratio) * height_image + 103. null = chưa detect được.
  const [headRatio, setHeadRatio] = useState(null);

  useEffect(() => {
    if (value || preview) return;
    let cancelled = false;
    setErr("");
    setReady(false);
    (async () => {
      const openStream = async (constraints) => navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
      try {
        let probe;
        try { probe = await openStream({ facingMode: "user" }); }
        catch { probe = await openStream(true); }
        probe.getTracks().forEach((t) => t.stop());

        const preferredId = await pickPreferredCamera();
        let stream;
        if (preferredId) {
          try {
            stream = await openStream({ deviceId: { exact: preferredId }, width: { ideal: 1280 }, height: { ideal: 960 } });
          } catch {
            stream = await openStream({ facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } });
          }
        } else {
          stream = await openStream({ facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } });
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      } catch (e) {
        if (!cancelled) setErr(e.message || apiT("capture.err.camera_open"));
      }
    })();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [value, preview]);

  const snap = async () => {
    if (!videoRef.current || busy) return;
    setBusy(true);
    setErr("");
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(apiT("capture.err.camera_create")))), "image/jpeg", 0.92);
      });
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      const file = new File([blob], `portrait_${Date.now()}.jpg`, { type: "image/jpeg" });
      // Chỉ ảnh thẳng (useYolo) mới gọi type=portrait để YOLO vẽ vạch đỏ + đo chiều cao.
      // Ảnh trái/phải chụp thường, không cần YOLO.
      const res = await api.uploadPhoto(file, useYolo ? "portrait" : "");
      setHeadRatio(useYolo && typeof res.head_ratio === "number" ? res.head_ratio : null);
      onCapture(res.url);
      onPortraitRecognize?.(res.url);
      setPreview(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const retake = () => {
    setPreview(false);
    setHeadRatio(null);
    onCapture("");
  };

  const showLive = !value && !preview;
  const captured = Boolean(value);
  // Chiều cao TỰ ĐỘNG = (1 - head_ratio) * height_image + height_offset.
  // head_ratio = vị trí vạch đỉnh đầu tính từ đỉnh ảnh (0..1) → khoảng tới đáy = 1 - head_ratio.
  const measuredHeight = showRuler && headRatio != null
    ? getMeasurementHeight({
      linePixelHeight: (1 - headRatio) * 100,
      imageHeight: 100,
      heightImage,
      heightOffset,
    })
    : null;

  useEffect(() => {
    if (!captured || !showRuler || !onMeasureHeight || headRatio == null) return;
    onMeasureHeight({
      linePixelHeight: (1 - headRatio) * 100,
      imageHeight: 100,
    });
  }, [captured, showRuler, onMeasureHeight, headRatio]);

  return (
    <>
      <div className="body-shot-body">
        <div ref={frameRef} className={"body-shot-frame" + (captured ? " body-shot-frame--done" : "") + (showRuler ? " body-shot-frame--measure" : "")}>
          {captured ? (
            <>
              <img src={value} alt={label} />
              {showRuler && headRatio != null && (
                <div className="height-measure-overlay" aria-label="Đo chiều cao">
                  <div
                    className="height-measure-line height-measure-line--auto"
                    style={{ top: `${headRatio * 100}%`, height: `${(1 - headRatio) * 100}%` }}
                  >
                    {measuredHeight && <span className="height-measure-value">{measuredHeight} cm</span>}
                  </div>
                </div>
              )}
            </>
          ) : err ? (
            <div className="body-shot-err">{err}</div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="body-shot-video"
            />
          )}
        </div>
      </div>
      <button
        type="button"
        className="body-shot-btn"
        onClick={captured ? retake : snap}
        disabled={busy || (!captured && (!ready || !!err))}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        {busy ? t("capture.liveshot.saving") : ready || captured ? t("capture.liveshot.capture") : t("capture.liveshot.opening")}
      </button>
    </>
  );
}

function Tier3Row({ label, children }) {
  return (
    <div className="tier3-row" style={{ gridTemplateColumns: "1fr 110px" }}>
      <span className="tier3-label">{label}</span>
      {children}
    </div>
  );
}

function Tier3Static({ label, value }) {
  return (
    <div className="tier3-row">
      <span className="tier3-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" />
          <path d="M7 7h.01M7 17h.01" />
        </svg>
      </span>
      <span className="tier3-label">{label}</span>
      <span className="tier3-value">{value}</span>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="summary-row">
      <span className="s-label">{label}</span>
      <span className="s-value" title={String(value)}>{value}</span>
    </div>
  );
}

function TimelineItem({ time, desc }) {
  return (
    <div className="timeline-item">
      <span className="timeline-dot" />
      <div>
        <div className="timeline-time">{time}</div>
        <div className="timeline-desc">{desc}</div>
      </div>
    </div>
  );
}

export const ProfilePreviewContent = forwardRef(function ProfilePreviewContent(
  { form, photos, cells = [] },
  ref,
) {
  const { t, formatDateLong } = useI18n();
  const genderVi = form.gender === "female"
    ? t("common.female")
    : form.gender === "male"
      ? t("common.male")
      : "";
  const dateLong = formatDateLong(new Date());
  const val = (v) => (v && String(v).trim() ? v : t("pdf.blank"));
  const custLabel = (v) => {
    if (!v) return t("pdf.blank");
    if (v === "tam_giu") return t("detainee.custody_type.temporary_hold");
    if (v === "tam_giam") return t("detainee.custody_type.detention");
    return v;
  };
  const cellName = (code) => {
    if (!code) return t("pdf.blank");
    const c = cells.find((x) => x.code === code);
    return c ? c.name : code;
  };
  const alcoholLabel = (v) => {
    if (v === true || v === "true") return t("common.yes");
    if (v === false || v === "false") return t("common.no");
    return val(v);
  };

  return (
    <div ref={ref} className="preview-a4 preview-a4-portrait">
      {/* ===== Header: ảnh CCCD (góc trên trái) + emblem/motto (bên phải) ===== */}
      <div className="pv-header-row pv-header-row-v3">
        <div className="pv-cccd-strip">
          {photos.cccd_front
            ? <img src={photos.cccd_front} alt={t("pdf.cccd_photo")} />
            : <span className="pv-cccd-strip-empty">{t("pdf.cccd_photo")}</span>}
          {photos.cccd_back
            ? <img src={photos.cccd_back} alt={t("pdf.cccd_photo")} />
            : null}
        </div>
        <div className="pv-header-left pv-header-left-v3">
          <div className="pv-org1">{t("pdf.emblem")}</div>
          <div className="pv-org2">{t("pdf.motto")}</div>
          <div className="pv-org-underline" />
        </div>
      </div>

      {/* ===== Title ===== */}
      <div className="pv-title-row">
        <h1 className="pv-title">{t("pdf.title")}</h1>
        <div className="pv-subtitle">
          {t("pdf.record_id")} <b>{val(form.personal_id || form.cccd_number)}</b>
        </div>
      </div>

      {/* ===== 2 cột: I. Thông tin cá nhân (+Hồ sơ) | II. Diện giam + Sức khỏe + Trình độ ===== */}
      <div className="pv-info-cols">
        {/* ---- Cột trái ---- */}
        <div className="pv-info-col">
          <h3 className="pv-section">{t("pdf.section1")}</h3>
          <table className="pv-table pv-info-table pv-info-single">
            <tbody>
              <tr><td className="pv-label">{t("pdf.field.full_name")}</td><td>{val(form.full_name)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.dob")}</td><td>{val(form.dob)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.gender")}</td><td>{val(genderVi)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.cccd")}</td><td>{val(form.cccd_number)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.nationality")}</td><td>{val(form.nationality)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.ethnicity")}</td><td>{val(form.ethnicity)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.religion")}</td><td>{val(form.religion)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.hometown")}</td><td>{val(form.hometown)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.address")}</td><td>{val(form.address)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.issued_date")}</td><td>{val(form.issued_date)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.expiry")}</td><td>{val(form.expiry_date)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.issued_place")}</td><td>{val(form.issued_place)}</td></tr>
              <tr><td className="pv-label">{t("detainee.field.distinguishing_features")}</td><td>{val(form.distinguishing_features)}</td></tr>
              <tr><td className="pv-label">{t("detainee.field.mrz")}</td><td><pre className="pv-mrz">{val(form.mrz)}</pre></td></tr>
              <tr><td className="pv-label">{t("detainee.field.alias")}</td><td>{val(form.alias)}</td></tr>
            </tbody>
          </table>

          <h3 className="pv-section pv-section-sub">{t("pdf.section2.file")}</h3>
          <table className="pv-table pv-info-table pv-info-single">
            <tbody>
              <tr><td className="pv-label">{t("detainee.field.file_number")}</td><td>{val(form.file_number)}</td></tr>
              <tr><td className="pv-label">{t("detainee.field.file_number_sub")}</td><td>{val(form.file_number_sub)}</td></tr>
              <tr><td className="pv-label">{t("detainee.field.search_index")}</td><td>{val(form.search_index)}</td></tr>
              <tr><td className="pv-label">{t("detainee.field.address_before_arrest")}</td><td>{val(form.address_before_arrest)}</td></tr>
              <tr><td className="pv-label">{t("detainee.field.release_residence")}</td><td>{val(form.release_residence)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.note")}</td><td>{val(form.note)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* ---- Cột phải ---- */}
        <div className="pv-info-col">
          <h3 className="pv-section">{t("pdf.section2.custody")}</h3>
          <div className="pv-info-grid">
            <div className="pv-g-label">{t("detainee.field.custody_type")}</div>
            <div>{custLabel(form.custody_type)}</div>
            <div className="pv-g-label">{t("detainee.field.facility_type")}</div>
            <div>{cellName(form.facility_code)}</div>
            {form.custody_type === "tam_giam" && (
              <>
                <div className="pv-g-label">{t("detainee.field.sub_camp")}</div>
                <div>{cellName(form.sub_camp_code)}</div>
              </>
            )}
            <div className="pv-g-label">{t("detainee.field.cell_block")}</div>
            <div>{cellName(form.cell_code)}</div>
            <div className="pv-g-label">{t("detainee.field.squad")}</div>
            <div>{val(form.squad)}</div>
            <div className="pv-g-label">{t("detainee.field.status_detainee")}</div>
            <div>{val(form.status_detainee)}</div>
            <div className="pv-g-label">{t("pdf.field.date_in")}</div>
            <div>{toDobInput(form.date_in) || toDobInput(new Date())}</div>
          </div>

          <h3 className="pv-section pv-section-sub">{t("pdf.section2.health")}</h3>
          <div className="pv-info-grid">
            <div className="pv-g-label">{t("detainee.field.health_intake")}</div>
            <div>{val(form.health_intake)}</div>
            <div className="pv-g-label">{t("detainee.field.alcohol_use")}</div>
            <div>{alcoholLabel(form.alcohol_use)}</div>
            <div className="pv-g-label">{t("detainee.field.disease_intake")}</div>
            <div>{val(form.disease_intake)}</div>
            <div className="pv-g-label">{t("detainee.field.disease_intake_detail")}</div>
            <div>{val(form.disease_intake_detail)}</div>
            <div className="pv-g-label">{t("detainee.field.disease_current")}</div>
            <div>{val(form.disease_current)}</div>
            <div className="pv-g-label">{t("detainee.field.disease_current_detail")}</div>
            <div>{val(form.disease_current_detail)}</div>
          </div>

          <h3 className="pv-section pv-section-sub">{t("pdf.section2.edu")}</h3>
          <div className="pv-info-grid">
            <div className="pv-g-label">{t("detainee.field.education_level")}</div>
            <div>{val(form.education_level)}</div>
            <div className="pv-g-label">{t("detainee.field.professional_level")}</div>
            <div>{val(form.professional_level)}</div>
            <div className="pv-g-label">{t("detainee.field.study_status")}</div>
            <div>{val(form.study_status)}</div>
            <div className="pv-g-label">{t("detainee.field.literacy")}</div>
            <div>{val(form.literacy)}</div>
            <div className="pv-g-label">{t("detainee.field.occupation")}</div>
            <div>{val(form.occupation)}</div>
            <div className="pv-g-label">{t("detainee.field.occupation_detail")}</div>
            <div>{val(form.occupation_detail)}</div>
            <div className="pv-g-label">{t("pdf.field.height")}</div>
            <div>{val(form.height_cm)}</div>
            <div className="pv-g-label">{t("pdf.field.weight")}</div>
            <div>{val(form.weight_kg)}</div>
          </div>
        </div>
      </div>

      {/* ===== III. Portrait photos (3 frames) ===== */}
      <h3 className="pv-section">{t("pdf.section3")}</h3>
      <div className="pv-portraits">
        {PORTRAITS.map((p) => (
          <div key={p.key} className="pv-portrait-item">
            <div className="pv-portrait-frame">
              {photos[p.key]
                ? <img src={photos[p.key]} alt={t(p.labelKey)} />
                : <span className="pv-empty">{t("pdf.no_photo")}</span>}
            </div>
            <span>{t(p.labelKey)}</span>
          </div>
        ))}
      </div>

      {/* ===== IV. Ten-finger prints (2 rows x 5 cols by hand) ===== */}
      <h3 className="pv-section">{t("pdf.section4")}</h3>
      <div className="pv-fp-wrap">
        <div className="pv-fp-hand">
          <div className="pv-fp-grid">
            {LEFT_HAND.map((f) => {
              const label = t(`fp.finger.${f.code}.long`);
              return (
                <div key={f.key} className="pv-fp-item">
                  <div className="pv-fp-frame">
                    {photos[f.key]
                      ? <img src={photos[f.key]} alt={label} />
                      : <span className="pv-empty">—</span>}
                  </div>
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="pv-fp-hand">
          <div className="pv-fp-grid">
            {RIGHT_HAND.map((f) => {
              const label = t(`fp.finger.${f.code}.long`);
              return (
                <div key={f.key} className="pv-fp-item">
                  <div className="pv-fp-frame">
                    {photos[f.key]
                      ? <img src={photos[f.key]} alt={label} />
                      : <span className="pv-empty">—</span>}
                  </div>
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== Signatures ===== */}
      <div className="pv-signatures">
        <div className="pv-sig-block">
          <div className="pv-sig-place">&nbsp;</div>
          <div className="pv-sig-role">{t("pdf.declarant")}</div>
          <div className="pv-sig-note">{t("pdf.sign_note")}</div>
          <div className="pv-sig-space" />
        </div>
        <div className="pv-sig-block">
          <div className="pv-sig-place">{dateLong}</div>
          <div className="pv-sig-role">{t("pdf.officer")}</div>
          <div className="pv-sig-note">{t("pdf.sign_note")}</div>
          <div className="pv-sig-space" />
        </div>
      </div>
    </div>
  );
});

function ProfilePreviewModal({ form, photos, cells = [], onClose }) {
  const { t } = useI18n();
  const a4Ref = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [usbPicker, setUsbPicker] = useState({ open: false, drives: [], resolve: null });

  const pickDrive = (drives) => new Promise((resolve) => {
    setUsbPicker({ open: true, drives, resolve });
  });

  const handlePrint = async () => {
    const node = a4Ref.current;
    if (!node) return;
    setExporting(true);
    try {
      const info = await usbApi.listWritable();
      const drives = info.drives || [];
      const dongles = info.dongle_drives || [];
      if (drives.length === 0) {
        if (dongles.length > 0) throw new Error(apiT("usb.export.err.only_dongle"));
        throw new Error(apiT("usb.export.err.no_drive"));
      }
      const chosen = drives.length === 1 ? drives[0] : await pickDrive(drives);
      if (!chosen) return;
      const blob = await buildProfilePdfBlob(node);
      const filename = makePdfFileName(form.personal_id || form.cccd_number, form.full_name);
      const saved = await usbApi.saveExport(chosen.path, filename, blob);
      const okMsg = t("usb.export.success", { path: saved?.path || chosen.path });
      notify.add(okMsg);
      toast.success(okMsg);
    } catch (ex) {
      console.error("[Export PDF] error:", ex);
      toast.error(t("capture.pdf.err_export", { message: ex?.message || ex }));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="preview-backdrop" onClick={onClose}>
      <div className="preview-toolbar no-print" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="preview-btn" onClick={handlePrint} disabled={exporting}>
          {exporting ? t("capture.pdf.exporting") : t("capture.pdf.export")}
        </button>
        <button type="button" className="preview-btn preview-close" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>

      <div className="preview-scroll" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()}>
          <ProfilePreviewContent ref={a4Ref} form={form} photos={photos} cells={cells} />
        </div>
      </div>

      {usbPicker.open && (
        <UsbDrivePickerModal
          drives={usbPicker.drives}
          onPick={(d) => {
            const r = usbPicker.resolve;
            setUsbPicker({ open: false, drives: [], resolve: null });
            r && r(d);
          }}
          onCancel={() => {
            const r = usbPicker.resolve;
            setUsbPicker({ open: false, drives: [], resolve: null });
            r && r(null);
          }}
        />
      )}
    </div>
  );
}

function CheckDot({ ok, tone }) {
  const cls = tone ? tone : ok ? "ok" : "warn";
  return (
    <span className={"chk-dot " + cls}>
      {ok ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" /><path d="M12 8v5M12 16h.01" />
        </svg>
      )}
    </span>
  );
}

function InfoDot() {
  return (
    <span className="info-dot">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" />
      </svg>
    </span>
  );
}

