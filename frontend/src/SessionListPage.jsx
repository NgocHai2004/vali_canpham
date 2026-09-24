import { useEffect, useState } from "react";
import { api, exportToUsb } from "./api";
import { notify } from "./notifications";
import SessionOpenModal from "./SessionOpenModal";
import { CellForm } from "./Dashboard";
import UsbDrivePickerModal from "./UsbDrivePickerModal";
import { toast } from "./Toast";
import { useI18n } from "./i18n";
import DashPageHeader from "./components/dashboard/DashPageHeader";
import DashStatCard from "./components/dashboard/DashStatCard";
import DashFilterBar, { DashFilterSelect, DashFilterField } from "./components/dashboard/DashFilterBar";
import DashDataTable from "./components/dashboard/DashDataTable";

const STAT_ICONS = {
  blue: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" />
    </svg>
  ),
  orange: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6v5h-5M4 18v-5h5" /><path d="M6.1 9A7 7 0 0 1 18 6l2 5M4 13l2 5a7 7 0 0 0 11.9-3" />
    </svg>
  ),
  purple: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  ),
  green: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 18a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.34 8.05 4.5 4.5 0 0 0 7 18" /><path d="m8 14 4-4 4 4M12 10v9" />
    </svg>
  ),
};

export default function SessionListPage({ role, username, fullName, onOpenSession }) {
  const { t, formatDateTime } = useI18n();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  // Admin là quản trị hệ thống: giám sát phiên của mọi cán bộ (xem, xoá, tải báo cáo)
  // nhưng không tự mở phiên và không tự thu nhận hồ sơ.
  const isAdmin = role === "admin";
  const [mineOnly, setMineOnly] = useState(role !== "admin");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [cellFormOpen, setCellFormOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [stats, setStats] = useState({ create: 0, update: 0, delete: 0, import: 0 });
  const [deletingId, setDeletingId] = useState(null);
  const [exportingId, setExportingId] = useState(null);
  const [usbPicker, setUsbPicker] = useState({ open: false, drives: [], resolve: null });
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const removeSession = (s) => setConfirmDel(s);

  const doDeleteSession = async () => {
    const s = confirmDel;
    if (!s) return;
    setDeletingId(s.id);
    setConfirmDel(null);
    try {
      await api.deleteSession(s.id);
      notify.add();
      await load();
    } catch (ex) {
      alert(ex.message || t("session.err.delete"));
    } finally {
      setDeletingId(null);
    }
  };

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const [resp, cur, logsResp] = await Promise.all([
        api.listSessions({
          status: statusFilter,
          mine_only: mineOnly ? "true" : "",
          date_from: dateFrom,
          date_to: dateTo,
          skip: String((page - 1) * pageSize),
          limit: String(pageSize),
        }),
        // Admin không có phiên của riêng mình → khỏi gọi API (backend trả 404).
        isAdmin ? Promise.resolve(null) : api.getCurrentSession().catch(() => null),
        api.listLogs({ resource: "detainee" }).catch(() => ({ counts: {} })),
      ]);
      setItems(resp.items || []);
      setTotal(resp.total || 0);
      setCurrent(cur);
      const c = logsResp.counts || {};
      setStats({
        create: c.create || 0,
        update: c.update || 0,
        delete: c.delete || 0,
        import: c.import || 0,
      });
    } catch (ex) {
      setErr(ex.message || t("session.err.load"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter, mineOnly, dateFrom, dateTo, page]);
  useEffect(() => { setPage(1); }, [statusFilter, mineOnly, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const hasOpenSession = Boolean(current);

  const openNew = () => {
    if (hasOpenSession) return;
    setModalOpen(true);
  };

  const handleCreated = (s) => {
    setModalOpen(false);
    setCurrent(s);
    notify.add();
    if (onOpenSession) onOpenSession(s.id);
  };

  const pickDrive = (drives) => new Promise((resolve) => {
    setUsbPicker({ open: true, drives, resolve });
  });

  const downloadReport = async (s) => {
    setExportingId(s.id);
    try {
      const res = await exportToUsb(
        `/api/sessions/${s.id}/report`,
        s.report_filename || `session_${s.code}.xlsx`,
        pickDrive,
      );
      if (!res.cancelled) {
        const msg = t("usb.export.success", { path: res.path });
        toast.success(msg);
        notify.add(msg);
      }
    } catch (ex) {
      toast.error(ex.message || t("session.err.report"));
    } finally {
      setExportingId(null);
    }
  };

  // Tổng % = 100 cho `table-layout: fixed`.
  const columns = [
    {
      key: "status",
      label: t("session.status"),
      width: "9%",
      render: (s) => (s.status === "open"
        ? <span className="badge badge-open">{t("session.status.open_dot")}</span>
        : <span className="badge badge-closed">{t("session.status.closed_dot")}</span>),
    },
    { key: "code", label: t("session.col.code"), width: "14%", className: "dh-cell-mono" },
    {
      key: "officer",
      label: t("session.col.officer"),
      width: "14%",
      render: (s) => s.officer_full_name || s.officer,
    },
    {
      key: "opened_at",
      label: t("session.col.opened_at"),
      width: "13%",
      render: (s) => formatDateTime(s.opened_at),
    },
    {
      key: "closed_at",
      label: t("session.col.closed_at"),
      width: "13%",
      render: (s) => formatDateTime(s.closed_at),
    },
    {
      key: "location",
      label: t("session.col.location"),
      width: "12%",
      render: (s) => s.location || "—",
    },
    {
      key: "detainee_count",
      label: t("session.col.detainees"),
      width: "8%",
      align: "right",
      render: (s) => s.detainee_count || 0,
    },
    {
      key: "actions",
      label: "",
      // 17% chứ không phải 12%: đo ở kiosk 1920 thì nhóm 2 nút đã rộng 166px mà ô
      // chỉ còn 149px lòng trong → nút TRÀN 5px qua mép bảng. Thêm nút thứ ba nữa
      // nên phải nới; 5% lấy từ officer/opened_at/closed_at/location ở trên.
      width: "17%",
      align: "right",
      className: "dh-cell-actions",
      // stopPropagation: cả dòng là nút mở phiên (onRowClick), nếu không chặn thì
      // bấm Xem/Xoá/Xuất cũng nhảy vào phiên (double-trigger).
      render: (s) => (
        <span className="dh-rowbtns">
          {(role === "admin" || s.officer === username) && (
            <button
              type="button"
              className="dh-rowbtn is-danger"
              disabled={deletingId === s.id}
              onClick={(e) => { e.stopPropagation(); removeSession(s); }}
              title={s.detainee_count
                ? t("session.delete.title", { n: s.detainee_count })
                : t("session.delete.title_simple")}
            >
              {deletingId === s.id ? t("common.deleting") : t("session.delete.title_simple")}
            </button>
          )}
          {/* Bấm cả dòng cũng mở phiên, nhưng dòng bảng không có dấu hiệu nào cho
              thấy nó bấm được — nút này là chỗ bấm tường minh cho hành động đó. */}
          <button
            type="button"
            className="dh-rowbtn"
            onClick={(e) => { e.stopPropagation(); onOpenSession && onOpenSession(s.id); }}
            title={t("common.view")}
          >
            {t("common.view")}
          </button>
          <button
            type="button"
            className="dh-rowbtn"
            disabled={exportingId === s.id}
            onClick={(e) => { e.stopPropagation(); downloadReport(s); }}
            title={t("session.export.title")}
          >
            {exportingId === s.id ? t("session.exporting") : t("session.export")}
          </button>
        </span>
      ),
    },
  ];
  return (
    <div className="page dh-page">
      <DashPageHeader title={t("session.title")} subtitle={t("common.total", { n: total })}>
        <button
          type="button"
          className="dh-rowbtn dh-rowbtn--lg"
          onClick={() => setCellFormOpen(true)}
          title={t("session.open.add_cell_hint")}
        >
          {t("session.open.add_cell")}
        </button>
        {/* Admin không mở phiên (backend cũng chặn) → không hiện nút này. */}
        {!isAdmin && (
          <span title={hasOpenSession ? t("session.open_hint", { code: current.code }) : ""}>
            <button
              type="button"
              className="dh-filter__submit"
              onClick={openNew}
              disabled={hasOpenSession}
            >
              {t("session.new")}
            </button>
          </span>
        )}
      </DashPageHeader>

      <div className="dh-statline">
        <DashStatCard tone="blue" icon={STAT_ICONS.blue} label={t("session.stat.create")} value={stats.create} note={t("session.stat.create_note")} />
        <DashStatCard tone="amber" icon={STAT_ICONS.orange} label={t("session.stat.update")} value={stats.update} note={t("session.stat.update_note")} />
        <DashStatCard tone="purple" icon={STAT_ICONS.purple} label={t("session.stat.delete")} value={stats.delete} note={t("session.stat.delete_note")} />
        <DashStatCard tone="emerald" icon={STAT_ICONS.green} label={t("session.stat.import")} value={stats.import} note={t("session.stat.import_note")} />
      </div>

      {current && (
        <div className="session-list-current neon-active">
          <span className="badge badge-open">{t("session.status.open_dot")}</span>
          <span className="dh-cell-mono">{current.code}</span>
          <span className="dh-cell-dim">
            {t("session.banner.current", { officer: current.officer_full_name || current.officer, n: current.detainee_count || 0 })}
          </span>
          <button
            type="button"
            className="dh-rowbtn"
            style={{ marginLeft: "auto" }}
            onClick={() => onOpenSession && onOpenSession(current.id)}
          >
            {t("session.banner.enter")}
          </button>
        </div>
      )}

      {/* Không có ô tìm kiếm: backend /api/work-sessions không nhận `q`. */}
      <DashFilterBar onSubmit={load} submitLabel={t("common.refresh")} busy={loading}>
        <DashFilterSelect
          label={t("session.status")}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "", label: t("common.all") },
            { value: "open", label: t("session.status.open") },
            { value: "closed", label: t("session.status.closed") },
          ]}
        />
        <label className="dh-filter__chk">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            disabled={role !== "admin"}
          />
          {t("session.filter.mine")}
        </label>
        <DashFilterField label={t("common.from")}>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </DashFilterField>
        <DashFilterField label={t("common.to")}>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </DashFilterField>
      </DashFilterBar>

      <DashDataTable
        columns={columns}
        rows={items}
        rowKey={(s) => s.id}
        onRowClick={(s) => onOpenSession && onOpenSession(s.id)}
        loading={loading}
        error={err}
        empty={t("session.empty")}
        pager={{
          page,
          totalPages,
          total,
          onPrev: () => setPage((p) => Math.max(1, p - 1)),
          onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
        }}
      />

      {modalOpen && (
        <SessionOpenModal
          officerName={username}
          officerFullName={fullName}
          role={role}
          onCancel={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {cellFormOpen && (
        <CellForm
          initial={null}
          onClose={() => setCellFormOpen(false)}
          onSaved={() => setCellFormOpen(false)}
        />
      )}

      {confirmDel && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setConfirmDel(null)}
        >
          <div className="modal-panel confirm-del-modal">
            <div className="modal-head">
              <h3>{t("session.delete.title_simple")}</h3>
            </div>
            <div style={{ padding: "14px 20px", whiteSpace: "pre-line", lineHeight: 1.5 }}>
              {(confirmDel.detainee_count || 0) > 0
                ? t("session.delete.confirm_multi", { code: confirmDel.code, n: confirmDel.detainee_count })
                : t("session.delete.confirm_empty", { code: confirmDel.code })}
            </div>
            <div className="modal-actions" style={{ padding: "10px 20px 16px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn-secondary" onClick={() => setConfirmDel(null)}>
                {t("common.cancel")}
              </button>
              <button type="button" className="btn-danger" onClick={doDeleteSession}>
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {usbPicker.open && (
        <UsbDrivePickerModal
          drives={usbPicker.drives}
          onPick={(d) => {
            const r = usbPicker.resolve;
            setUsbPicker({ open: false, drives: [], resolve: null });
            r && r(d);
          }}
          onCancel={() => {
            const r = usbPicker.resolve;
            setUsbPicker({ open: false, drives: [], resolve: null });
            r && r(null);
          }}
        />
      )}
    </div>
  );
}
