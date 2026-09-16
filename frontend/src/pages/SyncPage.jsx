import React, { useState, useEffect } from "react";
import api from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icons";
import SyncDiffModal from "../SyncDiffModal";
import { PageHeader } from "../components/CommonUI";
import { notify } from "../notifications";

function SyncPage() {
  const { t, formatDateTime } = useI18n();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [syncingIds, setSyncingIds] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const r = await api.listSessions(params);
      setSessions(r.items || []);
    } catch (e) {
      setError(e.message);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);
  useEffect(() => { setPage(1); }, [statusFilter, q]);

  const filtered = sessions.filter((s) => {
    if (!q.trim()) return true;
    const kw = q.trim().toLowerCase();
    return (
      (s.code || "").toLowerCase().includes(kw) ||
      (s.officer || "").toLowerCase().includes(kw) ||
      (s.officer_full_name || "").toLowerCase().includes(kw) ||
      (s.location || "").toLowerCase().includes(kw)
    );
  });
  const totalRows = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const pagedRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const allChecked = filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtered.map((s) => s.id)));
  };

  const [syncErrors, setSyncErrors] = useState({});
  const [syncSuccess, setSyncSuccess] = useState({});
  const [diffState, setDiffState] = useState(null); // { session, loading, diff }

  const REMOTE = "/api/proxy"; // proxy qua backend để tránh CORS

  const uploadPhoto = async (url) => {
    if (!url) return "";
    try {
      const absUrl = url.startsWith("http") ? url : url;
      const imgRes = await fetch(absUrl);
      if (!imgRes.ok) return "";
      const blob = await imgRes.blob();
      const ext = blob.type.includes("png") ? "png" : "jpg";
      const form = new FormData();
      form.append("file", blob, `photo.${ext}`);
      const j = await api.request(`${REMOTE}/upload-image`, { method: "POST", body: form });
      return j.url || "";
    } catch { return ""; }
  };

  // Tải full detainee của 1 phiên
  const loadSessionDetainees = async (sessionId) => {
    const detail = await api.request(`/api/sessions/${sessionId}`);
    return Promise.all(
      (detail.detainees || []).map((d) => api.getDetainee(d.id).catch(() => d))
    );
  };

  const mapOneToPayload = async (d) => {
    const p = d.photos || {};
    const keys = ["cccd_front", "cccd_back", "portrait_front", "portrait_left", "portrait_right",
      "fp_l1", "fp_l2", "fp_l3", "fp_l4", "fp_l5",
      "fp_r1", "fp_r2", "fp_r3", "fp_r4", "fp_r5",
      "iris_left", "iris_right"];
    const source = {
      cccd_front: p.cccd_front,
      cccd_back: p.cccd_back,
      portrait_front: p.portrait_front || d.photo_url,
      portrait_left: p.portrait_left,
      portrait_right: p.portrait_right,
      fp_l1: p.fp_l1, fp_l2: p.fp_l2, fp_l3: p.fp_l3, fp_l4: p.fp_l4, fp_l5: p.fp_l5,
      fp_r1: p.fp_r1, fp_r2: p.fp_r2, fp_r3: p.fp_r3, fp_r4: p.fp_r4, fp_r5: p.fp_r5,
      iris_left: p.iris_left, iris_right: p.iris_right,
    };
    const uploaded = {};
    await Promise.all(keys.map(async (k) => {
      const url = await uploadPhoto(source[k]);
      uploaded[k] = url || null;
    }));
    return {
      personal_id: d.personal_id || d.code || null,
      full_name: d.full_name || null,
      dob: d.dob || null,
      gender: d.gender || null,
      cccd_number: d.cccd_number || null,
      cmnd_old: d.cmnd_old || null,
      nationality: d.nationality || null,
      ethnicity: d.ethnicity || null,
      religion: d.religion || null,
      hometown: d.hometown || null,
      address: d.address || null,
      issued_date: d.issued_date || null,
      expiry_date: d.expiry_date || null,
      issued_place: d.issued_place || null,
      distinguishing_features: d.distinguishing_features || null,
      mrz: d.mrz || null,
      height_cm: d.height_cm || null,
      weight_kg: d.weight_kg || null,
      // ---- Diện giam & vị trí ----
      cell_code: d.cell_code || null,
      custody_type: d.custody_type || null,
      facility_code: d.facility_code || null,
      sub_camp_code: d.sub_camp_code || null,
      charge: d.charge || null,
      date_in: d.date_in || null,
      note: d.note || null,
      created_by: d.created_by || null,
      photos: uploaded,
    };
  };

  // Bước 1: so sánh + mở modal xác nhận
  const prepareSync = async (session) => {
    setSyncErrors((prev) => { const n = { ...prev }; delete n[session.id]; return n; });
    setSyncSuccess((prev) => { const n = { ...prev }; delete n[session.id]; return n; });
    setDiffState({ session, loading: true, diff: null });
    try {
      const [localDetainees, remoteResp] = await Promise.all([
        loadSessionDetainees(session.id),
        api.request(`${REMOTE}/pham-nhan`),
      ]);
      const remoteList = Array.isArray(remoteResp?.data) ? remoteResp.data : [];
      const diff = buildSyncDiff(localDetainees, remoteList);
      setDiffState({ session, loading: false, diff });
    } catch (e) {
      setDiffState(null);
      setSyncErrors((prev) => ({ ...prev, [session.id]: e.message }));
    }
  };

  // Bước 2: sau khi user xác nhận trong modal -> đẩy thật
  const doSync = async (selectedTargets) => {
    const session = diffState?.session;
    const diff = diffState?.diff;
    if (!session || !selectedTargets.length) {
      setDiffState(null);
      return;
    }
    setDiffState(null);
    setSyncingIds((prev) => new Set(prev).add(session.id));
    const pickEntry = (x) => ({
      code: x.code || "",
      full_name: x.full_name || "",
      cccd_number: x.cccd_number || "",
    });
    const addSel = selectedTargets.filter((x) => (diff?.toAdd || []).some((a) => a.id === x.id));
    const updSel = selectedTargets.filter((x) => (diff?.toUpdate || []).some((u) => u.id === x.id));
    try {
      const mappedDetainees = await Promise.all(selectedTargets.map((t) => mapOneToPayload(t.local)));
      const payload = {
        total: mappedDetainees.length,
        items: [{
          id: session.code || session.id || null,
          officer: session.officer || null,
          officer_full_name: session.officer_full_name || null,
          location: session.location || null,
          opened_at: session.opened_at || null,
          closed_at: session.closed_at || null,
          detainees: mappedDetainees,
        }],
      };
      await api.request(`${REMOTE}/sync-detainee`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSyncSuccess((prev) => ({ ...prev, [session.id]: true }));
      notify.add();
      try {
        await api.logSessionSync(session.id, {
          added: addSel.length,
          updated: updSel.length,
          duplicated: (diff?.duplicates || []).length,
          failed: 0,
          added_items: addSel.map(pickEntry),
          updated_items: updSel.map(pickEntry),
          duplicate_items: (diff?.duplicates || []).map(pickEntry),
          failed_items: [],
        });
      } catch { /* log-only; không chặn UX */ }
    } catch (e) {
      setSyncErrors((prev) => ({ ...prev, [session.id]: e.message }));
      try {
        await api.logSessionSync(session.id, {
          added: 0,
          updated: 0,
          duplicated: (diff?.duplicates || []).length,
          failed: addSel.length + updSel.length,
          added_items: [],
          updated_items: [],
          duplicate_items: (diff?.duplicates || []).map(pickEntry),
          failed_items: [...addSel, ...updSel].map(pickEntry),
          error: e.message,
        });
      } catch { /* noop */ }
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(session.id);
        return next;
      });
    }
  };

  const syncSelected = async () => {
    const targets = filtered.filter((s) => selected.has(s.id));
    for (const s of targets) {
      // eslint-disable-next-line no-await-in-loop
      await prepareSync(s);
      // prepareSync opens a modal -> wait for the user to resolve it before continuing.
      // Since the modal is interactive, we stop the chain here; the user clicks each session.
      break;
    }
  };

  const fmtDT = (iso) => formatDateTime(iso);

  return (
    <div className="page">
      <PageHeader title={t("sync.title")} subtitle={t("sync.subtitle")} />

      <div className="sync-toolbar">
        <input
          className="control sync-search"
          placeholder={t("sync.search_ph")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{t("sync.status.all")}</option>
          <option value="open">{t("sync.status.open")}</option>
          <option value="closed">{t("sync.status.closed")}</option>
        </select>
        <button className="button" onClick={load} disabled={loading}>{loading ? t("sync.loading") : t("common.refresh")}</button>
        <div className="sync-toolbar-spacer" />
        <button
          className="button primary"
          disabled={selected.size === 0 || syncingIds.size > 0}
          onClick={syncSelected}
          title={selected.size === 0 ? t("sync.tip.select") : t("sync.tip.selected", { n: selected.size })}
        >
          {selected.size > 0 ? t("sync.action_count", { n: selected.size }) : t("sync.action")}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="sync-table-wrap">
        <table className="sync-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label={t("sync.select_all_aria")} />
              </th>
              <th>{t("sync.col.code")}</th>
              <th>{t("sync.col.status")}</th>
              <th>{t("sync.col.officer")}</th>
              <th>{t("sync.col.location")}</th>
              <th>{t("sync.col.opened")}</th>
              <th>{t("sync.col.closed")}</th>
              <th style={{ textAlign: "center" }}>{t("sync.col.count")}</th>
              <th style={{ width: 140 }}>{t("sync.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 && !loading && (
              <tr><td colSpan={9} className="sync-empty">{t("sync.empty")}</td></tr>
            )}
            {pagedRows.map((s) => {
              const busy = syncingIds.has(s.id);
              return (
                <tr key={s.id} className={selected.has(s.id) ? "row-selected" : ""}>
                  <td><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id)} /></td>
                  <td><strong>{s.code}</strong></td>
                  <td>
                    <span className={"sync-badge " + (s.status === "open" ? "open" : "closed")}>
                      {s.status === "open" ? t("sync.status.open") : t("sync.status.closed")}
                    </span>
                  </td>
                  <td>{s.officer_full_name || s.officer}</td>
                  <td>{s.location || "—"}</td>
                  <td>{fmtDT(s.opened_at)}</td>
                  <td>{fmtDT(s.closed_at)}</td>
                  <td style={{ textAlign: "center" }}>{s.detainee_count || 0}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <button className="button small" disabled={busy} onClick={() => prepareSync(s)}>
                        {busy ? t("sync.syncing") : t("sync.action")}
                      </button>
                      {syncErrors[s.id] && (
                        <span style={{ fontSize: 11, color: "#e53e3e" }}>{t("sync.err_prefix", { message: syncErrors[s.id] })}</span>
                      )}
                      {syncSuccess[s.id] && !syncErrors[s.id] && (
                        <span style={{ fontSize: 11, color: "#12af64" }}>{t("sync.success")}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="session-list-toolbar">
          <div className="session-list-total">{t("common.total", { n: totalRows })}</div>
          <div className="pagination">
            <button disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t("common.prev")}</button>
            <span>{t("common.page_of", { page, total: totalPages })}</span>
            <button disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{t("common.next")}</button>
          </div>
        </div>
      </div>

      {diffState && (
        <SyncDiffModal
          session={diffState.session}
          diff={diffState.diff}
          loading={diffState.loading}
          onConfirm={doSync}
          onCancel={() => setDiffState(null)}
        />
      )}
    </div>
  );
}


export default SyncPage;
