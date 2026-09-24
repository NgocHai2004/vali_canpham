import React, { useState, useEffect } from "react";
import api from "../api";
import { useI18n } from "../i18n";
import DetailModal from "../components/DetailModal";
import DashPageHeader from "../components/dashboard/DashPageHeader";
import DashFilterBar, { DashFilterSelect } from "../components/dashboard/DashFilterBar";
import DashDataTable from "../components/dashboard/DashDataTable";
import { notify } from "../notifications";

const LIMIT = 10;

/**
 * Danh sách can phạm — GỘP từ hai màn cũ (danh sách + tra cứu).
 *
 * Tra cứu bằng vân tay đã bỏ (thiết bị :8765 không dùng tới ở luồng này). Ô tìm
 * kiếm chỉ cần một tham số `q`: backend regex cả `full_name`, `cccd_number` và
 * `personal_id` (backend/routers/detainees.py:48-54) nên không cần tab riêng
 * cho CCCD như bản cũ.
 *
 * Phân trang chạy ở server (`skip`/`limit`) thay vì slice mảng ở client — tổng
 * số bản ghi có thể lớn hơn nhiều so với một trang.
 */
function DetaineesPage({ onEdit, onRegister, isAdmin }) {
  const { t, formatDate } = useI18n();
  const [items, setItems] = useState([]);
  const [cells, setCells] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(null);

  // `q` là chữ đang gõ, `appliedQ` là chữ đã submit. Tách ra để không bắn request
  // theo từng ký tự.
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [cellCode, setCellCode] = useState("");
  const [gender, setGender] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ skip: String(skip), limit: String(LIMIT) });
      if (appliedQ) params.set("q", appliedQ);
      if (cellCode) params.set("cell_code", cellCode);
      if (gender) params.set("gender", gender);
      const result = await api.request(`/api/detainees?${params}`);
      setItems(result.items || []);
      setTotal(result.total || 0);
    } catch (e) {
      setError(e.message);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.listCells().then(setCells).catch(() => { });
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, appliedQ, cellCode, gender]);

  /** Đổi filter luôn phải về trang 1, nếu không `skip` cũ có thể vượt quá tổng
      số kết quả mới và bảng hiện rỗng dù có dữ liệu. */
  const applyFilter = (fn) => {
    setSkip(0);
    fn();
  };

  const deleteItem = async (item) => {
    if (!window.confirm(t("detainee.confirm.delete", { code: item.code, name: item.full_name }))) return;
    try {
      await api.deleteDetainee(item.id);
      notify.add();
      load();
    } catch (e) {
      window.alert(t("common.error_prefix", { message: e.message }));
    }
  };

  const openEdit = async (item) => {
    try {
      const full = await api.getDetainee(item.id);
      onEdit?.(full);
    } catch {
      onEdit?.(item);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const currentPage = Math.floor(skip / LIMIT) + 1;
  const filtering = !!(appliedQ || cellCode || gender);

  // Tổng % = 100 để `table-layout: fixed` chia đúng, không cần px cố định.
  const columns = [
    {
      key: "photo",
      label: t("detainee.col.photo"),
      width: "6%",
      render: (row) => (
        <div className="dh-avatar">
          {row.photo_url
            ? <img src={row.photo_url} alt="" />
            : (row.full_name || "?").slice(0, 1).toUpperCase()}
        </div>
      ),
    },
    {
      key: "code",
      label: t("detainee.col.code"),
      width: "13%",
      className: "dh-cell-mono",
      render: (row) => row.personal_id || row.code,
    },
    {
      key: "full_name",
      label: t("detainee.col.name"),
      width: "22%",
      className: "dh-cell-strong",
    },
    {
      key: "gender",
      label: t("detainee.col.gender"),
      width: "8%",
      render: (row) => (row.gender === "female" ? t("common.female") : t("common.male")),
    },
    {
      key: "dob",
      label: t("detainee.col.dob"),
      width: "11%",
      render: (row) => (row.dob ? formatDate(row.dob) : "-"),
    },
    {
      key: "cccd_number",
      label: t("detainee.col.cccd"),
      width: "14%",
      render: (row) => row.cccd_number || "-",
    },
    {
      key: "cell_code",
      label: t("detainee.col.cell"),
      width: "10%",
      render: (row) => row.cell_code || "-",
    },
    {
      key: "actions",
      label: t("detainee.col.actions"),
      width: "16%",
      align: "center",
      render: (row) => (
        <span className="dh-rowbtns">
          <button type="button" className="dh-rowbtn" onClick={() => setViewing(row)}>
            {t("detainee.action.view")}
          </button>
          <button type="button" className="dh-rowbtn" onClick={() => openEdit(row)}>
            {t("detainee.action.edit")}
          </button>
          <button type="button" className="dh-rowbtn is-danger" onClick={() => deleteItem(row)}>
            {t("detainee.action.delete")}
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="page dh-page">
      <DashPageHeader
        title={t("detainee.list.title")}
        subtitle={filtering
          ? t("detainee.list.subtitle_result", { n: total })
          : t("detainee.list.total", { n: total })}
      >
        {/* Đường tắt vào form thu nhận. Admin bị chặn ở backend (không mở phiên,
            không thu nhận) → hiện nhưng disable kèm lý do, đỡ phải đi tìm. */}
        {onRegister && (
          <button
            type="button"
            className="dh-filter__submit"
            onClick={onRegister}
            disabled={isAdmin}
            title={isAdmin ? t("detainee.register.hint_admin") : t("detainee.register.hint")}
          >
            {t("detainee.register")}
          </button>
        )}
      </DashPageHeader>

      <DashFilterBar
        value={q}
        onChange={setQ}
        onSubmit={() => applyFilter(() => setAppliedQ(q.trim()))}
        placeholder={t("detainee.list.search_ph")}
        submitLabel={t("detainee.filter.submit")}
        busy={loading}
      >
        <DashFilterSelect
          label={t("detainee.col.cell")}
          value={cellCode}
          onChange={(v) => applyFilter(() => setCellCode(v))}
          options={[
            { value: "", label: t("detainee.filter.cell_all") },
            ...cells.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` })),
          ]}
        />
        <DashFilterSelect
          label={t("detainee.col.gender")}
          value={gender}
          onChange={(v) => applyFilter(() => setGender(v))}
          options={[
            { value: "", label: t("detainee.filter.gender_all") },
            { value: "male", label: t("common.male") },
            { value: "female", label: t("common.female") },
          ]}
        />
      </DashFilterBar>

      <DashDataTable
        className="dh-datatable--roomy"
        columns={columns}
        rows={items}
        loading={loading}
        error={error}
        empty={t("detainee.empty")}
        pager={{
          page: currentPage,
          totalPages,
          total,
          onPrev: () => setSkip(Math.max(0, skip - LIMIT)),
          onNext: () => setSkip(skip + LIMIT),
        }}
      />

      {viewing && <DetailModal detainee={viewing} onClose={() => setViewing(null)} onEdit={onEdit} />}
    </div>
  );
}

export default DetaineesPage;
