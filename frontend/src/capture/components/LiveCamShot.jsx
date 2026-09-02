import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { useI18n, apiT } from "../../i18n";
import { getMeasurementHeight } from "../../lib/heightMeasurement";
import { pickPreferredCamera } from "../imageUtils";

export function LiveCamShot({ label, shortLabel, value, onCapture, showRuler, onMeasureHeight, onPortraitRecognize, heightImage = 100, heightOffset = 103, useYolo = false }) {
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
