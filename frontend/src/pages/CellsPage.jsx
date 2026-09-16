import React, { useState, useEffect, Fragment } from "react";
import api from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icons";
import { PageHeader, StateBox } from "../components/CommonUI";
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

  // Danh sách phẳng theo thứ tự cây: facility → sub_camp → cell
  const orderedRows = [];
  cells.filter((c) => c.level === "facility").forEach((f) => {
    orderedRows.push({ ...f, depth: 0 });
    cells.filter((s) => s.level === "sub_camp" && s.parent === f.code).forEach((s) => {
      orderedRows.push({ ...s, depth: 1 });
      cells.filter((r) => r.level === "cell" && r.parent === s.code).forEach((r) => orderedRows.push({ ...r, depth: 2 }));
    });
    // Buồng gắn trực tiếp facility (Nhà tạm giữ)
    cells.filter((r) => r.level === "cell" && r.parent === f.code).forEach((r) => orderedRows.push({ ...r, depth: 1 }));
  });

  const filtered = orderedRows.filter((row) => {
    if (filterLevel && row.level !== filterLevel) return false;
    if (filterCustody && custodyOf(row) !== filterCustody) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="page">
      <PageHeader title={t("cells.title")} subtitle={t("cells.subtitle", { n: cells.length })}>
        <button
          className="button primary"
          onClick={() => { setEditing(null); setShowForm(true); }}
        >
          {Icon.plus}
          {t("cells.add")}
        </button>
      </PageHeader>

      {error && <StateBox type="error">{error}</StateBox>}

      {/* Bộ lọc: Diện + Cấp */}
      <div className="cells-filter">
        <div className="filter-item">
          <label className="control-label">{t("detainee.field.custody_type")}</label>
          <select className="control" value={filterCustody} onChange={(e) => setFilterCustody(e.target.value)}>
            <option value="">{t("common.all")}</option>
            <option value="tam_giam">{t("detainee.custody_type.detention")}</option>
            <option value="tam_giu">{t("detainee.custody_type.temporary_hold")}</option>
          </select>
        </div>
        <div className="filter-item">
          <label className="control-label">{t("cells.col.level")}</label>
          <select className="control" value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}>
            <option value="">{t("common.all")}</option>
            <option value="facility">{t("cells.level.facility")}</option>
            <option value="sub_camp">{t("cells.level.sub_camp")}</option>
            <option value="cell">{t("cells.level.cell")}</option>
          </select>
        </div>
      </div>

      <div className="table-card detainees-table-wrap">
        {loading ? (
          <StateBox>{t("common.loading")}</StateBox>
        ) : !filtered.length ? (
          <StateBox>{t("common.empty")}</StateBox>
        ) : (
          <table className="cells-table">
            <thead>
              <tr>
                <th style={{ width: "13%" }}>{t("cells.col.code")}</th>
                <th style={{ width: "17%" }}>{t("cells.col.name")}</th>
                <th style={{ width: "11%" }}>{t("cells.col.level")}</th>
                <th style={{ width: "12%" }}>{t("detainee.field.custody_type")}</th>
                <th style={{ width: "8%", textAlign: "center" }}>{t("cells.col.capacity")}</th>
                <th style={{ width: "8%", textAlign: "center" }}>{t("cells.col.current")}</th>
                <th style={{ width: "13%" }}>{t("cells.col.note")}</th>
                <th style={{ width: "18%", textAlign: "right" }}>{t("cells.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((row) => {
                const rowClass = row.level === "facility" ? "row-facility"
                  : row.level === "sub_camp" ? "row-subcamp" : "row-cell";
                const indent = row.depth === 2 ? "　　└ " : row.depth === 1 ? "└ " : "";
                return (
                  <tr key={row.code} className={rowClass}>
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>
                      {indent}<strong>{row.code}</strong>
                    </td>
                    <td>{row.level === "facility" ? <strong>{row.name}</strong> : row.name}</td>
                    <td><span className="badge-level">{levelLabel(row.level)}</span></td>
                    <td>{row.level === "facility" ? custodyLabel(row.custody_type) : "—"}</td>
                    <td style={{ textAlign: "center" }}>{row.capacity || "—"}</td>
                    <td style={{ textAlign: "center" }}>
                      <strong style={{ color: row.current > 0 ? "var(--primary-hi)" : "inherit" }}>
                        {row.current || 0}
                      </strong>
                    </td>
                    <td style={{ color: "var(--muted)", fontSize: 12 }}>{row.note || "-"}</td>
                    <td style={{ textAlign: "right" }}>
                      <div className="row-actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        <button type="button" onClick={() => setViewingCell(row)}>{t("cells.view_detainees")}</button>
                        <button type="button" onClick={() => { setEditing(row); setShowForm(true); }}>{t("common.edit")}</button>
                        <button type="button" className="danger-text" onClick={() => deleteCell(row)}>{t("common.delete")}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Phân trang */}
      {totalPages > 1 && (
        <div className="pager">
          <button className="button secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            {t("common.prev")}
          </button>
          <span className="pager-info">{t("common.page_of", { page, total: totalPages })}</span>
          <button className="button secondary" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            {t("common.next")}
          </button>
        </div>
      )}

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
      const params = new URLSearchParams({ cell_code: cell.code, limit: "200" });
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

  const otherCells = allCells.filter((c) => c.code !== cell.code);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t("cells.transfer.title", { code: cell.code, name: cell.name })}</h3>
          <button onClick={onClose}>×</button>
        </div>

        <div style={{ padding: "16px 24px" }}>
          {notice && <div className={noticeOk ? "success-box" : "error-box"}>{notice}</div>}
          {error && <StateBox type="error">{error}</StateBox>}

          {loading ? (
            <StateBox>{t("common.loading")}</StateBox>
          ) : !items.length ? (
            <StateBox>{t("cells.transfer.empty")}</StateBox>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("cells.transfer.col.code")}</th>
                  <th>{t("cells.transfer.col.name")}</th>
                  <th>{t("cells.transfer.col.gender")}</th>
                  <th>{t("cells.transfer.col.action")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.personal_id || item.code}</strong></td>
                    <td>{item.full_name}</td>
                    <td>{item.gender === "female" ? t("common.female") : t("common.male")}</td>
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
                        {otherCells.map((c) => (
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
