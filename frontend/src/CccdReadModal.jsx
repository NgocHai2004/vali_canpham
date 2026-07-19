import { useCallback, useEffect, useRef, useState } from "react";
import { cccdApi } from "./api";

const GENDER_VI = { male: "Nam", female: "Nữ" };

const isPositive = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s || s === "—") return null;
  if (["true", "ok", "success", "1", "valid"].some((k) => s.includes(k))) return true;
  if (["false", "fail", "error", "0", "invalid"].some((k) => s.includes(k))) return false;
  return null;
};

export default function CccdReadModal({ open, onClose, onDone }) {
  // states: INIT | NO_READER | WAITING | PREVIEW | ERROR
  const [state, setState] = useState("INIT");
  const [health, setHealth] = useState(null);
  const [sid, setSid] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const abortRef = useRef(null);
  const cancelledRef = useRef(false);

  const cleanupSession = useCallback(async () => {
    cancelledRef.current = true;
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { /* noop */ }
    }
    if (sid) {
      try { await cccdApi.cancel(sid); } catch { /* noop */ }
    }
  }, [sid]);

  const close = useCallback(async () => {
    await cleanupSession();
    onClose();
  }, [cleanupSession, onClose]);

  // Khởi tạo modal khi mở
  useEffect(() => {
    if (!open) return;
    cancelledRef.current = false;
    setState("INIT");
    setData(null);
    setErr("");
    setSid(null);
    (async () => {
      try {
        const h = await cccdApi.health();
        if (cancelledRef.current) return;
        setHealth(h);
        if (!h.ok) {
          setErr(h.error || "Đầu đọc CCCD chưa sẵn sàng.");
          setState("NO_READER");
          return;
        }
        const s = await cccdApi.startSession();
        if (cancelledRef.current) return;
        setSid(s.session_id);
        setState("WAITING");
      } catch (e) {
        if (cancelledRef.current) return;
        setErr(e.message);
        setState("NO_READER");
      }
    })();
    return () => {
      cancelledRef.current = true;
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch { /* noop */ }
      }
    };
  }, [open]);

  // Long-poll khi đang WAITING
  useEffect(() => {
    if (state !== "WAITING" || !sid) return;
    let stopped = false;
    const loop = async () => {
      while (!stopped && !cancelledRef.current) {
        const ac = new AbortController();
        abortRef.current = ac;
        try {
          const r = await cccdApi.wait(sid, ac.signal, 25);
          if (stopped || cancelledRef.current) return;
          if (r && r.status === "ok" && r.data) {
            setData(r.data);
            setState("PREVIEW");
            return;
          }
          // timeout → loop tiếp
        } catch (e) {
          if (e.name === "AbortError" || cancelledRef.current) return;
          setErr(e.message);
          setState("ERROR");
          return;
        }
      }
    };
    loop();
    return () => { stopped = true; };
  }, [state, sid]);

  const retryFromError = async () => {
    setErr("");
    setState("WAITING");
  };

  const readAnother = async () => {
    if (!sid) return;
    try { await cccdApi.readAgain(sid); } catch { /* noop */ }
    setData(null);
    setErr("");
    setState("WAITING");
  };

  const apply = () => {
    if (!data) return;
    // eslint-disable-next-line no-unused-vars
    const { verify_sod, aa_ca_authen, ...formData } = data;
    onDone(formData);
    cleanupSession();
    onClose();
  };

  if (!open) return null;

  const sodOk = data ? isPositive(data.verify_sod) : null;
  const aaOk = data ? isPositive(data.aa_ca_authen) : null;

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal cccd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Đọc CCCD (Hanel HN-212)</h3>
          <button className="close-x" onClick={close} aria-label="Đóng">×</button>
        </div>

        <div className="cccd-body">
          <div className="cccd-status-line">
            <span className={"cccd-badge " + (health && health.ok ? "ok" : "off")}>
              <span className="dot" />
              {health && health.ok
                ? `Đầu đọc OK · ${health.sdk || "HN-212"}`
                : "Đầu đọc chưa sẵn sàng"}
            </span>
            {state === "WAITING" && (
              <span className="cccd-progress-text">Đang chờ thẻ...</span>
            )}
          </div>

          {state === "INIT" && (
            <div className="cccd-center-msg">Đang khởi tạo đầu đọc...</div>
          )}

          {state === "NO_READER" && (
            <div className="cccd-error-panel">
              <div className="cccd-error-title">Không sẵn sàng</div>
              <div className="cccd-error-msg">{err}</div>
              <div className="cccd-hint">
                Kiểm tra cáp USB, driver đầu đọc, và service Python <code>cccd_api</code> đã chạy ở cổng <b>8767</b>.
              </div>
              <div className="cccd-actions">
                <button className="btn-primary" onClick={async () => {
                  setErr("");
                  setState("INIT");
                  try {
                    const h = await cccdApi.health();
                    setHealth(h);
                    if (h.ok) {
                      const s = await cccdApi.startSession();
                      setSid(s.session_id);
                      setState("WAITING");
                    } else {
                      setErr(h.error || "Đầu đọc CCCD chưa sẵn sàng.");
                      setState("NO_READER");
                    }
                  } catch (e) {
                    setErr(e.message);
                    setState("NO_READER");
                  }
                }}>Thử lại</button>
                <button className="btn-ghost" onClick={close}>Đóng</button>
              </div>
            </div>
          )}

          {state === "WAITING" && (
            <div className="cccd-wait-panel">
              <div className="cccd-wait-icon">🪪</div>
              <div className="cccd-wait-title">Đưa thẻ CCCD vào đầu đọc</div>
              <div className="cccd-wait-sub">Giữ nguyên thẻ tới khi hệ thống báo đọc xong.</div>
              <div className="cccd-spinner" />
              <div className="cccd-actions">
                <button className="btn-ghost" onClick={close}>Huỷ</button>
              </div>
            </div>
          )}

          {state === "PREVIEW" && data && (
            <div className="cccd-preview-panel">
              <div className="cccd-verify-row">
                <VerifyBadge label="Xác thực toàn vẹn (SOD)" ok={sodOk} raw={data.verify_sod} />
                <VerifyBadge label="Xác thực chip (AA/CA)" ok={aaOk} raw={data.aa_ca_authen} />
              </div>

              <div className="cccd-fields">
                <Row label="Họ và tên" value={data.full_name} strong />
                <Row label="Số CCCD" value={data.cccd_number} strong />
                <Row label="Ngày sinh" value={data.dob} />
                <Row label="Giới tính" value={GENDER_VI[data.gender] || data.gender} />
                <Row label="Dân tộc" value={data.ethnicity} />
                <Row label="Tôn giáo" value={data.religion} />
                <Row label="Quê quán" value={data.hometown} />
                <Row label="Thường trú" value={data.address} />
                <Row label="Ngày cấp" value={data.issued_date} />
                <Row label="Hết hạn" value={data.expiry_date} />
                <Row label="CMND cũ" value={data.cmnd_old} />
                <Row label="Quốc tịch" value={data.nationality} />
              </div>

              <div className="cccd-actions">
                <button className="btn-ghost" onClick={readAnother}>Đọc thẻ khác</button>
                <button className="btn-ghost" onClick={close}>Huỷ</button>
                <button className="btn-primary" onClick={apply}>Áp dụng vào hồ sơ</button>
              </div>
            </div>
          )}

          {state === "ERROR" && (
            <div className="cccd-error-panel">
              <div className="cccd-error-title">Lỗi đọc thẻ</div>
              <div className="cccd-error-msg">{err}</div>
              <div className="cccd-actions">
                <button className="btn-primary" onClick={retryFromError}>Thử lại</button>
                <button className="btn-ghost" onClick={close}>Đóng</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }) {
  const empty = !value || String(value).trim() === "";
  return (
    <div className="cccd-row">
      <span className="cccd-row-label">{label}</span>
      <span className={"cccd-row-value" + (strong ? " strong" : "") + (empty ? " empty" : "")}>
        {empty ? "—" : value}
      </span>
    </div>
  );
}

function VerifyBadge({ label, ok, raw }) {
  const cls = ok === true ? "ok" : ok === false ? "bad" : "unknown";
  const text = ok === true ? "HỢP LỆ" : ok === false ? "KHÔNG HỢP LỆ" : (raw || "—");
  return (
    <div className={"cccd-verify-badge " + cls}>
      <div className="cccd-verify-label">{label}</div>
      <div className="cccd-verify-text">{text}</div>
    </div>
  );
}
