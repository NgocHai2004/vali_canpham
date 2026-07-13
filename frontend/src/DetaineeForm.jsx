import { useEffect, useState } from "react";
import { api } from "./api";

const emptyForm = {
  full_name: "",
  gender: "male",
  dob: "",
  cccd_number: "",
  hometown: "",
  address: "",
  ethnicity: "",
  religion: "",
  cell_code: "",
  charge: "",
  date_in: "",
  note: "",
  photo_url: "",
};

function isoToDMY(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function DetaineeForm({ initial, cells, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    if (!initial) return { ...emptyForm };
    return {
      ...emptyForm,
      ...initial,
      dob: isoToDMY(initial.dob),
      date_in: isoToDMY(initial.date_in),
    };
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState("");
  const [dupCheck, setDupCheck] = useState(null);
  const [confirmDup, setConfirmDup] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const readCCCD = async () => {
    setReading(true);
    setErr("");
    try {
      const d = await api.mockReadCCCD();
      setForm((f) => ({ ...f, ...d }));
    } catch (e) {
      setErr("Không đọc được CCCD: " + e.message);
    } finally {
      setReading(false);
    }
  };

  const onPhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr("");
    try {
      const { url } = await api.uploadPhoto(file);
      setForm((f) => ({ ...f, photo_url: url }));
    } catch (e) {
      setErr("Upload thất bại: " + e.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");

    if (!confirmDup && !initial) {
      try {
        const r = await api.checkDuplicate({
          full_name: form.full_name,
          gender: form.gender,
          dob: form.dob,
        });
        if (r.count > 0) {
          setDupCheck(r);
          return;
        }
      } catch {
        // bỏ qua lỗi check trùng, cho lưu bình thường
      }
    }

    setSaving(true);
    try {
      if (initial) {
        await api.updateDetainee(initial.id, form);
      } else {
        await api.createDetainee(form);
      }
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{initial ? "Sửa hồ sơ can phạm" : "Thêm hồ sơ can phạm mới"}</h3>
          <button className="close-x" onClick={onClose}>×</button>
        </div>

        <form onSubmit={submit} className="modal-form">
          {err && <div className="err-box">{err}</div>}

          <div className="form-grid">
            <div className="col-photo">
              <div className="photo-preview">
                {form.photo_url ? (
                  <img src={form.photo_url} alt="Ảnh can phạm" />
                ) : (
                  <div className="photo-empty">Chưa có ảnh</div>
                )}
              </div>
              <label className="btn-ghost photo-upload">
                {uploading ? "Đang upload..." : "📷 Tải ảnh lên"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={onPhotoChange}
                  style={{ display: "none" }}
                  disabled={uploading}
                />
              </label>
              {!initial && (
                <button
                  type="button"
                  className="btn-cccd-reader"
                  onClick={readCCCD}
                  disabled={reading}
                  title="Giả lập máy đọc CCCD - tự điền dữ liệu mẫu"
                >
                  {reading ? "Đang đọc..." : "📄 Đọc CCCD (giả lập)"}
                </button>
              )}
            </div>

            <div className="col-fields">
              <div className="row-2">
                <Field label="Họ và tên *">
                  <input className="input" value={form.full_name} onChange={set("full_name")} required maxLength={100} />
                </Field>
                <Field label="Giới tính *">
                  <select className="input" value={form.gender} onChange={set("gender")}>
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                  </select>
                </Field>
              </div>

              <div className="row-2">
                <Field label="Ngày sinh (dd/mm/yyyy)">
                  <input className="input" value={form.dob} onChange={set("dob")} placeholder="15/03/1990" />
                </Field>
                <Field label="Số CCCD">
                  <input className="input" value={form.cccd_number || ""} onChange={set("cccd_number")} maxLength={20} />
                </Field>
              </div>

              <div className="row-2">
                <Field label="Dân tộc">
                  <input className="input" value={form.ethnicity || ""} onChange={set("ethnicity")} />
                </Field>
                <Field label="Tôn giáo">
                  <input className="input" value={form.religion || ""} onChange={set("religion")} />
                </Field>
              </div>

              <Field label="Quê quán">
                <input className="input" value={form.hometown || ""} onChange={set("hometown")} />
              </Field>

              <Field label="Địa chỉ thường trú">
                <input className="input" value={form.address || ""} onChange={set("address")} />
              </Field>

              <div className="row-2">
                <Field label="Buồng giam">
                  <select className="input" value={form.cell_code || ""} onChange={set("cell_code")}>
                    <option value="">-- Chọn buồng --</option>
                    {cells.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} - {c.name} ({c.current}/{c.capacity})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Ngày vào (dd/mm/yyyy)">
                  <input className="input" value={form.date_in || ""} onChange={set("date_in")} placeholder="01/01/2026" />
                </Field>
              </div>

              <Field label="Tội danh">
                <input className="input" value={form.charge || ""} onChange={set("charge")} />
              </Field>

              <Field label="Ghi chú">
                <textarea className="input" rows={2} value={form.note || ""} onChange={set("note")} />
              </Field>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Huỷ</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Đang lưu..." : initial ? "Cập nhật" : "Lưu hồ sơ"}
            </button>
          </div>
        </form>

        {dupCheck && (
          <div className="dup-overlay" onClick={() => setDupCheck(null)}>
            <div className="dup-card" onClick={(e) => e.stopPropagation()}>
              <div className="dup-head">
                <span className="dup-icon">⚠</span>
                <h4>Phát hiện hồ sơ trùng khớp</h4>
              </div>
              <p>
                Hệ thống phát hiện <strong>{dupCheck.count}</strong> hồ sơ có
                Họ tên + Ngày sinh + Giới tính khớp với bản ghi mới:
              </p>
              <ul className="dup-list">
                {dupCheck.duplicates.map((d) => (
                  <li key={d.id}>
                    <strong>{d.code}</strong> - {d.full_name} ({d.gender === "female" ? "Nữ" : "Nam"})
                    {d.dob && ` - sinh ${new Date(d.dob).toLocaleDateString("vi-VN")}`}
                    {d.cell_code && ` - buồng ${d.cell_code}`}
                  </li>
                ))}
              </ul>
              <div className="dup-actions">
                <button className="btn-ghost" onClick={() => setDupCheck(null)}>
                  Xem lại
                </button>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setConfirmDup(true);
                    setDupCheck(null);
                    setTimeout(() => document.querySelector(".form-modal form").requestSubmit(), 50);
                  }}
                >
                  Vẫn lưu (khác người)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="field-block">
      <label>{label}</label>
      {children}
    </div>
  );
}
