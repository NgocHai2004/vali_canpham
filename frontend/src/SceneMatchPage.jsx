import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";
import { useI18n } from "./i18n";
import SceneTraceFull from "./SceneTraceFull";
import { MATCH_ROWS, SUBJECTS } from "./sceneMatchDemo";
import { fmtSize } from "./SceneTracesPage";
import { SCORE_TOTAL } from "./sceneDemo";
import {
  IcAvatar, IcCaret, IcChevRight, IcChevUp, IcCheck, IcClose, IcExport, IcFilter,
  IcEye, IcPageNext, IcPagePrev, IcPencil, IcPlus,
  IcReanalyze, IcTick, IcTrash, IcUpload,
} from "./sceneMatchIcons";

// Man "Phan tich doi sanh" — dung theo design D:\Downloads\Phan tich doi sanh.
// Vu an / ma phien / danh sach dau vet = data THAT tu API.
// Ket qua doi sanh + ho so doi tuong = data gia (chua co engine trich minutiae).
const PAGE_SIZE = 10;   // design: "Hien thi 1 - 10 cua 20"

// Ten file: backend KHONG luu ten goc luc upload (_save_scene_image doi ten thanh
// "<timestamp>_<ObjectId>.png"), nen ten hien thi lay tu duoi url. Bo query/hash
// cho chac vi url co the co "?v=..". ponytail: doi sang field ten goc that neu
// backend luu them, cho do sua o day 1 cho.
const fileName = (u) => (u || "").split(/[?#]/)[0].split("/").pop() || "—";

// time trong data gia la "DD/MM/YYYY HH:MM" -> so sanh chuoi se sai (03/09 vs 12/08).
// Doi sang YYYYMMDDHHMM de sort. Bo ham nay khi backend tra ISO timestamp.
// Thang diem 0..22 nhu design: cung thang voi so diem minutiae o cot "Diem
// tuong dong" va o trang chi tiet (SCORE_TOTAL trong sceneDemo).
const SCORE_MIN = 0;
const SCORE_MAX = SCORE_TOTAL;
const SCORE_MID = SCORE_TOTAL / 2;
const clampScore = (v) =>
  Math.max(SCORE_MIN, Math.min(SCORE_MAX, Number(v) || SCORE_MIN));

// Thu tu 4 o "Sắp xếp theo" dung nhu design.
// Design: 3 kieu sap xep cho panel dau vet.
const TRACE_SORTS = [
  ["newest", "smp.tsort.newest"],
  ["oldest", "smp.tsort.oldest"],
  ["code", "smp.tsort.code"],
];

const SORT_OPTS = [
  ["newest", "smp.sort.newest"],
  ["oldest", "smp.sort.oldest"],
  ["score_desc", "smp.sort.score_desc"],
  ["score_asc", "smp.sort.score_asc"],
];

const traceCode = (it) =>
  `DVHT-${String(it.captured_at || "").slice(0, 4)}-${String(it.seq).padStart(4, "0")}`;

function timeKey(r) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/.exec(r.time || "");
  return m ? Number(m[3] + m[2] + m[1] + m[4] + m[5]) : 0;
}

export default function SceneMatchPage({ sessionId, onBack, onAddSubject }) {
  const { t, formatDateTime } = useI18n();
  const [session, setSession] = useState(null);
  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [advOpen, setAdvOpen] = useState(false);
  const [subjOpen, setSubjOpen] = useState(false);
  const [subjectSel, setSubjectSel] = useState(() => new Set());   // rong = tat ca
  const [fingerFilter, setFingerFilter] = useState("");
  const [minScore, setMinScore] = useState(SCORE_MIN);
  const [sortBy, setSortBy] = useState("score_desc");   // mac dinh "Điểm cao nhất"
  const [traceQ, setTraceQ] = useState("");
  const [traceSort, setTraceSort] = useState("newest");
  const [editTrace, setEditTrace] = useState(null);   // != null => mo modal sua
  const [delTrace, setDelTrace] = useState(null);     // != null => mo popup xac nhan xoa
  const [picked, setPicked] = useState(() => new Set());
  const [openSub, setOpenSub] = useState(SUBJECTS[0]?.id || "");
  const [uploading, setUploading] = useState(false);
  // Dong da bam trong bang KET QUA DOI SANH: giu ca id dau vet + row de trang
  // chi tiet hien dung so lieu cua dong do (truoc day tu dung lai theo seq => lech).
  const [full, setFull] = useState(null);   // != null => mo trang chi tiet dau vet

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
    const out = MATCH_ROWS.filter((r) => {
      if (subjectSel.size && !subjectSel.has(r.name)) return false;
      if (fingerFilter && r.finger !== fingerFilter) return false;
      if (r.score < minScore) return false;
      if (!kw) return true;
      return `${r.code} ${r.name}`.toLowerCase().includes(kw);
    });
    // filter() da tra array moi nen sort() tai cho khong dung vao MATCH_ROWS.
    const cmp = {
      newest:     (a, b) => timeKey(b) - timeKey(a),
      oldest:     (a, b) => timeKey(a) - timeKey(b),
      score_desc: (a, b) => b.score - a.score,
      score_asc:  (a, b) => a.score - b.score,
    }[sortBy];
    return cmp ? out.sort(cmp) : out;
  }, [q, subjectSel, fingerFilter, minScore, sortBy]);

  // Danh sach ngon tay lay tu chinh data -> khong can export thu tu tu sceneMatchDemo.
  const FINGER_OPTS = useMemo(
    () => [...new Set(MATCH_ROWS.map((r) => r.finger))], []);
  // Badge dem so dieu kien dang thu hep ket qua (sort chi doi thu tu -> khong dem).
  const filterCount = (fingerFilter ? 1 : 0) + (minScore > SCORE_MIN ? 1 : 0)
    + (subjectSel.size ? 1 : 0);
  const resetFilter = () => {
    setFingerFilter("");
    setMinScore(SCORE_MIN);
    setSortBy("newest");
    setSubjectSel(new Set());
  };
  const toggleSubj = (name) => setSubjectSel((prev) => {
    const n = new Set(prev);
    n.has(name) ? n.delete(name) : n.add(name);
    return n;
  });
  // Design: "Tất cả đối tượng" / "Đã chọn N đối tượng" — 1 nguoi thi hien ten.
  const subjLabel = subjectSel.size === 0
    ? t("smp.all_subjects")
    : subjectSel.size === 1
      ? [...subjectSel][0]
      : t("smp.subj.n_picked", { n: subjectSel.size });

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [q, subjectSel, fingerFilter, minScore, sortBy]);

  // ----- Dau vet hien truong (that) -----
  const shownTraces = useMemo(() => {
    const kw = traceQ.trim().toLowerCase();
    const out = kw
      ? traces.filter((x) =>
          `${traceCode(x)} ${x.seq} ${x.collection_source || ""}`.toLowerCase().includes(kw))
      : traces.slice();
    const cmp = {
      newest: (a, b) => String(b.captured_at || "").localeCompare(String(a.captured_at || "")),
      oldest: (a, b) => String(a.captured_at || "").localeCompare(String(b.captured_at || "")),
      code: (a, b) => (a.seq || 0) - (b.seq || 0),
    }[traceSort];
    return cmp ? out.sort(cmp) : out;
  }, [traces, traceQ, traceSort]);

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
    setDelTrace(null);
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

  const saveTrace = async (it, patch) => {
    setErr("");
    try {
      await api.updateSceneTrace(it.id, patch);
      setTraces((prev) => prev.map((x) => (x.id === it.id ? { ...x, ...patch } : x)));
      setEditTrace(null);
    } catch (ex) {
      setErr(ex.message || t("scene.err.save_note"));
    }
  };


  const from = rows.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, rows.length);

  // Ket qua doi sanh la data gia nen chua co FK sang dau vet that -> gan theo
  // thu tu (index tuyet doi trong rows) cho anh va link chi tiet luon khop nhau.
  // Bo ham nay khi backend tra trace_id trong ket qua doi sanh.
  const traceFor = (absIdx) => (traces.length ? traces[absIdx % traces.length] : null);

  const fullItem = full ? traces.find((x) => x.id === full.id) : null;
  if (fullItem) {
    return (
      <SceneTraceFull item={fullItem} row={full.row} session={session} onBack={() => setFull(null)} />
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
              {/* Trang thai vu an, KHONG phai trang thai phan tich: truoc day hardcode
                  "Dang phan tich" nen vu da dong o list cung hien xanh. Dung dung key +
                  class nhu SceneCasePicker de 2 cho khong lech nhau. */}
              <span className={"smp-chip " + (session?.status === "open" ? "smp-chip-green" : "scp-chip-grey")}>
                {t(session?.status === "open" ? "session.status.open_dot" : "session.status.closed_dot")}
              </span>
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
            <PopMenu
              label={t("smp.all_subjects")}
              btnClassName="smp-trg smp-trg-subj"
              popClassName="smp-pop-subj"
              width={260}
              closeOnClick={false}
              onState={setSubjOpen}
              trigger={<>
                <span>{subjLabel}</span>
                <IcCaret s={15} open={subjOpen} />
              </>}
            >
              {/* Design: chon nhieu doi tuong; "Tất cả" = bo hết lựa chọn. */}
              <button
                type="button"
                className={"smp-opt" + (subjectSel.size === 0 ? " on" : "")}
                onClick={() => setSubjectSel(new Set())}
              >
                {t("smp.all_subjects")}
                {subjectSel.size === 0 && <IcTick />}
              </button>
              {SUBJECTS.map((sub) => (
                <button
                  type="button"
                  key={sub.id}
                  className={"smp-opt" + (subjectSel.has(sub.name) ? " on" : "")}
                  onClick={() => toggleSubj(sub.name)}
                >
                  {sub.name}
                  {subjectSel.has(sub.name) && <IcTick />}
                </button>
              ))}
            </PopMenu>
            <PopMenu
              label={t("smp.filter")}
              btnClassName="smp-trg smp-trg-filter"
              popClassName="smp-adv"
              width={420}
              closeOnClick={false}
              onState={setAdvOpen}
              trigger={<>
                <IcFilter />
                {t("smp.filter")}
                {filterCount > 0 && <span className="smp-trg-badge">{filterCount}</span>}
                <IcCaret open={advOpen} />
              </>}
              render={(close) => (
                <>
                  <div className="smp-adv-head">
                    <span className="smp-adv-title">{t("smp.filter.adv")}</span>
                    <button
                      type="button"
                      className="smp-adv-x"
                      aria-label={t("common.close")}
                      onClick={close}
                    ><IcClose /></button>
                  </div>

                  <div className="smp-adv-grid">
                    <div className="smp-adv-wide">
                      <div className="smp-adv-lb">{t("smp.sort")}</div>
                      <div className="smp-seg">
                        {SORT_OPTS.map(([key, k]) => (
                          <button
                            type="button"
                            key={key}
                            className={sortBy === key ? "on" : ""}
                            onClick={() => setSortBy(key)}
                          >{t(k)}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="smp-adv-lb">{t("smp.filter.finger")}</div>
                      <select
                        className="smp-adv-sel"
                        value={fingerFilter}
                        onChange={(e) => setFingerFilter(e.target.value)}
                      >
                        <option value="">{t("smp.filter.all_fingers")}</option>
                        {FINGER_OPTS.map((f) => <option key={f} value={f}>{t(f)}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="smp-adv-scorehd">
                      <span>{t("smp.filter.min_score")}</span>
                      <span className="smp-adv-scoreval">
                        <input
                          className="smp-adv-num"
                          type="number"
                          min={SCORE_MIN}
                          max={SCORE_MAX}
                          value={minScore}
                          onChange={(e) => setMinScore(clampScore(e.target.value))}
                        />
                        <span className="smp-adv-max">/ {SCORE_MAX}</span>
                      </span>
                    </div>
                    <input
                      className="smp-adv-range"
                      type="range"
                      min={SCORE_MIN}
                      max={SCORE_MAX}
                      value={minScore}
                      onChange={(e) => setMinScore(clampScore(e.target.value))}
                      aria-label={t("smp.filter.min_score")}
                      // CSS khong doc duoc value cua input range -> gan % fill inline.
                      style={{ "--smp-fill": `${(minScore / SCORE_MAX) * 100}%` }}
                    />
                    <div className="smp-adv-ticks">
                      <span>{SCORE_MIN}</span><span>{SCORE_MID}</span><span>{SCORE_MAX}</span>
                    </div>
                  </div>

                  <div className="smp-adv-foot">
                    <button
                      type="button"
                      className="smp-adv-reset"
                      disabled={!filterCount && sortBy === "score_desc"}
                      onClick={resetFilter}
                    >{t("smp.filter.reset")}</button>
                    <button type="button" className="smp-adv-apply" onClick={close}>
                      {t("smp.filter.apply")}
                    </button>
                  </div>
                </>
              )}
            />
          </div>
        </div>

        {/* Design bo head+body trong 1 khung vien bo goc (kieu bang Excel). */}
        <div className="smp-mt-wrap">
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
            const open = it ? () => setFull({ id: it.id, row: r }) : undefined;
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
                <div className="smp-dim smp-ellip">{t(r.finger)}</div>
                <div>
                  <span className="smp-score">{r.score}/{SCORE_TOTAL}</span>{" "}
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
          picked={picked}
          toggle={toggle}
          traceCode={traceCode}
          formatDateTime={formatDateTime}
          onAddFiles={addTraces}
          uploading={uploading}
          onDelete={(items) => setDelTrace(items[0] || null)}
          onEdit={setEditTrace}
          sort={traceSort}
          setSort={setTraceSort}
        />
        <SubjectPanel
          t={t}
          subjects={SUBJECTS}
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

      {editTrace && (
        <TraceEditModal
          t={t}
          item={editTrace}
          code={traceCode(editTrace)}
          onClose={() => setEditTrace(null)}
          onSave={saveTrace}
        />
      )}

      {delTrace && (
        <div
          className="smp-modal-bd"
          onMouseDown={(e) => e.target === e.currentTarget && setDelTrace(null)}
        >
          <div className="smp-modal smp-modal-sm" role="dialog" aria-modal="true">
            <div className="smp-modal-head">
              <span className="smp-modal-title">{t("scene.del.title")}</span>
              <button
                type="button"
                className="smp-adv-x"
                aria-label={t("common.close")}
                onClick={() => setDelTrace(null)}
              ><IcClose s={17} /></button>
            </div>
            <div className="smp-modal-msg">
              {t("scene.del.body", { n: traceCode(delTrace) })}
            </div>
            <div className="smp-modal-foot">
              <button type="button" className="smp-modal-cancel" onClick={() => setDelTrace(null)}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="smp-modal-del"
                disabled={uploading}
                onClick={() => delTraces([delTrace])}
              >{t("common.delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PopMenu({
  label, trigger, children, render, onState,
  popClassName = "", width = 176, closeOnClick = true, btnClassName = "smp-menu-btn",
}) {
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const popId = useId();          // label la chuoi i18n dung chung -> id phai tu useId
  const [open, setOpen] = useState(false);

  // Menu nam trong .smp-tr-card-img (height 64px, overflow hidden) va .smp-tr-list
  // (overflow-y auto) -> position:absolute bi cat mat. Dung popover native: browser
  // dua element len top layer, khong ancestor overflow nao cat duoc.
  // Toa do phai tu tinh (CSS anchor positioning chua co tren Chromium cua Electron 33).
  const place = (h) => {
    const b = btnRef.current?.getBoundingClientRect();
    const pop = popRef.current;
    if (!b || !pop) return;
    const W = width, M = 8;                  // khop min-width 168 + padding trong CSS
    const left = Math.max(M, Math.min(b.right - W + 2, window.innerWidth - W - M));
    const below = b.bottom + 6;
    // Het cho ben duoi (the o hang cuoi) -> mo len tren.
    const top = below + h > window.innerHeight - M
      ? Math.max(M, b.top - 6 - h)
      : below;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  };

  return (
    <div className="smp-menu" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        className={btnClassName + (open ? " on" : "")}
        aria-label={label}
        title={label}
        popoverTarget={popId}
      >{trigger}</button>
      <div
        ref={popRef}
        id={popId}
        popover="auto"
        className={`smp-menu-pop ${popClassName}`}
        // ponytail: uoc luong chieu cao (44px/item) de dat cho dung ngay lan dau —
        // luc beforetoggle popover con display:none nen do that ra 0. onToggle do
        // lai chinh xac, chi lech neu uoc luong sai (item xuong 2 dong).
        onBeforeToggle={(e) => {
          if (e.newState === "open") place(44 * (popRef.current?.children.length || 2) + 14);
        }}
        onToggle={(e) => {
          if (e.newState === "open") place(popRef.current.offsetHeight);
          setOpen(e.newState === "open");
          onState && onState(e.newState === "open");
        }}
        onClick={closeOnClick ? () => popRef.current?.hidePopover() : undefined}
      >
        {render ? render(() => popRef.current?.hidePopover()) : children}
      </div>
    </div>
  );
}

/* ---------- Panel: DẤU VẾT HIỆN TRƯỜNG (data thật) ---------- */
function SceneTracePanel({
  t, traces, total, q, setQ, picked, toggle, traceCode, formatDateTime,
  onAddFiles, uploading, onDelete, onEdit, sort, setSort,
}) {
  const [dragOver, setDragOver] = useState(false);
  const [zoom, setZoom] = useState(null);
  // Design: 3 nut Xem / Chinh sua / Xoa ngay tren the, thay cho menu "...".
  const actions = (it, grid) => (
    <div className={"smp-act" + (grid ? " smp-act-grid" : "")} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="smp-act-view"
        title={t("common.view")}
        aria-label={t("common.view")}
        onClick={() => setZoom(it)}
      ><IcEye s={grid ? 12 : 13} /></button>
      <button
        type="button"
        className="smp-act-edit"
        title={t("smp.tr.edit")}
        aria-label={t("smp.tr.edit")}
        onClick={() => onEdit(it)}
      ><IcPencil s={grid ? 12 : 13} /></button>
      <button
        type="button"
        className="smp-act-del"
        title={t("common.delete")}
        aria-label={t("common.delete")}
        disabled={uploading}
        onClick={() => onDelete([it])}
      ><IcTrash s={grid ? 12 : 13} /></button>
    </div>
  );
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

      <div className="smp-tr-tools">
        <input
          className="smp-search smp-tr-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("smp.trace.search_ph")}
        />
        <div className="smp-panel-tools">
        <PopMenu
          label={t("smp.filter")}
          btnClassName="smp-trg smp-trg-tsort"
          popClassName="smp-pop-tsort"
          width={200}
          closeOnClick={false}
          trigger={<>
            <IcFilter s={14} />
            {t("smp.filter")}
          </>}
        >
          <div className="smp-pop-cap">{t("smp.sort")}</div>
          {TRACE_SORTS.map(([key, k]) => (
            <button
              type="button"
              key={key}
              className={"smp-opt" + (sort === key ? " on" : "")}
              onClick={() => setSort(key)}
            >
              {t(k)}
              {sort === key && <IcTick />}
            </button>
          ))}
        </PopMenu>
        </div>
      </div>

      {traces.length === 0 ? (
        <div className="scene-empty">{t("smp.trace.empty")}</div>
      ) : (
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
                <div className="smp-dim smp-ellip">{fileName(it.url)}</div>
              </div>
              <div className="smp-dim smp-ellip smp-tr-src">{it.collection_source || "—"}</div>
              <div className="smp-dim smp-tr-time">{formatDateTime(it.captured_at)}</div>
              <div className="smp-dim smp-tr-size">{fmtSize(it.size)}</div>
              {actions(it, false)}
              <div className="smp-check">{picked.has(it.id) && <span className="smp-tick-dot"><IcCheck /></span>}</div>
            </div>
          ))}
        </div>
      )}

      {/* Xem anh chi tiet: dung lai .scene-zoom-backdrop cua styles.css.
          Portal ra body: .smp-panel-trace co transform (hover lift -2px) nen no
          la containing block cua position:fixed => overlay chi phu panel
          (709x457) thay vi ca man hinh. */}
      {zoom && createPortal(
        <div className="scene-zoom-backdrop" onMouseDown={() => setZoom(null)}>
          <img src={zoom.url} alt={traceCode(zoom)} />
        </div>,
        document.body
      )}
    </section>
  );
}

/* ---------- Modal: CHỈNH SỬA DẤU VẾT ---------- */
/* Ma dau vet sinh tu seq (traceCode) nen khong sua duoc; 3 truong con lai
   (loai dau vet, vi tri thu thap, ghi chu) PATCH len backend. */
function TraceEditModal({ t, item, code, onClose, onSave }) {
  const [form, setForm] = useState({
    trace_type: item.trace_type || "",
    collection_source: item.collection_source || "",
    note: item.note || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setSaving(true);
    await onSave(item, form);
    setSaving(false);
  };
  return (
    <div
      className="smp-modal-bd"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="smp-modal" role="dialog" aria-modal="true" aria-label={t("smp.tr.edit_title")}>
        <div className="smp-modal-head">
          <span className="smp-modal-title">{t("smp.tr.edit_title")}</span>
          <button
            type="button"
            className="smp-adv-x"
            aria-label={t("common.close")}
            onClick={onClose}
          ><IcClose s={17} /></button>
        </div>
        <div className="smp-modal-body">
          <div>
            <div className="smp-modal-lb">{t("smp.tr.f_code")}</div>
            {/* Ma sinh tu so thu tu anh trong phien -> khong cho sua. */}
            <input className="smp-modal-in" value={code} readOnly disabled />
          </div>
          <div>
            <div className="smp-modal-lb">{t("scene.col.type")}</div>
            <input
              className="smp-modal-in"
              value={form.trace_type}
              onChange={set("trace_type")}
              maxLength={100}
              placeholder={t("smp.tr.f_type_ph")}
            />
          </div>
          <div>
            <div className="smp-modal-lb">{t("smp.tr.f_place")}</div>
            <input
              className="smp-modal-in"
              value={form.collection_source}
              onChange={set("collection_source")}
              maxLength={200}
              placeholder={t("smp.tr.f_place_ph")}
            />
          </div>
          <div>
            <div className="smp-modal-lb">{t("smp.tr.f_note")}</div>
            <textarea
              className="smp-modal-in"
              rows="3"
              maxLength={500}
              value={form.note}
              onChange={set("note")}
              placeholder={t("smp.tr.f_note_ph")}
            />
          </div>
        </div>
        <div className="smp-modal-foot">
          <button type="button" className="smp-modal-cancel" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="button" className="smp-modal-save" disabled={saving} onClick={save}>
            {saving ? t("common.saving") : t("smp.tr.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Panel: HỒ SƠ ĐỐI TƯỢNG (data giả) ---------- */
function SubjectPanel({
  t, subjects, openSub, setOpenSub, onAdd, addDisabledHint,
}) {
  const total = subjects.length;
  const photos = subjects.reduce((n, s) => n + s.photoCount, 0);

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
        {subjects.map((s) => {
          const open = s.id === openSub;
          return open ? (
            <div className="smp-sub-open" key={s.id}>
              <div className="smp-sub-photo">
                {s.photo ? <img src={s.photo} alt={s.name} loading="lazy" /> : <IcAvatar />}
              </div>
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
                {/* Design xep Tay phai truoc Tay trai. */}
                {[["right", t("smp.sub.right")], ["left", t("smp.sub.left")]].map(([key, label]) => (
                  <div key={key}>
                    <div className="smp-hand-title">{label}</div>
                    <div className="smp-fingers">
                      {/* Tay trai: ut -> cai; tay phai: cai -> ut. Doc lien 2 ban la
                          thu tu ngon chay deu tu trai qua phai nhu 2 ban tay up xuong. */}
                      {(key === "left" ? [...s[key]].reverse() : s[key]).map((f) => (
                        <img
                          className="smp-finger"
                          key={f.label}
                          src={f.url}
                          alt={t(f.label)}
                          title={t(f.label)}
                          loading="lazy"
                        />
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
                <div className="smp-sub-avatar">
                  {s.photo ? <img src={s.photo} alt={s.name} loading="lazy" /> : <IcAvatar />}
                </div>
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
