import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n";
import SceneTraceFull from "./SceneTraceFull";
import { MATCH_ROWS, SUBJECTS } from "./sceneMatchDemo";
import {
  IcChevDown, IcChevRight, IcChevUp, IcCheck, IcDots, IcExport, IcFilter,
  IcGrid, IcInfo, IcList, IcPageNext, IcPagePrev, IcPerson, IcPlus,
  IcReanalyze, IcSearch, IcUpload,
} from "./sceneMatchIcons";

// Man "Phan tich doi sanh" — dung theo design D:\Downloads\Phan tich doi sanh.
// Vu an / ma phien / danh sach dau vet = data THAT tu API.
// Ket qua doi sanh + ho so doi tuong = data gia (chua co engine trich minutiae).
const PAGE_SIZE = 5;

export default function SceneMatchPage({ sessionId, onBack, onAddSubject }) {
  const { t, formatDateTime } = useI18n();
  const [session, setSession] = useState(null);
  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [traceQ, setTraceQ] = useState("");
  const [view, setView] = useState("grid");      // grid | list
  const [picked, setPicked] = useState(() => new Set());
  const [openSub, setOpenSub] = useState(SUBJECTS[0]?.id || "");
  const [uploading, setUploading] = useState(false);
  const [fullId, setFullId] = useState("");   // != "" => mo trang chi tiet dau vet

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await api.listSceneTraces(sessionId);
      setSession(r.session || null);
      setTraces(r.items || []);
    } catch (ex) {
      setErr(ex.message || t("scene.err.load"));
    } finally {
      setLoading(false);
    }
  }, [sessionId, t]);

  useEffect(() => { load(); }, [load]);

  // ----- Ket qua doi sanh (fake) -----
  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return MATCH_ROWS.filter((r) => {
      if (subjectFilter && r.name !== subjectFilter) return false;
      if (!kw) return true;
      return `${r.code} ${r.name}`.toLowerCase().includes(kw);
    });
  }, [q, subjectFilter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [q, subjectFilter]);

  // ----- Dau vet hien truong (that) -----
  const shownTraces = useMemo(() => {
    const kw = traceQ.trim().toLowerCase();
    if (!kw) return traces;
    return traces.filter((x) =>
      `${x.seq} ${x.collection_source || ""}`.toLowerCase().includes(kw));
  }, [traces, traceQ]);

  const toggle = (id) => setPicked((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  // Import anh hien truong: POST /api/scene/traces (endpoint da co), xong reload.
  const addTraces = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setUploading(true);
    setErr("");
    try {
      for (const f of list) {
        await api.createSceneTrace(f, { sessionId, source: "upload" });
      }
      await load();
    } catch (ex) {
      setErr(ex.message || t("scene.err.upload"));
    } finally {
      setUploading(false);
    }
  };

  // Xoa / sua ghi chu: dung lai api co san, confirm+prompt native nhu DataCapturePage.
  const delTraces = async (items) => {
    if (!items.length) return;
    const names = items.map((x) => `#${x.seq}`).join(", ");
    if (!window.confirm(t("scene.del.body", { n: names }))) return;
    setUploading(true);
    setErr("");
    try {
      for (const it of items) await api.deleteSceneTrace(it.id);
      setPicked(new Set());
      await load();
    } catch (ex) {
      setErr(ex.message || t("scene.err.delete"));
    } finally {
      setUploading(false);
    }
  };

  const editNote = async (it) => {
    const text = window.prompt(t("scene.detail.note"), it.note || "");
    if (text === null) return;
    setErr("");
    try {
      await api.updateSceneTrace(it.id, text);
      setTraces((prev) => prev.map((x) => (x.id === it.id ? { ...x, note: text.trim() } : x)));
    } catch (ex) {
      setErr(ex.message || t("scene.err.save_note"));
    }
  };

  const traceCode = (it) =>
    `DVHT-${String(it.captured_at || "").slice(0, 4)}-${String(it.seq).padStart(4, "0")}`;

  const from = rows.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, rows.length);

  // Ket qua doi sanh la data gia nen chua co FK sang dau vet that -> gan theo
  // thu tu (index tuyet doi trong rows) cho anh va link chi tiet luon khop nhau.
  // Bo ham nay khi backend tra trace_id trong ket qua doi sanh.
  const traceFor = (absIdx) => (traces.length ? traces[absIdx % traces.length] : null);

  const fullItem = fullId ? traces.find((x) => x.id === fullId) : null;
  if (fullItem) {
    return (
      <SceneTraceFull item={fullItem} session={session} onBack={() => setFullId("")} />
    );
  }

  return (
    <div className="smp">
      {/* ---------- Header vu an ---------- */}
      <div className="smp-top">
        <div className="smp-top-left">
          {onBack && (
            <button type="button" className="smp-btn-ghost smp-back" onClick={onBack}>
              {t("common.back")}
            </button>
          )}
          <div>
            <div className="smp-top-line">
              <div className="smp-case-code">
                {t("smp.case")}: {session?.code || "—"}
              </div>
              <span className="smp-chip smp-chip-green">{t("smp.analyzing")}</span>
            </div>
            <div className="smp-case-name">
              {session?.case_name || t("scene.no_case")}
            </div>
          </div>
        </div>
        <div className="smp-top-actions">
          <button type="button" className="smp-btn-ghost"><IcReanalyze />{t("smp.reanalyze")}</button>
          <button type="button" className="smp-btn-ghost"><IcExport />{t("smp.export")}</button>
        </div>
      </div>

      {err && <div className="lg-err" role="alert">{err}</div>}

      {/* ---------- KET QUA DOI SANH ---------- */}
      <section className="smp-panel smp-panel-match">
        <div className="smp-panel-head">
          <div className="smp-panel-title">
            <span className="smp-h">{t("smp.match.title")}</span>
            <span className="smp-badge">{rows.length}</span>
            <span className="smp-sub">{t("smp.match.pairs")}</span>
          </div>
          <div className="smp-panel-tools">
            <input
              className="smp-search smp-search-wide"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("smp.match.search_ph")}
            />
            <select
              className="smp-select"
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              <option value="">{t("smp.all_subjects")}</option>
              {SUBJECTS.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="smp-mt-head">
          <div>{t("smp.col.stt")}</div>
          <div>{t("smp.col.code")}</div>
          <div>{t("smp.col.img")}</div>
          <div>{t("smp.col.subject")}</div>
          <div>{t("smp.col.cccd")}</div>
          <div>{t("smp.col.finger")}</div>
          <div>{t("smp.col.score")}</div>
          <div>{t("smp.col.result")}</div>
          <div>{t("smp.col.time")}</div>
          <div />
        </div>

        <div className="smp-mt-body">
          {loading && <div className="scene-empty">{t("common.loading")}</div>}
          {!loading && pageRows.length === 0 && (
            <div className="scene-empty">{t("smp.match.empty")}</div>
          )}
          {!loading && pageRows.map((r, i) => {
            const it = traceFor((page - 1) * PAGE_SIZE + i);
            const open = it ? () => setFullId(it.id) : undefined;
            return (
              <div
                className={"smp-mt-row" + (it ? " go" : "")}
                key={r.code}
                role={it ? "button" : undefined}
                tabIndex={it ? 0 : undefined}
                aria-label={it ? t("smp.match.open", { code: r.code }) : undefined}
                onClick={open}
                onKeyDown={it ? (e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
                } : undefined}
              >
                <div className="smp-dim">{r.stt}</div>
                <div className="smp-strong">{r.code}</div>
                <div>
                  <img className="smp-thumb-sm" src={it?.url} alt={r.code} loading="lazy" />
                </div>
                <div className="smp-ellip">{r.name}</div>
                <div className="smp-dim">{r.cccd}</div>
                <div className="smp-dim smp-ellip">{r.finger}</div>
                <div>
                  <span className="smp-score">{r.score}</span>{" "}
                  <span className="smp-dim">{r.pct}</span>
                </div>
                <div>
                  <span className="smp-chip smp-chip-green">{t("smp.matched")}</span>
                </div>
                <div className="smp-dim">{r.time}</div>
                <div className="smp-mt-go" aria-hidden="true"><IcChevRight /></div>
              </div>
            );
          })}
        </div>

        <div className="smp-pg">
          <div />
          <div className="smp-pg-mid">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label={t("common.prev")}
            ><IcPagePrev /></button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                type="button"
                key={p}
                className={p === page ? "on" : ""}
                onClick={() => setPage(p)}
              >{p}</button>
            ))}
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label={t("common.next")}
            ><IcPageNext /></button>
          </div>
          <div className="smp-pg-right">
            <span className="smp-dim">{t("smp.per_page", { n: PAGE_SIZE })}</span>
            <span className="smp-dim">
              {t("smp.showing", { from, to, total: rows.length })}
            </span>
          </div>
        </div>
      </section>

      {/* ---------- 2 panel duoi: dau vet + ho so doi tuong ---------- */}
      <div className="smp-bottom">
        <SceneTracePanel
          t={t}
          traces={shownTraces}
          total={traces.length}
          q={traceQ}
          setQ={setTraceQ}
          view={view}
          setView={setView}
          picked={picked}
          toggle={toggle}
          traceCode={traceCode}
          formatDateTime={formatDateTime}
          onAddFiles={addTraces}
          uploading={uploading}
          onDelete={delTraces}
          onEditNote={editNote}
          onReload={load}
        />
        <SubjectPanel
          t={t}
          openSub={openSub}
          setOpenSub={setOpenSub}
          // ponytail: chi chan theo status (co trong payload san). Backend con chan
          // officer != user va role admin -> se bao 403 luc luu. Them officer vao
          // GET /api/scene/traces neu can chan som ngay tren nut.
          onAdd={onAddSubject && session?.status === "open"
            ? () => onAddSubject(session.id)
            : null}
          addDisabledHint={session && session.status !== "open"
            ? t("smp.sub.add_closed")
            : ""}
        />
      </div>
    </div>
  );
}

/* ---------- Menu ⋮ ----------
   Dung <details> native: tu toggle, khong can state + outside-click handler.
   ponytail: bam ra ngoai khong tu dong dong menu. Them handler document
   mousedown neu thay vuong. */
function DotsMenu({ label, children }) {
  return (
    <details
      className="smp-menu"
      onClick={(e) => e.stopPropagation()}   // trong the row/card co onClick toggle chon anh
    >
      <summary aria-label={label} title={label}><IcDots /></summary>
      <div className="smp-menu-pop">{children}</div>
    </details>
  );
}

/* ---------- Panel: DẤU VẾT HIỆN TRƯỜNG (data thật) ---------- */
function SceneTracePanel({
  t, traces, total, q, setQ, view, setView, picked, toggle, traceCode, formatDateTime,
  onAddFiles, uploading, onDelete, onEditNote, onReload,
}) {
  const pickedItems = traces.filter((x) => picked.has(x.id));
  // Menu tren tung anh: viec chi lien quan den anh do.
  const rowMenu = (it) => (
    <DotsMenu label={t("scene.row.actions")}>
      <button type="button" onClick={() => onEditNote(it)}>{t("scene.note_add")}</button>
      <a href={it.url} download target="_blank" rel="noreferrer">{t("scene.detail.download")}</a>
      <button
        type="button"
        className="smp-menu-del"
        disabled={uploading}
        onClick={() => onDelete([it])}
      >{t("common.delete")}</button>
    </DotsMenu>
  );
  const [dragOver, setDragOver] = useState(false);
  const pick = (e) => {
    onAddFiles(e.target.files);
    e.target.value = "";     // chon lai cung file van chay onChange
  };
  // Kéo thả: phải chặn dragover, không thì browser mở ảnh thay vì gọi onDrop.
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    onAddFiles(e.dataTransfer.files);
  };
  return (
    <section className="smp-panel smp-panel-trace">
      <div className="smp-panel-head">
        <div className="smp-panel-title">
          <span className="smp-h">{t("smp.trace.title")}</span>
          <span className="smp-badge">{t("smp.trace.count", { n: total })}</span>
        </div>
        <div className="smp-panel-tools">
          <label className="smp-btn-primary">
            <IcUpload />
            {uploading ? t("scene.uploading") : t("smp.trace.import")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              disabled={uploading}
              onChange={pick}
            />
          </label>
          <DotsMenu label={t("scene.row.actions")}>
            <button type="button" onClick={onReload} disabled={uploading}>
              {t("scene.btn.refresh")}
            </button>
            <button
              type="button"
              className="smp-menu-del"
              disabled={uploading || !pickedItems.length}
              onClick={() => onDelete(pickedItems)}
            >
              {t("common.delete")}{pickedItems.length ? ` (${pickedItems.length})` : ""}
            </button>
          </DotsMenu>
        </div>
      </div>

      <label
        className={"smp-drop" + (dragOver ? " on" : "")}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="smp-drop-ic"><IcUpload /></div>
        <div className="smp-drop-main">{t("smp.trace.drop")}</div>
        <div className="smp-drop-sub">{t("smp.trace.drop_hint")}</div>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          disabled={uploading}
          onChange={pick}
        />
      </label>

      <div className="smp-panel-tools smp-panel-tools-row">
        <input
          className="smp-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("smp.trace.search_ph")}
        />
        <div className="smp-viewtoggle">
          <button
            type="button"
            className={view === "grid" ? "on" : ""}
            onClick={() => setView("grid")}
            aria-label={t("smp.view.grid")}
          ><IcGrid /></button>
          <button
            type="button"
            className={view === "list" ? "on" : ""}
            onClick={() => setView("list")}
            aria-label={t("smp.view.list")}
          ><IcList /></button>
        </div>
      </div>

      {traces.length === 0 ? (
        <div className="scene-empty">{t("smp.trace.empty")}</div>
      ) : view === "list" ? (
        <div className="smp-tr-list">
          {traces.map((it) => (
            <div
              key={it.id}
              className={"smp-tr-row" + (picked.has(it.id) ? " on" : "")}
              onClick={() => toggle(it.id)}
            >
              <img className="smp-thumb-md" src={it.url} alt={traceCode(it)} loading="lazy" />
              <div className="smp-tr-meta">
                <div className="smp-strong">{traceCode(it)}</div>
                <div className="smp-dim smp-ellip">{it.collection_source || "—"}</div>
              </div>
              <div className="smp-dim">{formatDateTime(it.captured_at)}</div>
              <div className="smp-dim">{t("smp.trace.pending")}</div>
              <div className="smp-check">{picked.has(it.id) && <span className="smp-tick-dot"><IcCheck /></span>}</div>
              {rowMenu(it)}
            </div>
          ))}
        </div>
      ) : (
        <div className="smp-tr-grid">
          {traces.map((it) => (
            <div
              key={it.id}
              className={"smp-tr-card" + (picked.has(it.id) ? " on" : "")}
              onClick={() => toggle(it.id)}
            >
              <div className="smp-tr-card-img">
                <img src={it.url} alt={traceCode(it)} loading="lazy" />
                {picked.has(it.id) && <span className="smp-tick-dot smp-tick-abs"><IcCheck /></span>}
                <div className="smp-menu-abs">{rowMenu(it)}</div>
              </div>
              <div className="smp-tr-card-body">
                <div className="smp-strong smp-ellip">{traceCode(it)}</div>
                <div className="smp-dim smp-ellip">{it.collection_source || "—"}</div>
                <div className="smp-dim smp-ellip">{formatDateTime(it.captured_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- Panel: HỒ SƠ ĐỐI TƯỢNG (data giả) ---------- */
function SubjectPanel({ t, openSub, setOpenSub, onAdd, addDisabledHint }) {
  const total = SUBJECTS.length;
  const photos = SUBJECTS.reduce((n, s) => n + s.photoCount, 0);

  return (
    <section className="smp-panel smp-panel-subject">
      <div className="smp-panel-head">
        <div className="smp-panel-title">
          <span className="smp-h">{t("smp.sub.title")}</span>
          <span className="smp-badge">
            {t("smp.sub.count", { n: String(total).padStart(2, "0") })} • {t("smp.sub.photos", { n: photos })}
          </span>
        </div>
        <div className="smp-panel-tools">
          <button
            type="button"
            className="smp-btn-primary"
            onClick={onAdd || undefined}
            disabled={!onAdd}
            title={addDisabledHint || undefined}
          ><IcPlus />{t("smp.sub.add")}</button>
        </div>
      </div>

      <div className="smp-sub-list">
        {SUBJECTS.map((s) => {
          const open = s.id === openSub;
          return open ? (
            <div className="smp-sub-open" key={s.id}>
              <div className="smp-sub-photo" aria-hidden="true" />
              <div className="smp-sub-info">
                <div className="smp-top-line">
                  <span className="smp-strong">{s.name}</span>
                  {s.primary && (
                    <span className="smp-chip smp-chip-blue">{t("smp.sub.primary")}</span>
                  )}
                </div>
                <div className="smp-sub-fields">
                  <div>CCCD: {s.cccd}</div>
                  <div>{t("smp.sub.dob")}: {s.dob}</div>
                  <div>{t("smp.sub.sex")}: {s.sex}</div>
                </div>
                <button type="button" className="btn-link">{t("smp.sub.detail")}</button>
              </div>
              <div className="smp-hands">
                {[["right", t("smp.sub.right")], ["left", t("smp.sub.left")]].map(([key, label]) => (
                  <div key={key}>
                    <div className="smp-hand-title">{label}</div>
                    <div className="smp-fingers">
                      {s[key].map((f) => (
                        <div key={f.label}>
                          <img className="smp-finger" src={f.url} alt={f.label} loading="lazy" />
                          <div className="smp-hand-label">{f.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="smp-sub-toggle"
                onClick={() => setOpenSub("")}
                aria-label={t("smp.sub.collapse")}
              ><IcChevUp /></button>
            </div>
          ) : (
            <div className="smp-sub-row" key={s.id} onClick={() => setOpenSub(s.id)}>
              <div className="smp-sub-row-left">
                <div className="smp-sub-avatar" aria-hidden="true" />
                <div>
                  <div className="smp-strong">{s.name}</div>
                  <div className="smp-dim">CCCD: {s.cccd}</div>
                </div>
              </div>
              <div className="smp-sub-row-right"><span className="smp-dim2">{t("smp.sub.photos", { n: s.photoCount })}</span><IcChevRight /></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
