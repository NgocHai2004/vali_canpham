import React, { useState, useEffect } from "react";
import api from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icons";
import SyncDiffModal from "../SyncDiffModal";
import DashPageHeader from "../components/dashboard/DashPageHeader";
import DashFilterBar, { DashFilterSelect, DashFilterField } from "../components/dashboard/DashFilterBar";
import DashDataTable from "../components/dashboard/DashDataTable";
import { notify } from "../notifications";

function SyncPage() {
  const { t, formatDateTime } = useI18n();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [syncingIds, setSyncingIds] = useState(() => new Set());
  const [syncErrors, setSyncErrors] = useState({});
  const [syncSuccess, setSyncSuccess] = useState({});
  const [diffState, setDiffState] = useState(null);
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

  const prepareSync = async (session) => {
    setSyncErrors((prev) => ({ ...prev, [session.id]: null }));
    setSyncSuccess((prev) => ({ ...prev, [session.id]: false }));
    setSyncingIds((prev) => new Set(prev).add(session.id));
    try {
      const diff = await api.fetchSessionSyncDiff(session.id);
      setDiffState({ session, diff, loading: false });
    } catch (e) {
      setSyncErrors((prev) => ({ ...prev, [session.id]: e.message }));
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(session.id);
        return next;
      });
    }
  };

  const pickEntry = (it) => ({
    id: it?.id || it?._id || "",
    full_name: it?.full_name || "",
    cccd_number: it?.cccd_number || "",
    personal_id: it?.personal_id || "",
  });

  const doSync = async (addSel, updSel) => {
    if (!diffState) return;
    const { session, diff } = diffState;
    setDiffState((prev) => (prev ? { ...prev, loading: true } : null));
    try {
      const payload = {
        session_id: session.id,
        added_ids: addSel.map((x) => x.id),
        updated_ids: updSel.map((x) => x.id),
      };
      const token = api.getToken();
      await fetch("/api/sync/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
      } catch { /* log-only */ }
      setDiffState(null);
    } catch (e) {
      setSyncErrors((prev) => ({ ...prev, [session.id]: e.message }));
      setDiffState(null);
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
      await prepareSync(s);
      break;
    }
  };

  const fmtDT = (iso) => (iso ? formatDateTime(iso) : "—");

  const columns = [
    {
      key: "check",
      label: (
        <input
          type="checkbox"
          checked={allChecked}
          onChange={toggleAll}
          aria-label={t("sync.select_all_aria") || "Chọn tất cả"}
        />
      ),
      width: "5%",
      render: (s) => (
        <input
          type="checkbox"
          checked={selected.has(s.id)}
          onChange={() => toggleOne(s.id)}
        />
      ),
    },
    {
      key: "code",
      label: t("sync.col.code"),
      width: "15%",
      className: "dh-cell-mono",
      render: (s) => <strong>{s.code}</strong>,
    },
    {
      key: "status",
      label: t("sync.col.status"),
      width: "12%",
      render: (s) => (
        <span className={"sync-badge " + (s.status === "open" ? "open" : "closed")}>
          {s.status === "open" ? t("sync.status.open") : t("sync.status.closed")}
        </span>
      ),
    },
    {
      key: "officer",
      label: t("sync.col.officer"),
      width: "18%",
      render: (s) => s.officer_full_name || s.officer || "—",
    },
    {
      key: "location",
      label: t("sync.col.location"),
      width: "15%",
      render: (s) => s.location || "—",
    },
    {
      key: "opened",
      label: t("sync.col.opened"),
      width: "13%",
      render: (s) => fmtDT(s.opened_at),
    },
    {
      key: "count",
      label: t("sync.col.count"),
      width: "8%",
      className: "dh-cell-mono",
      render: (s) => s.detainee_count || 0,
    },
    {
      key: "action",
      label: t("sync.col.actions"),
      width: "14%",
      align: "center",
      render: (s) => {
        const busy = syncingIds.has(s.id);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center", justifyContent: "center" }}>
            <button
              className="dh-rowbtn"
              disabled={busy}
              onClick={() => prepareSync(s)}
            >
              {busy ? (t("sync.syncing") || "Đang xử lý...") : (t("sync.action") || "Đồng bộ")}
            </button>
            {syncErrors[s.id] && (
              <span style={{ fontSize: 11, color: "#ef4444", textAlign: "center" }}>
                {t("sync.err_prefix", { message: syncErrors[s.id] })}
              </span>
            )}
            {syncSuccess[s.id] && !syncErrors[s.id] && (
              <span style={{ fontSize: 11, color: "#22c55e", textAlign: "center" }}>
                {t("sync.success") || "Thành công"}
              </span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="page dh-page">
      <DashPageHeader
        title={t("sync.title") || "Đồng bộ dữ liệu"}
        subtitle={t("sync.subtitle") || "Đồng bộ hồ sơ giữa các phiên làm việc và máy chủ trung tâm"}
        action={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="button primary dh-filter__submit"
              disabled={selected.size === 0 || syncingIds.size > 0}
              onClick={syncSelected}
            >
              {selected.size > 0
                ? t("sync.action_count", { n: selected.size }) || `Đồng bộ (${selected.size})`
                : t("sync.action") || "Đồng bộ"}
            </button>
          </div>
        }
      />

      <DashFilterBar
        value={q}
        onChange={setQ}
        onSubmit={load}
        placeholder={t("sync.search_ph") || "Tìm theo mã phiên, cán bộ, địa điểm..."}
        submitLabel={loading ? (t("sync.loading") || "Đang tải...") : (t("common.refresh") || "Làm mới")}
        busy={loading}
      >
        <DashFilterSelect
          label={t("sync.col.status") || "Trạng thái"}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "", label: t("sync.status.all") || "Tất cả trạng thái" },
            { value: "open", label: t("sync.status.open") || "Đang mở" },
            { value: "closed", label: t("sync.status.closed") || "Đã đóng" },
          ]}
        />
      </DashFilterBar>

      <DashDataTable
        columns={columns}
        data={pagedRows}
        rowKey={(s) => s.id}
        loading={loading}
        error={error}
        emptyText={t("sync.empty") || "Không có phiên nào cần đồng bộ"}
        page={page}
        totalRows={totalRows}
        pageSize={pageSize}
        onPageChange={setPage}
      />

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
