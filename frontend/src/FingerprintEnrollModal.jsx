import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// Morfin la slap scanner: 1 lan chup lay ca cum, khong tach le 1 ngon duoc.
// => Chup lai = chup lai CA CUM (4 ngon ban tay, hoac 2 ngon cai).
// Thu tu: 4 ngon trai -> 2 ngon cai -> 4 ngon phai (do backend /api/steps quyet dinh).
export default function FingerprintEnrollModal({ open, userName, onClose, onDone }) {
  const { t } = useI18n();
  const fingerName = (code) => t(`fp.finger.${code}.side_short`);
  const stepName = (step) => t(`fpenroll.step.${step}`);

  const [health, setHealth] = useState(null);
  const [healthErr, setHealthErr] = useState("");
  const [sid, setSid] = useState(null);
  const [steps, setSteps] = useState([]);
  const [fingers, setFingers] = useState([]);
  const [nextStep, setNextStep] = useState(null);
  const [minQuality, setMinQuality] = useState(50);
  const [thumbs, setThumbs] = useState({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  // Cum co ngon loi (partial=true): {step, failing:[{code,reason,quality,need}]}.
  // Luu lai de can bo quyet dinh "xac nhan thieu" hoac "chup lai cum".
  const [partial, setPartial] = useState(null);
  // Anh goc (full size) chi dung luc upload; state chi giu thumb cho nhe.
  const capturedRef = useRef({});

  const byCode = useMemo(() => {
    const m = {};
    for (const f of fingers) m[f.code] = f;
    return m;
  }, [fingers]);

  const done = fingers.filter((f) => f.done).length;
  const total = fingers.length || 10;

  const applyState = useCallback((r) => {
    if (r.steps) setSteps(r.steps);
    if (r.fingers) setFingers(r.fingers);
    setNextStep(r.next_step || null);
    setFinished(!!r.finished);
    if (r.min_quality) setMinQuality(r.min_quality);
  }, []);

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

  const reset = useCallback(() => {
    setSid(null);
    setSteps([]);
    setFingers([]);
    setNextStep(null);
    setThumbs({});
    setErr("");
    setStatus("");
    setFinished(false);
    setSaving(false);
    setPartial(null);
    capturedRef.current = {};
  }, []);

  const start = useCallback(async () => {
    reset();
    setBusy(true);
    try {
      const r = await fpApi.startSession(userName || t("fpenroll.anon"));
      setSid(r.session_id);
      applyState(r);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }, [userName, t, reset, applyState]);

  useEffect(() => {
    if (!open) return;
    reset();
    checkHealth();
  }, [open, reset, checkHealth]);

  const capture = async (step) => {
    const target = step || (nextStep && nextStep.step);
    if (!sid || !target || busy || saving) return;
    setBusy(true);
    setErr("");
    setStatus(t("fpenroll.status.reading_step", { step: stepName(target) }));
    try {
      const r = await fpApi.capture(sid, target);
      applyState(r);
      const nextThumbs = {};
      for (const c of r.captured || []) {
        capturedRef.current[c.code] = c.image_b64;
        nextThumbs[c.code] = c.thumb_b64 || c.image_b64;
      }
      setThumbs((prev) => ({ ...prev, ...nextThumbs }));
      // Con ngon loi trong cum: mo panel cho can bo quyet dinh.
      if (r.partial) {
        setPartial({ step: target, failing: r.failing || [] });
      } else {
        setPartial(null);
      }
      setStatus(r.finished ? t("fpenroll.status.done_all") : r.message || "");
    } catch (e) {
      setErr(e.message);
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  // Nhap DOI vao 1 cum da chup => xoa ca cum va cho chup lai.
  const retakeStep = async (stepObj) => {
    if (!sid || busy || saving || !stepObj || !stepObj.done) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fpApi.redo(sid, stepObj.codes[0]);
      applyState(r);
      setThumbs((prev) => {
        const nx = { ...prev };
        for (const c of stepObj.codes) delete nx[c];
        return nx;
      });
      for (const c of stepObj.codes) delete capturedRef.current[c];
      setStatus(t("fpenroll.status.retake_step", { step: stepName(stepObj.step) }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Can bo xac nhan nhung ngon da that bai trong cum la "khong co van tay".
  // KHONG kich hoat quet lai - backend dung lai data cua lan chup gan nhat.
  const confirmMissing = async (codes) => {
    if (!sid || !partial || busy || saving) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fpApi.confirmMissing(sid, partial.step, codes);
      applyState(r);
      // Ngong duoc danh dau thieu khong co anh -> xoa thumb + cache.
      setThumbs((prev) => {
        const nx = { ...prev };
        for (const c of codes) delete nx[c];
        return nx;
      });
      for (const c of codes) delete capturedRef.current[c];
      setPartial(null);
      setStatus(r.message || "");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
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
      for (const code of Object.keys(capturedRef.current)) {
        const key = CODE_TO_KEY[code];
        if (!key) continue;
        const file = await b64PngToFile(capturedRef.current[code], `${key}.png`);
        const up = await api.uploadPhoto(file);
        mapping[key] = up.url;
      }
      // Danh sach ngon can bo xac nhan "khong co van tay" (ma CO CODE trong
      // morfin). DataCapturePage luu vao photos.fp_missing de admin phan biet
      // "da xac nhan thieu" voi "chua thu thap duoc" khi xem lai ho so.
      mapping.fp_missing = fingers.filter((f) => f.missing).map((f) => f.code);
      onDone(mapping);
    } catch (e) {
      setErr(t("fpenroll.err.upload", { message: e.message }));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const qClass = (q) => (q >= 70 ? "good" : q >= minQuality ? "ok" : "bad");
  const notReady = !health || !health.ok;
  const isNext = (s) => !!nextStep && nextStep.step === s.step;

  const renderGroup = (s) => (
    <div
      key={s.step}
      className={"fp-group" + (s.done ? " done" : "") + (isNext(s) ? " active" : "")}
      onDoubleClick={s.done ? () => retakeStep(s) : undefined}
      title={s.done ? t("fpenroll.dblclick_retake") : undefined}
    >
      <div className="fp-group-head">
        <span className="fp-group-name">{stepName(s.step)}</span>
        <span className="fp-group-badge">
          {s.done ? t("fpenroll.done_label") : isNext(s) ? t("fpenroll.waiting_label") : ""}
        </span>
        {s.done && (
          <span className="fp-group-redo">↻ {t("fpenroll.dblclick_hint")}</span>
        )}
      </div>
      <div className="fp-group-tiles">
        {s.codes.map((code) => {
          const f = byCode[code] || {};
          const img = thumbs[code];
          const tileCls =
            "fp-tile" +
            (f.done ? " has-img" : "") +
            (f.missing ? " has-missing" : "");
          return (
            <div className={tileCls} key={code}>
              <div className="fp-tile-img">
                {img
                  ? <img alt={fingerName(code)} src={`data:image/png;base64,${img}`} />
                  : <span className="fp-tile-empty">—</span>}
                {f.missing ? (
                  <span className="fp-quality missing" title={t("fpenroll.tile.missing_label")}>
                    ⊘
                  </span>
                ) : f.done ? (
                  <span className={"fp-quality " + qClass(f.quality)}>{f.quality}%</span>
                ) : null}
              </div>
              <div className="fp-tile-name">
                {fingerName(code)}
                {f.missing && <em className="fp-tile-missing">{t("fpenroll.tile.missing_label")}</em>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

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
                ? t("fpenroll.sensor.ok", { w: health.width, h: health.height, users: 0 })
                : t("fpenroll.sensor.not_ready")}
            </span>
            {healthErr && <span className="fp-err-inline">{healthErr}</span>}
            {!sid && (
              <button className="btn-primary" onClick={start} disabled={busy || notReady}>
                {busy ? t("fpenroll.initializing") : t("fpenroll.start")}
              </button>
            )}
            {sid && (
              <>
                <span className="fp-progress-text">{t("fpenroll.progress", { done, total })}</span>
                <span className="fp-minq">{t("fpenroll.min_quality", { min: minQuality })}</span>
              </>
            )}
          </div>

          {sid && (
            <>
              <div className="fp-progress-bar">
                <div style={{ width: `${(done / total) * 100}%` }} />
              </div>

              <div className="fp-groups">{steps.map(renderGroup)}</div>

              {status && <div className="fp-msg">{status}</div>}
              {err && <div className="fp-err">{err}</div>}

              {partial && partial.failing.length > 0 && (
                <div className="fp-partial">
                  <div className="fp-partial-title">{t("fpenroll.partial.title")}</div>
                  <ul className="fp-partial-list">
                    {partial.failing.map((w) => (
                      <li key={w.code}>
                        {w.reason === "weak"
                          ? t("fpenroll.partial.reason_weak", {
                              name: fingerName(w.code),
                              q: w.quality,
                              need: w.need,
                            })
                          : t("fpenroll.partial.reason_no_quality", {
                              name: fingerName(w.code),
                            })}
                      </li>
                    ))}
                  </ul>
                  <div className="fp-partial-hint">
                    {partial.failing.some((w) => w.reason === "no_quality")
                      ? t("fpenroll.partial.hint")
                      : t("fpenroll.partial.hint_weak_only")}
                  </div>
                  <div className="fp-partial-actions">
                    {partial.failing.some((w) => w.reason === "no_quality") && (
                      <button
                        className="btn-ghost"
                        onClick={() => confirmMissing(
                          partial.failing.filter((w) => w.reason === "no_quality")
                            .map((w) => w.code))}
                        disabled={busy || saving}
                      >
                        {t("fpenroll.confirm_missing_btn")}
                      </button>
                    )}
                    <button
                      className="btn-primary"
                      onClick={() => capture(partial.step)}
                      disabled={busy || saving}
                    >
                      {t("fpenroll.retake_cluster_btn")}
                    </button>
                  </div>
                </div>
              )}

              <div className="fp-actions">
                <button
                  className="btn-primary"
                  onClick={() => capture()}
                  disabled={busy || saving || !nextStep}
                >
                  {busy
                    ? t("fpenroll.capturing")
                    : nextStep
                      ? t("fpenroll.capture_step", { step: stepName(nextStep.step) })
                      : t("fpenroll.enough")}
                </button>
                <button className="btn-ghost" onClick={apply} disabled={!finished || saving}>
                  {saving ? t("fpenroll.uploading") : t("fpenroll.apply")}
                </button>
                <button className="btn-ghost" onClick={cancel} disabled={saving}>
                  {t("common.cancel")}
                </button>
              </div>
            </>
          )}

          {!sid && <div className="fp-hint">{t("fpenroll.hint")}</div>}
        </div>
      </div>
    </div>
  );
}
