import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";
import { useI18n } from "./i18n";
import SceneTraceFull from "./SceneTraceFull";
import { fmtSize } from "./sceneTraceUtils";
import {
  IcAvatar, IcCaret, IcChevRight, IcChevUp, IcCheck, IcClose, IcExport, IcFilter,
  IcEye, IcPageNext, IcPagePrev, IcPencil, IcPlus,
  IcDots, IcReanalyze, IcTick, IcTrash, IcUpload,
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

// Thang diem cua ENGINE HBIE: 0..1000, cang cao cang giong. KHONG con thang 22
// diem minutiae cua design cu — do la so gia, engine that khong tra minutiae.
// Nguong ket luan (threshold) do backend quyet dinh (HBIE_MATCH_THRESHOLD) va
// tra ve trong /api/scene/matches -> config, nen o day chi la gia tri du phong
// khi chua nap duoc config.
const SCORE_MIN = 0;
const SCORE_MAX = 1000;
// Nhan (lo, hi) vi ca hai dau deu song: score_max va diem san (keep_score) doc
// tu config cua backend, admin doi duoc trong Cai dat.
const clampScore = (v, lo, hi) =>
  Math.max(lo, Math.min(hi, Number(v) || lo));

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

// Thu tu ngon trong panel HO SO DOI TUONG: cai -> ut cho tung ban tay. Ma ngon
// khop FP_KEY_BY_CODE o backend (photos.fp_l1..fp_r5) va key i18n fp.finger.*.
const HAND_CODES = {
  right: ["right_thumb", "right_index", "right_middle", "right_ring", "right_little"],
  left: ["left_thumb", "left_index", "left_middle", "left_ring", "left_little"],
};

const traceCode = (it) =>
  `DVHT-${String(it.captured_at || "").slice(0, 4)}-${String(it.seq).padStart(4, "0")}`;

export default function SceneMatchPage({ caseId, onBack, onAddSubject }) {
  const { t, formatDate, formatDateTime } = useI18n();
  const [caseDoc, setCaseDoc] = useState(null);
  const [traces, setTraces] = useState([]);
  const [detainees, setDetainees] = useState([]);
  const [matches, setMatches] = useState([]);
  // Cau hinh engine HBIE tu backend: nguong ket luan + thang diem. Lay tu API de
  // doi nguong trong .env la UI doi theo, khong phai sua code 2 noi.
  const [mcfg, setMcfg] = useState(null);
  // Thang diem THAT dang dung: uu tien config cua backend, chua nap duoc thi
  // dung hang du phong (HBIE luon 0..1000).
  const scoreMax = mcfg?.score_max || SCORE_MAX;
  // Diem san: cap nao duoi muc nay bi loai NGAY khi doi sach, khong duoc luu vao
  // scene_matches -> khong the co trong bang. Thanh loc vi the chi can keo trong
  // [scoreFloor, scoreMax]; keo xuong duoi do la vung chet (khong an bot duoc dong
  // nao ma van keo duoc). Chua nap duoc config thi dung 0 nhu cu: thanh loc rong
  // hon mot chut van hon la an mat ket qua.
  const scoreFloor = Number(mcfg?.keep_score) > 0 ? Number(mcfg.keep_score) : SCORE_MIN;
  // Vach giua va % fill deu tinh trong khoang THAT su keo duoc [scoreFloor,
  // scoreMax]. Lay scoreMax/2 nhu cu thi khi diem san > 500 ba vach lech thu tu
  // (700, 500, 1000); con fill tinh tu 0 thi o vi tri nghi da san 25% mau du
  // nguoi dung chua loc gi ca.
  const scoreSpan = Math.max(1, scoreMax - scoreFloor);
  const scoreMid = scoreFloor + Math.round(scoreSpan / 2);
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
  const [openSub, setOpenSub] = useState("");
  const [uploading, setUploading] = useState(false);
  const [spinning, setSpinning] = useState(false);   // 1 vong xoay icon moi lan bam "Phan tich lai"
  const [exporting, setExporting] = useState(false);  // icon truot xuong roi ve cho khi bam "Xuat bao cao"
  // Dong da bam trong bang KET QUA DOI SANH: giu ca id dau vet + row de trang
  // chi tiet hien dung so lieu cua dong do (truoc day tu dung lai theo seq => lech).
  const [full, setFull] = useState(null);   // != null => mo trang chi tiet dau vet

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      // 2 request song song: dau vet + chi tiet vu an (de lay danh sach doi tuong
      // that cua CHINH vu an nay cho panel HO SO DOI TUONG).
      const [r, cs, mt] = await Promise.all([
        api.listSceneTraces(caseId),
        api.getCase(caseId),
        // Ket qua doi sanh THAT do engine HBIE sinh ra khi up dau vet. Loi rieng
        // request nay khong duoc lam trang ca man -> catch tra ve rong.
        api.listSceneMatches({ caseId }).catch(() => ({ items: [], config: null })),
      ]);
      setCaseDoc(cs || r.case || null);
      setTraces(r.items || []);
      setDetainees(cs?.detainees || []);
      setMatches(mt.items || []);
      setMcfg(mt.config || null);
    } catch (ex) {
      setErr(ex.message || t("scene.err.load"));
    } finally {
      setLoading(false);
    }
  }, [caseId, t]);

  useEffect(() => { load(); }, [load]);

  // Config ve muon hon lan render dau, nen phai nhac minScore len theo diem san:
  // de 0 thi o nhap hien 0 trong khi thanh truot da bat dau o scoreFloor -> hai
  // dieu khien cua cung mot gia tri lech nhau. Chi nang len, khong bao gio ha
  // xuong, de khong de len lua chon cua nguoi dung khi ho da keo.
  useEffect(() => {
    setMinScore((v) => (v < scoreFloor ? scoreFloor : v));
  }, [scoreFloor]);

  // ----- Ket qua doi sanh (THAT, engine HBIE) -----
  // Moi ban ghi scene_matches = 1 cap (dau vet x ngon cua 1 doi tuong), do backend
  // sinh ra khi up dau vet len. Vu chua co dau vet => khong co cap nao => bang rong.
  //
  // CCCD khong nam trong scene_matches (tranh nhan ban du lieu ho so): join tu
  // detainees cua chinh vu an nay theo detainee_id.
  const cccdById = useMemo(
    () => Object.fromEntries(detainees.map((d) => [d.id, d.cccd_number || "—"])),
    [detainees],
  );

  const allRows = useMemo(() => matches.map((m) => ({
    id: m.id,
    traceId: m.trace_id,
    code: `DVHT-${String(m.created_at || "").slice(0, 4)}-${String(m.trace_seq || 0).padStart(4, "0")}`,
    url: m.trace_url || "",
    name: m.detainee_name || m.detainee_code || "—",
    cccd: cccdById[m.detainee_id] || "—",
    // finger la KEY i18n (t(r.finger) o cho render), khop fp.finger.*.long.
    finger: `fp.finger.${m.finger_code}.long`,
    fingerCode: m.finger_code,
    score: m.score,
    pct: `${m.percent}%`,
    verdict: m.verdict,
    time: m.created_at ? formatDateTime(m.created_at) : "—",
    latent_landmarks: m.latent_landmarks,
    latent_dim: m.latent_dim,
    candidate_url: m.candidate_url,
    candidate_landmarks: m.candidate_landmarks,
    candidate_dim: m.candidate_dim,
  })), [matches, cccdById, formatDateTime]);

  // Loc + sap xep. Backend da sort theo diem giam dan; day la loc phia client theo
  // lua chon cua can bo (ngon tay, diem toi thieu, doi tuong, tu khoa).
  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let out = allRows.filter((r) =>
      (!fingerFilter || r.finger === fingerFilter)
      && r.score >= minScore
      && (!subjectSel.size || subjectSel.has(r.name))
      && (!kw || `${r.code} ${r.name} ${r.cccd}`.toLowerCase().includes(kw)));
    const cmp = {
      score_desc: (a, b) => b.score - a.score,
      score_asc: (a, b) => a.score - b.score,
      newest: (a, b) => String(b.time).localeCompare(String(a.time)),
      oldest: (a, b) => String(a.time).localeCompare(String(b.time)),
    }[sortBy];
    if (cmp) out = out.slice().sort(cmp);
    // STT tinh SAU khi loc/sap xep de danh so lien tuc 1..N tren ket qua dang xem.
    return out.map((r, i) => ({ ...r, stt: String(i + 1).padStart(2, "0") }));
  }, [allRows, q, fingerFilter, minScore, subjectSel, sortBy]);

  // Loc theo ngon tay lay tu chinh ket qua -> chua co ket qua thi khong co lua chon.
  const FINGER_OPTS = useMemo(
    () => [...new Set(allRows.map((r) => r.finger))], [allRows]);
  // Badge dem so dieu kien dang thu hep ket qua (sort chi doi thu tu -> khong dem).
  const filterCount = (fingerFilter ? 1 : 0) + (minScore > scoreFloor ? 1 : 0)
    + (subjectSel.size ? 1 : 0);
  const resetFilter = () => {
    setFingerFilter("");
    setMinScore(scoreFloor);
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

  // ----- Ho so doi tuong (that, cua CHINH vu an nay) -----
  // GET /api/cases/{id} tra detainees[] kem fingerprints (ma ngon -> url anh van
  // lan) va portrait. Truoc day panel nay doc SUBJECTS trong sceneMatchDemo nen
  // vu an nao cung hien dung 9 nguoi + 90 anh.
  const subjects = useMemo(() => detainees.map((d, i) => {
    const fp = d.fingerprints || {};
    const hand = (side) => HAND_CODES[side].map((code) => ({
      label: `fp.finger.${code}.long`,
      url: fp[code] || "",
    }));
    return {
      id: d.id,
      name: d.full_name || d.code || "—",
      cccd: d.cccd_number || "—",
      dob: d.dob ? formatDate(d.dob) : "—",
      sex: t(d.gender === "female" ? "search.gender.female" : "search.gender.male"),
      // "Doi tuong chinh" = ho so lap dau tien trong vu (detainees da sort theo
      // created_at tang dan o backend). Chua co field danh dau rieng trong DB.
      primary: i === 0,
      photoCount: d.fp_count || 0,
      photo: d.portrait || "",
      right: hand("right"),
      left: hand("left"),
    };
  }), [detainees, formatDate, t]);

  const toggle = (id) => setPicked((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  // Chon tat ca = danh sach DANG HIEN (shownTraces, da loc + tim), khong phai
  // toan bo traces: nguoi dung thay gi thi chon dung cai do.
  const selectAllShown = () => setPicked(new Set(shownTraces.map((x) => x.id)));
  const clearSel = () => setPicked(new Set());

  // Import anh hien truong: POST /api/scene/traces (endpoint da co), xong reload.
  const addTraces = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setUploading(true);
    setErr("");
    try {
      for (const f of list) {
        await api.createSceneTrace(f, { caseId, source: "upload" });
      }
      await load();
      // Backend doi sanh o BACKGROUND ngay khi nhan anh (khong chan upload), nen
      // luc load() vua xong ket qua thuong chua kip ghi. Nap lai bang ket qua sau
      // vai giay de can bo khong phai bam "Phan tich lai".
      //
      // Vi sao 3 lan cach nhau 4s: HBIE extract + match ca vu mat vai giay den vai
      // chuc giay tuy so doi tuong; nap 1 lan la hay ra bang rong. Muon chac thi
      // co nut "Phan tich lai" chay dong bo.
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        await reloadMatches();
      }
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

  // Chi nap lai BANG KET QUA (khong nap lai ca dau vet + ho so) — dung sau khi
  // up anh xong de doi engine chay nen roi hien ket qua vao bang.
  const reloadMatches = useCallback(async () => {
    try {
      const mt = await api.listSceneMatches({ caseId });
      setMatches(mt.items || []);
      setMcfg(mt.config || null);
    } catch { /* loi nap ket qua khong duoc lam trang man */ }
  }, [caseId]);

  // "Phan tich lai": doi sanh lai TOAN BO dau vet cua vu an. Dung khi vu an vua
  // them doi tuong moi (dau vet cu chua tung so voi van tay cua nguoi do), hoac
  // luc up anh HBIE loi.
  //
  // Chay TUAN TU tung dau vet: moi lan goi la HBIE extract + match ca vu, ban song
  // song la doi service ngoai chiu tai vo ich.
  const reanalyze = async () => {
    if (!traces.length || spinning) return;
    setSpinning(true);
    setErr("");
    try {
      for (const it of traces) await api.rematchSceneTrace(it.id);
      await load();
    } catch (ex) {
      setErr(ex.message || t("smp.err.match"));
    } finally {
      setSpinning(false);
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

  const fullItem = full ? traces.find((x) => x.id === full.id) : null;
  if (fullItem) {
    return (
      <SceneTraceFull item={fullItem} row={full.row} caseDoc={caseDoc} onBack={() => setFull(null)} />
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
                {t("smp.case")}: {caseDoc?.code || "—"}
              </div>
              {/* Trang thai vu an, KHONG phai trang thai phan tich: truoc day hardcode
                  "Dang phan tich" nen vu da dong o list cung hien xanh. Dung dung key +
                  class nhu SceneCasePicker de 2 cho khong lech nhau. */}
              <span className={"smp-chip " + (caseDoc?.status === "investigating" ? "smp-chip-green" : "scp-chip-grey")}>
                {t(caseDoc?.status === "investigating" ? "case.status.investigating_dot" : "case.status.closed_dot")}
              </span>
            </div>
            <div className="smp-case-name">
              {caseDoc?.name || t("scene.no_case")}
            </div>
          </div>
        </div>
        <div className="smp-top-actions">
          <button
            type="button"
            className="smp-btn-ghost"
            onClick={reanalyze}
            disabled={spinning || !traces.length}
            title={traces.length ? undefined : t("scene.empty")}
          >
            {/* onAnimationEnd de tren span, KHONG tren button: button co animation
                btn-sweep tren ::after luc hover, event do bubble len button va se
                tat spin som. */}
            <span className={"smp-ic" + (spinning ? " smp-ic-spin" : "")} onAnimationEnd={() => setSpinning(false)}>
              <IcReanalyze />
            </span>
            {t("smp.reanalyze")}
          </button>
          <button type="button" className="smp-btn-ghost" onClick={() => setExporting(true)}>
            <span className={"smp-ic" + (exporting ? " smp-ic-out" : "")} onAnimationEnd={() => setExporting(false)}>
              <IcExport />
            </span>
            {t("smp.export")}
          </button>
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
              {subjects.map((sub) => (
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
                          min={scoreFloor}
                          max={scoreMax}
                          value={minScore}
                          onChange={(e) => setMinScore(clampScore(e.target.value, scoreFloor, scoreMax))}
                        />
                        <span className="smp-adv-max">/ {scoreMax}</span>
                      </span>
                    </div>
                    <input
                      className="smp-adv-range"
                      type="range"
                      min={scoreFloor}
                      max={scoreMax}
                      value={minScore}
                      onChange={(e) => setMinScore(clampScore(e.target.value, scoreFloor, scoreMax))}
                      aria-label={t("smp.filter.min_score")}
                      // CSS khong doc duoc value cua input range -> gan % fill inline.
                      style={{ "--smp-fill": `${Math.round(((minScore - scoreFloor) / scoreSpan) * 100)}%` }}
                    />
                    <div className="smp-adv-ticks">
                      <span>{scoreFloor}</span><span>{scoreMid}</span><span>{scoreMax}</span>
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
          {!loading && pageRows.map((r) => {
            // Dau vet CUA CHINH dong nay (theo trace_id backend tra ve), khong con
            // doan theo vi tri dong nhu truoc — 1 dau vet co nhieu dong ket qua nen
            // lay theo index la lech anh.
            const it = traces.find((x) => x.id === r.traceId);
            const open = it ? () => setFull({ id: it.id, row: r }) : undefined;
            return (
              <div
                className={"smp-mt-row" + (it ? " go" : "")}
                key={r.id}
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
                  <span className="smp-score">{r.score}/{scoreMax}</span>{" "}
                  <span className="smp-dim">{r.pct}</span>
                </div>
                <div>
                  {/* Ket luan do BACKEND quyet dinh (so voi HBIE_MATCH_THRESHOLD),
                      khong tinh lai o day de 2 noi khong lech nguong. */}
                  {r.verdict === "match" ? (
                    <span className="smp-chip smp-chip-green">{t("smp.matched")}</span>
                  ) : (
                    <span className="smp-chip">{t("smp.review")}</span>
                  )}
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
          onSelectAll={selectAllShown}
          onClearSel={clearSel}
        />
        <SubjectPanel
          t={t}
          subjects={subjects}
          openSub={openSub}
          setOpenSub={setOpenSub}
          // ponytail: chi chan theo status (co trong payload san). Backend con chan
          // officer != user va role admin -> se bao 403 luc luu. Them officer vao
          // GET /api/scene/traces neu can chan som ngay tren nut.
          onAdd={onAddSubject && caseDoc?.status === "investigating"
            ? () => onAddSubject(caseDoc.id)
            : null}
          addDisabledHint={caseDoc && caseDoc.status !== "investigating"
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
  onAddFiles, uploading, onDelete, onEdit, sort, setSort, onSelectAll, onClearSel,
}) {
  // "Chon tat ca" tinh tren danh sach DANG HIEN (da loc/tim), khong phai toan bo
  // traces — nguoi dung thay gi thi chon dung cai do.
  const allPicked = traces.length > 0 && traces.every((x) => picked.has(x.id));
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
        {/* Nut 3 cham: chon/bo chon tat ca. Dung lai PopMenu (popover native) nhu
            nut Bo loc ben canh, khong tu dung dropdown moi. */}
        <PopMenu
          label={t("smp.trace.bulk")}
          btnClassName="smp-trg smp-trg-bulk"
          popClassName="smp-pop-bulk"
          width={196}
          trigger={<IcDots />}
        >
          <button type="button" className="smp-opt" onClick={onSelectAll}>
            {t("smp.trace.select_all")}
            {allPicked && <IcTick />}
          </button>
          <button type="button" className="smp-opt" onClick={onClearSel}>
            {t("smp.trace.clear_sel")}
          </button>
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
