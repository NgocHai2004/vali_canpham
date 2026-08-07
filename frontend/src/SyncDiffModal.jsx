import { useMemo, useState } from "react";

const FIELD_LABELS = {
  full_name: "Họ tên",
  gender: "Giới tính",
  dob: "Ngày sinh",
  cccd_number: "Số CCCD",
  issued_date: "Ngày cấp CCCD",
  expiry_date: "Hạn CCCD",
  ethnicity: "Dân tộc",
  religion: "Tôn giáo",
  nationality: "Quốc tịch",
  hometown: "Nguyên quán",
  address: "Địa chỉ",
  cell_code: "Buồng giam",
  search_index: "Chỉ mục tìm kiếm",
  height_cm: "Chiều cao",
  weight_kg: "Cân nặng",
  charge: "Tội danh",
  cccd_front: "Ảnh CCCD mặt trước",
  cccd_back: "Ảnh CCCD mặt sau",
  portrait_front: "Ảnh chân dung",
  portrait_left: "Ảnh góc trái",
  portrait_right: "Ảnh góc phải",
  fp_l1: "Vân tay T1",
  fp_l2: "Vân tay T2",
  fp_l3: "Vân tay T3",
  fp_l4: "Vân tay T4",
  fp_l5: "Vân tay T5",
  fp_r1: "Vân tay P1",
  fp_r2: "Vân tay P2",
  fp_r3: "Vân tay P3",
  fp_r4: "Vân tay P4",
  fp_r5: "Vân tay P5",
  iris_left: "Mống mắt trái",
  iris_right: "Mống mắt phải",
};

const PHOTO_FIELDS = [
  "cccd_front", "cccd_back",
  "portrait_front", "portrait_left", "portrait_right",
  "fp_l1", "fp_l2", "fp_l3", "fp_l4", "fp_l5",
  "fp_r1", "fp_r2", "fp_r3", "fp_r4", "fp_r5",
  "iris_left", "iris_right",
];

const META_FIELDS = [
  "full_name", "gender", "dob", "cccd_number",
  "issued_date", "expiry_date",
  "ethnicity", "religion", "nationality",
  "hometown", "address", "cell_code", "search_index",
  "height_cm", "weight_kg", "charge",
];

function normCccd(v) {
  return String(v || "").trim().replace(/\s+/g, "");
}

function normGender(v) {
  if (!v) return "";
  const s = String(v).toLowerCase();
  if (s === "nam" || s === "male" || s === "m") return "male";
  if (s === "nữ" || s === "nu" || s === "female" || s === "f") return "female";
  return s;
}

function normDate(v) {
  if (!v) return "";
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v).trim();
    return d.toISOString().slice(0, 10);
  } catch {
    return String(v).trim();
  }
}

function normNumber(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

function localToComparable(d) {
  const p = d.photos || {};
  const out = {
    full_name: String(d.full_name || "").trim(),
    gender: normGender(d.gender),
    dob: normDate(d.dob),
    cccd_number: normCccd(d.cccd_number),
    issued_date: normDate(d.issued_date),
    expiry_date: normDate(d.expiry_date),
    ethnicity: String(d.ethnicity || "").trim(),
    religion: String(d.religion || "").trim(),
    nationality: String(d.nationality || "").trim(),
    hometown: String(d.hometown || "").trim(),
    address: String(d.address || "").trim(),
    cell_code: String(d.cell_code || "").trim(),
    search_index: String(d.search_index || "").trim(),
    height_cm: normNumber(d.height_cm),
    weight_kg: normNumber(d.weight_kg),
    charge: String(d.charge || "").trim(),
  };
  PHOTO_FIELDS.forEach((k) => { out[k] = String(p[k] || d[k] || "").trim(); });
  return out;
}

function remoteToComparable(r) {
  const p = r.photos || {};
  const out = {
    full_name: String(r.hoTen || "").trim(),
    gender: normGender(r.gioiTinh),
    dob: normDate(r.ngaySinh),
    cccd_number: normCccd(r.soCCCD),
    issued_date: normDate(r.ngayCapCCCD),
    expiry_date: normDate(r.ngayHetHanCCCD),
    ethnicity: String(r.danToc || "").trim(),
    religion: String(r.tonGiao || "").trim(),
    nationality: String(r.quocTich || "").trim(),
    hometown: String(r.nguyenQuan || "").trim(),
    address: String(r.noiDKThuongTru || "").trim(),
    cell_code: String(r.buongGiam || "").trim(),
    search_index: String(r.chiMucTimKiem || r.searchIndex || "").trim(),
    height_cm: normNumber(r.chieuCao),
    weight_kg: normNumber(r.canNang),
    charge: String(r.toiDanh || "").trim(),
  };
  PHOTO_FIELDS.forEach((k) => { out[k] = String(p[k] || "").trim(); });
  return out;
}

function diffFields(localComp, remoteComp) {
  const diffs = [];
  [...META_FIELDS, ...PHOTO_FIELDS].forEach((k) => {
    const a = localComp[k] ?? "";
    const b = remoteComp[k] ?? "";
    if (a !== b) diffs.push(k);
  });
  return diffs;
}

export function buildSyncDiff(localDetainees, remoteList) {
  const remoteMap = new Map();
  for (const r of remoteList || []) {
    const cccd = normCccd(r.soCCCD);
    if (cccd) remoteMap.set(cccd, r);
  }

  const toAdd = [];
  const toUpdate = [];
  const duplicates = [];

  for (const d of localDetainees || []) {
    const localComp = localToComparable(d);
    const cccd = localComp.cccd_number;
    const summary = {
      id: d.id,
      code: d.code || d.personal_id || "",
      full_name: d.full_name || "",
      cccd_number: cccd,
      cell_code: d.cell_code || "",
    };

    if (!cccd || !remoteMap.has(cccd)) {
      toAdd.push({ ...summary, local: d });
      continue;
    }

    const remote = remoteMap.get(cccd);
    const remoteComp = remoteToComparable(remote);
    const diffs = diffFields(localComp, remoteComp);

    if (diffs.length === 0) {
      duplicates.push({ ...summary, remoteId: remote._id });
    } else {
      toUpdate.push({
        ...summary,
        local: d,
        remoteId: remote._id,
        diffFields: diffs,
      });
    }
  }

  return { toAdd, toUpdate, duplicates };
}

export default function SyncDiffModal({ session, diff, loading, onConfirm, onCancel }) {
  const [addSel, setAddSel] = useState(() => new Set());
  const [updSel, setUpdSel] = useState(() => new Set());
  const [expandedId, setExpandedId] = useState(null);

  useMemo(() => {
    setAddSel(new Set((diff?.toAdd || []).map((x) => x.id)));
    setUpdSel(new Set((diff?.toUpdate || []).map((x) => x.id)));
  }, [diff]);

  const toggle = (set, setter, id) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };
  const toggleGroup = (items, set, setter, allChecked) => {
    if (allChecked) setter(new Set());
    else setter(new Set(items.map((x) => x.id)));
  };

  const addAllChecked = diff?.toAdd?.length > 0 && diff.toAdd.every((x) => addSel.has(x.id));
  const updAllChecked = diff?.toUpdate?.length > 0 && diff.toUpdate.every((x) => updSel.has(x.id));

  const selectedCount = addSel.size + updSel.size;
  const totalAdd = diff?.toAdd?.length || 0;
  const totalUpd = diff?.toUpdate?.length || 0;
  const totalDup = diff?.duplicates?.length || 0;

  const submit = () => {
    const targets = [
      ...diff.toAdd.filter((x) => addSel.has(x.id)),
      ...diff.toUpdate.filter((x) => updSel.has(x.id)),
    ];
    onConfirm(targets);
  };

  const rowLine = (x) => `${x.code || x.cccd_number || "—"} • ${x.full_name || "—"} • CCCD: ${x.cccd_number || "(trống)"}`;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal sync-diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>So sánh trước khi đồng bộ</h3>
          <button className="close-x" onClick={onCancel}>×</button>
        </div>

        <div className="sync-diff-sub">
          Phiên <strong className="mono">{session?.code}</strong> • {session?.detainee_count || 0} hồ sơ trong phiên
        </div>

        {loading ? (
          <div className="sync-diff-loading">Đang tải dữ liệu so sánh...</div>
        ) : (
          <>
            <div className="sync-diff-summary">
              <span className="sd-sum add">🟢 Thêm mới: {totalAdd}</span>
              <span className="sd-sum upd">🟡 Cập nhật: {totalUpd}</span>
              <span className="sd-sum dup">⚪ Trùng (bỏ qua): {totalDup}</span>
            </div>

            <div className="sync-diff-body">
              {totalAdd === 0 && totalUpd === 0 && totalDup === 0 && (
                <div className="sync-diff-empty">Không có dữ liệu để so sánh.</div>
              )}

              {totalAdd > 0 && (
                <section className="sd-group">
                  <div className="sd-group-head">
                    <label className="sd-checkall">
                      <input
                        type="checkbox"
                        checked={addAllChecked}
                        onChange={() => toggleGroup(diff.toAdd, addSel, setAddSel, addAllChecked)}
                      />
                      <span>🟢 Thêm mới ({totalAdd})</span>
                    </label>
                  </div>
                  <div className="sd-list">
                    {diff.toAdd.map((x) => (
                      <label key={x.id} className="sd-row">
                        <input
                          type="checkbox"
                          checked={addSel.has(x.id)}
                          onChange={() => toggle(addSel, setAddSel, x.id)}
                        />
                        <span className="sd-row-line">{rowLine(x)}</span>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {totalUpd > 0 && (
                <section className="sd-group">
                  <div className="sd-group-head">
                    <label className="sd-checkall">
                      <input
                        type="checkbox"
                        checked={updAllChecked}
                        onChange={() => toggleGroup(diff.toUpdate, updSel, setUpdSel, updAllChecked)}
                      />
                      <span>🟡 Cập nhật ({totalUpd})</span>
                    </label>
                  </div>
                  <div className="sd-list">
                    {diff.toUpdate.map((x) => (
                      <div key={x.id} className="sd-row sd-row-upd">
                        <label className="sd-row-main">
                          <input
                            type="checkbox"
                            checked={updSel.has(x.id)}
                            onChange={() => toggle(updSel, setUpdSel, x.id)}
                          />
                          <span className="sd-row-line">{rowLine(x)}</span>
                          <button
                            type="button"
                            className="sd-diff-toggle"
                            onClick={() => setExpandedId(expandedId === x.id ? null : x.id)}
                          >
                            {expandedId === x.id ? "Ẩn diff" : `Khác ${x.diffFields.length} trường`}
                          </button>
                        </label>
                        {expandedId === x.id && (
                          <div className="sd-diff-list">
                            {x.diffFields.map((f) => (
                              <div key={f} className="sd-diff-field">
                                <span className="sd-diff-label">{FIELD_LABELS[f] || f}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {totalDup > 0 && (
                <section className="sd-group sd-group-dup">
                  <div className="sd-group-head">
                    <span>⚪ Trùng (bỏ qua) ({totalDup})</span>
                  </div>
                  <div className="sd-list">
                    {diff.duplicates.map((x) => (
                      <div key={x.id} className="sd-row sd-row-dup">
                        <span className="sd-row-line">{rowLine(x)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="sync-diff-actions">
              <button type="button" className="btn-secondary" onClick={onCancel}>Huỷ</button>
              <button
                type="button"
                className="btn-primary"
                disabled={selectedCount === 0}
                onClick={submit}
              >
                Đồng bộ {selectedCount > 0 ? `${selectedCount} hồ sơ` : ""}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
