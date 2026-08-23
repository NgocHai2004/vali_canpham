import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n";

// Ảnh dấu vết hiện trường của 1 vụ án (= 1 phiên làm việc).
// Nguồn: máy ngoài bắn qua /api/scene/push, hoặc cán bộ chụp/chọn file ở đây.
// Backend trả 409 khi chưa có phiên nào mở => hiện lời nhắc khởi tạo phiên.

function seqLabel(n) {
  return String(n ?? 0).padStart(3, "0");
}

function fmtSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SceneTracesPage({ go }) {
  const { t, formatDateTime } = useI18n();
  const fileRef = useRef(null);
  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // needSession = backend trả 409 => chưa có phiên nào mở, không phải lỗi hệ thống.
  const [needSession, setNeedSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  // Phạm vi đối sánh: "session" = 3.1 (nghi phạm lập tại chỗ trong vụ án này),
  // "commune"/"province" = 3.2 (mở rộng ra DB can phạm cấp xã / cấp tỉnh).
  // Chỉ là vỏ giao diện — engine đối sánh vân tay latent chưa có, xem scope.notice.
  const [scope, setScope] = useState("session");
  const [dragOver, setDragOver] = useState(false);
  const [noteEdit, setNoteEdit] = useState({ id: "", text: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    setNeedSession(false);
    try {
      const r = await api.listSceneTraces();
      setSession(r.session || null);
      setItems(r.items || []);
    } catch (ex) {
      const msg = ex.message || t("scene.err.load");
      // 409 từ backend: "Chưa có phiên làm việc nào đang mở..."
      if (ex.status === 409 || /phiên/i.test(msg)) setNeedSession(true);
      else setErr(msg);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const addFile = async (file, source) => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      await api.createSceneTrace(file, { sessionId: session?.id, source });
      await load();
    } catch (ex) {
      setErr(ex.message || t("scene.err.upload"));
    } finally {
      setBusy(false);
    }
  };

  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const f of files) await addFile(f, "upload");
  };

  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    // Chỉ nhận ảnh; kéo thư mục / file lạ vào thì bỏ qua im lặng.
    const files = Array.from(e.dataTransfer?.files || []).filter((f) =>
      /^image\/(jpeg|png|webp)$/.test(f.type),
    );
    for (const f of files) await addFile(f, "upload");
  };

  const saveNote = async () => {
    const { id, text } = noteEdit;
    if (!id) return;
    setBusy(true);
    try {
      await api.updateSceneTrace(id, text);
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, note: text.trim() } : x)));
      setNoteEdit({ id: "", text: "" });
    } catch (ex) {
      setErr(ex.message || t("scene.err.save_note"));
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    const row = confirmDel;
    setConfirmDel(null);
    if (!row) return;
    setBusy(true);
    try {
      await api.deleteSceneTrace(row.id);
      await load();
    } catch (ex) {
      setErr(ex.message || t("scene.err.delete"));
    } finally {
      setBusy(false);
    }
  };

  if (needSession) {
    return (
      <section className="panel scene-need-session">
        <h2>{t("scene.title")}</h2>
        <p>{t("scene.need_session")}</p>
        <button className="btn-primary" onClick={() => go && go("sessions")}>
          {t("scene.go_sessions")}
        </button>
      </section>
    );
  }

  return (
    <section className="panel scene-page">
      <div className="scene-head">
        <div className="scene-head-main">
          <h2>{session?.case_name || t("scene.no_case_name")}</h2>
          <div className="scene-head-sub">
            <span className="scene-code">{session?.code || "—"}</span>
            <span className="scene-count">{t("scene.count", { n: items.length })}</span>
          </div>
        </div>
        <div className="scene-head-actions">
          <button className="btn-ghost" onClick={load} disabled={busy || loading}>
            {t("scene.btn.refresh")}
          </button>
        </div>
      </div>

      {/* Ô upload: 1 khối lớn giữa màn, kéo-thả hoặc bấm để chọn file. */}
      <div
        className={"scene-drop" + (dragOver ? " over" : "") + (busy ? " busy" : "")}
        onClick={() => !busy && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
      >
        <div className="scene-drop-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M12 3v13" /><path d="m7 8 5-5 5 5" />
          </svg>
        </div>
        <div className="scene-drop-title">
          {busy ? t("scene.drop.uploading") : t("scene.drop.title")}
        </div>
        <div className="scene-drop-hint">{t("scene.drop.hint")}</div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={onPickFiles}
        />
      </div>

      {/* Thanh đối sánh — 3.1 trong vụ án, 3.2 mở rộng xã/tỉnh.
          Vỏ giao diện: nút bấm được nhưng chưa gọi API, vì đối sánh vân tay
          latent (ảnh vết) cần engine trích minutiae mà hệ thống chưa có. */}
      <div className="scene-match-bar">
        <div className="scene-match-scopes">
          <span className="scene-match-label">{t("scene.match.scope_label")}</span>
          {["session", "commune"].map((k) => (
            <label className={"scene-scope" + (scope === k ? " on" : "")} key={k}>
              <input
                type="radio"
                name="scene-scope"
                value={k}
                checked={scope === k}
                onChange={() => setScope(k)}
              />
              <span>{t(`scene.match.scope.${k}`)}</span>
            </label>
          ))}
        </div>
        <div className="scene-match-run">
          <button className="btn-primary" disabled title={t("scene.match.notice")}>
            {t("scene.match.run")}
          </button>
          <span className="scene-match-notice">{t("scene.match.notice")}</span>
        </div>
      </div>

      {err && <div className="error-box">{err}</div>}

      {loading ? (
        <div className="scene-empty">{t("common.loading")}</div>
      ) : items.length === 0 ? (
        <div className="scene-empty">{t("scene.empty")}</div>
      ) : (
        <div className="scene-grid">
          {items.map((it) => (
            <figure className="scene-card" key={it.id}>
              <a className="scene-card-img" href={it.url} target="_blank" rel="noreferrer">
                <img src={it.url} alt={`${t("scene.image")} ${seqLabel(it.seq)}`} loading="lazy" />
              </a>
              <figcaption>
                <div className="scene-card-top">
                  <strong>{t("scene.image")} {seqLabel(it.seq)}</strong>
                  <span className={`scene-src scene-src-${it.source || "upload"}`}>
                    {t(`scene.source.${it.source || "upload"}`)}
                  </span>
                </div>
                <div className="scene-card-meta">
                  {formatDateTime ? formatDateTime(it.captured_at) : it.captured_at} · {fmtSize(it.size)}
                </div>
                {noteEdit.id === it.id ? (
                  <div className="scene-note-edit">
                    <input
                      className="control"
                      value={noteEdit.text}
                      maxLength={500}
                      autoFocus
                      onChange={(e) => setNoteEdit({ id: it.id, text: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && saveNote()}
                    />
                    <button className="btn-primary" onClick={saveNote} disabled={busy}>
                      {t("common.save")}
                    </button>
                    <button className="btn-ghost" onClick={() => setNoteEdit({ id: "", text: "" })}>
                      {t("common.cancel")}
                    </button>
                  </div>
                ) : (
                  <button
                    className="scene-note"
                    onClick={() => setNoteEdit({ id: it.id, text: it.note || "" })}
                    title={t("scene.note_edit")}
                  >
                    {it.note || t("scene.note_add")}
                  </button>
                )}
                <button className="btn-danger scene-del" onClick={() => setConfirmDel(it)} disabled={busy}>
                  {t("common.delete")}
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {confirmDel && (
        <div className="session-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConfirmDel(null)}>
          <div className="session-modal scene-confirm">
            <div className="session-modal-head"><h3>{t("scene.del.title")}</h3></div>
            <div className="session-modal-body">
              {t("scene.del.body", { n: seqLabel(confirmDel.seq) })}
            </div>
            <div className="session-modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmDel(null)}>{t("common.cancel")}</button>
              <button className="btn-danger" onClick={runDelete}>{t("common.delete")}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
