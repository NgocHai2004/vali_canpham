import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n";

// Bảng chọn vụ án / phiên làm việc — bước đầu của tab Dấu vết hiện trường.
// Đọc GET /api/sessions có sẵn, không thêm endpoint. Bấm vào hàng chưa làm gì
// (màn chi tiết làm sau) nên hàng để cursor default, không hover kiểu clickable.
const PAGE_SIZE = 10;

export default function SceneCasePicker({ onPick }) {
  const { t, formatDateTime } = useI18n();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await api.listSessions({
        status: statusFilter,
        skip: String((page - 1) * PAGE_SIZE),
        limit: String(PAGE_SIZE),
      });
      setItems(r.items || []);
      setTotal(r.total || 0);
    } catch (ex) {
      setErr(ex.message || t("scene.case.err_load"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [statusFilter]);

  // Lọc theo tên vụ án / mã phiên ngay trên trang hiện tại.
  const kw = q.trim().toLowerCase();
  const rows = kw
    ? items.filter((s) =>
        `${s.case_name || ""} ${s.code || ""}`.toLowerCase().includes(kw))
    : items;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="panel scene-list-panel">
      <div className="scene-list-head">
        <div className="scene-list-head-main">
          <h2>{t("scene.case.title")}</h2>
          <div className="scene-list-sub">{t("scene.case.sub")}</div>
        </div>
      </div>

      <div className="scene-list-filters">
        <label>
          {t("session.status")}
          <select
            className="control"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">{t("common.all")}</option>
            <option value="open">{t("session.status.open")}</option>
            <option value="closed">{t("session.status.closed")}</option>
          </select>
        </label>
        <label>
          {t("common.search")}
          <input
            type="search"
            className="control"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("scene.case.search_ph")}
          />
        </label>
        <button type="button" className="btn-secondary" onClick={load}>
          {t("common.refresh")}
        </button>
      </div>

      {err && <div className="lg-err" role="alert">{err}</div>}

      <div className="scene-table-wrap">
        <table className="scene-table">
          <thead>
            <tr>
              <th>{t("session.status")}</th>
              <th>{t("session.col.code")}</th>
              <th>{t("scene.case.col.case")}</th>
              <th>{t("session.col.officer")}</th>
              <th>{t("session.col.location")}</th>
              <th>{t("session.col.opened_at")}</th>
              <th style={{ textAlign: "right" }}>{t("scene.case.col.traces")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="scene-empty">{t("common.loading")}</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="scene-empty">{t("scene.case.empty")}</td></tr>
            )}
            {!loading && rows.map((s) => (
              <tr
                key={s.id}
                className="session-list-row"
                onClick={() => onPick && onPick(s.id)}
              >
                <td>
                  {s.status === "open"
                    ? <span className="badge badge-open">{t("session.status.open_dot")}</span>
                    : <span className="badge badge-closed">{t("session.status.closed_dot")}</span>}
                </td>
                <td className="mono">{s.code}</td>
                <td>{s.case_name || "—"}</td>
                <td>{s.officer_full_name || s.officer}</td>
                <td>{s.location || "—"}</td>
                <td>{formatDateTime(s.opened_at)}</td>
                <td style={{ textAlign: "right" }}>{s.scene_count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="scene-pg">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t("common.prev")}
          </button>
          <span className="scene-pg-size">{page} / {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            {t("common.next")}
          </button>
        </div>
      )}
    </section>
  );
}
