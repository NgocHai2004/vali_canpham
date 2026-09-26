import React, { useState, useEffect } from "react";
import api, { usbApi, syncPackageApi, exportSyncPackageToUsb } from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icons";
import SyncDiffModal from "../SyncDiffModal";
// MOCK: backend chua co router sync, xem lib/syncMock.js (co ghi ro SEAM de doi sang
// API that). Truoc do dong nay goi api.fetchSessionSyncDiff() — mot ham khong ton tai.
import { fetchSessionSyncDiff, executeSync } from "../lib/syncMock";
import DashPageHeader from "../components/dashboard/DashPageHeader";
import DashFilterBar, { DashFilterSelect, DashFilterField } from "../components/dashboard/DashFilterBar";
import DashDataTable from "../components/dashboard/DashDataTable";
import UsbDrivePickerModal from "../UsbDrivePickerModal";
import UsbPackagePickerModal from "../components/UsbPackagePickerModal";
import SyncPackageProgressModal from "../components/SyncPackageProgressModal";
import { notify } from "../notifications";
import { toast } from "../Toast";

// Bước hỏng của máy chủ (PackageError.step) -> bước trên giao diện. validate mở
// gói + giải mã + đọc manifest + kiểm phiên bản trong cùng một request nên 4 mã
// đó cùng thuộc bước "format"; checksum và schema có bước riêng.
const FAIL_STEP = {
  format: "format", decrypt: "format", manifest: "format", version: "format",
  checksum: "integrity", schema: "schema",
};
const PKG_STEP_IDS = ["read", "format", "integrity", "schema", "write"];

function fmtBytes(n) {
  if (n == null || Number.isNaN(n)) return "";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

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

  // --- Xuất / nhận gói dữ liệu qua USB ---
  // usbPicker giữ nguyên dáng mà ImportExportPage đang dùng: exportToUsb nhận một
  // hàm pickDrive trả Promise, nên modal chỉ việc resolve đúng drive người dùng chọn.
  const [usbPicker, setUsbPicker] = useState({ open: false, drives: [], resolve: null });
  const [exportingPkg, setExportingPkg] = useState(false);
  const [pkgPickerOpen, setPkgPickerOpen] = useState(false);
  const [pkgTarget, setPkgTarget] = useState(null);
  const [pkgSteps, setPkgSteps] = useState([]);
  // "idle" chu khong phai "running": khoi tao la "running" thi nút Xuất dữ liệu bị
  // khoá vĩnh viễn ngay từ đầu (điều kiện disabled có `pkgPhase === "running"`).
  const [pkgPhase, setPkgPhase] = useState("idle");
  const [pkgSummary, setPkgSummary] = useState(null);
  const [pkgError, setPkgError] = useState("");

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
      const diff = await fetchSessionSyncDiff(session.id);
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

  // SyncDiffModal.jsx:225 goi onConfirm(targets) voi MOT mang phang da gop
  // (toAdd da chon + toUpdate da chon). Truoc day ham nay khai bao (addSel, updSel)
  // nen tham so thu hai LUON undefined => updSel.map(...) nem "Cannot read
  // properties of undefined (reading 'map')" va moi lan bam Dong bo deu that bai.
  // Tach lai thanh 2 nhom theo id cua diff.toAdd.
  const doSync = async (targets) => {
    if (!diffState) return;
    const { session, diff } = diffState;
    const list = Array.isArray(targets) ? targets : [];
    const addIds = new Set((diff?.toAdd || []).map((x) => x.id));
    const addSel = list.filter((x) => addIds.has(x.id));
    const updSel = list.filter((x) => !addIds.has(x.id));
    setDiffState((prev) => (prev ? { ...prev, loading: true } : null));
    try {
      const payload = {
        session_id: session.id,
        added_ids: addSel.map((x) => x.id),
        updated_ids: updSel.map((x) => x.id),
      };
      // MOCK, xem lib/syncMock.js. Truoc day la fetch("/api/sync/execute") — endpoint
      // khong ton tai (backend/main.py khong include router sync nao), va ma nay lai
      // KHONG kiem tra res.ok nen 404 van bi tinh la dong bo thanh cong.
      await executeSync(payload);
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

  // --- Xuất gói dữ liệu ra USB --------------------------------------------
  // Giữ nguyên dáng ImportExportPage đang dùng: exportToUsb nhận hàm pickDrive
  // trả Promise, nên modal chỉ cần resolve đúng drive người dùng chọn.
  const pickDrive = (drives) => new Promise((resolve) => {
    setUsbPicker({ open: true, drives, resolve });
  });

  const closeUsbPicker = (picked) => {
    usbPicker.resolve?.(picked);
    setUsbPicker({ open: false, drives: [], resolve: null });
  };

  const exportPackage = async () => {
    if (selected.size === 0) return;
    setExportingPkg(true);
    try {
      const res = await exportSyncPackageToUsb([...selected], pickDrive);
      if (res.cancelled) return;
      const msg = t("usb.export.success", { path: res.path });
      toast.success(msg);
      notify.add(msg);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setExportingPkg(false);
    }
  };

  // --- Nhận gói dữ liệu từ USB --------------------------------------------
  const setStep = (id, status, detail = "") =>
    setPkgSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, detail } : s)));

  const importPackage = async ({ drive, name }) => {
    setPkgPickerOpen(false);
    setPkgTarget({ drive, name });
    setPkgSummary(null);
    setPkgError("");
    setPkgPhase("running");
    setPkgSteps(PKG_STEP_IDS.map((id) => ({ id, status: "pending", detail: "" })));

    // Các bước chạy tuần tự, nên bước hỏng nghĩa là mọi bước TRƯỚC nó đã xong. Phải
    // đánh dấu nốt: không thì bước trước còn hiện "đang chạy" trong khi bước sau đã
    // báo lỗi (ví dụ gói sai sha256 -> "Mở gói và giải mã" quay mãi mà "Kiểm tra
    // toàn vẹn" đã đỏ).
    const failAt = (id, message) => {
      const at = PKG_STEP_IDS.indexOf(id);
      setPkgSteps((prev) =>
        prev.map((s, i) => ({
          ...s,
          status: i < at ? "done" : s.id === id ? "failed" : "pending",
          detail: s.id === id ? message : s.detail,
        }))
      );
      setPkgError(message);
      setPkgPhase("failed");
      toast.error(message);
    };

    let blob;
    try {
      setStep("read", "running");
      const r = await usbApi.readFile(drive, name);
      blob = r.blob;
      setStep("read", "done", fmtBytes(blob.size));
    } catch (e) {
      failAt("read", e.message);
      return;
    }

    const file = new File([blob], name, { type: "application/octet-stream" });

    // Bước 1: máy chủ kiểm hợp lệ, KHÔNG ghi gì. Qua được mới sang bước ghi.
    // Gói phải đọc từ USB chỉ một lần (ở trên) rồi gửi lại 2 lượt — đổi lại là
    // biết chắc gói hợp lệ TRƯỚC khi động vào DB, đúng yêu cầu.
    try {
      setStep("format", "running");
      await syncPackageApi.validate(file);
      setStep("format", "done");
      setStep("integrity", "done");
      setStep("schema", "done");
    } catch (e) {
      failAt(FAIL_STEP[e.step] || "format", e.message);
      return;
    }

    // Bước 2: ghi DB. Máy chủ tự hoàn tác nếu hỏng giữa chừng (nhật ký bù trừ),
    // nên `ok: false` nghĩa là DB vẫn nguyên như trước khi nhận.
    try {
      setStep("write", "running");
      const res = await syncPackageApi.apply(file);
      if (!res.ok) {
        failAt("write", res.error || t("sync.pkg.err.apply_failed"));
        return;
      }
      setStep("write", "done");
      setPkgSummary({ written: res.written || {}, skipped: res.skipped || {} });
      setPkgPhase("done");
      const msg = t("sync.pkg.success", {
        sessions: res.written?.sessions || 0,
        detainees: res.written?.detainees || 0,
      });
      toast.success(msg);
      notify.add(msg);
      load();   // gói có thể mang thêm phiên mới
    } catch (e) {
      failAt(FAIL_STEP[e.step] || "write", e.message);
    }
  };

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
      {/* DashPageHeader.jsx:14 nhận `children`, KHÔNG có prop `action` — trước đây
          trang này truyền `action={...}` nên nút Đồng bộ không được render ở đâu cả
          (bảng vẫn chạy, chỉ là không có nút nào để bấm). Ba nút dưới đây là con. */}
      <DashPageHeader
        title={t("sync.title") || "Đồng bộ dữ liệu"}
        subtitle={t("sync.subtitle") || "Đồng bộ hồ sơ giữa các phiên làm việc và máy chủ trung tâm"}
      >
        <button
          className="dh-filter__submit ghost"
          disabled={selected.size === 0 || exportingPkg || (!!pkgTarget && pkgPhase === "running")}
          onClick={exportPackage}
        >
          {exportingPkg ? t("common.processing") : t("sync.pkg.export")}
        </button>
        <button
          className="dh-filter__submit ghost"
          disabled={pkgPhase === "running" && !!pkgTarget}
          onClick={() => setPkgPickerOpen(true)}
        >
          {t("sync.pkg.import")}
        </button>
        {/* Bỏ `button primary` (2 class không có định nghĩa toàn cục): chúng kéo
            chiều cao lên 42px trong khi .dh-filter__submit là 34px, làm 3 nút
            trong cùng một hàng so le nhau. .dh-filter__submit đã là nền xanh đặc
            nên vẫn nổi hơn 2 nút viền. */}
        <button
          className="dh-filter__submit"
          disabled={selected.size === 0 || syncingIds.size > 0}
          onClick={syncSelected}
        >
          {selected.size > 0
            ? t("sync.action_count", { n: selected.size }) || `Đồng bộ (${selected.size})`
            : t("sync.action") || "Đồng bộ"}
        </button>
      </DashPageHeader>

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

      {/* Ten prop phai khop DashDataTable.jsx:26 — truoc day truyen `data` /
          `emptyText` / `page,totalRows,pageSize,onPageChange`, khong khop cai nao,
          nen `rows` roi ve mac dinh [] va bang LUON trong du API tra ve du phien;
          `empty` cung rong nen hop trang thai khong co chu, nhin nhu bang hong. */}
      <DashDataTable
        columns={columns}
        rows={pagedRows}
        rowKey={(s) => s.id}
        loading={loading}
        error={error}
        empty={t("sync.empty") || "Không có phiên nào cần đồng bộ"}
        pager={{
          page,
          totalPages,
          total: totalRows,
          onPrev: () => setPage(Math.max(1, page - 1)),
          onNext: () => setPage(Math.min(totalPages, page + 1)),
        }}
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

      {usbPicker.open && (
        <UsbDrivePickerModal
          drives={usbPicker.drives}
          onPick={closeUsbPicker}
          onCancel={() => closeUsbPicker(null)}
        />
      )}

      {pkgPickerOpen && (
        <UsbPackagePickerModal
          onPick={importPackage}
          onCancel={() => setPkgPickerOpen(false)}
        />
      )}

      {pkgTarget && (
        <SyncPackageProgressModal
          drive={pkgTarget.drive}
          filename={pkgTarget.name}
          steps={pkgSteps}
          phase={pkgPhase}
          summary={pkgSummary}
          error={pkgError}
          onClose={() => { setPkgTarget(null); setPkgSteps([]); }}
        />
      )}
    </div>
  );
}

export default SyncPage;
