import { useState } from "react";
import { api } from "./api";
import { notify } from "./notifications";
import { useI18n } from "./i18n";

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
  date_in: "",
  note: "",
  photo_url: "",
  height_cm: "",
  weight_kg: "",
};

function isoToDMY(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function DetaineeForm({ initial, cells, onClose, onSaved }) {
  const { t, formatDate } = useI18n();
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
  const [err, setErr] = useState("");
  const [dupCheck, setDupCheck] = useState(null);
  const [confirmDup, setConfirmDup] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onPhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr("");
    try {
      const { url } = await api.uploadPhoto(file);
      setForm((f) => ({ ...f, photo_url: url }));
    } catch (e) {
      setErr(t("detainee.form.upload_failed", { message: e.message }));
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
        // skip duplicate-check errors
      }
    }

    setSaving(true);
    try {
      const body = { ...form };
      if (initial && initial.photos && body.photos === undefined) {
        body.photos = initial.photos;
      }
      if (initial) {
        await api.updateDetainee(initial.id, body);
        notify.add();
      } else {
        await api.createDetainee(body);
        notify.add();
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
          <h3>{initial ? t("detainee.form.title.edit") : t("detainee.form.title.new")}</h3>
          <button className="close-x" onClick={onClose}>×</button>
        </div>

        <form onSubmit={submit} className="modal-form">
          {err && <div className="err-box">{err}</div>}

          <div className="form-grid">
            <div className="col-photo">
              <div className="photo-preview">
                {form.photo_url ? (
                  <img src={form.photo_url} alt={t("detainee.form.photo_alt")} />
                ) : (
                  <div className="photo-empty">{t("detainee.detail.no_photo")}</div>
                )}
              </div>
              <label className="btn-ghost photo-upload">
                {uploading ? t("detainee.form.photo_uploading") : t("detainee.form.photo_upload")}
                <input
                  type="file"
                  accept="image/*"
                  onChange={onPhotoChange}
                  style={{ display: "none" }}
                  disabled={uploading}
                />
              </label>
            </div>

            <div className="col-fields">
              <div className="row-2">
                <Field label={t("detainee.field.full_name") + " *"}>
                  <input className="input" value={form.full_name} onChange={set("full_name")} required maxLength={100} />
                </Field>
                <Field label={t("detainee.field.gender") + " *"}>
                  <div className="radio-group">
                    <label className="radio-option">
                      <input
                        type="radio"
                        name="gender"
                        value="male"
                        checked={form.gender === "male"}
                        onChange={set("gender")}
                      />
                      <span>{t("common.male")}</span>
                    </label>
                    <label className="radio-option">
                      <input
                        type="radio"
                        name="gender"
                        value="female"
                        checked={form.gender === "female"}
                        onChange={set("gender")}
                      />
                      <span>{t("common.female")}</span>
                    </label>
                  </div>
                </Field>
              </div>

              <div className="row-2">
                <Field label={t("detainee.form.dob_label")}>
                  <input className="input" value={form.dob} onChange={set("dob")} placeholder={t("detainee.form.dob_ph")} />
                </Field>
                <Field label={t("detainee.field.cccd")}>
                  <input className="input" value={form.cccd_number || ""} onChange={set("cccd_number")} maxLength={20} />
                </Field>
              </div>

              <div className="row-2">
                <Field label={t("detainee.field.ethnicity")}>
                  <input className="input" value={form.ethnicity || ""} onChange={set("ethnicity")} />
                </Field>
                <Field label={t("detainee.field.religion")}>
                  <input className="input" value={form.religion || ""} onChange={set("religion")} />
                </Field>
              </div>

              <Field label={t("detainee.field.hometown")}>
                <input className="input" value={form.hometown || ""} onChange={set("hometown")} />
              </Field>

              <Field label={t("detainee.field.address_short")}>
                <input className="input" value={form.address || ""} onChange={set("address")} />
              </Field>

              <div className="row-2">
                <Field label={t("detainee.field.height_cm")}>
                  <input
                    className="input"
                    type="number"
                    min={50}
                    max={250}
                    value={form.height_cm ?? ""}
                    onChange={set("height_cm")}
                  />
                </Field>
                <Field label={t("detainee.field.weight_kg")}>
                  <input
                    className="input"
                    type="number"
                    min={20}
                    max={200}
                    value={form.weight_kg ?? ""}
                    onChange={set("weight_kg")}
                  />
                </Field>
              </div>

              <div className="row-2">
                <Field label={t("detainee.field.cell")}>
                  <select className="input" value={form.cell_code || ""} onChange={set("cell_code")}>
                    <option value="">{t("detainee.form.select_cell")}</option>
                    {cells.map((c) => (
                      <option key={c.code} value={c.code}>
                        {t("detainee.form.cell_option", { code: c.code, name: c.name, current: c.current, capacity: c.capacity })}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("detainee.form.date_in_label")}>
                  <input className="input" value={form.date_in || ""} onChange={set("date_in")} placeholder={t("detainee.form.date_in_ph")} />
                </Field>
              </div>

              <Field label={t("detainee.field.note")}>
                <textarea className="input" rows={2} value={form.note || ""} onChange={set("note")} />
              </Field>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>{t("common.cancel")}</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? t("common.saving") : initial ? t("detainee.form.update") : t("detainee.form.save")}
            </button>
          </div>
        </form>

        {dupCheck && (
          <div className="dup-overlay" onClick={() => setDupCheck(null)}>
            <div className="dup-card" onClick={(e) => e.stopPropagation()}>
              <div className="dup-head">
                <span className="dup-icon">⚠</span>
                <h4>{t("detainee.dup.title")}</h4>
              </div>
              <p>{t("detainee.dup.desc", { n: dupCheck.count })}</p>
              <ul className="dup-list">
                {dupCheck.duplicates.map((d) => (
                  <li key={d.id}>
                    {t("detainee.dup.row", {
                      code: d.code,
                      name: d.full_name,
                      gender: d.gender === "female" ? t("common.female") : t("common.male"),
                      dob: d.dob ? formatDate(d.dob) : "—",
                      cell: d.cell_code || "—",
                    })}
                  </li>
                ))}
              </ul>
              <div className="dup-actions">
                <button className="btn-ghost" onClick={() => setDupCheck(null)}>
                  {t("detainee.dup.review")}
                </button>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setConfirmDup(true);
                    setDupCheck(null);
                    setTimeout(() => document.querySelector(".form-modal form").requestSubmit(), 50);
                  }}
                >
                  {t("detainee.dup.save_anyway")}
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
