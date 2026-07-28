import { useEffect, useMemo, useRef, useState } from "react";
import { api, fpApi, cccdApi, b64PngToFile, weightApi } from "./api";
import { notify } from "./notifications";
import cccdTemplateBg from "./assets/cccd-template.png";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useI18n, apiT } from "./i18n";

function removeVietnameseDiacritics(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function makePdfFileName(personalId, fullName) {
  const code = removeVietnameseDiacritics(personalId || "hoso")
    .replace(/[^A-Za-z0-9_-]+/g, "")
    .trim() || "hoso";
  const name = removeVietnameseDiacritics(fullName || "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim() || "khongten";
  return `${code}_${name}.pdf`;
}

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
  height_cm: "",
  weight_kg: "",
  cell_code: "",
  note: "",
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

function CccdCardUpload({ form, photos, cardPortrait, onUpload, onClear, onCardPortraitPreview }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

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
        <div className="cccd-mf cccd-mf-no">{form.cccd_number || ""}</div>
        <div className="cccd-mf cccd-mf-name">{form.full_name || ""}</div>
        <div className="cccd-mf cccd-mf-dob">{form.dob || ""}</div>
        <div className="cccd-mf cccd-mf-sex">{form.gender ? (form.gender === "female" ? t("common.female") : t("common.male")) : ""}</div>
        <div className="cccd-mf cccd-mf-nat">{form.nationality || ""}</div>
        <div className="cccd-mf cccd-mf-origin">{form.hometown || ""}</div>
        <div className="cccd-mf cccd-mf-res">{form.address || ""}</div>
        <div className="cccd-mf cccd-mf-exp">{form.expiry_date || ""}</div>
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
      height_cm: initial.height_cm != null ? String(initial.height_cm) : "",
      weight_kg: initial.weight_kg != null ? String(initial.weight_kg) : "",
      cell_code: initial.cell_code || "",
      note: initial.note || "",
    },
    photos,
  };
}

export default function DataCapturePage({ go, initial, onDone, sessionId, sessionCode, sessionReadOnly = false, onSavedInSession }) {
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
  const [cells, setCells] = useState([]);
  const [fpRunning, setFpRunning] = useState(false);
  const [fpNextCode, setFpNextCode] = useState(null);
  const [fpStatus, setFpStatus] = useState("");
  const [fpError, setFpError] = useState("");
  const fpAbortRef = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);

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

  const stopFpCollect = () => {
    fpAbortRef.current = true;
    setFpRunning(false);
    setFpNextCode(null);
    setFpStatus("");
  };

  // Double-click 1 ô vân tay để thu/thu lại ngón đó
  const retryFingerprint = async (photoKey, fingerCode) => {
    console.log("[retryFingerprint] called", { photoKey, fingerCode, fpRunning });
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
      cmnd_old: d.cmnd_old || f.cmnd_old,
    }));
    if (d.facePhoto) {
      const dataUrl = `data:image/jpeg;base64,${d.facePhoto}`;
      setCccdCardPortrait(dataUrl);
      try {
        const file = await b64PngToFile(d.facePhoto, `cccd_face_${d.cccd_number || Date.now()}.jpg`);
        const jpgFile = new File([file], file.name, { type: "image/jpeg" });
        const res = await api.uploadPhoto(jpgFile);
        setPhoto("cccd_front", res.url);
      } catch (uploadEx) {
        console.error("[CCCD] portrait upload failed:", uploadEx);
        setErr(t("capture.err.cccd_saved_photo", { message: uploadEx.message }));
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

  const fpCount = FINGERS.filter((f) => photos[f.key]).length;
  const portraitCount = PORTRAITS.filter((p) => photos[p.key]).length;

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

  const submit = async () => {
    if (!allRequiredValid) return;
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
        height_cm: form.height_cm ? Math.round(Number(form.height_cm)) : null,
        weight_kg: form.weight_kg ? Math.round(Number(form.weight_kg)) : null,
        cell_code: strOrNull(form.cell_code),
        note: strOrNull(form.note),
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
        {/* ================ Tier 1: 3 cols — Photo + Personal info + CCCD ================ */}
        <div className="case-tier-1">
          <section className="cap-block">
            <div className="cap-block-head">
              <h2 className="cap-block-title">{t("capture.section.body_photo")}</h2>
            </div>
            <div className="body-shots">
              {PORTRAITS.map((p) => (
                <div key={p.key} className="body-shot">
                  <span className="body-shot-label">
                    {p.key === "portrait_left" ? "TRÁI" : p.key === "portrait_front" ? "THẲNG" : "PHẢI"}
                  </span>
                  <LiveCamShot
                    label={t(p.labelKey)}
                    shortLabel={p.key === "portrait_left" ? "TRÁI" : p.key === "portrait_front" ? "THẲNG" : "PHẢI"}
                    value={photos[p.key]}
                    onCapture={(u) => setPhoto(p.key, u)}
                    showRuler={p.key === "portrait_front"}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="cap-block">
            <div className="cap-block-head">
              <h2 className="cap-block-title">{t("capture.section.personal")}</h2>
            </div>
            <div className="personal-info">
              {/* Col 1 */}
              <InfoField label={t("capture.form.personal_id")}>
                <input className="control control-sm" value={form.personal_id}
                  onChange={(e) => setField("personal_id", e.target.value)}
                  placeholder={t("capture.form.personal_id_ph")} />
              </InfoField>
              {/* Col 2 */}
              <InfoField label={t("detainee.field.hometown")}>
                <input className="control control-sm" value={form.hometown}
                  onChange={(e) => setField("hometown", e.target.value)}
                  placeholder={t("capture.form.hometown_ph")} />
              </InfoField>

              <InfoField label={t("detainee.field.full_name")}>
                <input className="control control-sm" value={form.full_name}
                  onChange={(e) => setField("full_name", e.target.value)}
                  placeholder={t("capture.form.full_name_ph")} />
              </InfoField>
              <InfoField label={t("detainee.field.address")}>
                <input className="control control-sm" value={form.address}
                  onChange={(e) => setField("address", e.target.value)}
                  placeholder={t("capture.form.address_ph")} />
              </InfoField>

              <InfoField label={t("detainee.field.cccd")}>
                <input className="control control-sm" value={form.cccd_number}
                  onChange={(e) => setField("cccd_number", e.target.value.replace(/\D/g, "").slice(0, 12))}
                  placeholder={t("capture.form.cccd_ph")} inputMode="numeric" />
              </InfoField>
              <InfoField label={t("detainee.field.issued_date")}>
                <input className="control control-sm" value={form.issued_date}
                  onChange={(e) => setField("issued_date", e.target.value)}
                  placeholder={t("capture.form.date_ph")} />
              </InfoField>

              <InfoField label={t("detainee.field.dob")}>
                <input className="control control-sm" value={form.dob}
                  onChange={(e) => setField("dob", e.target.value)}
                  placeholder={t("capture.form.date_ph")} />
              </InfoField>
              <InfoField label={t("detainee.field.expiry_date")}>
                <input className="control control-sm" value={form.expiry_date}
                  onChange={(e) => setField("expiry_date", e.target.value)}
                  placeholder={t("capture.form.date_ph")} />
              </InfoField>

              <InfoField label={t("detainee.field.gender")}>
                <select className="control control-sm" value={form.gender}
                  onChange={(e) => setField("gender", e.target.value)}>
                  <option value="">{t("common.select")}</option>
                  <option value="male">{t("common.male")}</option>
                  <option value="female">{t("common.female")}</option>
                </select>
              </InfoField>
              <InfoField label={t("detainee.field.ethnicity")}>
                <input className="control control-sm" value={form.ethnicity}
                  onChange={(e) => setField("ethnicity", e.target.value)}
                  placeholder={t("capture.form.ethnicity_ph")} />
              </InfoField>

              <InfoField label={t("detainee.field.nationality")}>
                <input className="control control-sm" value={form.nationality}
                  onChange={(e) => setField("nationality", e.target.value)} />
              </InfoField>
              <InfoField label={t("detainee.field.religion")}>
                <input className="control control-sm" value={form.religion}
                  onChange={(e) => setField("religion", e.target.value)}
                  placeholder={t("capture.form.religion_ph")} />
              </InfoField>
            </div>
          </section>

          <section className="cap-block">
            <div className="cap-block-head">
              <h2 className="cap-block-title">{t("capture.section.cccd_card")}</h2>
              <span className={"cccd-listen-badge" + (reading ? " on" : "")}>
                <span className="cccd-listen-dot" />
                {reading ? t("capture.toolbar.listening") : t("capture.toolbar.reader_off")}
              </span>
            </div>
            <div className="cccd-preview-wrap">
              <CccdCardUpload
                form={form}
                photos={photos}
                cardPortrait={cccdCardPortrait}
                onUpload={(url) => setPhoto("cccd_front", url)}
                onClear={() => { setPhoto("cccd_front", ""); setCccdCardPortrait(""); }}
                onCardPortraitPreview={setCccdCardPortrait}
              />
            </div>
          </section>
        </div>

        {/* ================ Tier 2: Fingerprint + KPI ================ */}
        <div className="case-tier-2">
          <section className="cap-block">
            <div className="cap-block-head">
              <h2 className="cap-block-title">{t("capture.section.fp", { n: fpCount })}</h2>
              {!fpRunning ? (
                <button type="button" className="btn-cccd-scan" onClick={startFpCollect}>
                  {t("capture.toolbar.enroll")}
                </button>
              ) : (
                <button type="button" className="btn-cccd-scan" onClick={stopFpCollect}>
                  {t("capture.toolbar.stop")}
                </button>
              )}
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
          </section>

          <section className="cap-block">
            <div className="cap-block-head">
              <h2 className="cap-block-title">{t("capture.section.quality")}</h2>
            </div>
            <div className="fp-kpi">
              <div className="fp-kpi-icon">
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
              </div>
              <div className="fp-kpi-count">{t("capture.quality.collected", { n: fpCount })}</div>
              <div className="fp-kpi-big">{fpCount === 10 ? "100%" : `${Math.round(fpCount * 10)}%`}</div>
            </div>
          </section>
        </div>

        {/* ================ Tier 3: 4 side cols ================ */}
        <div className="case-tier-3">
          <section className="cap-block">
            <div className="cap-block-head">
              <h2 className="cap-block-title">{t("capture.section.extra")}</h2>
            </div>
            <div className="tier3-body">
              <Tier3Row label={t("capture.field.height_cm")}>
                <div className="tier3-input-unit">
                  <input className="control tier3-input" type="number" min="50" max="250" value={form.height_cm}
                    onChange={(e) => setField("height_cm", e.target.value)} placeholder="---" />
                  <span className="tier3-unit">cm</span>
                </div>
              </Tier3Row>
              <Tier3Row label={t("capture.field.weight_kg")}>
                <div className="tier3-input-unit">
                  <input className="control tier3-input" type="number" min="20" max="200" value={form.weight_kg}
                    onChange={(e) => setField("weight_kg", e.target.value)} placeholder="---" />
                  <span className="tier3-unit">kg</span>
                </div>
              </Tier3Row>
              <Tier3Row label={t("capture.field.cell")}>
                <input
                  className="control tier3-input"
                  type="text"
                  list="cell-code-suggestions"
                  value={form.cell_code}
                  onChange={(e) => setField("cell_code", e.target.value)}
                  placeholder={t("capture.field.cell_ph")}
                />
                <datalist id="cell-code-suggestions">
                  {cells.map((c) => (
                    <option key={c.code} value={c.code}>{c.name || c.code}</option>
                  ))}
                </datalist>
              </Tier3Row>
            </div>
          </section>

          <section className="cap-block">
            <div className="cap-block-head">
              <h2 className="cap-block-title">{t("capture.section.devices")}</h2>
            </div>
            <div className="tier3-body">
              <Tier3Static label={t("capture.field.device")} value="Vali" />
              <Tier3Static label={t("capture.field.serial")} value="ZKF-4500-2401" />
              <Tier3Static label={t("capture.field.software")} value="v5.3.4.1" />
              <Tier3Static label={t("capture.field.method")} value="Live Scan" />
              <Tier3Static label={t("capture.field.workstation")} value={typeof window !== "undefined" ? window.location.hostname : "-"} />
            </div>
          </section>

          <section className="cap-block">
            <div className="cap-block-head">
              <h2 className="cap-block-title">{t("capture.section.note")}</h2>
            </div>
            <div className="notes-body">
              <textarea
                className="control notes-input"
                value={form.note}
                onChange={(e) => setField("note", e.target.value)}
                placeholder={t("capture.field.note_ph")}
                rows={4}
              />
            </div>
          </section>

          <section className="cap-block">
            <div className="cap-block-head">
              <h2 className="cap-block-title">{t("capture.section.history")}</h2>
            </div>
            <div className="timeline-body">
              <TimelineItem time={captureTimeStr} desc={t("capture.timeline.capture")} />
              <TimelineItem time={captureTimeStr} desc={t("capture.timeline.verify")} />
              {readyState && <TimelineItem time={captureTimeStr} desc={t("capture.timeline.ready")} />}
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
          onClick={() => setPreviewOpen(true)}>
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
    </div>
  );
}

function InfoField({ label, children }) {
  return (
    <label className="info-field">
      <span className="info-field-label">{label}</span>
      {children}
    </label>
  );
}

function LiveCamShot({ label, shortLabel, value, onCapture, showRuler }) {
  const { t } = useI18n();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState(false);

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
      const res = await api.uploadPhoto(file);
      onCapture(res.url);
      setPreview(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const retake = () => {
    setPreview(false);
    onCapture("");
  };

  const showLive = !value && !preview;
  const captured = Boolean(value);

  return (
    <>
      <div className="body-shot-body">
        <div className={"body-shot-frame" + (captured ? " body-shot-frame--done" : "")}>
          {captured ? (
            <img src={value} alt={label} />
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

function ProfilePreviewModal({ form, photos, cells, onClose }) {
  const { t, formatDateLong } = useI18n();
  const cell = cells.find((c) => c.code === form.cell_code);
  const genderVi = form.gender === "female" ? t("common.female") : t("common.male");
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  const dateLong = formatDateLong(today);

  const val = (v) => (v && String(v).trim() ? v : t("pdf.blank"));

  const a4Ref = useRef(null);
  const [exporting, setExporting] = useState(false);

  const handlePrint = async () => {
    const node = a4Ref.current;
    if (!node) return;
    setExporting(true);
    try {
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
        // Paginate: slice canvas into pageH-tall chunks
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
      pdf.save(makePdfFileName(form.personal_id || form.cccd_number, form.full_name));
    } catch (ex) {
      console.error("[Export PDF] error:", ex);
      alert(t("capture.pdf.err_export", { message: ex?.message || ex }));
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
        <div ref={a4Ref} className="preview-a4 preview-a4-portrait" onClick={(e) => e.stopPropagation()}>

          {/* ===== Header: national emblem centered ===== */}
          <div className="pv-header-row">
            <div className="pv-header-left">
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

          {/* ===== I. Personal info (2 cols: table + 4x6 portrait) ===== */}
          <h3 className="pv-section">{t("pdf.section1")}</h3>
          <div className="pv-info-row">
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
              </tbody>
            </table>
            <div className="pv-info-photo">
              <div className="pv-portrait-4x6">
                {photos.cccd_front
                  ? <img src={photos.cccd_front} alt={t("pdf.cccd_photo")} />
                  : <span>{t("pdf.cccd_photo")}</span>}
              </div>
              <div className="pv-portrait-4x6-caption">{t("pdf.cccd_photo")}</div>
            </div>
          </div>

          {/* ===== II. Biometric & custody info ===== */}
          <h3 className="pv-section">{t("pdf.section2")}</h3>
          <div className="pv-info-grid">
            <div className="pv-g-label">{t("pdf.field.height")}</div>
            <div className="pv-g-value">{val(form.height_cm)}</div>
            <div className="pv-g-label">{t("pdf.field.weight")}</div>
            <div className="pv-g-value">{val(form.weight_kg)}</div>

            <div className="pv-g-label">{t("pdf.field.date_in")}</div>
            <div className="pv-g-value">{val(form.date_in)}</div>
            <div className="pv-g-label">{t("pdf.field.cell")}</div>
            <div className="pv-g-value">{val(form.cell_code)}</div>

            <div className="pv-g-label">{t("pdf.field.note")}</div>
            <div className="pv-g-value pv-g-note">{val(form.note)}</div>
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
              <div className="pv-sig-place">
                {dateLong}
              </div>
              <div className="pv-sig-role">{t("pdf.officer")}</div>
              <div className="pv-sig-note">{t("pdf.sign_note")}</div>
              <div className="pv-sig-space" />
            </div>
          </div>
        </div>
      </div>
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

