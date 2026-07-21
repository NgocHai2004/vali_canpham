import { useCallback, useEffect, useRef, useState } from "react";
import { cccdApi } from "./api";

const GENDER_VI = { male: "Nam", female: "Nữ" };

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
          setErr("Thư mục dữ liệu CCCD chưa sẵn sàng: " + (h.data_dir || ""));
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
    const { facePhoto, personal_identification, sex_vi, _scan_folder, ...formData } = data;
    onDone(formData);
    cleanupSession();
    onClose();
  };

  if (!open) return null;

  const faceSrc = data && data.facePhoto
    ? `data:image/jpeg;base64,${data.facePhoto}`
    : null;

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal cccd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Đọc CCCD (HANEL eKYC)</h3>
          <button className="close-x" onClick={close} aria-label="Đóng">×</button>
        </div>

        <div className="cccd-body">
          <div className="cccd-status-line">
            <span className={"cccd-badge " + (health && health.ok ? "ok" : "off")}>
              <span className="dot" />
              {health && health.ok
                ? "Đang theo dõi thư mục dữ liệu CCCD"
                : "Thư mục dữ liệu chưa sẵn sàng"}
            </span>
            {state === "WAITING" && (
              <span className="cccd-progress-text">Đang chờ thẻ mới...</span>
            )}
          </div>

          {state === "INIT" && (
            <div className="cccd-center-msg">Đang khởi tạo phiên đọc...</div>
          )}

          {state === "NO_READER" && (
            <div className="cccd-error-panel">
              <div className="cccd-error-title">Không sẵn sàng</div>
              <div className="cccd-error-msg">{err}</div>
              <div className="cccd-hint">
                Kiểm tra thư mục <code>backend/data_cccd/</code> đã tồn tại và app HANEL eKYC đang ghi file vào đó.
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
                      setErr("Thư mục dữ liệu CCCD chưa sẵn sàng: " + (h.data_dir || ""));
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
              <div className="cccd-wait-title">Đưa thẻ CCCD vào đầu đọc HANEL eKYC</div>
              <div className="cccd-wait-sub">
                Hệ thống sẽ tự động nhận dữ liệu ngay khi app HANEL eKYC quét xong thẻ.
              </div>
              <div className="cccd-spinner" />
              <div className="cccd-actions">
                <button className="btn-ghost" onClick={close}>Huỷ</button>
              </div>
            </div>
          )}

          {state === "PREVIEW" && data && (
            <div className="cccd-preview-panel">
              <div className="cccd-preview-grid">
                <div className="cccd-face">
                  {faceSrc ? (
                    <img src={faceSrc} alt="Ảnh chân dung" />
                  ) : (
                    <div className="cccd-face-empty">Không có ảnh</div>
                  )}
                </div>

                <div className="cccd-fields">
                  <Row label="Số CCCD" value={data.cccd_number} strong />
                  <Row label="Họ và tên" value={data.full_name} strong />
                  <Row label="Ngày sinh" value={data.dob} />
                  <Row label="Giới tính" value={data.sex_vi || GENDER_VI[data.gender] || data.gender} />
                  <Row label="Quốc tịch" value={data.nationality} />
                  <Row label="Quê quán" value={data.hometown} />
                  <Row label="Nơi thường trú" value={data.address} />
                  <Row label="Ngày cấp" value={data.issued_date} />
                  <Row label="Ngày hết hạn" value={data.expiry_date} />
                  <Row label="Đặc điểm nhận dạng" value={data.personal_identification} />
                </div>
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
