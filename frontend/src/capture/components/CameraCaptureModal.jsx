import { useEffect, useRef, useState } from "react";
import { useI18n, apiT } from "../../i18n";
import { pickPreferredCamera } from "../imageUtils";

export function CameraCaptureModal({ open, label, onCapture, onClose }) {
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
