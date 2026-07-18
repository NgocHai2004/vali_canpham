import { useCallback, useEffect, useRef, useState } from "react";
import { api, fpApi, b64PngToFile } from "./api";

// Mapping code ZKFinger -> key ảnh trên form (10 slot)
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

const FINGER_NAME_VI = {
  left_thumb: "Cái trái",
  left_index: "Trỏ trái",
  left_middle: "Giữa trái",
  left_ring: "Áp út trái",
  left_little: "Út trái",
  right_thumb: "Cái phải",
  right_index: "Trỏ phải",
  right_middle: "Giữa phải",
  right_ring: "Áp út phải",
  right_little: "Út phải",
};

export default function FingerprintEnrollModal({ open, userName, onClose, onDone }) {
  const [health, setHealth] = useState(null);
  const [healthErr, setHealthErr] = useState("");
  const [sid, setSid] = useState(null);
  const [fingers, setFingers] = useState([]); // [{code, name_vi, hand, done, image_b64?}]
  const [nextCode, setNextCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const [previewB64, setPreviewB64] = useState(null);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const capturedRef = useRef({}); // { code: base64 png }

  const done = fingers.filter((f) => f.done).length;
  const total = fingers.length || 10;

  const checkHealth = useCallback(async () => {
    setHealthErr("");
    try {
      const h = await fpApi.health();
      setHealth(h);
      if (!h.ok) setHealthErr(h.error || "Máy quét vân tay chưa sẵn sàng.");
    } catch (e) {
      setHealth({ ok: false });
      setHealthErr(e.message);
    }
  }, []);

  const start = useCallback(async () => {
    setErr("");
    setStatus("");
    setPreviewB64(null);
    setFinished(false);
    capturedRef.current = {};
    setBusy(true);
    try {
      const r = await fpApi.startSession(userName || "Ẩn danh");
      setSid(r.session_id);
      setFingers(r.fingers.map((f) => ({ ...f, done: false })));
      setNextCode(r.next_finger ? r.next_finger.code : null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }, [userName]);

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
    setStatus(`Đang đọc ${FINGER_NAME_VI[nextCode] || nextCode}... Đặt ngón tay và giữ yên.`);
    try {
      const r = await fpApi.capture(sid);
      const code = r.finger.code;
      capturedRef.current[code] = r.finger.image_b64;
      setPreviewB64(r.finger.image_b64);
      setFingers((list) => list.map((f) => (f.code === code ? { ...f, done: true } : f)));
      setNextCode(r.next_finger ? r.next_finger.code : null);
      setStatus(r.message || `Đã lưu ${FINGER_NAME_VI[code] || code}.`);
      if (r.finished) {
        setFinished(true);
        setStatus("Đã thu thập đủ 10 ngón. Nhấn 'Áp dụng vào hồ sơ' để đưa vào form.");
      }
    } catch (e) {
      setErr(e.message);
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const redoCurrent = async () => {
    if (!sid) return;
    // Chụp lại ngón vừa xong (ngón được done gần nhất)
    const lastDone = [...fingers].reverse().find((f) => f.done);
    if (!lastDone) return;
    setBusy(true);
    setErr("");
    try {
      await fpApi.redo(sid, lastDone.code);
      delete capturedRef.current[lastDone.code];
      setFingers((list) => list.map((f) => (f.code === lastDone.code ? { ...f, done: false } : f)));
      setNextCode(lastDone.code);
      setStatus(`Chụp lại ${FINGER_NAME_VI[lastDone.code]}.`);
      setPreviewB64(null);
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
      setErr("Không lưu được ảnh vân tay lên máy chủ: " + e.message);
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
          <div key={code} className={"fp-row" + (isDone ? " done" : "") + (isNext ? " active" : "")}>
            <span className="fp-row-dot" />
            <span className="fp-row-name">{FINGER_NAME_VI[code]}</span>
            <span className="fp-row-status">
              {isDone ? "Đã thu" : isNext ? "Đang chờ" : ""}
            </span>
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
          <h3>Thu thập vân tay 10 ngón (ZKFinger)</h3>
          <button className="close-x" onClick={cancel} aria-label="Đóng">×</button>
        </div>

        <div className="fp-body">
          <div className="fp-status-line">
            <span className={"fp-badge " + (health && health.ok ? "ok" : "off")}>
              <span className="dot" />
              {health && health.ok
                ? `Sensor OK · ${health.width}×${health.height} · ${health.users || 0} user`
                : "Sensor chưa sẵn sàng"}
            </span>
            {healthErr && <span className="fp-err-inline">{healthErr}</span>}
            {!sid && (
              <button className="btn-primary" onClick={start} disabled={busy || notReady}>
                {busy ? "Đang khởi tạo..." : "Bắt đầu"}
              </button>
            )}
            {sid && (
              <span className="fp-progress-text">Tiến độ: <b>{done}/{total}</b> ngón</span>
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
                      ? <img alt="Vân tay" src={`data:image/png;base64,${previewB64}`} />
                      : <span>Ảnh vân tay sẽ hiện ở đây</span>}
                  </div>
                  <div className="fp-next">
                    <div className="fp-next-label">Ngón tiếp theo</div>
                    <div className="fp-next-name">
                      {nextCode ? FINGER_NAME_VI[nextCode] : "Hoàn tất"}
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
                  {busy ? "Đang chụp..." : nextCode ? `Chụp ${FINGER_NAME_VI[nextCode]}` : "Đã đủ 10 ngón"}
                </button>
                <button
                  className="btn-ghost"
                  onClick={redoCurrent}
                  disabled={busy || saving || !fingers.some((f) => f.done)}
                >
                  Chụp lại ngón vừa rồi
                </button>
                <button
                  className="btn-ghost"
                  onClick={apply}
                  disabled={!finished || saving}
                >
                  {saving ? "Đang tải ảnh lên..." : "Áp dụng vào hồ sơ"}
                </button>
                <button className="btn-ghost" onClick={cancel} disabled={saving}>
                  Huỷ
                </button>
              </div>
            </>
          )}

          {!sid && (
            <div className="fp-hint">
              Kết nối máy quét ZKFinger (ZK4500/7500/8500 hoặc Live20R), chạy service Python
              (<code>python -m uvicorn api:app --host 127.0.0.1 --port 8765</code>), rồi nhấn "Bắt đầu".
              Hệ thống sẽ hướng dẫn đặt lần lượt 10 ngón tay.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
