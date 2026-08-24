import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, fpApi, cccdApi, b64PngToFile, weightApi, usbApi } from "./api";
import { notify } from "./notifications";
import { toast } from "./Toast";
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

// 3 cum dung bang dung cum may Morfin chup 1 lan (khop STEPS cua morfin_service):
// 4 ngon trai | 2 ngon cai | 4 ngon phai. Nhap nhay theo CA CUM, khong nhay le tung o.
const FP_CLUSTERS = [
  { step: "left_hand", codes: ["left_little", "left_ring", "left_middle", "left_index"] },
  { step: "thumbs", codes: ["left_thumb", "right_thumb"] },
  { step: "right_hand", codes: ["right_index", "right_middle", "right_ring", "right_little"] },
];

// Hinh ban tay so do: 4 ngon + ngon cai, ngon dang can lan thi sang len.
// Ban tay TRAI la hinh goc (nhin tu mu ban tay, ngon cai o ben phai);
// ban tay PHAI la ban lat ngang cua no => chi 1 bo path duy nhat.
// Mau lay theo currentColor nen tu an theo class .done / .active / .empty.
const HAND_FINGERS = [
  { name: "little", x: 4, y: 17 },
  { name: "ring", x: 10.5, y: 11 },
  { name: "middle", x: 17, y: 8.5 },
  { name: "index", x: 23.5, y: 12 },
];

// active = ngon DA thu (sang len). blink = ngon DANG lan (nhay).
// Class .hg-finger/.on/.blink de CSS to mau rieng theo ngu canh (o luoi vs icon KPI),
// vi fill dung currentColor thi ca ban tay se cung mot mau.
function HandGlyph({ side = "left", active = [], blink = [], className = "" }) {
  const cls = (n) =>
    "hg-finger" + (active.includes(n) ? " on" : "") + (blink.includes(n) ? " blink" : "");
  const lit = { fill: "currentColor", fillOpacity: 0.9, stroke: "currentColor" };
  const dim = { fill: "none", fillOpacity: 0, stroke: "currentColor", strokeOpacity: 0.75 };
  const skin = (n) => (active.includes(n) ? lit : dim);
  return (
    <svg
      className={"hand-glyph " + className}
      /* viewBox bo sat hinh (x 2->39, y 7->45; da tinh ca ngon cai xoay 38do
         va nua do day vien). Cu la "0 0 40 48" => ti le 0.83, cao thua nhieu
         cho trong nen hinh bi co lai. Gio ti le ~0.97 (gan vuong) => cung 1
         khung render, hinh to hon ro ret. */
      viewBox="2 7 37 38"
      aria-hidden="true"
      style={side === "right" ? { transform: "scaleX(-1)" } : undefined}
    >
      <g strokeWidth="1.6" strokeLinejoin="round">
        {/* long ban tay */}
        <rect className="hg-palm" x="3" y="27" width="28" height="17" rx="5" {...dim} />
        {/* 4 ngon */}
        {HAND_FINGERS.map((f) => (
          <rect
            key={f.name}
            className={cls(f.name)}
            x={f.x}
            y={f.y}
            width="5.5"
            height={31 - f.y}
            rx="2.7"
            {...skin(f.name)}
          />
        ))}
        {/* ngon cai — nghieng ra phia ngoai long ban tay */}
        <rect
          className={cls("thumb")}
          x="29"
          y="26"
          width="5.5"
          height="14"
          rx="2.7"
          transform="rotate(38 31.7 33)"
          {...skin("thumb")}
        />
      </g>
    </svg>
  );
}

// So lan chup lai toi da cho MOI cum truoc khi dung ca vong thu. Voi nguong 50%
// nguoi dan thuong can vai lan de chinh cach ap tay, nen 5 la qua it: het 5 lan
// la vong thu dung giua duong va cac cum sau khong bao gio duoc chay.
const FP_MAX_FAILS = 15;

const PORTRAITS = [
  { key: "portrait_left", labelKey: "capture.portrait.left" },
  { key: "portrait_front", labelKey: "capture.portrait.front" },
  { key: "portrait_right", labelKey: "capture.portrait.right" },
];

const EMPTY_FORM = {
  full_name: "",
  // cccd | passport — người nước ngoài không có CCCD 12 số
  doc_type: "cccd",
  cccd_number: "",
  passport_number: "",
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
      // Hồ sơ cũ không có doc_type => mặc định cccd
      doc_type: initial.doc_type === "passport" ? "passport" : "cccd",
      cccd_number: initial.cccd_number || "",
      passport_number: initial.passport_number || "",
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
  // Morfin slap: ca CUM nhap nhay cung luc (4 ngon / 2 ngon cai), khong phai 1 ngon.
  const [fpActiveCodes, setFpActiveCodes] = useState([]);
  // Quality (%) tung ngon cua lan chup hien tai, key = ma ngon (left_index...).
  // Chi song trong phien thu; mo lai ho so cu se khong co (service moi tra).
  const [fpQuality, setFpQuality] = useState({});
  // Nguong dat RIENG tung ngon do service tra ve (ngon ut thap hon 50 vi tren
  // platen phang chi dau ngon tiep xuc). Hardcode 50 o day se to do ngon ut du
  // no da dat nguong cua chinh no.
  const [fpMinQ, setFpMinQ] = useState({});
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
  }, [seed]);

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
    setFpActiveCodes([]);
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

  // Nhap DOI 1 o van tay => chup lai CA CUM chua ngon do (4 ngon ban tay hoac
  // 2 ngon cai). Morfin la slap scanner: 4 ngon den tu cung 1 anh, khong tach
  // le 1 ngon de chup rieng duoc.
  const retryFingerprint = async (photoKey, fingerCode) => {
    // Da khoa: PHAI noi ra. Truoc day chi `return` im lang => nhay doi khong co
    // phan hoi nao, nguoi dung tuong app treo ("khoa luon khong cap nhat").
    if (fpLocked) {
      setFpError(t("capture.err.fp_locked"));
      return;
    }
    if (fpRunning) {
      setFpError(t("capture.err.fp_running"));
      return;
    }
    if (!photoKey || !fingerCode) {
      setFpError(t("capture.err.unknown_finger", { key: photoKey, code: fingerCode }));
      return;
    }

    // Tim cum chua ngon nay tu /api/steps (nguon su that la backend).
    let group;
    try {
      const steps = await fpApi.listSteps();
      group = steps.find((s) => s.codes.includes(fingerCode));
    } catch (e) {
      setFpError(e.message);
      return;
    }
    if (!group) {
      setFpError(t("capture.err.unknown_finger", { key: photoKey, code: fingerCode }));
      return;
    }

    // KHONG xoa anh/template cu o day.
    //
    // Truoc day cho nay xoa ca cum NGAY, truoc khi biet lan chup moi co thanh
    // cong hay khong. Sau cho xoa co 6 duong thoat (health !ok, health throw,
    // startSession throw, capture 422, abort, uploadPhoto throw) va khong duong
    // nao hoan lai => mot lan 422 la mat luon anh cu, o trong vinh vien. Voi
    // nguong 50% thi 422 la chuyen thuong xuyen, nen loi nay gan nhu chac chan
    // xay ra chu khong phai truong hop hiem.
    //
    // Khong can xoa: setPhotos({...p, [key]: up.url}) ben duoi da GHI DE key khi
    // thanh cong, va service tu choi ca cum (all-or-nothing) nen khong co canh
    // nua cu nua moi. O dang chup da nhap nhay qua fpActiveCodes roi.
    // => Giu anh cu den khi co anh moi tot hon de THAY THE.
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

    // Chot co NGAY (ref) nhu startFpCollect. setFpRunning la async => neu chi
    // dua vao no thi vong auto-start 3s/lan doc fpRunningRef con false, goi
    // startFpCollect, startSession moi => next_step ve left_hand va nhay cum.
    fpRunningRef.current = true;
    setFpRunning(true);
    setFpNextCode(group.codes[0]);
    setFpActiveCodes(group.codes);   // ca cum nhap nhay cung luc
    // KHONG xoa quality cu o day - cung ly do nhu khong xoa anh: neu chup lai
    // that bai thi o se vua mat anh vua mat so %. Quality moi duoc ghi de ben
    // duoi khi chup thanh cong.
    const groupName = t(`fpenroll.step.${group.step}`);
    setFpStatus(t("fpenroll.status.reading_step", { step: groupName }));

    let sid = null;
    try {
      const r = await fpApi.startSession("__retry__" + group.step);
      sid = r.session_id;

      // Chup lai CA CUM, THU NHIEU LAN nhu vong thu chinh.
      //
      // Truoc day chi goi capture() DUNG MOT LAN: 422 la thua ngay. Ghep voi
      // viec xoa anh cu truoc do thi mot lan 422 = mat anh cu, khong co anh moi.
      // Voi nguong 50% thi 422 la chuyen thuong xuyen nen phai cho thu lai,
      // giong vong thu chinh (FP_MAX_FAILS).
      //
      // Anh cu duoc giu nguyen suot qua trinh nay: chi ghi de khi da co ket qua
      // dat nguong. Bo cuoc giua duong thi o van con anh cu.
      let capRes = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= FP_MAX_FAILS; attempt++) {
        if (fpAbortRef.current) return;
        try {
          capRes = await fpApi.capture(sid, group.step);
          break;
        } catch (e) {
          lastErr = e;
          if (fpAbortRef.current) return;
          // Hien loi cua lan nay + so lan da thu, de nguoi dan biet dang tien
          // trien chu khong phai treo.
          setFpError(e.message);
          setFpStatus(t("capture.status.retry_attempt", {
            name: groupName, n: attempt, max: FP_MAX_FAILS,
          }));
        }
      }
      if (!capRes) {
        // Het luot: anh cu VAN CON, chi bao loi.
        throw new Error(lastErr
          ? t("capture.err.fp_too_many_fails", { count: FP_MAX_FAILS })
          : t("capture.err.fp_not_ready"));
      }
      if (fpAbortRef.current) return;

      try {
        // Quality tung ngon de hien % de len anh trong luoi 10 o.
        setFpQuality((prev) => {
          const nx = { ...prev };
          for (const c of capRes.captured || []) nx[c.code] = c.quality;
          return nx;
        });
        for (const c of capRes.captured || []) {
          const key = FP_CODE_TO_KEY[c.code];
          if (!key) continue;
          const file = await b64PngToFile(c.image_b64, `${key}.png`);
          const up = await api.uploadPhoto(file);
          setPhotos((p) => {
            const next = { ...p, [key]: up.url };
            if (c.template_b64) {
              next.fp_templates = { ...(p.fp_templates || {}), [c.code]: c.template_b64 };
            }
            return next;
          });
        }
        setFpStatus(t("capture.status.retook", { name: groupName }));
        setOk(t("capture.status.updated", { name: groupName }));
        // (Đã bỏ tra cứu ngay sau thu lại — BE cần đủ 10 ngón. Tra cứu chỉ
        //  chạy sau khi thu đủ 10 ngón ở vòng tự động.)
      } catch (e) {
        setFpError(t("capture.err.save_photo", { message: e.message }));
      }
    } catch (e) {
      setFpError(e.message);
    } finally {
      if (sid) {
        try { await fpApi.cancel(sid); } catch { /* noop */ }
      }
      // Nha co ngay tai day (xem giai thich o finally cua startFpCollect).
      fpRunningRef.current = false;
      setFpRunning(false);
      setFpNextCode(null);
      setFpActiveCodes([]);
    }
  };

  const startFpCollect = async () => {
    // Chot co NGAY (ref, khong qua setState) de auto-start effect 3s/lan khong
    // kip chen vao giua. Truoc day chi dua vao fpRunningRef do effect cap nhat
    // => co khe hoi khien vong thu 2 start_session moi va nhay ve cum dau.
    if (fpRunning || fpRunningRef.current) return;
    fpRunningRef.current = true;
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
      // Morfin slap: moi lan chup lay CA CUM (4 ngon trai -> 2 ngon cai ->
      // 4 ngon phai), khong con vong 10 lan theo tung ngon.
      let step = r.next_step;
      let fails = 0;

      while (step && !fpAbortRef.current) {
        setFpNextCode(step.codes[0]);
        setFpActiveCodes(step.codes);   // ca cum nhap nhay cung luc
        setFpStatus(t("fpenroll.status.reading_step", { step: t(`fpenroll.step.${step.step}`) }));
        let capRes;
        try {
          capRes = await fpApi.capture(sid, step.step);
        } catch (e) {
          if (fpAbortRef.current) break;
          // Quality duoi nguong => service tra 422 va KHONG luu gi. Khong
          // advance step, chup lai ca cum. Chan vong lap vo han sau N lan.
          //
          // 5 lan la QUA IT voi nguong 50%: nguoi dan can vai lan de chinh cach
          // ap tay (hai ngon ria luon ep nhe hon hai ngon giua). Het 5 lan la
          // ca vong thu dung han giua duong - dung hien tuong "dang lay xong lai
          // bi tat", va nang hon la CHUA BAO GIO chay tiep sang cum sau.
          setFpError(e.message);
          if (++fails >= FP_MAX_FAILS) {
            setFpError(t("capture.err.fp_too_many_fails", { count: FP_MAX_FAILS }));
            break;
          }
          continue;
        }
        fails = 0;
        if (fpAbortRef.current) break;

        // Quality tung ngon de hien % de len anh trong luoi 10 o.
        setFpQuality((prev) => {
          const nx = { ...prev };
          for (const c of capRes.captured || []) nx[c.code] = c.quality;
          return nx;
        });
        // Nguong rieng tung ngon do service tra ve (ngon ut thap hon).
        if (capRes.min_quality_by_code) {
          setFpMinQ((prev) => ({ ...prev, ...capRes.min_quality_by_code }));
        }
        for (const c of capRes.captured || []) {
          const key = FP_CODE_TO_KEY[c.code];
          if (!key) continue;
          try {
            const file = await b64PngToFile(c.image_b64, `${key}.png`);
            const up = await api.uploadPhoto(file);
            setPhotos((p) => {
              const np = { ...p, [key]: up.url };
              if (c.template_b64) {
                np.fp_templates = { ...(p.fp_templates || {}), [c.code]: c.template_b64 };
              }
              return np;
            });
          } catch (e) {
            setFpError(t("capture.err.save_photo", { message: e.message }));
          }
        }
        setFpStatus(capRes.message || "");
        step = capRes.next_step;
      }

      // Vong while ket thuc theo 3 duong: xong that (step=null), fails>=5, hoac
      // abort. Truoc day chi kiem tra !fpAbortRef => chup that bai 5 lan cung
      // bao "da thu du 10 ngon". Phai hoi service xem THUC SU du chua.
      let srvDone = false;
      try {
        const st = await fpApi.getSession(sid);
        srvDone = !!st.finished;
      } catch { /* khong doc duoc trang thai => coi nhu chua xong */ }

      if (!fpAbortRef.current && !srvDone) {
        setFpError(t("capture.err.fp_incomplete"));
        setFpStatus("");
      }

      if (!fpAbortRef.current && srvDone) {
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
      // Nha co NGAY tai day, khong cho effect [fpRunning] cap nhat.
      // fpRunningRef duoc chot = true o dau ham; neu chi de effect nha thi co
      // 1 nhip render ma fpRunning=false nhung anh chua upload xong => vong
      // auto-start (3s/lan) chen vao, startSession moi, next_step ve left_hand
      // => dang thu 4 ngon phai bi nhay ve 4 ngon dau.
      fpRunningRef.current = false;
      // DUNG HAN sau khi vong thu ket thuc (du xong het, that bai, hay abort).
      // Auto-start chi de lo khi may quet chua san sang luc vao trang; mot khi
      // da chup duoc thi KHONG bao gio tu chay lai, vi startSession moi luon
      // tra next_step = left_hand => nhay ve 4 ngon dau. Muon thu lai thi nhay
      // doi vao o ngon (retryFingerprint), dung tu dong.
      fpAutoStoppedRef.current = true;
      setFpRunning(false);
      setFpNextCode(null);
      setFpActiveCodes([]);
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
    // Ảnh thẻ CCCD đã bỏ khỏi form: chỉ nhận dữ liệu chữ từ máy quét,
    // không lưu ảnh mặt trước/mặt sau nữa (d.facePhoto bị bỏ qua).

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
  // Ngon nao da thu -> sang len tren 2 icon ban tay tong quan o khoi KPI.
  const fpDoneByHand = useMemo(() => {
    const out = { left: [], right: [] };
    for (const f of FINGERS) {
      if (!photos[f.key]) continue;
      const hand = f.code.startsWith("left") ? "left" : "right";
      out[hand].push(f.code.replace(/^(left|right)_/, ""));
    }
    return out;
  }, [photos]);
  // Ngon dang lan -> nhay tren icon KPI. Mo rong ra CA CUM vi may Morfin chup
  // ca cum 1 lan => cum thumbs nhay ngon cai o CA HAI ban tay.
  const fpBlinkByHand = useMemo(() => {
    const out = { left: [], right: [] };
    if (!fpRunning) return out;
    const cluster = FP_CLUSTERS.find((c) =>
      fpActiveCodes.length
        ? c.codes.some((x) => fpActiveCodes.includes(x))
        : c.codes.includes(fpNextCode)
    );
    if (!cluster) return out;
    for (const code of cluster.codes) {
      const hand = code.startsWith("left") ? "left" : "right";
      out[hand].push(code.replace(/^(left|right)_/, ""));
    }
    return out;
  }, [fpRunning, fpActiveCodes, fpNextCode]);
  const portraitCount = PORTRAITS.filter((p) => photos[p.key]).length;
  useEffect(() => { fpRunningRef.current = fpRunning; }, [fpRunning]);
  useEffect(() => { fpCountRef.current = fpCount; }, [fpCount]);

  const isPassport = form.doc_type === "passport";
  const checks = useMemo(() => {
    const personalOk = !!(form.personal_id || "").trim();
    // Hộ chiếu: chữ + số 6-12 ký tự (người nước ngoài không có CCCD 12 số).
    const docNumOk = isPassport
      ? /^[A-Z0-9]{6,12}$/i.test((form.passport_number || "").trim())
      : /^\d{12}$/.test(form.cccd_number || "");
    const cccdOk = !!form.full_name.trim() && docNumOk && !!form.dob;
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
        doc_type: isPassport ? "passport" : "cccd",
        // Mỗi loại chỉ gửi số của nó, tránh sót số cũ khi officer đổi radio.
        cccd_number: isPassport ? null : digitsOrNull(form.cccd_number),
        passport_number: isPassport
          ? strOrNull((form.passport_number || "").toUpperCase())
          : null,
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
    // Hộ chiếu: bỏ qua check trùng CCCD (API strip non-digit nên tra sai).
    const cccd = isPassport ? "" : (form.cccd_number || "").replace(/\D/g, "");
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
  // Ảnh thẻ CCCD đã bỏ khỏi form nên không còn là điều kiện hoàn tất.
  const readyState = fpCount === 10 && portraitCount === 3 && allRequiredValid;
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
        {/* Hàng trên: ẢNH TOÀN THÂN | THÔNG TIN NGHI PHẠM — mỗi khối 1 cột */}
        <div className="case-tier-top">
        {/* ================ Tier 1: ảnh chụp toàn thân ================ */}
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

        </div>

        {/* ================ Tier 2: Personal info ================ */}
        <div className="case-tier-2">
          <section className="cap-block">
            <div className="cap-block-head">
              <h2 className="cap-block-title">{t("capture.section.personal")}</h2>
              {/* Đèn báo đầu đọc CCCD + nút chốt — trước ở khối ảnh thẻ (đã bỏ).
                  Chốt để lần chạm thẻ sau không ghi đè form đang nhập. */}
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
            {/* Khối thông tin gọn: chỉ các trường cơ bản trên thẻ CCCD + chiều cao/cân nặng.
                Máy quét CCCD ghi thẳng vào các input này (applyCccdData), không còn 2 ảnh thẻ. */}
            <div className="personal-info personal-info--basic">
              {/* Mã nghi phạm — nghiệp vụ, không phải trường CCCD */}
              <InfoField label={t("capture.form.personal_id")}>
                <input className="control control-sm" value={form.personal_id}
                  onChange={(e) => setField("personal_id", e.target.value)}
                  placeholder={t("capture.form.personal_id_ph")} />
              </InfoField>
              <InfoField label={t("detainee.field.full_name")}>
                <input className="control control-sm" value={form.full_name}
                  onChange={(e) => setField("full_name", e.target.value)}
                  placeholder={t("capture.form.full_name_ph")} />
              </InfoField>
              {/* Loại giấy tờ: người nước ngoài không có CCCD 12 số => chọn hộ chiếu.
                  Đổi radio thì đổi luôn ô số bên dưới, không dùng chung 1 ô. */}
              <InfoField label={t("capture.form.doc_type")}>
                <div className="radio-group radio-group-sm">
                  <label className="radio-option">
                    <input type="radio" name="doc_type" checked={!isPassport}
                      onChange={() => setField("doc_type", "cccd")} />
                    <span>{t("capture.form.doc_cccd")}</span>
                  </label>
                  <label className="radio-option">
                    <input type="radio" name="doc_type" checked={isPassport}
                      onChange={() => setField("doc_type", "passport")} />
                    <span>{t("capture.form.doc_passport")}</span>
                  </label>
                </div>
              </InfoField>
              {isPassport ? (
                <InfoField label={t("capture.form.passport")}>
                  <input className="control control-sm" value={form.passport_number}
                    onChange={(e) => setField("passport_number",
                      e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12))}
                    placeholder={t("capture.form.passport_ph")} />
                </InfoField>
              ) : (
                <InfoField label={t("detainee.field.cccd")}>
                  <input className="control control-sm" inputMode="numeric" value={form.cccd_number}
                    onChange={(e) => setField("cccd_number", e.target.value.replace(/\D/g, "").slice(0, 12))}
                    placeholder={t("capture.form.cccd_ph")} />
                </InfoField>
              )}
              <InfoField label={t("detainee.field.dob")}>
                <input className="control control-sm" value={form.dob}
                  onChange={(e) => setField("dob", e.target.value)}
                  placeholder={t("capture.form.dob_ph")} />
              </InfoField>
              <InfoField label={t("detainee.field.gender")}>
                <select className="control control-sm" value={form.gender}
                  onChange={(e) => setField("gender", e.target.value)}>
                  <option value="">{t("common.select")}</option>
                  <option value="male">{t("common.male")}</option>
                  <option value="female">{t("common.female")}</option>
                </select>
              </InfoField>
              <InfoField label={t("detainee.field.nationality")}>
                <input className="control control-sm" value={form.nationality}
                  onChange={(e) => setField("nationality", e.target.value)}
                  placeholder={t("detainee.field.nationality_default")} />
              </InfoField>
              <InfoField label={t("detainee.field.ethnicity")}>
                <input className="control control-sm" value={form.ethnicity}
                  onChange={(e) => setField("ethnicity", e.target.value)}
                  placeholder={t("capture.form.ethnicity_ph")} />
              </InfoField>
              <InfoField label={t("detainee.field.religion")}>
                <input className="control control-sm" value={form.religion}
                  onChange={(e) => setField("religion", e.target.value)}
                  placeholder={t("capture.form.religion_ph")} />
              </InfoField>
              <InfoField label={t("detainee.field.hometown")}>
                <input className="control control-sm" value={form.hometown}
                  onChange={(e) => setField("hometown", e.target.value)}
                  placeholder={t("capture.form.hometown_ph")} />
              </InfoField>
              <InfoField label={t("detainee.field.address")}>
                <input className="control control-sm" value={form.address}
                  onChange={(e) => setField("address", e.target.value)}
                  placeholder={t("capture.form.address_ph")} />
              </InfoField>
              <InfoField label={t("detainee.field.issued_date")}>
                <input className="control control-sm" value={form.issued_date}
                  onChange={(e) => setField("issued_date", e.target.value)}
                  placeholder={t("capture.form.date_ph")} />
              </InfoField>
              <InfoField label={t("detainee.field.expiry_date")}>
                <input className="control control-sm" value={form.expiry_date}
                  onChange={(e) => setField("expiry_date", e.target.value)}
                  placeholder={t("capture.form.date_ph")} />
              </InfoField>
              <InfoField label={t("detainee.field.issued_place")}>
                <input className="control control-sm" value={form.issued_place}
                  onChange={(e) => setField("issued_place", e.target.value)}
                  placeholder={t("capture.form.issued_place_ph")} />
              </InfoField>
              <InfoField label={t("detainee.field.distinguishing_features")}>
                <input className="control control-sm" value={form.distinguishing_features}
                  onChange={(e) => setField("distinguishing_features", e.target.value)}
                  placeholder={t("capture.form.distinguishing_ph")} />
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
              <InfoField label={t("detainee.field.note")}>
                <input className="control control-sm" value={form.note}
                  onChange={(e) => setField("note", e.target.value)}
                  placeholder={t("capture.field.note_ph")} />
              </InfoField>
            </div>
          </section>
        </div>
        </div>

        {/* Hàng 2 cột: tier-3 (dấu vân tay 7/10) + kiểm tra dữ liệu (3/10) */}
        <div className="case-tier3-row">
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
              {FP_CLUSTERS.map((cluster) => {
                // Ca cum nhap nhay cung luc = dung 1 lan chup cua may Morfin.
                const clusterActive = fpRunning && (
                  fpActiveCodes.length
                    ? cluster.codes.some((c) => fpActiveCodes.includes(c))
                    : cluster.codes.includes(fpNextCode)
                );
                const clusterDone = cluster.codes.every((c) => photos[FP_CODE_TO_KEY[c]]);
                return (
                  <div
                    key={cluster.step}
                    className={
                      "fp-cluster fp-cluster--" + cluster.step +
                      (clusterDone ? " done" : "") +
                      (clusterActive ? " active neon-active" : "")
                    }
                  >
                    {cluster.codes.map((fpCode) => {
                      const key = FP_CODE_TO_KEY[fpCode];
                      const label = t(`fp.finger.${fpCode}.long`);
                      const filled = !!photos[key];
                      const q = fpQuality[fpCode];
                      return (
                        <div
                          key={key}
                          className={"fp-preview-cell " + (filled ? "done" : "empty")}
                          onDoubleClick={() => !fpRunning && retryFingerprint(key, fpCode)}
                          title={filled ? t("capture.fp.dbl_retake") : t("capture.fp.dbl_take")}
                          style={{ cursor: fpRunning ? "default" : "pointer" }}
                        >
                          <div className="fp-preview-thumb">
                            {filled ? (
                              <img src={photos[key]} alt={label} />
                            ) : (
                              <HandGlyph
                                side={fpCode.startsWith("left") ? "left" : "right"}
                                active={[fpCode.replace(/^(left|right)_/, "")]}
                              />
                            )}
                            {typeof q === "number" && (() => {
                              // Nguong RIENG tung ngon (service tra min_quality_by_code).
                              // Ngon ut thap hon 50 vi tren platen phang chi dau ngon
                              // tiep xuc => hardcode 50 se to do du no da dat.
                              const need = fpMinQ[fpCode] ?? 50;
                              const cls = q >= need + 20 ? "good" : q >= need ? "ok" : "bad";
                              return <span className={"fp-cell-quality " + cls}>{q}%</span>;
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="fp-kpi fp-kpi-inline fp-kpi-2col">
              <div className="fp-kpi-cell">
                <span className="fp-kpi-num">{fpCount}</span>
                <span className="fp-kpi-divider">/ 10</span>
              </div>
              <div className="fp-kpi-cell fp-kpi-hands">
                <HandGlyph
                  side="left"
                  active={fpDoneByHand.left}
                  blink={fpBlinkByHand.left}
                  className="kpi"
                />
                <HandGlyph
                  side="right"
                  active={fpDoneByHand.right}
                  blink={fpBlinkByHand.right}
                  className="kpi"
                />
              </div>
            </div>
          </section>
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
        </div>

      </div>

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
            const payload = { form, photos };
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
  // Ảnh CÓ vạch đỏ (data URI) của lần chụp hiện tại — chỉ để xem tạm tại màn thu nhận.
  // Giữ kèm url ảnh sạch tương ứng để không hiện nhầm vạch cho ảnh khác. Không lưu DB.
  const [redLinePreview, setRedLinePreview] = useState({ url: "", src: "" });
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
      // res.url = ảnh SẠCH (đã lưu đĩa, đi vào DB, dùng cho xem trước hồ sơ + in).
      // res.preview_url = ảnh CÓ vạch đỏ (data URI, không lưu) — chỉ xem tạm ở màn này.
      setRedLinePreview(
        useYolo && res.preview_url ? { url: res.url, src: res.preview_url } : { url: "", src: "" },
      );
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
    setRedLinePreview({ url: "", src: "" });
    onCapture("");
  };

  const showLive = !value && !preview;
  const captured = Boolean(value);
  // Chỉ dùng ảnh có vạch đỏ khi nó đúng là bản preview của ảnh đang hiển thị.
  // Mọi nơi khác (xem trước hồ sơ, in, DB) luôn dùng `value` = ảnh sạch.
  const displaySrc = redLinePreview.src && redLinePreview.url === value ? redLinePreview.src : value;
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
              <img src={displaySrc} alt={label} />
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
  { form, photos },
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
  const alcoholLabel = (v) => {
    if (v === true || v === "true") return t("common.yes");
    if (v === false || v === "false") return t("common.no");
    return val(v);
  };

  return (
    <div ref={ref} className="preview-a4 preview-a4-portrait">
      {/* ===== Header: ảnh CCCD (góc trên trái) + emblem/motto (bên phải) ===== */}
      <div className="pv-header-row pv-header-row-v3">
        {/* Form đăng ký không còn thu ảnh thẻ CCCD, nên chỉ hiện dải này với
            hồ sơ cũ đã có ảnh — không in ô trống cho hồ sơ mới. */}
        {(photos.cccd_front || photos.cccd_back) && (
          <div className="pv-cccd-strip">
            {photos.cccd_front
              ? <img src={photos.cccd_front} alt={t("pdf.cccd_photo")} />
              : null}
            {photos.cccd_back
              ? <img src={photos.cccd_back} alt={t("pdf.cccd_photo")} />
              : null}
          </div>
        )}
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
          {/* Khối "Diện giam giữ" đã bỏ cùng chức năng cơ sở giam giữ. */}
          <h3 className="pv-section">{t("pdf.section2.health")}</h3>
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

function ProfilePreviewModal({ form, photos, onClose }) {
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

