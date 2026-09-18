import React, { useState, useEffect, useRef } from "react";
import api, { fpApi } from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icons";
import DetailModal from "../components/DetailModal";
import { PageHeader, StateBox } from "../components/CommonUI";

function SearchPage() {
  const { t, formatDate } = useI18n();
  const [mode, setMode] = useState("text"); // "text" | "cccd" | "fingerprint"
  const [items, setItems] = useState([]);
  const [cells, setCells] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [cccdNumber, setCccdNumber] = useState("");
  const [fpImageB64, setFpImageB64] = useState("");
  const [fpTemplateB64, setFpTemplateB64] = useState("");
  const [fpScanStatus, setFpScanStatus] = useState("");
  const [fpScanning, setFpScanning] = useState(false);
  const [fpMatchScore, setFpMatchScore] = useState(null);
  const [cellCode, setCellCode] = useState("");
  const [gender, setGender] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(null);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 12;

  useEffect(() => {
    api.listCells().then(setCells).catch(() => { });
  }, []);

  const resetResults = () => {
    setItems([]);
    setTotal(0);
    setSearched(false);
    setError("");
    setFpMatchScore(null);
    setPage(1);
  };

  const switchMode = (m) => {
    setMode(m);
    resetResults();
    setFpImageB64("");
    setFpTemplateB64("");
    setFpScanStatus("");
  };

  const doSearchText = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (q.trim()) params.set("q", q.trim());
      if (cellCode) params.set("cell_code", cellCode);
      if (gender) params.set("gender", gender);
      const res = await api.request(`/api/detainees?${params}`);
      setItems(res.items || []);
      setTotal(res.total || 0);
      setSearched(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const doSearchCccd = async (e) => {
    if (e) e.preventDefault();
    const num = cccdNumber.trim();
    if (!num) {
      setError(t("search.err.empty_cccd"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ q: num, limit: "50" });
      const res = await api.request(`/api/detainees?${params}`);
      // Ưu tiên match chính xác cccd_number trước, rồi partial
      const list = res.items || [];
      const exact = list.filter((it) => it.cccd_number === num);
      const filtered = exact.length ? exact : list;
      setItems(filtered);
      setTotal(filtered.length);
      setSearched(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const doFpScanAndMatch = async () => {
    if (fpScanning) return;
    setFpScanning(true);
    setError("");
    setFpScanStatus(t("search.status.check_fp"));
    setFpImageB64("");
    setFpTemplateB64("");
    setItems([]);
    setSearched(false);
    setFpMatchScore(null);

    let sid = null;
    try {
      const h = await fpApi.health();
      if (!h.ok) {
        throw new Error(h.error || t("search.status.check_fp"));
      }
      const startResp = await fpApi.startSession("__search_query__");
      sid = startResp.session_id;

      setFpScanStatus(t("search.status.place_any"));
      const capRes = await fpApi.capture(sid);
      const tmplB64 = capRes.finger?.template_b64;
      const imgB64 = capRes.finger?.image_b64;
      if (!tmplB64) throw new Error(t("search.err.no_template"));

      setFpImageB64(imgB64 || "");
      setFpTemplateB64(tmplB64);
      setFpScanStatus(t("search.status.matching"));

      // Cleanup session ngay sau khi có template
      try { await fpApi.cancel(sid); } catch { /* noop */ }
      sid = null;

      setLoading(true);
      const res = await api.matchFingerprintSingle(tmplB64);
      let list = [];
      if (Array.isArray(res.items)) list = res.items;
      else if (res.detainee) list = [res.detainee];
      else if (Array.isArray(res)) list = res;
      setItems(list);
      setTotal(list.length);
      if (typeof res.score === "number") setFpMatchScore(res.score);
      setSearched(true);
      setFpScanStatus(list.length ? t("search.status.matched", { n: list.length }) : t("search.status.no_match"));
    } catch (err) {
      setError(err.message || t("search.err.match_fail"));
      setFpScanStatus("");
    } finally {
      if (sid) {
        try { await fpApi.cancel(sid); } catch { /* noop */ }
      }
      setFpScanning(false);
      setLoading(false);
    }
  };

  const clearFp = () => {
    setFpImageB64("");
    setFpTemplateB64("");
    setFpScanStatus("");
    setFpMatchScore(null);
    resetResults();
  };

  const subtitle = searched
    ? t("search.subtitle.results", { n: total, pct: fpMatchScore != null ? (fpMatchScore * 100).toFixed(1) : "-" })
    : t("search.subtitle.desc");

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const paged = items.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="page">
      <PageHeader title={t("search.title")} subtitle={subtitle} />

      <div className="search-tabs" role="tablist" aria-label={t("search.tab.aria")}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "text"}
          className={"search-tab " + (mode === "text" ? "active" : "")}
          onClick={() => switchMode("text")}
        >
          {t("search.tab.text")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "cccd"}
          className={"search-tab " + (mode === "cccd" ? "active" : "")}
          onClick={() => switchMode("cccd")}
        >
          {t("search.tab.cccd")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "fingerprint"}
          className={"search-tab " + (mode === "fingerprint" ? "active" : "")}
          onClick={() => switchMode("fingerprint")}
        >
          {t("search.tab.fp")}
        </button>
      </div>

      {mode === "text" && (
        <form className="filter-bar" onSubmit={doSearchText}>
          <input
            className="control search-control"
            placeholder={t("search.ph.text")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="control" value={cellCode} onChange={(e) => setCellCode(e.target.value)}>
            <option value="">{t("search.cell.all")}</option>
            {cells.map((cell) => (
              <option key={cell.code} value={cell.code}>
                {cell.code} - {cell.name}
              </option>
            ))}
          </select>
          <select className="control" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">{t("search.gender.all")}</option>
            <option value="male">{t("search.gender.male")}</option>
            <option value="female">{t("search.gender.female")}</option>
          </select>
          <button className="button primary" type="submit" disabled={loading}>
            {loading ? t("search.searching") : t("search.submit")}
          </button>
        </form>
      )}

      {mode === "cccd" && (
        <form className="filter-bar" onSubmit={doSearchCccd}>
          <input
            className="control search-control"
            placeholder={t("search.cccd_ph")}
            value={cccdNumber}
            onChange={(e) => setCccdNumber(e.target.value.replace(/\D/g, "").slice(0, 12))}
            inputMode="numeric"
            maxLength={12}
            autoFocus
          />
          <button className="button primary" type="submit" disabled={loading || cccdNumber.length < 6}>
            {loading ? t("search.searching") : t("search.by_cccd")}
          </button>
        </form>
      )}

      {mode === "fingerprint" && (
        <div className="filter-bar filter-bar-fp">
          <div className="fp-search-slot">
            {fpImageB64 ? (
              <div className="fp-search-preview">
                <img src={`data:image/png;base64,${fpImageB64}`} alt={t("search.fp.alt")} />
                <button
                  type="button"
                  className="fp-search-clear"
                  onClick={clearFp}
                  disabled={fpScanning}
                  aria-label={t("search.fp.aria_delete")}
                >×</button>
              </div>
            ) : (
              <div className="fp-search-drop fp-search-drop--live" role="status" aria-live="polite">
                <span className="fp-search-drop-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 11c0-4 3-7 7-7" />
                    <path d="M5 4c4 0 7 3 7 7v6a3 3 0 0 0 3 3" />
                    <path d="M8 11a4 4 0 0 1 8 0v5a2 2 0 0 0 2 2" />
                    <path d="M12 15v1a3 3 0 0 0 3 3" />
                  </svg>
                </span>
                <span>{fpScanStatus || t("search.fp.hint_click")}</span>
                <span className="fp-search-drop-hint">
                  {fpScanning ? t("search.fp.waiting") : t("search.fp.hint_place")}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="button primary"
            onClick={doFpScanAndMatch}
            disabled={fpScanning || loading}
          >
            {fpScanning ? t("search.scanning") : (fpTemplateB64 ? t("search.rescan") : t("search.start_scan"))}
          </button>
        </div>
      )}

      {error && <StateBox type="error">{error}</StateBox>}

      <div className="table-card detainees-table-wrap">
        {!searched ? (
          <StateBox>{t("search.hint_empty")}</StateBox>
        ) : loading ? (
          <StateBox>{t("common.loading")}</StateBox>
        ) : !items.length ? (
          <StateBox>{t("search.empty")}</StateBox>
        ) : (
          <table className="cells-table">
            <thead>
              <tr>
                <th style={{ width: "48px" }}>{t("search.col.photo")}</th>
                <th>{t("search.col.code")}</th>
                <th>{t("search.col.name")}</th>
                <th>{t("search.col.gender")}</th>
                <th>{t("search.col.dob")}</th>
                <th>{t("search.col.cccd")}</th>
                <th>{t("search.col.cell")}</th>
                <th style={{ textAlign: "right" }}>{t("search.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="table-avatar">
                      {item.photo_url ? <img src={item.photo_url} alt="" /> : (item.full_name || "?").slice(0, 1).toUpperCase()}
                    </div>
                  </td>
                  <td><strong>{item.personal_id || item.code}</strong></td>
                  <td>{item.full_name}</td>
                  <td>{item.gender === "female" ? t("common.female") : t("common.male")}</td>
                  <td>{item.dob ? formatDate(item.dob) : "-"}</td>
                  <td>{item.cccd_number || "-"}</td>
                  <td>{item.cell_code || "-"}</td>
                  <td style={{ textAlign: "right" }}>
                    <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                      <button onClick={() => setViewing(item)}>{t("common.view")}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {searched && !loading && items.length > 0 && (
          <div className="session-list-toolbar" style={{ marginTop: "auto" }}>
            <div className="session-list-total">
              {t("common.total", { n: items.length })}
            </div>
            <div className="pagination">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("common.prev")}
              </button>
              <span>
                {t("common.page_of", { page, total: totalPages })}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                {t("common.next")}
              </button>
            </div>
          </div>
        )}
      </div>

      {viewing && <DetailModal detainee={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}


export default SearchPage;
