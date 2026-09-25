import React, { useState, useEffect, Fragment } from "react";
import api from "../api";
import { useI18n } from "../i18n";
import { StateBox } from "../components/CommonUI";
import DashPageHeader from "../components/dashboard/DashPageHeader";
import DashFilterBar, { DashFilterSelect } from "../components/dashboard/DashFilterBar";
import DashDataTable from "../components/dashboard/DashDataTable";
import DetailModal from "../components/DetailModal";

function CellsPage() {
  const { t } = useI18n();
  const [cells, setCells] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewingCell, setViewingCell] = useState(null);
  // Bộ lọc
  const [filterCustody, setFilterCustody] = useState("");   // Diện
  const [filterLevel, setFilterLevel] = useState("");       // Cấp
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setCells(await api.listCells());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [filterCustody, filterLevel]);

  const deleteCell = async (cell) => {
    if (!window.confirm(t("cells.confirm_delete", { code: cell.code }))) return;
    try {
      await api.deleteCell(cell.id);
      load();
    } catch (e) {
      window.alert(t("common.error_prefix", { message: e.message }));
    }
  };

  // Suy ra Diện của 1 node bất kỳ bằng cách truy ngược lên gốc
  const custodyOf = (node) => {
    let cur = node;
    const seen = new Set();
    while (cur && !seen.has(cur.code)) {
      if (cur.custody_type) return cur.custody_type;
      seen.add(cur.code);
      cur = cells.find((c) => c.code === cur.parent);
    }
    return null;
  };

  const levelLabel = (lv) =>
    lv === "facility" ? t("cells.level.facility")
      : lv === "sub_camp" ? t("cells.level.sub_camp")
      : t("cells.level.cell");
  const custodyLabel = (ct) =>
    ct === "tam_giam" ? t("detainee.custody_type.detention")
      : ct === "tam_giu" ? t("detainee.custody_type.temporary_hold") : "—";

  // Lấy toàn bộ mã buồng con cháu của 1 node
  const getCellDescendantCodes = (node, allList = cells) => {
    if (!node) return [];
    if (node.level === "cell") return [node.code];
    if (node.level === "sub_camp") {
      return allList.filter((c) => c.level === "cell" && c.parent === node.code).map((c) => c.code);
    }
    if (node.level === "facility") {
      const direct = allList.filter((c) => c.level === "cell" && c.parent === node.code).map((c) => c.code);
      const subCampCodes = new Set(allList.filter((s) => s.level === "sub_camp" && s.parent === node.code).map((s) => s.code));
      const subCells = allList.filter((c) => c.level === "cell" && subCampCodes.has(c.parent)).map((c) => c.code);
      return [...direct, ...subCells];
    }
    return [];
  };

  // Tính tổng sức chứa và số lượng hiện tại cho node
  const getRollupStats = (node, allList = cells) => {
    if (node.level === "cell") {
      return {
        capacity: node.capacity != null && !isNaN(Number(node.capacity)) ? Number(node.capacity) : null,
        current: node.current || 0,
      };
    }
    const descendantCodes = new Set(getCellDescendantCodes(node, allList));
    const descendantCells = allList.filter((c) => c.level === "cell" && descendantCodes.has(c.code));
    const current = descendantCells.reduce((sum, c) => sum + (c.current || 0), 0);
    const caps = descendantCells.filter((c) => c.capacity != null && !isNaN(Number(c.capacity)) && Number(c.capacity) > 0);
    const capacity = caps.length ? caps.reduce((sum, c) => sum + Number(c.capacity), 0) : (node.capacity ?? null);
    return { capacity, current };
  };

  // Danh sách phẳng theo thứ tự cây: facility → sub_camp → cell
  //
  // Ba trường chỉ để VẼ đường nối, không phải dữ liệu:
  //   isLast  — con cuối của cha, nên nhánh là `└` thay vì `├`
  //   guides  — mỗi phần tử là một cột tổ tiên; true = tổ tiên đó CÒN em phía
  //             dưới nên phải kẻ đường dọc xuyên qua cột ấy
  //   hasKids — dòng này có con ngay dưới, nên phải kẻ tiếp đoạn dọc từ ô cấp
  //             xuống hết dòng. Thiếu nó thì đoạn dọc của dòng con bắt đầu lơ
  //             lửng ở mép dòng, không dính vào cha.
  const orderedRows = [];
  cells.filter((c) => c.level === "facility").forEach((f) => {
    const fStats = getRollupStats(f);

    const subCamps = cells.filter((s) => s.level === "sub_camp" && s.parent === f.code);
    // Buồng gắn trực tiếp facility (Nhà tạm giữ) được đẩy SAU các phân trại, nên
    // "con cuối của facility" phải tính trên tổng hai nhóm — nếu chỉ xét trong
    // từng nhóm thì có hai nhánh `└` trong cùng một cấp.
    const directCells = cells.filter((r) => r.level === "cell" && r.parent === f.code);
    const childCount = subCamps.length + directCells.length;

    orderedRows.push({
      ...f, ...fStats, depth: 0, guides: [], isLast: true, hasKids: childCount > 0,
    });

    subCamps.forEach((s, si) => {
      const sStats = getRollupStats(s);
      const sLast = si === childCount - 1;
      const kids = cells.filter((r) => r.level === "cell" && r.parent === s.code);
      orderedRows.push({
        ...s, ...sStats, depth: 1, guides: [], isLast: sLast, hasKids: kids.length > 0,
      });

      kids.forEach((r, ri) => {
        const rStats = getRollupStats(r);
        orderedRows.push({
          ...r,
          ...rStats,
          depth: 2,
          guides: [!sLast],
          isLast: ri === kids.length - 1,
          hasKids: false,
        });
      });
    });

    directCells.forEach((r, ri) => {
      const rStats = getRollupStats(r);
      orderedRows.push({
        ...r,
        ...rStats,
        depth: 1,
        guides: [],
        isLast: subCamps.length + ri === childCount - 1,
        hasKids: false,
      });
    });
  });

  const filtered = orderedRows.filter((row) => {
    if (filterLevel && row.level !== filterLevel) return false;
    if (filterCustody && custodyOf(row) !== filterCustody) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Tổng % = 100 cho `table-layout: fixed`.
  const columns = [
    {
      key: "code",
      label: t("cells.col.code"),
      width: "13%",
      className: "dh-cell-mono",
      // Cây vẽ bằng các ô có border (trước đây là ký tự `└` + khoảng trắng
      // full-width): đường nối liền mạch, thụt đều, và không bị ellipsis của
      // bảng cắt mất phần thụt.
      //
      // Khi đang lọc theo cấp thì cha bị ẩn, đường nối sẽ trỏ vào dòng không có
      // → bỏ cây, vẽ phẳng. Thà không có đường nối còn hơn đường nối sai.
      render: (row) => (filterLevel ? (
        <span className="cells-tree">
          <span className="cells-tree__mark" data-level={row.level} aria-hidden="true" />
          <span className="cells-tree__code" data-level={row.level}>{row.code}</span>
        </span>
      ) : (
        <span className="cells-tree">
          {row.guides.map((on, i) => (
            <span
              key={`g-${i}`}
              className="cells-tree__guide"
              data-line={on ? "on" : "off"}
              aria-hidden="true"
            />
          ))}
          {row.depth > 0 && (
            <span
              className="cells-tree__branch"
              data-last={row.isLast ? "yes" : "no"}
              aria-hidden="true"
            />
          )}
          <span
            className="cells-tree__mark"
            data-level={row.level}
            data-kids={row.hasKids ? "yes" : "no"}
            aria-hidden="true"
          />
          <span className="cells-tree__code" data-level={row.level}>{row.code}</span>
        </span>
      )),
    },
    {
      key: "name",
      label: t("cells.col.name"),
      width: "17%",
      render: (row) => (row.level === "facility" ? <strong>{row.name}</strong> : row.name),
    },
    {
      key: "level",
      label: t("cells.col.level"),
      width: "11%",
      render: (row) => <span className="badge-level">{levelLabel(row.level)}</span>,
    },
    {
      key: "custody",
      label: t("detainee.field.custody_type"),
      width: "13%",
      render: (row) => (row.level === "facility"
        ? <strong>{custodyLabel(custodyOf(row))}</strong>
        : custodyLabel(custodyOf(row))),
    },
    {
      key: "capacity",
      label: t("cells.col.capacity"),
      width: "8%",
      align: "center",
      render: (row) => row.capacity || "—",
    },
    {
      key: "current",
      label: t("cells.col.current"),
      width: "8%",
      align: "center",
      render: (row) => (
        <strong className={row.current > 0 ? "dh-cell-hot" : undefined}>{row.current || 0}</strong>
      ),
    },
    {
      key: "note",
      label: t("cells.col.note"),
      width: "12%",
      className: "dh-cell-dim",
      render: (row) => ((row.note && row.note.trim() !== "-")
        ? row.note
        : (row.parent ? (cells.find((c) => c.code === row.parent)?.name || row.name) : row.name)),
    },
    {
      key: "actions",
      label: t("cells.col.actions"),
      width: "18%",
      align: "right",
      render: (row) => (
        <span className="dh-rowbtns">
          <button type="button" className="dh-rowbtn" onClick={() => setViewingCell(row)}>
            {t("cells.view_detainees")}
          </button>
          <button type="button" className="dh-rowbtn" onClick={() => { setEditing(row); setShowForm(true); }}>
            {t("common.edit")}
          </button>
          <button type="button" className="dh-rowbtn is-danger" onClick={() => deleteCell(row)}>
            {t("common.delete")}
          </button>
        </span>
      ),
    },
  ];
  return (
    <div className="page dh-page">
      <DashPageHeader title={t("cells.title")} subtitle={t("cells.subtitle", { n: cells.length })}>
        <button
          type="button"
          className="dh-filter__submit"
          onClick={() => { setEditing(null); setShowForm(true); }}
        >
          {t("cells.add")}
        </button>
      </DashPageHeader>

      {/* Không truyền `onChange` → DashFilterBar bỏ ô tìm kiếm: màn này chỉ lọc
          bằng hai select, cả hai lọc ở client nên không cần nút submit. */}
      <DashFilterBar>
        <DashFilterSelect
          label={t("detainee.field.custody_type")}
          value={filterCustody}
          onChange={setFilterCustody}
          options={[
            { value: "", label: t("common.all") },
            { value: "tam_giam", label: t("detainee.custody_type.detention") },
            { value: "tam_giu", label: t("detainee.custody_type.temporary_hold") },
          ]}
        />
        <DashFilterSelect
          label={t("cells.col.level")}
          value={filterLevel}
          onChange={setFilterLevel}
          options={[
            { value: "", label: t("common.all") },
            { value: "facility", label: t("cells.level.facility") },
            { value: "sub_camp", label: t("cells.level.sub_camp") },
            { value: "cell", label: t("cells.level.cell") },
          ]}
        />
      </DashFilterBar>

      <DashDataTable
        columns={columns}
        rows={paged}
        rowKey={(row) => row.code}
        rowClassName={(row) => (row.level === "facility" ? "row-facility"
          : row.level === "sub_camp" ? "row-subcamp" : "row-cell")}
        loading={loading}
        error={error}
        empty={t("common.empty")}
        pager={{
          page,
          totalPages,
          total: filtered.length,
          onPrev: () => setPage((p) => Math.max(1, p - 1)),
          onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
        }}
      />

      {showForm && (
        <CellForm
          initial={editing}
          allCells={cells}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }}
        />
      )}

      {viewingCell && (
        <CellDetaineesModal
          cell={viewingCell}
          allCells={cells}
          onClose={() => setViewingCell(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function CellDetaineesModal({ cell, allCells, onClose, onChanged }) {
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeOk, setNoticeOk] = useState(false);
  const [transferring, setTransferring] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const descCodes = (() => {
        if (!cell) return [];
        if (cell.level === "cell") return [cell.code];
        if (cell.level === "sub_camp") {
          return allCells.filter((c) => c.level === "cell" && c.parent === cell.code).map((c) => c.code);
        }
        if (cell.level === "facility") {
          const direct = allCells.filter((c) => c.level === "cell" && c.parent === cell.code).map((c) => c.code);
          const subCampCodes = new Set(allCells.filter((s) => s.level === "sub_camp" && s.parent === cell.code).map((s) => s.code));
          const subCells = allCells.filter((c) => c.level === "cell" && subCampCodes.has(c.parent)).map((c) => c.code);
          return [...direct, ...subCells];
        }
        return [cell.code];
      })();

      const codeParam = descCodes.length ? descCodes.join(",") : cell.code;
      const params = new URLSearchParams({ cell_code: codeParam, limit: "200" });
      const res = await api.request(`/api/detainees?${params}`);
      setItems(res.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [cell.code]);

  const doTransfer = async (item, newCode) => {
    if (newCode === item.cell_code) return;
    const target = newCode || t("cells.transfer.target_empty");
    if (!window.confirm(t("cells.transfer.confirm", { name: item.full_name, target }))) return;
    setTransferring(item.id);
    try {
      await api.transferDetainee(item.id, newCode);
      setNotice(t("cells.transfer.done", { name: item.full_name }));
      setNoticeOk(true);
      load();
      onChanged && onChanged();
    } catch (e) {
      setNotice(t("common.error_prefix", { message: e.message }));
      setNoticeOk(false);
    } finally {
      setTransferring(null);
    }
  };

  const targetCells = allCells.filter((c) => c.level === "cell");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t("cells.transfer.title", { code: cell.code, name: cell.name })}</h3>
          <button onClick={onClose}>×</button>
        </div>

        {/* Vùng cuộn phải là khối NÀY, không phải cả `.modal`. `.modal` ở
            styles.css:2026 có `max-height: calc(100vh - 2.5rem)` + `overflow-y: auto`
            nên mặc định cả hộp thoại cuộn — kéo bảng 23 hàng là tiêu đề và nút ×
            trượt mất, `<thead>` cũng trượt nên mất tên cột. Cần class để CSS biến
            khối này thành vùng cuộn riêng, nên không dùng inline style nữa. */}
        <div className="cells-detainees-body">
          {notice && <div className={noticeOk ? "success-box" : "error-box"}>{notice}</div>}
          {error && <StateBox type="error">{error}</StateBox>}

          {loading ? (
            <StateBox>{t("common.loading")}</StateBox>
          ) : !items.length ? (
            <StateBox>{t("cells.transfer.empty")}</StateBox>
          ) : (
            <table className="cells-detainees-table">
              {/* colgroup + table-layout:fixed (CSS) là cách chặn tràn ngang ở đây.
                  Cột cuối chứa select, mà bề rộng nội tại của select bị kéo theo
                  option DÀI NHẤT ("B101 - Buồng 101 (3/20)"), nên với table-layout
                  mặc định (auto) bảng phình ra 944px trong khung 903px → cuộn ngang
                  và cột cuối bị cắt. Layout fixed bỏ qua bề rộng nội tại, các cột
                  ăn đúng tỉ lệ dưới đây. */}
              <colgroup>
                <col style={{ width: "16%" }} />
                <col />
                <col style={{ width: "10%" }} />
                {cell.level !== "cell" && <col style={{ width: "13%" }} />}
                <col style={{ width: "30%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>{t("cells.transfer.col.code")}</th>
                  <th>{t("cells.transfer.col.name")}</th>
                  <th>{t("cells.transfer.col.gender")}</th>
                  {cell.level !== "cell" && <th>{t("cells.level.cell")}</th>}
                  <th>{t("cells.transfer.col.action")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.personal_id || item.code}</strong></td>
                    <td>{item.full_name}</td>
                    <td>{item.gender === "female" ? t("common.female") : t("common.male")}</td>
                    {cell.level !== "cell" && <td><span className="mono">{item.cell_code || "—"}</span></td>}
                    <td>
                      <select
                        className="control"
                        defaultValue=""
                        disabled={transferring === item.id}
                        onChange={(e) => {
                          const v = e.target.value;
                          e.target.value = "";
                          if (v !== "") doTransfer(item, v);
                        }}
                      >
                        <option value="">{t("cells.transfer.select")}</option>
                        {targetCells.filter((c) => c.code !== item.cell_code).map((c) => (
                          <option key={c.code} value={c.code}>
                            {t("cells.transfer.opt", { code: c.code, name: c.name, current: c.current, capacity: c.capacity })}
                          </option>
                        ))}
                        <option value="">{t("cells.transfer.remove")}</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export function CellForm({ initial, allCells = [], onClose, onSaved }) {
  const { t } = useI18n();
  const [name, setName] = useState(initial?.name || "");
  const [level, setLevel] = useState(initial?.level || "facility");
  const [custodyType, setCustodyType] = useState(initial?.custody_type || "tam_giam");
  // parent cho sub_camp = facility; cho cell = phân trại (hoặc facility nếu tạm giữ)
  const [facilityParent, setFacilityParent] = useState(initial?.parent || "");
  const [subCampParent, setSubCampParent] = useState("");
  const [capacity, setCapacity] = useState(initial?.capacity ?? 20);
  const [note, setNote] = useState(initial?.note || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Khôi phục sub_camp_parent khi edit một cell
  useEffect(() => {
    if (initial && initial.level === "cell" && initial.parent) {
      const parentNode = allCells.find((c) => c.code === initial.parent);
      if (parentNode?.level === "sub_camp") {
        setFacilityParent(parentNode.parent || "");
        setSubCampParent(parentNode.code);
      } else {
        // cha là facility (Nhà tạm giữ)
        setFacilityParent(initial.parent);
        setSubCampParent("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Khi đổi level → reset lựa chọn cha
  useEffect(() => {
    if (level === "facility") {
      setFacilityParent("");
      setSubCampParent("");
    }
  }, [level]);

  // Danh sách cơ sở theo Diện đã chọn (cho sub_camp & cell)
  const facilitiesByCustody = allCells.filter(
    (c) => c.level === "facility" && (!custodyType || c.custody_type === custodyType)
  );
  // Phân trại thuộc cơ sở đã chọn
  const subCampsOfFacility = allCells.filter(
    (c) => c.level === "sub_camp" && c.parent === facilityParent
  );

  // parent cuối cùng gửi backend
  const resolvedParent = (() => {
    if (level === "facility") return null;
    if (level === "sub_camp") return facilityParent || null;
    // cell: ưu tiên phân trại, nếu không có (Nhà tạm giữ) thì lấy facility
    return subCampParent || facilityParent || null;
  })();

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        code: "",                          // tự sinh backend
        name: name.trim(),
        capacity: Number(capacity),
        note,
        level,
        parent: resolvedParent,
        custody_type: level === "facility" ? custodyType : null,
      };
      if (initial) await api.updateCell(initial.id, payload);
      else await api.createCell(payload);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const LEVELS = [
    { key: "facility", labelKey: "cells.level.facility", descKey: "cells.form.level_desc.facility", icon: "🏛" },
    { key: "sub_camp", labelKey: "cells.level.sub_camp", descKey: "cells.form.level_desc.sub_camp", icon: "🏢" },
    { key: "cell", labelKey: "cells.level.cell", descKey: "cells.form.level_desc.cell", icon: "🚪" },
  ];

  // Breadcrumb đường dẫn cây (hiển thị ngữ cảnh)
  const facilityName = allCells.find((c) => c.code === facilityParent)?.name;
  const subCampName = allCells.find((c) => c.code === subCampParent)?.name;
  const crumbs = [];
  if (level === "facility") {
    crumbs.push(custodyType === "tam_giam" ? t("detainee.custody_type.detention") : t("detainee.custody_type.temporary_hold"));
    crumbs.push(name || t("cells.level.facility"));
  } else {
    crumbs.push(facilityName || t("cells.level.facility"));
    if (level === "sub_camp") crumbs.push(name || t("cells.level.sub_camp"));
    if (level === "cell") {
      if (subCampName) crumbs.push(subCampName);
      crumbs.push(name || t("cells.level.cell"));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cells-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{initial ? t("cells.form.title.edit") : t("cells.form.title.new")}</h3>
          <button onClick={onClose}>×</button>
        </div>

        <form className="form cells-form" onSubmit={submit}>
          {error && <div className="error-box">{error}</div>}

          {/* Breadcrumb ngữ cảnh cây */}
          <div className="cells-breadcrumb">
            {crumbs.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="cells-breadcrumb-sep">›</span>}
                <span className={"cells-breadcrumb-item" + (i === crumbs.length - 1 ? " current" : "")}>{c}</span>
              </Fragment>
            ))}
          </div>

          {/* Chọn cấp bằng card */}
          <div className="cells-field-label">{t("cells.form.level")}</div>
          <div className="cells-level-picker">
            {LEVELS.map((lv) => (
              <button
                type="button"
                key={lv.key}
                className={"cells-level-card" + (level === lv.key ? " active" : "")}
                onClick={() => !initial && setLevel(lv.key)}
                disabled={!!initial && level !== lv.key}
              >
                <span className="cells-level-icon">{lv.icon}</span>
                <span className="cells-level-name">{t(lv.labelKey)}</span>
                <span className="cells-level-desc">{t(lv.descKey)}</span>
              </button>
            ))}
          </div>

          {/* VUNG GIU CHO: khoi "Dien" va khoi "Chon cha" dung CHUNG mot vung cao
              co dinh (.cells-context-slot). Hai khoi loai tru nhau san (facility vs
              !facility) nen khong bao gio hien cung luc => cho chung mot cho la du,
              khong phai cong don chieu cao. Truoc day hai khoi nam thang trong form:
              bam doi cap thi mot khoi bien mat, khoi kia chen vao, moi thu ben duoi
              nhay len roi tut xuong. */}
          <div className="cells-context-slot">
          {/* Diện — chỉ khi tạo cơ sở */}
          {level === "facility" && (
            <>
              <div className="cells-field-label">{t("detainee.field.custody_type")}</div>
              <div className="cells-segment">
                <button
                  type="button"
                  className={"cells-segment-btn" + (custodyType === "tam_giam" ? " active" : "")}
                  onClick={() => !initial && setCustodyType("tam_giam")}
                  disabled={!!initial}
                >
                  {t("detainee.custody_type.detention")}
                </button>
                <button
                  type="button"
                  className={"cells-segment-btn" + (custodyType === "tam_giu" ? " active" : "")}
                  onClick={() => !initial && setCustodyType("tam_giu")}
                  disabled={!!initial}
                >
                  {t("detainee.custody_type.temporary_hold")}
                </button>
              </div>
            </>
          )}

          {/* Chọn cha */}
          {level !== "facility" && (
            <div className="cells-row-2">
              <div className="cells-field">
                <label className="cells-field-label">{t("cells.form.facility_parent")}</label>
                <select
                  className="control"
                  value={facilityParent}
                  onChange={(e) => { setFacilityParent(e.target.value); setSubCampParent(""); }}
                  required
                  disabled={!!initial}
                >
                  <option value="">{t("cells.form.select_facility")}</option>
                  {facilitiesByCustody.map((p) => (
                    <option key={p.code} value={p.code}>{p.name}</option>
                  ))}
                </select>
              </div>
              {/* O Phan trai LUON render khi cap = Buong, chi disable khi co so chua
                  chon / khong co phan trai (Nha tam giu). Truoc day dieu kien la
                  `subCampsOfFacility.length > 0`, nghia la o nay MOC RA giua luc dang
                  dien: chon mot co so co phan trai la tu dung hien thêm mot o, day
                  Ten / Suc chua / Ghi chu tut xuong. Giu cho san thi chieu cao khong doi. */}
              {level === "cell" && (
                <div className="cells-field">
                  <label className="cells-field-label">{t("cells.form.sub_camp_parent")}</label>
                  <select
                    className="control"
                    value={subCampParent}
                    onChange={(e) => setSubCampParent(e.target.value)}
                    disabled={!!initial || subCampsOfFacility.length === 0}
                  >
                    <option value="">{t("cells.form.no_sub_camp")}</option>
                    {subCampsOfFacility.map((p) => (
                      <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          </div>{/* /.cells-context-slot */}

          {/* Tên + sức chứa */}
          <div className="cells-row-2">
            <div className="cells-field">
              <label className="cells-field-label">{t("cells.form.name")}</label>
              <input className="control" value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder={t("cells.form.name_ph")} />
            </div>
            {level === "cell" && (
              <div className="cells-field cells-field-narrow">
                <label className="cells-field-label">{t("cells.form.capacity")}</label>
                <input className="control" type="number" min="0" max="500" value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
              </div>
            )}
          </div>

          <div className="cells-field">
            <label className="cells-field-label">{t("cells.form.note")}</label>
            <input className="control" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("cells.form.note_ph")} />
          </div>

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose}>{t("common.cancel")}</button>
            <button type="submit" className="button primary" disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


export default CellsPage;
