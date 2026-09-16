import { useEffect, useState } from "react";
import { api, exportToUsb } from "./api";
import { notify } from "./notifications";
import { useI18n } from "./i18n";
import UsbDrivePickerModal from "./UsbDrivePickerModal";
import { toast } from "./Toast";

// Hồ sơ 1 vụ án: thông tin vụ + danh sách hồ sơ can phạm thuộc vụ đó.
// Thay cho SessionDetailPage. Khác biệt so với phiên làm việc cũ:
//   - Không có cán bộ phụ trách → bỏ khối avatar/officer.
//   - Trạng thái là investigating/closed, không phải open/closed.
//   - Vụ đã kết thúc thì khoá: không thêm/sửa/xoá hồ sơ (backend chặn 403).
function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CaseDetailPage({ caseId, role, onBack, onAddDetainee, onEditDetainee, onCaseClosed }) {
  const { t, formatDate, formatDateTime } = useI18n();
  // Admin giám sát: xem, kết thúc, xoá, tải báo cáo — nhưng không thu nhận hồ sơ.
  const isAdmin = role === "admin";
  const [caseDoc, setCaseDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDeleteCase, setConfirmDeleteCase] = useState(false);
  const [confirmDelRow, setConfirmDelRow] = useState(null);
  const [usbPicker, setUsbPicker] = useState({ open: false, drives: [], resolve: null });

  // Bảng chỉ có bản gọn của hồ sơ (đủ hiển thị), form sửa cần bản đầy đủ.
  const openEditFull = async (d) => {
    if (!onEditDetainee || !caseDoc) return;
    try {
      const full = await api.getDetainee(d.id);
      onEditDetainee(full, caseDoc);
    } catch {
      onEditDetainee(d, caseDoc);
    }
  };

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      setCaseDoc(await api.getCase(caseId));
    } catch (ex) {
      setErr(ex.message || t("case.detail.err.load"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [caseId]);

  const runClose = async () => {
    setConfirmClose(false);
    if (!caseDoc) return;
    setBusy(true);
    setErr("");
    try {
      await api.closeCase(caseId);
      notify.add();
      if (onCaseClosed) onCaseClosed(caseDoc);
      await load();
    } catch (ex) {
      setErr(ex.message || t("case.detail.err.close"));
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    setConfirmDeleteCase(false);
    if (!caseDoc) return;
    setBusy(true);
    setErr("");
    try {
      await api.deleteCase(caseId);
      notify.add();
      // Vụ án không còn nữa → thoát về danh sách, không load lại.
      if (onCaseClosed) onCaseClosed(caseDoc);
    } catch (ex) {
      setErr(ex.message || t("case.detail.err.delete_full"));
    } finally {
      setBusy(false);
    }
  };

  const pickDrive = (drives) => new Promise((resolve) => {
    setUsbPicker({ open: true, drives, resolve });
  });

  const doDownload = async () => {
    if (!caseDoc) return;
    try {
      const res = await exportToUsb(
        `/api/cases/${caseId}/report`,
        caseDoc.report_filename || `case_${caseDoc.code || caseId}.xlsx`,
        pickDrive,
      );
      if (!res.cancelled) {
        const msg = t("usb.export.success", { path: res.path });
        toast.success(msg);
        notify.add(msg);
      }
    } catch (ex) {
      toast.error(ex.message || t("case.detail.err.report"));
    }
  };

  const runRemoveDetainee = async () => {
    const d = confirmDelRow;
    setConfirmDelRow(null);
    if (!d) return;
    try {
      await api.deleteDetainee(d.id);
      notify.add();
      await load();
    } catch (ex) {
      setErr(ex.message || t("case.detail.err.delete_row"));
    }
  };

  if (loading) return <div className="session-detail-page"><div>{t("common.loading")}</div></div>;
  if (err && !caseDoc) return (
    <div className="session-detail-page">
      <button className="btn-link" onClick={onBack}>{t("common.back")}</button>
      <div className="error-box">{err}</div>
    </div>
  );
  if (!caseDoc) return null;

  const isOpen = caseDoc.status === "investigating";
  const nDetainees = caseDoc.detainee_count || 0;

  return (
    <div className="session-detail-page">
      <button className="btn-link session-detail-back" onClick={onBack}>{t("common.back_to_list")}</button>

      <div className={"session-detail-head " + (isOpen ? "open" : "closed")}>
        <div className="session-detail-title">
          {/* Ký hiệu ● / ✓ nằm trong chuỗi dịch nên không chỉ dựa vào màu. */}
          <span className={"badge " + (isOpen ? "badge-open" : "badge-closed")}>
            {t(isOpen ? "case.status.investigating_dot" : "case.status.closed_dot")}
          </span>
          <span className="session-detail-code mono">{caseDoc.code}</span>
          <strong className="case-detail-name">{caseDoc.name || t("case.no_name")}</strong>
        </div>
        <div className="session-detail-meta">
          <span>{t("case.col.occurred_at")}: <strong>{formatDateTime(caseDoc.occurred_at)}</strong></span>
          {caseDoc.location && <span>{t("case.col.location")}: <strong>{caseDoc.location}</strong></span>}
          {caseDoc.officer_name && (
            <span>{t("case.col.officer")}: <strong>{caseDoc.officer_rank ? `${caseDoc.officer_rank} ` : ""}{caseDoc.officer_name}</strong></span>
          )}
          <span>{t("case.detail.traces")}: <strong>{caseDoc.trace_count || 0}</strong></span>
          {!isOpen && <span>{t("case.detail.closed")}: <strong>{formatDateTime(caseDoc.closed_at)}</strong></span>}
        </div>
        {caseDoc.note && <div className="session-detail-note">{t("case.form.note")}: {caseDoc.note}</div>}
      </div>

      {err && <div className="error-box">{err}</div>}

      <div className="session-detail-toolbar">
        <div className="session-detail-toolbar-title">{t("case.detail.detainees_header", { n: nDetainees })}</div>
        <div className="session-detail-toolbar-actions">
          {isOpen ? (
            <>
              {/* Admin không thu nhận hồ sơ (backend cũng chặn) → ẩn nút. */}
              {!isAdmin && (
                <button className="btn-primary" onClick={() => onAddDetainee && onAddDetainee(caseDoc.id)}>
                  {t("case.detail.add_new")}
                </button>
              )}
              {!isAdmin && (
                <>
                  <button className="btn-danger-outline" onClick={() => setConfirmClose(true)} disabled={busy}>
                    {busy ? t("case.detail.closing") : t("case.detail.close")}
                  </button>
                  <button className="btn-danger-outline" onClick={() => setConfirmDeleteCase(true)} disabled={busy}>
                    {busy ? t("case.detail.deleting") : t("case.detail.delete")}
                  </button>
                </>
              )}
              <button className="btn-secondary" onClick={doDownload}>{t("case.detail.download_report")}</button>
            </>
          ) : (
            <>
              {!isAdmin && (
                <button className="btn-danger-outline" onClick={() => setConfirmDeleteCase(true)} disabled={busy}>
                  {busy ? t("case.detail.deleting") : t("case.detail.delete")}
                </button>
              )}
              <button className="btn-primary" onClick={doDownload}>{t("case.detail.download_report")}</button>
            </>
          )}
        </div>
      </div>

      <div className="session-list-table-wrap">
        <table className="session-list-table session-detail-table">
          <thead>
            <tr>
              <th>{t("detainee.field.personal_id")}</th>
              <th>{t("detainee.field.full_name")}</th>
              <th>{t("detainee.field.gender")}</th>
              <th>{t("detainee.field.dob")}</th>
              <th>{t("detainee.field.cccd")}</th>
              <th>{t("case.col.captured_at")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(caseDoc.detainees || []).length === 0 && (
              <tr>
                <td colSpan={8} className="session-list-empty">
                  {isOpen ? t("case.detail.empty_open") : t("case.detail.empty_closed")}
                </td>
              </tr>
            )}
            {(caseDoc.detainees || []).map((d) => (
              <tr key={d.id} className="session-list-row" onClick={() => openEditFull(d)}>
                <td className="mono">{d.personal_id || d.code || "—"}</td>
                <td>{d.full_name}</td>
                <td>{d.gender === "female" ? t("common.female") : t("common.male")}</td>
                <td>{d.dob ? formatDate(d.dob) : "—"}</td>
                <td className="mono">{d.cccd_number || "—"}</td>
                <td>{fmtTime(d.created_at)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {isOpen && !isAdmin && (
                    <button type="button" className="btn-link btn-link-danger" onClick={() => setConfirmDelRow(d)}>
                      {t("common.delete")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmClose && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConfirmClose(false)}>
          <div className="modal-panel confirm-del-modal">
            <div className="modal-head"><h3>{t("case.detail.close")}</h3></div>
            <div style={{ padding: "14px 20px", whiteSpace: "pre-line", lineHeight: 1.5 }}>
              {t("case.confirm.close", { code: caseDoc.code, n: nDetainees })}
            </div>
            <div className="modal-actions" style={{ padding: "10px 20px 16px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn-secondary" onClick={() => setConfirmClose(false)}>{t("common.cancel")}</button>
              <button type="button" className="btn-danger" onClick={runClose}>{t("common.confirm")}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteCase && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConfirmDeleteCase(false)}>
          <div className="modal-panel confirm-del-modal">
            <div className="modal-head"><h3>{t("case.detail.delete")}</h3></div>
            <div style={{ padding: "14px 20px", whiteSpace: "pre-line", lineHeight: 1.5 }}>
              {nDetainees > 0
                ? t("case.confirm.delete_multi", { code: caseDoc.code, n: nDetainees })
                : t("case.confirm.delete_empty", { code: caseDoc.code })}
            </div>
            <div className="modal-actions" style={{ padding: "10px 20px 16px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn-secondary" onClick={() => setConfirmDeleteCase(false)}>{t("common.cancel")}</button>
              <button type="button" className="btn-danger" onClick={runDelete}>{t("common.delete")}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelRow && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConfirmDelRow(null)}>
          <div className="modal-panel confirm-del-modal">
            <div className="modal-head"><h3>{t("common.delete")}</h3></div>
            <div style={{ padding: "14px 20px", whiteSpace: "pre-line", lineHeight: 1.5 }}>
              {t("case.detail.confirm.delete_row", { code: confirmDelRow.personal_id || confirmDelRow.code, name: confirmDelRow.full_name })}
            </div>
            <div className="modal-actions" style={{ padding: "10px 20px 16px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn-secondary" onClick={() => setConfirmDelRow(null)}>{t("common.cancel")}</button>
              <button type="button" className="btn-danger" onClick={runRemoveDetainee}>{t("common.delete")}</button>
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
