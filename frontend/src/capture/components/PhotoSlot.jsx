import { useRef, useState } from "react";
import { api } from "../../api";
import { useI18n } from "../../i18n";
import { resizeImageFile } from "../imageUtils";
import { CameraCaptureModal } from "./CameraCaptureModal";

export function PhotoSlot({ label, value, onChange, aspect = "1 / 1", size, compact, disabled, resize, useCamera }) {
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
