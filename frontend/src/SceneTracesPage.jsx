import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import SceneTraceDetail from "./SceneTraceDetail";
import SceneTraceFull from "./SceneTraceFull";
import { useI18n } from "./i18n";
import { DEMO_ITEMS } from "./sceneDemo";

// Ảnh dấu vết hiện trường của 1 vụ án (= 1 phiên làm việc).
// Nguồn: máy ngoài bắn qua /api/scene/push, hoặc cán bộ chọn file ở đây.
// Backend trả 409 khi chưa có phiên nào mở => hiện lời nhắc khởi tạo phiên.
//
// Bố cục: bảng danh sách (~72%) + panel chi tiết (~28%) trên cùng 1 trang.
// Vài trăm dấu vết là bình thường nên danh sách là bảng nén + phân trang,
// không phải lưới card ảnh lớn.
//
// Phiên chưa có dấu vết nào => dùng DEMO_ITEMS để đúng bố cục đã chốt,
// vì backend còn thiếu code/trace_type/collection_source. Xem sceneDemo.js.

// Cố định 14 dòng/trang: vừa đúng 1 màn hình, không sinh thanh cuộn.
const PAGE_SIZE = 14;

export function seqLabel(n) {
  return String(n ?? 0).padStart(3, "0");
}

// Mã dấu vết: dùng field code nếu backend đã lưu, chưa có thì dựng từ
// seq + năm thu thập. Khi backend có code thật thì bỏ nhánh dự phòng.
export function traceCode(it) {
  if (it?.code) return it.code;
  const y = String(it?.captured_at || "").slice(0, 4) || "----";
  return `DVHT-${y}-${String(it?.seq ?? 0).padStart(4, "0")}`;
}

export function fmtSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Dãy số trang có dấu ... hai đầu: 1 … 4 5 6 … 24
function pageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  const from = Math.max(2, cur - 1);
  const to = Math.min(total - 1, cur + 1);
  if (from > 2) out.push("…");
  for (let p = from; p <= to; p++) out.push(p);
  if (to < total - 1) out.push("…");
  out.push(total);
  return out;
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
  const [menuId, setMenuId] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [q, setQ] = useState("");
  const [fType, setFType] = useState("");
  const [fSource, setFSource] = useState("");
  const [page, setPage] = useState(1);
  // fullId != "" => hiện trang chi tiết đầy đủ thay cho bảng danh sách.
  const [fullId, setFullId] = useState("");

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

  const demo = !loading && !err && items.length === 0;
  const rows = demo ? DEMO_ITEMS : items;

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

  const saveNote = async (id, text) => {
    if (!id || String(id).startsWith("demo-")) return;
    setBusy(true);
    try {
      await api.updateSceneTrace(id, text);
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, note: text.trim() } : x)));
    } catch (ex) {
      setErr(ex.message || t("scene.err.save_note"));
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    const row = confirmDel;
    setConfirmDel(null);
    if (!row || row.demo) return;
    setBusy(true);
    try {
      await api.deleteSceneTrace(row.id);
      if (selectedId === row.id) setSelectedId("");
      await load();
    } catch (ex) {
      setErr(ex.message || t("scene.err.delete"));
    } finally {
      setBusy(false);
    }
  };

  // Lọc client-side: dữ liệu 1 phiên, vài trăm bản ghi => không cần lọc ở server.
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows.filter((it) => {
      if (fType && (it.trace_type || "") !== fType) return false;
      if (fSource && (it.collection_source || "") !== fSource) return false;
      if (!kw) return true;
      return traceCode(it).toLowerCase().includes(kw);
    });
  }, [rows, q, fType, fSource]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE),
    [filtered, curPage],
  );

  // Bộ lọc đổi => về trang 1, tránh đứng ở trang trống.
  useEffect(() => { setPage(1); }, [q, fType, fSource]);

  // Mặc định chọn dấu vết đầu tiên để panel phải không trống.
  useEffect(() => {
    if (!rows.length) { setSelectedId(""); return; }
    if (!rows.some((x) => x.id === selectedId)) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  const selected = rows.find((x) => x.id === selectedId) || null;

  // Dropdown chỉ liệt kê giá trị có thật trong dữ liệu.
  const typeOpts = useMemo(
    () => Array.from(new Set(rows.map((x) => x.trace_type).filter(Boolean))),
    [rows],
  );
  const sourceOpts = useMemo(
    () => Array.from(new Set(rows.map((x) => x.collection_source).filter(Boolean))),
    [rows],
  );

  if (needSession) {
    return (
      <section className="panel scene-need-session">
        <h2>{t("scene.title")}</h2>
        <p>{t("scene.need_session")}</p>
        <button className="btn-primary" onClick={() => go && go("scene_traces")}>
          {t("scene.go_cases")}
        </button>
      </section>
    );
  }

  const fullItem = fullId ? rows.find((x) => x.id === fullId) : null;
  if (fullItem) {
    return (
      <SceneTraceFull
        item={fullItem}
        session={session}
        onBack={() => setFullId("")}
      />
    );
  }

  return (
    <div
      className={"scene-layout" + (dragOver ? " drag" : "")}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => menuId && setMenuId("")}
    >
      <section className="panel scene-list-panel">
        <div className="scene-list-head">
          <div className="scene-list-head-main">
            <h2>{t("scene.list.title")}</h2>
            <div className="scene-list-sub">
              <span className="scene-count">{t("scene.list.total", { n: filtered.length })}</span>
              {demo && <span className="scene-demo-tag">{t("scene.demo")}</span>}
            </div>
          </div>
          <div className="scene-list-head-actions">
            <button
              className="btn-primary"
              onClick={() => !busy && fileRef.current?.click()}
              disabled={busy}
            >
              {busy ? t("scene.uploading") : t("scene.btn.add")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={onPickFiles}
            />
          </div>
        </div>

        <div className="scene-toolbar">
          <input
            className="control scene-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("scene.search.ph")}
          />
          <select
            className="control scene-filter"
            value={fType}
            onChange={(e) => setFType(e.target.value)}
          >
            <option value="">{t("scene.filter.type")}</option>
            {typeOpts.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            className="control scene-filter"
            value={fSource}
            onChange={(e) => setFSource(e.target.value)}
          >
            <option value="">{t("scene.filter.source")}</option>
            {sourceOpts.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            className="btn-ghost scene-filter-clear"
            onClick={() => { setQ(""); setFType(""); setFSource(""); }}
            disabled={!q && !fType && !fSource}
          >
            {t("scene.filter.reset")}
          </button>
        </div>

        {err && <div className="error-box">{err}</div>}

        {loading ? (
          <div className="scene-empty">{t("common.loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="scene-empty">{t("scene.filter.none")}</div>
        ) : (
          <>
            <div className="scene-table-wrap">
              <table className="scene-table">
                <thead>
                  <tr>
                    <th className="st-pick" />
                    <th>{t("scene.col.code")}</th>
                    <th className="st-thumb">{t("scene.col.preview")}</th>
                    <th>{t("scene.col.type")}</th>
                    <th>{t("scene.col.source")}</th>
                    <th>{t("scene.col.time")}</th>
                    <th className="st-act" />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((it) => (
                    <tr
                      key={it.id}
                      className={"scene-row" + (selectedId === it.id ? " on" : "")}
                      onClick={() => setSelectedId(it.id)}
                    >
                      <td className="st-pick">
                        <input
                          type="radio"
                          name="scene-pick"
                          checked={selectedId === it.id}
                          onChange={() => setSelectedId(it.id)}
                          aria-label={traceCode(it)}
                        />
                      </td>
                      <td className="st-code">{traceCode(it)}</td>
                      <td className="st-thumb">
                        <img src={it.url} alt={traceCode(it)} loading="lazy" />
                      </td>
                      <td>{it.trace_type || "—"}</td>
                      <td className="st-src">{it.collection_source || "—"}</td>
                      <td className="st-time">
                        {formatDateTime ? formatDateTime(it.captured_at) : it.captured_at}
                      </td>
                      <td className="st-act">
                        <button
                          className="scene-row-menu"
                          title={t("scene.row.actions")}
                          aria-label={t("scene.row.actions")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuId(menuId === it.id ? "" : it.id);
                          }}
                        >
                          ⋮
                        </button>
                        {menuId === it.id && (
                          <div className="scene-row-pop" onClick={(e) => e.stopPropagation()}>
                            <a href={it.url} target="_blank" rel="noreferrer">
                              {t("scene.detail.download")}
                            </a>
                            <button
                              className="scene-row-pop-del"
                              onClick={() => { setMenuId(""); setConfirmDel(it); }}
                              disabled={busy || it.demo}
                            >
                              {t("common.delete")}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="scene-pager">
              <button
                className="scene-pg"
                onClick={() => setPage(curPage - 1)}
                disabled={curPage <= 1}
                aria-label={t("scene.page.prev")}
              >
                ‹
              </button>
              {pageList(curPage, totalPages).map((p, i) =>
                p === "…" ? (
                  <span className="scene-pg-gap" key={`gap${i}`}>…</span>
                ) : (
                  <button
                    key={p}
                    className={"scene-pg" + (p === curPage ? " on" : "")}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                className="scene-pg"
                onClick={() => setPage(curPage + 1)}
                disabled={curPage >= totalPages}
                aria-label={t("scene.page.next")}
              >
                ›
              </button>
              <span className="scene-pg-size">{t("scene.page.size", { n: PAGE_SIZE })}</span>
            </div>
          </>
        )}
      </section>

      <SceneTraceDetail
        item={selected}
        busy={busy}
        onClose={() => setSelectedId("")}
        onSaveNote={saveNote}
        onOpenFull={(it) => setFullId(it.id)}
      />

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
    </div>
  );
}
