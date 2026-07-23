import { useEffect, useMemo, useRef, useState } from "react";
import { api, fpApi, cccdApi, b64PngToFile } from "./api";
import cccdTemplateBg from "./assets/cccd-template.png";

const FINGERS = [
  { key: "fp_l1", label: "T. cái trái" },
  { key: "fp_l2", label: "T. trỏ trái" },
  { key: "fp_l3", label: "T. giữa trái" },
  { key: "fp_l4", label: "T. áp út trái" },
  { key: "fp_l5", label: "T. út trái" },
  { key: "fp_r1", label: "T. cái phải" },
  { key: "fp_r2", label: "T. trỏ phải" },
  { key: "fp_r3", label: "T. giữa phải" },
  { key: "fp_r4", label: "T. áp út phải" },
  { key: "fp_r5", label: "T. út phải" },
];

// Sắp xếp theo hình bàn tay: út → áp út → giữa → trỏ → cái (ngón cái sát giữa)
const LEFT_HAND = [
  { key: "fp_l5", label: "Út" },
  { key: "fp_l4", label: "Áp út" },
  { key: "fp_l3", label: "Giữa" },
  { key: "fp_l2", label: "Trỏ" },
  { key: "fp_l1", label: "Cái" },
];
const RIGHT_HAND = [
  { key: "fp_r1", label: "Cái" },
  { key: "fp_r2", label: "Trỏ" },
  { key: "fp_r3", label: "Giữa" },
  { key: "fp_r4", label: "Áp út" },
  { key: "fp_r5", label: "Út" },
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

const FP_NAME_VI = {
  left_thumb: "ngón cái trái",
  left_index: "ngón trỏ trái",
  left_middle: "ngón giữa trái",
  left_ring: "ngón áp út trái",
  left_little: "ngón út trái",
  right_thumb: "ngón cái phải",
  right_index: "ngón trỏ phải",
  right_middle: "ngón giữa phải",
  right_ring: "ngón áp út phải",
  right_little: "ngón út phải",
};

const PORTRAITS = [
  { key: "portrait_front", label: "Ảnh thẳng" },
  { key: "portrait_left", label: "Ảnh trái" },
  { key: "portrait_right", label: "Ảnh phải" },
];

const EMPTY_FORM = {
  full_name: "",
  cccd_number: "",
  personal_id: "",
  dob: "",
  gender: "",
  nationality: "Việt Nam",
  ethnicity: "",
  religion: "",
  hometown: "",
  address: "",
  issued_date: "",
  expiry_date: "",
  issued_place: "",
  height_cm: "",
  weight_kg: "",
  charge: "",
  cell_code: "",
  note: "",
};

async function cropPortraitFromCCCD(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Không đọc được file"));
    r.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Ảnh không hợp lệ"));
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
        <div className="cccd-mf cccd-mf-sex">{form.gender ? (form.gender === "female" ? "Nữ" : "Nam") : ""}</div>
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
          aria-label="Xoá ảnh CCCD"
        >×</button>
      )}
      {(uploading || err) && (
        <div className="cccd-card-mock-hint">
          {uploading ? "Đang tải & cắt ảnh..." : err}
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
    r.onerror = () => reject(new Error("Không đọc được file ảnh"));
    r.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Ảnh không hợp lệ"));
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
        if (!cancelled) setErr(e.message || "Không mở được camera. Kiểm tra quyền truy cập.");
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
          setErr("Không tạo được ảnh từ camera.");
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
          <h3>Chụp {label || "ảnh chân dung"}</h3>
          <button className="close-x" onClick={onClose} aria-label="Đóng">×</button>
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
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Huỷ</button>
          <button className="btn-primary" onClick={snap} disabled={!ready || busy || !!err}>
            {busy ? "Đang xử lý..." : "📸 Chụp"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PhotoSlot({ label, value, onChange, aspect = "1 / 1", size, compact, disabled, resize, useCamera }) {
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
              aria-label="Xoá ảnh"
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
          {!compact && <span className="photo-slot-label">{useCamera ? `📷 Chụp ${label}` : label}</span>}
          {!compact && uploading && <span className="photo-slot-hint">Đang tải...</span>}
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
      nationality: initial.nationality || "Việt Nam",
      ethnicity: initial.ethnicity || "",
      religion: initial.religion || "",
      hometown: initial.hometown || "",
      address: initial.address || "",
      issued_date: toDobInput(initial.issued_date),
      expiry_date: toDobInput(initial.expiry_date),
      issued_place: initial.issued_place || "",
      height_cm: initial.height_cm != null ? String(initial.height_cm) : "",
      weight_kg: initial.weight_kg != null ? String(initial.weight_kg) : "",
      charge: initial.charge || "",
      cell_code: initial.cell_code || "",
      note: initial.note || "",
    },
    photos,
  };
}

export default function DataCapturePage({ go, initial, onDone, sessionId, sessionCode, sessionReadOnly = false, onSavedInSession }) {
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
          i.onerror = () => reject(new Error("Không tải được ảnh CCCD đã lưu"));
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

  const startFpCollect = async () => {
    if (fpRunning) return;
    setFpError("");
    setFpStatus("Đang kiểm tra máy quét...");
    fpAbortRef.current = false;

    try {
      const h = await fpApi.health();
      if (!h.ok) {
        setFpError(h.error || "Máy quét vân tay chưa sẵn sàng.");
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
      const r = await fpApi.startSession(form.full_name.trim() || "Ẩn danh");
      sid = r.session_id;
      let next = r.next_finger;

      while (next && !fpAbortRef.current) {
        setFpNextCode(next.code);
        setFpStatus(`Đặt ${FP_NAME_VI[next.code] || next.code} lên máy quét và giữ yên ~1 giây...`);
        let capRes;
        try {
          capRes = await fpApi.capture(sid);
        } catch (e) {
          if (fpAbortRef.current) break;
          setFpError(e.message + " — Đặt lại ngón tay để thử lại.");
          continue;
        }
        if (fpAbortRef.current) break;

        const code = capRes.finger.code;
        const key = FP_CODE_TO_KEY[code];
        if (key) {
          try {
            const file = await b64PngToFile(capRes.finger.image_b64, `${key}.png`);
            const up = await api.uploadPhoto(file);
            setPhoto(key, up.url);
          } catch (e) {
            setFpError("Không lưu được ảnh: " + e.message);
          }
        }
        setFpStatus(capRes.message || `Đã thu ${FP_NAME_VI[code] || code}.`);
        next = capRes.next_finger;
      }

      if (!fpAbortRef.current) {
        setFpStatus("Đã thu đủ 10 ngón vân tay.");
        setOk("Đã thu thập đủ 10/10 vân tay từ máy quét.");
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
        setPhoto("portrait_front", res.url);
      } catch (uploadEx) {
        console.error("[CCCD] Không upload được ảnh chân dung:", uploadEx);
        setErr("Đọc CCCD thành công nhưng không lưu được ảnh: " + uploadEx.message);
      }
    }
  };

  const readCCCD = async () => {
    if (reading) return;
    setErr("");
    setOk("");
    setReading(true);
    const ac = new AbortController();
    cccdAbortRef.current = ac;
    try {
      const h = await cccdApi.health();
      if (!h.ok) {
        throw new Error("Thư mục dữ liệu CCCD chưa sẵn sàng: " + (h.data_dir || ""));
      }
      const s = await cccdApi.startSession();
      cccdSidRef.current = s.session_id;
      while (!ac.signal.aborted) {
        const r = await cccdApi.wait(s.session_id, ac.signal, 25);
        if (ac.signal.aborted) break;
        if (r && r.status === "ok" && r.data) {
          applyCccdData(r.data);
          setOk("Đã đọc dữ liệu CCCD từ HANEL eKYC.");
          break;
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") setErr(e.message);
    } finally {
      const sid = cccdSidRef.current;
      cccdSidRef.current = null;
      cccdAbortRef.current = null;
      setReading(false);
      if (sid) {
        try { await cccdApi.cancel(sid); } catch { /* noop */ }
      }
    }
  };

  const cancelReadCCCD = () => {
    if (cccdAbortRef.current) {
      try { cccdAbortRef.current.abort(); } catch { /* noop */ }
    }
  };

  const fpCount = FINGERS.filter((f) => photos[f.key]).length;
  const irisCount = ["iris_left", "iris_right"].filter((k) => photos[k]).length;
  const portraitCount = PORTRAITS.filter((p) => photos[p.key]).length;

  const checks = useMemo(() => {
    const cccdOk =
      !!(form.personal_id || "").trim() &&
      !!form.full_name.trim() &&
      /^\d{12}$/.test(form.cccd_number || "") &&
      !!form.dob;
    return [
      { key: "cccd", label: "Mã can phạm + Thông tin CCCD", ok: cccdOk, required: true },
      { key: "portrait", label: "Ảnh chân dung đa góc", ok: portraitCount === 3, required: false },
      { key: "fp", label: "Vân tay (10/10)", ok: fpCount === 10, required: false },
      { key: "iris", label: "Mống mắt (2/2)", ok: irisCount === 2, required: false },
      { key: "extra", label: "Thông tin bổ sung", ok: !!form.height_cm && !!form.weight_kg, required: false },
      { key: "device", label: "Thiết bị & kết nối", ok: true, required: false },
    ];
  }, [form, fpCount, irisCount, portraitCount]);

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
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        charge: strOrNull(form.charge),
        cell_code: strOrNull(form.cell_code),
        note: strOrNull(form.note),
        photo_url: photos.portrait_front || null,
        photos,
      };
      if (isEdit) {
        const updated = await api.updateDetainee(initial.id, body);
        setOk(`Đã cập nhật hồ sơ ${updated.code} — ${updated.full_name}`);
        if (onDone) onDone();
        if (sessionId && onSavedInSession) {
          setTimeout(() => onSavedInSession(), 600);
        } else if (go) {
          setTimeout(() => go("detainees"), 800);
        }
      } else {
        const created = await api.createDetainee(body);
        setOk(`Đã lưu hồ sơ ${created.code} — ${created.full_name}`);
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
    if (!window.confirm(isEdit ? "Huỷ chỉnh sửa và xoá dữ liệu đang nhập?" : "Xoá toàn bộ dữ liệu đã nhập?")) return;
    if (isEdit && onDone) onDone();
    setForm(EMPTY_FORM);
    setPhotos({});
    setErr("");
    setOk("");
  };

  const backToList = () => {
    if (onDone) onDone();
    if (go) go("detainees");
  };

  return (
    <div className="page capture-page">
      {(err || ok) && (
        <div className="capture-banner">
          {err && <div className="error-box">{err}</div>}
          {ok && (
            <div className="success-box">
              {ok}
              <button type="button" className="banner-link" onClick={() => go && go("detainees")}>
                Xem danh sách →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================ Block 1: CĂN CƯỚC CÔNG DÂN ================ */}
      <section className="cap-block">
        <div className="cap-block-head">
          <h2 className="cap-block-title">CĂN CƯỚC CÔNG DÂN</h2>
          <button type="button" className="btn-cccd-scan" onClick={readCCCD} disabled={reading}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="5" height="5" rx="2" /><path d="M3 10h18" />
            </svg>
            {reading ? "Đang đọc..." : "Đọc thẻ CCCD"}
          </button>
        </div>

        <div className="cccd-body cccd-body-2col">
          <div className="cccd-col cccd-col-form">
            <Field label="Mã can phạm *">
              <input className="control" value={form.personal_id}
                onChange={(e) => setField("personal_id", e.target.value)}
                placeholder="VD: CP2026-001 hoặc số CCCD" required />
            </Field>
            <Field label="Họ và tên">
              <input className="control" value={form.full_name}
                onChange={(e) => setField("full_name", e.target.value)} placeholder="Nguyễn Văn A" />
            </Field>
            <Field label="Số CCCD">
              <input className="control" value={form.cccd_number}
                onChange={(e) => setField("cccd_number", e.target.value.replace(/\D/g, "").slice(0, 12))}
                placeholder="079204012345" inputMode="numeric" />
            </Field>
            <Field label="Ngày sinh">
              <input className="control" value={form.dob}
                onChange={(e) => setField("dob", e.target.value)} placeholder="dd/mm/yyyy" />
            </Field>
            <Field label="Giới tính">
              <select className="control" value={form.gender}
                onChange={(e) => setField("gender", e.target.value)}
                style={{ color: form.gender ? "" : "var(--text-muted, #aaa)" }}>
                <option value="" style={{ color: "#aaa" }}>-- Chọn --</option>
                <option value="male" style={{ color: "" }}>Nam</option>
                <option value="female" style={{ color: "" }}>Nữ</option>
              </select>
            </Field>
            <Field label="Quốc tịch">
              <input className="control" value={form.nationality}
                onChange={(e) => setField("nationality", e.target.value)} />
            </Field>
            <Field label="Quê quán">
              <input className="control" value={form.hometown}
                onChange={(e) => setField("hometown", e.target.value)} placeholder="Xã ..., Huyện ..., Tỉnh ..." />
            </Field>
            <Field label="Nơi thường trú">
              <input className="control" value={form.address}
                onChange={(e) => setField("address", e.target.value)} placeholder="Số nhà, phường, quận, TP" />
            </Field>
            <Field label="Ngày cấp">
              <input className="control" value={form.issued_date}
                onChange={(e) => setField("issued_date", e.target.value)} placeholder="dd/mm/yyyy" />
            </Field>
            <Field label="Có giá trị đến">
              <input className="control" value={form.expiry_date}
                onChange={(e) => setField("expiry_date", e.target.value)} placeholder="dd/mm/yyyy" />
            </Field>
            <Field label="Dân tộc">
              <input className="control" value={form.ethnicity}
                onChange={(e) => setField("ethnicity", e.target.value)} placeholder="Kinh" />
            </Field>
            <Field label="Tôn giáo">
              <input className="control" value={form.religion}
                onChange={(e) => setField("religion", e.target.value)} placeholder="Không" />
            </Field>
          </div>

          <div className="cccd-preview-col">
            <CccdCardUpload
              form={form}
              photos={photos}
              cardPortrait={cccdCardPortrait}
              onUpload={(url) => setPhoto("cccd_front", url)}
              onClear={() => { setPhoto("cccd_front", ""); setCccdCardPortrait(""); }}
              onCardPortraitPreview={setCccdCardPortrait}
            />

          </div>

        </div>
      </section>

      {/* ================ Block 2: Sinh trắc | Chân dung ================ */}
      <div className="cap-row">
        <section className="cap-block">
          <div className="cap-block-head">
            <h2 className="cap-block-title">DỮ LIỆU SINH TRẮC HỌC</h2>
          </div>
          <div className="bio-body">
            <div className="bio-fp">
              <div className="bio-sub-row">
                <div className="bio-sub-title">Vân tay (10 ngón)</div>
                {!fpRunning ? (
                  <button
                    type="button"
                    className="btn-fp-collect"
                    onClick={startFpCollect}
                    title="Chạy máy quét ZKFinger để thu thập lần lượt 10 ngón"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 11c0-4 3-7 7-7" />
                      <path d="M5 4c4 0 7 3 7 7v6a3 3 0 0 0 3 3" />
                      <path d="M8 11a4 4 0 0 1 8 0v5a2 2 0 0 0 2 2" />
                      <path d="M12 15v1a3 3 0 0 0 3 3" />
                    </svg>
                    Thu thập
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-fp-collect"
                    onClick={stopFpCollect}
                    style={{ background: "var(--danger)" }}
                    title="Dừng thu thập"
                  >
                    Dừng
                  </button>
                )}
              </div>
              {(fpRunning || fpStatus || fpError) && (
                <div className={"fp-inline-status " + (fpError ? "err" : "info")}>
                  {fpRunning && <span className="fp-inline-spinner" />}
                  <span>
                    {fpError
                      ? fpError
                      : fpNextCode
                        ? `Đang chờ: ${FP_NAME_VI[fpNextCode]} — ${fpStatus}`
                        : fpStatus}
                  </span>
                </div>
              )}
              <div className="fp-hands">
                {[
                  { side: "left", title: "Bàn tay trái", fingers: LEFT_HAND },
                  { side: "right", title: "Bàn tay phải", fingers: RIGHT_HAND },
                ].map(({ side, title, fingers }) => (
                  <div key={side} className={"fp-hand fp-hand-" + side}>
                    <div className="fp-hand-title">{title}</div>
                    <div className="fp-hand-row">
                      {fingers.map((f) => {
                        const targetKey = fpNextCode ? FP_CODE_TO_KEY[fpNextCode] : null;
                        const isActive = fpRunning && targetKey === f.key;
                        const filled = !!photos[f.key];
                        return (
                          <div
                            key={f.key}
                            className={
                              "fp-item" +
                              (isActive ? " fp-item-active" : "") +
                              (filled ? " fp-item-done" : "")
                            }
                          >
                            <PhotoSlot compact label={f.label} value={photos[f.key]}
                              onChange={(u) => setPhoto(f.key, u)} aspect="1 / 1" />
                            <span className="fp-item-label">{f.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className={"bio-status " + (fpCount === 10 ? "ok" : "warn")}>
                <CheckDot ok={fpCount === 10} />
                {fpCount === 10 ? `Đã thu thập đủ 10/10 vân tay` : `Đã thu thập ${fpCount}/10 vân tay`}
              </div>
            </div>

            <div className="bio-iris">
              <div className="bio-sub-title">Mống mắt (2 mắt)</div>
              <div className="iris-grid">
                <div className="iris-item">
                  <PhotoSlot label="Mắt trái" value={photos.iris_left}
                    onChange={(u) => setPhoto("iris_left", u)} aspect="1.4 / 1" />
                  <span className="iris-item-label">Mắt trái</span>
                </div>
                <div className="iris-item">
                  <PhotoSlot label="Mắt phải" value={photos.iris_right}
                    onChange={(u) => setPhoto("iris_right", u)} aspect="1.4 / 1" />
                  <span className="iris-item-label">Mắt phải</span>
                </div>
              </div>
              <div className={"bio-status " + (irisCount === 2 ? "ok" : "warn")}>
                <CheckDot ok={irisCount === 2} />
                {irisCount === 2 ? `Đã thu thập đủ 2/2 mống mắt` : `Đã thu thập ${irisCount}/2 mống mắt`}
              </div>
            </div>
          </div>
        </section>

        <section className="cap-block">
          <div className="cap-block-head">
            <h2 className="cap-block-title">ẢNH CHÂN DUNG ĐA GÓC</h2>
          </div>
          <div className="portrait-body">
            {PORTRAITS.map((p) => (
              <div key={p.key} className="portrait-item">
                <div className="portrait-frame">
                  <div className="ruler ruler-l">
                    {[190, 180, 170, 160, 150, 140].map((n) => (<span key={n}>{n} cm</span>))}
                  </div>
                  <div className="ruler ruler-r">
                    {[190, 180, 170, 160, 150, 140].map((n) => (<span key={n}>{n} cm</span>))}
                  </div>
                  <PhotoSlot label={p.label} value={photos[p.key]}
                    onChange={(u) => setPhoto(p.key, u)} aspect="3 / 4"
                    useCamera
                    resize={{ w: 600, h: 800, mime: "image/jpeg", quality: 0.9 }} />
                </div>
                <span className="portrait-label">{p.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ================ Block 3: Bổ sung | Validate ================ */}
      <div className="cap-row cap-row-3">
        <section className="cap-block">
          <div className="cap-block-head">
            <h2 className="cap-block-title">THÔNG TIN BỔ SUNG / CHỈ SỐ NHẬN DẠNG</h2>
          </div>
          <div className="extra-body">
            <div className="extra-grid">
              <Field label="Chiều cao (cm)">
                <input className="control" type="number" min="50" max="250" value={form.height_cm}
                  onChange={(e) => setField("height_cm", e.target.value)} placeholder="170" />
              </Field>
              <Field label="Cân nặng (kg)">
                <input className="control" type="number" min="20" max="200" value={form.weight_kg}
                  onChange={(e) => setField("weight_kg", e.target.value)} placeholder="65" />
              </Field>
              <Field label="Buồng giam">
                <select className="control" value={form.cell_code}
                  onChange={(e) => setField("cell_code", e.target.value)}>
                  <option value="">-- Chọn buồng --</option>
                  {cells.map((c) => {
                    const full = c.capacity != null && c.current >= c.capacity;
                    return (
                      <option key={c.code} value={c.code} disabled={full && form.cell_code !== c.code}>
                        {c.code} — {c.name} ({c.current}/{c.capacity}){full ? " · Đầy" : ""}
                      </option>
                    );
                  })}
                </select>
              </Field>
            </div>
            <div className="extra-note">
              <InfoDot />
              Vui lòng nhập đầy đủ thông tin bổ sung để hoàn thiện hồ sơ.
            </div>
          </div>
        </section>

        <section className="cap-block">
          <div className="cap-block-head">
            <h2 className="cap-block-title">KẾT QUẢ KIỂM TRA DỮ LIỆU / XÁC NHẬN HỢP LỆ</h2>
          </div>
          <div className="validate-body">
            <div className="validate-grid">
              {checks.map((c) => {
                const tone = c.ok ? "ok" : c.required ? "warn" : "muted";
                const status = c.ok
                  ? "Đã có"
                  : c.required
                    ? "Chưa hợp lệ"
                    : "Tuỳ chọn";
                return (
                  <div key={c.key} className={"validate-cell " + tone}>
                    <CheckDot ok={c.ok} tone={tone} />
                    <div>
                      <strong>
                        {c.label}
                        {!c.required && <em className="opt-tag"> (tuỳ chọn)</em>}
                      </strong>
                      <span>{status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={"validate-note " + (allRequiredValid ? "ok" : "warn")}>
              <InfoDot />
              {allRequiredValid
                ? allValid
                  ? "Kết quả kiểm tra: TẤT CẢ DỮ LIỆU HỢP LỆ. Có thể lưu hồ sơ."
                  : "Đã đủ thông tin CCCD bắt buộc. Có thể lưu hồ sơ (các mục còn lại là tuỳ chọn)."
                : "Kết quả kiểm tra: Chưa đủ thông tin CCCD. Vui lòng bổ sung."}
            </div>
          </div>
        </section>
      </div>

      {previewOpen && (
        <ProfilePreviewModal
          form={form}
          photos={photos}
          cells={cells}
          onClose={() => setPreviewOpen(false)}
        />
      )}


      {/* ================ Block 4: Actions ================ */}
      <section className="cap-block save-block">
        <div className="cap-block-head">
          <h2 className="cap-block-title">LƯU DỮ LIỆU</h2>
        </div>
        <div className="save-actions">
          <button type="button" className="save-btn save-primary"
            disabled={!allRequiredValid || saving} onClick={submit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <path d="M17 21v-8H7v8M7 3v5h8" />
            </svg>
            {saving ? "Đang lưu..." : isEdit ? "Cập nhật hồ sơ" : "Lưu dữ liệu vào hồ sơ"}
          </button>
          <button type="button" className="save-btn save-secondary" disabled={saving}
            onClick={() => setPreviewOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6M8 13h8M8 17h6" />
            </svg>
            Xem trước hồ sơ
          </button>
          <button type="button" className="save-btn save-danger" disabled={saving} onClick={resetAll}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
            </svg>
            Xóa dữ liệu
          </button>
        </div>
      </section>
    </div>
  );
}

function ProfilePreviewModal({ form, photos, cells, onClose }) {
  const cell = cells.find((c) => c.code === form.cell_code);
  const genderVi = form.gender === "female" ? "Nữ" : "Nam";
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();

  const val = (v) => (v && String(v).trim() ? v : "…………………………");

  const handlePrint = () => window.print();

  return (
    <div className="preview-backdrop" onClick={onClose}>
      <div className="preview-toolbar no-print" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="preview-btn" onClick={handlePrint}>
          In / Xuất PDF
        </button>
        <button type="button" className="preview-btn preview-close" onClick={onClose}>
          Đóng
        </button>
      </div>

      <div className="preview-scroll" onClick={onClose}>
        <div className="preview-a4" onClick={(e) => e.stopPropagation()}>
          <div className="pv-header">
            <div className="pv-header-left">
              <div className="pv-org1">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
              <div className="pv-org2">Độc lập - Tự do - Hạnh phúc</div>
              <div className="pv-org-underline" />
            </div>
          </div>

          <h1 className="pv-title">HỒ SƠ CAN PHẠM</h1>
          <div className="pv-subtitle">Số định danh: <b>{val(form.personal_id || form.cccd_number)}</b></div>

          <div className="pv-body">
            <div className="pv-body-left">
              <h3 className="pv-section">I. THÔNG TIN CÁ NHÂN</h3>
              <table className="pv-table">
                <tbody>
                  <tr><td className="pv-label">Họ và tên</td><td>{val(form.full_name)}</td></tr>
                  <tr><td className="pv-label">Ngày sinh</td><td>{val(form.dob)}</td></tr>
                  <tr><td className="pv-label">Giới tính</td><td>{val(genderVi)}</td></tr>
                  <tr><td className="pv-label">Số CCCD</td><td>{val(form.cccd_number)}</td></tr>
                  <tr><td className="pv-label">Quốc tịch</td><td>{val(form.nationality)}</td></tr>
                  <tr><td className="pv-label">Dân tộc</td><td>{val(form.ethnicity)}</td></tr>
                  <tr><td className="pv-label">Tôn giáo</td><td>{val(form.religion)}</td></tr>
                  <tr><td className="pv-label">Quê quán</td><td>{val(form.hometown)}</td></tr>
                  <tr><td className="pv-label">Nơi thường trú</td><td>{val(form.address)}</td></tr>
                  <tr><td className="pv-label">Ngày cấp CCCD</td><td>{val(form.issued_date)}</td></tr>
                  <tr><td className="pv-label">Ngày hết hạn</td><td>{val(form.expiry_date)}</td></tr>
                  <tr><td className="pv-label">Nơi cấp</td><td>{val(form.issued_place)}</td></tr>
                </tbody>
              </table>
            </div>

            <div className="pv-body-right">
              <div className="pv-photo-frame">
                {photos.portrait_front
                  ? <img src={photos.portrait_front} alt="Chân dung" />
                  : <span>Ảnh 4x6</span>}
              </div>
              <div className="pv-photo-caption">Ảnh chân dung</div>
            </div>
          </div>

          <h3 className="pv-section">II. CHỈ SỐ NHẬN DẠNG & THÔNG TIN GIAM GIỮ</h3>
          <table className="pv-table pv-table-2col">
            <tbody>
              <tr>
                <td className="pv-label">Chiều cao (cm)</td><td>{val(form.height_cm)}</td>
                <td className="pv-label">Cân nặng (kg)</td><td>{val(form.weight_kg)}</td>
              </tr>
              <tr>
                <td className="pv-label">Buồng giam</td>
                <td colSpan={3}>{cell ? `${cell.code} — ${cell.name}` : val(form.cell_code)}</td>
              </tr>
              <tr>
                <td className="pv-label">Tội danh</td>
                <td colSpan={3}>{val(form.charge)}</td>
              </tr>
              <tr>
                <td className="pv-label">Ghi chú</td>
                <td colSpan={3}>{val(form.note)}</td>
              </tr>
            </tbody>
          </table>

          <h3 className="pv-section">III. ẢNH CHÂN DUNG ĐA GÓC</h3>
          <div className="pv-portraits">
            {PORTRAITS.map((p) => (
              <div key={p.key} className="pv-portrait-item">
                <div className="pv-portrait-frame">
                  {photos[p.key]
                    ? <img src={photos[p.key]} alt={p.label} />
                    : <span className="pv-empty">Chưa có</span>}
                </div>
                <span>{p.label}</span>
              </div>
            ))}
          </div>

          <h3 className="pv-section">IV. DỮ LIỆU SINH TRẮC HỌC</h3>
          <div className="pv-bio-row">
            <div className="pv-bio-col">
              <div className="pv-bio-title">Vân tay 10 ngón</div>
              <div className="pv-fp-grid">
                {FINGERS.map((f) => (
                  <div key={f.key} className="pv-fp-item">
                    <div className="pv-fp-frame">
                      {photos[f.key]
                        ? <img src={photos[f.key]} alt={f.label} />
                        : <span className="pv-empty">—</span>}
                    </div>
                    <span>{f.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="pv-bio-col">
              <div className="pv-bio-title">Mống mắt</div>
              <div className="pv-iris-row">
                <div className="pv-iris-item">
                  <div className="pv-iris-frame">
                    {photos.iris_left
                      ? <img src={photos.iris_left} alt="Mắt trái" />
                      : <span className="pv-empty">Chưa có</span>}
                  </div>
                  <span>Mắt trái</span>
                </div>
                <div className="pv-iris-item">
                  <div className="pv-iris-frame">
                    {photos.iris_right
                      ? <img src={photos.iris_right} alt="Mắt phải" />
                      : <span className="pv-empty">Chưa có</span>}
                  </div>
                  <span>Mắt phải</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pv-signatures">
            <div className="pv-sig-block">
              <div className="pv-sig-place">
                Ngày {dd} tháng {mm} năm {yyyy}
              </div>
              <div className="pv-sig-role">CÁN BỘ LẬP HỒ SƠ</div>
              <div className="pv-sig-note">(Ký, ghi rõ họ tên)</div>
              <div className="pv-sig-space" />
            </div>
            <div className="pv-sig-block">
              <div className="pv-sig-place">&nbsp;</div>
              <div className="pv-sig-role">NGƯỜI KHAI</div>
              <div className="pv-sig-note">(Ký, ghi rõ họ tên)</div>
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

