import { useCallback, useEffect, useRef, useState } from "react";
import { api, fpApi, b64PngToFile } from "./api";
import { useI18n } from "./i18n";

const CODE_TO_KEY = {
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

const LEFT_ORDER = ["left_thumb", "left_index", "left_middle", "left_ring", "left_little"];
const RIGHT_ORDER = ["right_thumb", "right_index", "right_middle", "right_ring", "right_little"];

export default function FingerprintEnrollModal({ open, userName, onClose, onDone }) {
  const { t } = useI18n();
  const fingerName = (code) => t(`fp.finger.${code}.side_short`);
  const [health, setHealth] = useState(null);
  const [healthErr, setHealthErr] = useState("");
  const [sid, setSid] = useState(null);
  const [fingers, setFingers] = useState([]);
  const [nextCode, setNextCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const [previewB64, setPreviewB64] = useState(null);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const capturedRef = useRef({});

  const done = fingers.filter((f) => f.done).length;
  const total = fingers.length || 10;

  const checkHealth = useCallback(async () => {
    setHealthErr("");
    try {
      const h = await fpApi.health();
      setHealth(h);
      if (!h.ok) setHealthErr(h.error || t("fpenroll.err.not_ready"));
    } catch (e) {
      setHealth({ ok: false });
      setHealthErr(e.message);
    }
  }, [t]);

  const start = useCallback(async () => {
    setErr("");
    setStatus("");
    setPreviewB64(null);
    setFinished(false);
    capturedRef.current = {};
    setBusy(true);
    try {
      const r = await fpApi.startSession(userName || t("fpenroll.anon"));
      setSid(r.session_id);
      setFingers(r.fingers.map((f) => ({ ...f, done: false })));
      setNextCode(r.next_finger ? r.next_finger.code : null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }, [userName, t]);

  useEffect(() => {
    if (!open) return;
    setSid(null);
    setFingers([]);
    setNextCode(null);
    setPreviewB64(null);
    setErr("");
    setStatus("");
    setFinished(false);
    setSaving(false);
    capturedRef.current = {};
    checkHealth();
  }, [open, checkHealth]);

  const capture = async () => {
    if (!sid || !nextCode) return;
    setBusy(true);
    setErr("");
    setStatus(t("fpenroll.status.reading", { finger: fingerName(nextCode) }));
    try {
      const r = await fpApi.capture(sid);
      const code = r.finger.code;
      capturedRef.current[code] = r.finger.image_b64;
      // Hiển thị thumbnail nhỏ cho nhanh; ảnh gốc (image_b64) chỉ dùng khi upload.
      setPreviewB64(r.finger.thumb_b64 || r.finger.image_b64);
      setFingers((list) => list.map((f) => (f.code === code ? { ...f, done: true } : f)));
      setNextCode(r.next_finger ? r.next_finger.code : null);
      setStatus(r.message || t("fpenroll.status.saved", { finger: fingerName(code) }));
      if (r.finished) {
        setFinished(true);
        setStatus(t("fpenroll.status.done_all"));
      }
    } catch (e) {
      setErr(e.message);
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const redoFinger = async (code) => {
    if (!sid || busy || saving) return;
    setBusy(true);
    setErr("");
    try {
      await fpApi.redo(sid, code);
      delete capturedRef.current[code];
      setFingers((list) => list.map((f) => (f.code === code ? { ...f, done: false } : f)));
      setNextCode(code);
      setStatus(t("fpenroll.status.retake", { finger: fingerName(code) }));
      setPreviewB64(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const redoCurrent = async () => {
    if (!sid) return;
    const lastDone = [...fingers].reverse().find((f) => f.done);
    if (!lastDone) return;
    await redoFinger(lastDone.code);
  };

  const cancel = async () => {
    if (sid) {
      try { await fpApi.cancel(sid); } catch { /* noop */ }
    }
    onClose();
  };

  const apply = async () => {
    if (!finished) return;
    setSaving(true);
    setErr("");
    try {
      const mapping = {};
      const codes = Object.keys(capturedRef.current);
      for (const code of codes) {
        const key = CODE_TO_KEY[code];
        if (!key) continue;
        const file = await b64PngToFile(capturedRef.current[code], `${key}.png`);
        const up = await api.uploadPhoto(file);
        mapping[key] = up.url;
      }
      onDone(mapping);
    } catch (e) {
      setErr(t("fpenroll.err.upload", { message: e.message }));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const renderCol = (order) => (
    <div className="fp-col">
      {order.map((code) => {
        const f = fingers.find((x) => x.code === code);
        const isNext = nextCode === code;
        const isDone = !!(f && f.done);
        return (
          <div
            key={code}
            className={"fp-row" + (isDone ? " done redoable" : "") + (isNext ? " active" : "")}
            onClick={isDone ? () => redoFinger(code) : undefined}
            title={isDone ? t("fpenroll.retake_last") : undefined}
          >
            <span className="fp-row-dot" />
            <span className="fp-row-name">{fingerName(code)}</span>
            <span className="fp-row-status">
              {isDone ? t("fpenroll.done_label") : isNext ? t("fpenroll.waiting_label") : ""}
            </span>
            {isDone && <span className="fp-row-redo">↻</span>}
          </div>
        );
      })}
    </div>
  );

  const notReady = !health || !health.ok;

  return (
    <div className="modal-backdrop" onClick={cancel}>
      <div className="modal fp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{t("fpenroll.title")}</h3>
          <button className="close-x" onClick={cancel} aria-label={t("common.close")}>×</button>
        </div>

        <div className="fp-body">
          <div className="fp-status-line">
            <span className={"fp-badge " + (health && health.ok ? "ok" : "off")}>
              <span className="dot" />
              {health && health.ok
                ? t("fpenroll.sensor.ok", { w: health.width, h: health.height, users: health.users || 0 })
                : t("fpenroll.sensor.not_ready")}
            </span>
            {healthErr && <span className="fp-err-inline">{healthErr}</span>}
            {!sid && (
              <button className="btn-primary" onClick={start} disabled={busy || notReady}>
                {busy ? t("fpenroll.initializing") : t("fpenroll.start")}
              </button>
            )}
            {sid && (
              <span className="fp-progress-text">{t("fpenroll.progress", { done, total })}</span>
            )}
          </div>

          {sid && (
            <>
              <div className="fp-progress-bar">
                <div style={{ width: `${(done / total) * 100}%` }} />
              </div>

              <div className="fp-grid">
                {renderCol(LEFT_ORDER)}

                <div className="fp-center">
                  <div className="fp-preview">
                    {previewB64
                      ? <img alt="" src={`data:image/png;base64,${previewB64}`} />
                      : <span>{t("fpenroll.image_placeholder")}</span>}
                  </div>
                  <div className="fp-next">
                    <div className="fp-next-label">{t("fpenroll.next_finger")}</div>
                    <div className="fp-next-name">
                      {nextCode ? fingerName(nextCode) : t("fpenroll.complete")}
                    </div>
                  </div>
                  {status && <div className="fp-msg">{status}</div>}
                  {err && <div className="fp-err">{err}</div>}
                </div>

                {renderCol(RIGHT_ORDER)}
              </div>

              <div className="fp-actions">
                <button
                  className="btn-primary"
                  onClick={capture}
                  disabled={busy || saving || !nextCode || finished}
                >
                  {busy ? t("fpenroll.capturing") : nextCode ? t("fpenroll.capture_next", { finger: fingerName(nextCode) }) : t("fpenroll.enough")}
                </button>
                <button
                  className="btn-ghost"
                  onClick={redoCurrent}
                  disabled={busy || saving || !fingers.some((f) => f.done)}
                >
                  {t("fpenroll.retake_last")}
                </button>
                <button
                  className="btn-ghost"
                  onClick={apply}
                  disabled={!finished || saving}
                >
                  {saving ? t("fpenroll.uploading") : t("fpenroll.apply")}
                </button>
                <button className="btn-ghost" onClick={cancel} disabled={saving}>
                  {t("common.cancel")}
                </button>
              </div>
            </>
          )}

          {!sid && (
            <div className="fp-hint">{t("fpenroll.hint")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
