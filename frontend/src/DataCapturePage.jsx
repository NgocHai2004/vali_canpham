import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";

const FINGERS = [
  { key: "fp_l1", label: "T. cái trái" },
  { key: "fp_l2", label: "T. trỏ trái" },
  { key: "fp_l3", label: "T. giữa trái" },
  { key: "fp_l4", label: "T. áp út trái" },
  { key: "fp_l5", label: "T. út trái" },
  { key: "fp_r1", label: "T. cái phải" },
  { key: "fp_r2", label: "T. trỏ phải" },
  { key: "fp_r3", label: "T. giữa phải" },
  { key: "fp_r4", label: "T. áp út phải" },
  { key: "fp_r5", label: "T. út phải" },
];

const PORTRAITS = [
  { key: "portrait_front", label: "Ảnh thẳng" },
  { key: "portrait_left", label: "Ảnh trái" },
  { key: "portrait_right", label: "Ảnh phải" },
];

const EMPTY_FORM = {
  full_name: "",
  code: "",
  cccd_number: "",
  personal_id: "",
  dob: "",
  gender: "male",
  nationality: "Việt Nam",
  ethnicity: "",
  religion: "",
  hometown: "",
  address: "",
  issued_date: "",
  expiry_date: "",
  issued_place: "",
  height_cm: "",
  weight_kg: "",
  charge: "",
  cell_code: "",
  note: "",
};

function CccdCardUpload({ form, photos, onUpload, onClear }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  const pick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setErr("");
    try {
      const res = await api.uploadPhoto(f);
      onUpload(res.url);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const uploaded = photos.cccd_front;

  return (
    <div className="cccd-card-mock" onClick={() => !uploaded && inputRef.current?.click()} style={{ cursor: uploaded ? "default" : "pointer" }}>
      {uploaded ? (
        <>
          <img className="cccd-card-mock-bg" src={uploaded} alt="Ảnh CCCD" style={{ objectFit: "cover" }} />
          <button
            type="button"
            className="cccd-card-mock-clear"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            aria-label="Xoá ảnh CCCD"
          >×</button>
          <button
            type="button"
            className="cccd-card-mock-reupload"
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
          >Đổi ảnh</button>
        </>
      ) : (
        <>
          <img className="cccd-card-mock-bg" src="/cccd-template.png" alt="" />
          <div className="cccd-card-mock-photo">
            {photos.portrait_front && <img src={photos.portrait_front} alt="" />}
          </div>
          <div className="cccd-card-mock-fields">
            <div className="cccd-mf cccd-mf-no">{form.cccd_number || ""}</div>
            <div className="cccd-mf cccd-mf-name">{form.full_name || ""}</div>
            <div className="cccd-mf cccd-mf-dob">{form.dob || ""}</div>
            <div className="cccd-mf cccd-mf-sex">{form.full_name ? (form.gender === "female" ? "Nữ" : "Nam") : ""}</div>
            <div className="cccd-mf cccd-mf-nat">{form.nationality || ""}</div>
            <div className="cccd-mf cccd-mf-origin">{form.hometown || ""}</div>
            <div className="cccd-mf cccd-mf-res">{form.address || ""}</div>
            <div className="cccd-mf cccd-mf-exp">{form.expiry_date || ""}</div>
          </div>
          {(uploading || err) && (
            <div className="cccd-card-mock-hint">
              {uploading ? "Đang tải ảnh..." : err}
            </div>
          )}
        </>
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
    </div>
  );
}

function PhotoSlot({ label, value, onChange, aspect = "1 / 1", size, compact, disabled }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  const pick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setErr("");
    try {
      const res = await api.uploadPhoto(f);
      onChange(res.url);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const style = { aspectRatio: aspect };
  if (size) {
    style.width = size;
    style.height = size;
    style.aspectRatio = undefined;
  }

  return (
    <div className={"photo-slot" + (compact ? " ps-compact" : "")} style={style}>
      {value ? (
        <>
          <img src={value} alt={label} />
          {!disabled && (
            <button
              type="button"
              className="photo-slot-clear"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              aria-label="Xoá ảnh"
            >×</button>
          )}
        </>
      ) : (
        <button
          type="button"
          className="photo-slot-empty"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || disabled}
        >
          <span className="photo-slot-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="6" width="18" height="14" rx="2" />
              <circle cx="12" cy="13" r="4" />
              <path d="M8 6l1.5-2h5L16 6" />
            </svg>
          </span>
          {!compact && <span className="photo-slot-label">{label}</span>}
          {!compact && uploading && <span className="photo-slot-hint">Đang tải...</span>}
          {!compact && err && <span className="photo-slot-err">{err}</span>}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="cccd-field">
      <span className="cccd-field-label">{label}</span>
      {children}
    </div>
  );
}

function toDobInput(v) {
  if (!v) return "";
  const s = String(v);
  if (s.includes("/")) return s;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  }
  return s;
}

function normalizeInitial(initial) {
  if (!initial) return { form: EMPTY_FORM, photos: {} };
  const photos = initial.photos && typeof initial.photos === "object" ? { ...initial.photos } : {};
  if (initial.photo_url && !photos.portrait_front) photos.portrait_front = initial.photo_url;
  return {
    form: {
      ...EMPTY_FORM,
      full_name: initial.full_name || "",
      code: initial.code || "",
      cccd_number: initial.cccd_number || "",
      personal_id: initial.personal_id || initial.cccd_number || "",
      dob: toDobInput(initial.dob),
      gender: initial.gender === "female" ? "female" : "male",
      nationality: initial.nationality || "Việt Nam",
      ethnicity: initial.ethnicity || "",
      religion: initial.religion || "",
      hometown: initial.hometown || "",
      address: initial.address || "",
      issued_date: toDobInput(initial.issued_date),
      expiry_date: toDobInput(initial.expiry_date),
      issued_place: initial.issued_place || "",
      height_cm: initial.height_cm != null ? String(initial.height_cm) : "",
      weight_kg: initial.weight_kg != null ? String(initial.weight_kg) : "",
      charge: initial.charge || "",
      cell_code: initial.cell_code || "",
      note: initial.note || "",
    },
    photos,
  };
}

export default function DataCapturePage({ go, initial, onDone, sessionId, sessionCode, sessionReadOnly = false, onSavedInSession }) {
  const isEdit = Boolean(initial && initial.id);
  const seed = useMemo(() => normalizeInitial(initial), [initial]);
  const [form, setForm] = useState(seed.form);
  const [photos, setPhotos] = useState(seed.photos);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [reading, setReading] = useState(false);
  const [cells, setCells] = useState([]);

  useEffect(() => {
    setForm(seed.form);
    setPhotos(seed.photos);
    setErr("");
    setOk("");
  }, [seed]);

  useEffect(() => {
    api.listCells().then(setCells).catch(() => setCells([]));
  }, []);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setPhoto = (k, v) =>
    setPhotos((p) => {
      const next = { ...p };
      if (v) next[k] = v;
      else delete next[k];
      return next;
    });

  const readCCCD = async () => {
    setReading(true);
    setErr("");
    try {
      const d = await api.mockReadCCCD();
      setForm((f) => ({
        ...f,
        full_name: d.full_name || f.full_name,
        cccd_number: d.cccd_number || f.cccd_number,
        personal_id: d.cccd_number || f.personal_id,
        dob: d.dob || f.dob,
        gender: d.gender || f.gender,
        hometown: d.hometown || f.hometown,
        address: d.address || d.hometown || f.address,
        ethnicity: d.ethnicity || f.ethnicity,
        religion: d.religion || f.religion,
      }));
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setReading(false);
    }
  };

  const fpCount = FINGERS.filter((f) => photos[f.key]).length;
  const irisCount = ["iris_left", "iris_right"].filter((k) => photos[k]).length;
  const portraitCount = PORTRAITS.filter((p) => photos[p.key]).length;

  const checks = useMemo(() => {
    const cccdOk =
      !!form.full_name.trim() &&
      /^\d{12}$/.test(form.cccd_number || "") &&
      !!form.dob &&
      !!form.code.trim();
    return [
      { key: "cccd", label: "Thông tin CCCD", ok: cccdOk, required: true },
      { key: "portrait", label: "Ảnh chân dung đa góc", ok: portraitCount === 3, required: false },
      { key: "fp", label: "Vân tay (10/10)", ok: fpCount === 10, required: false },
      { key: "iris", label: "Mống mắt (2/2)", ok: irisCount === 2, required: false },
      { key: "extra", label: "Thông tin bổ sung", ok: !!form.height_cm && !!form.weight_kg, required: false },
      { key: "device", label: "Thiết bị & kết nối", ok: true, required: false },
    ];
  }, [form, fpCount, irisCount, portraitCount]);

  const allRequiredValid = checks.filter((c) => c.required).every((c) => c.ok);
  const allValid = checks.every((c) => c.ok);

  const submit = async () => {
    if (!allRequiredValid) return;
    setSaving(true);
    setErr("");
    setOk("");
    try {
      const strOrNull = (v) => {
        const s = (v ?? "").toString().trim();
        return s === "" ? null : s;
      };
      const digitsOrNull = (v) => {
        const s = (v ?? "").toString().replace(/\D/g, "");
        return /^\d{12}$/.test(s) ? s : null;
      };
      const body = {
        session_id: sessionId || null,
        full_name: form.full_name.trim(),
        gender: form.gender === "female" ? "female" : "male",
        dob: strOrNull(form.dob),
        cccd_number: digitsOrNull(form.cccd_number),
        personal_id: digitsOrNull(form.personal_id),
        nationality: strOrNull(form.nationality),
        hometown: strOrNull(form.hometown),
        address: strOrNull(form.address),
        ethnicity: strOrNull(form.ethnicity),
        religion: strOrNull(form.religion),
        issued_date: strOrNull(form.issued_date),
        expiry_date: strOrNull(form.expiry_date),
        issued_place: strOrNull(form.issued_place),
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        charge: strOrNull(form.charge),
        cell_code: strOrNull(form.cell_code),
        note: strOrNull(form.note),
        photo_url: photos.portrait_front || null,
        photos,
      };
      if (isEdit) {
        const updated = await api.updateDetainee(initial.id, body);
        setOk(`Đã cập nhật hồ sơ ${updated.code} — ${updated.full_name}`);
        if (onDone) onDone();
        if (sessionId && onSavedInSession) {
          setTimeout(() => onSavedInSession(), 600);
        } else if (go) {
          setTimeout(() => go("detainees"), 800);
        }
      } else {
        const created = await api.createDetainee(body);
        setOk(`Đã lưu hồ sơ ${created.code} — ${created.full_name}`);
        setForm(EMPTY_FORM);
        setPhotos({});
        if (sessionId && onSavedInSession) {
          setTimeout(() => onSavedInSession(), 800);
        }
      }
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    if (!window.confirm(isEdit ? "Huỷ chỉnh sửa và xoá dữ liệu đang nhập?" : "Xoá toàn bộ dữ liệu đã nhập?")) return;
    if (isEdit && onDone) onDone();
    setForm(EMPTY_FORM);
    setPhotos({});
    setErr("");
    setOk("");
  };

  const backToList = () => {
    if (onDone) onDone();
    if (go) go("detainees");
  };

  return (
    <div className="page capture-page">
      {sessionId && (
        <div className={"capture-session-banner " + (sessionReadOnly ? "closed" : "open")}>
          <span className="dot" />
          {sessionReadOnly ? (
            <>Đang xem hồ sơ trong phiên <strong>{sessionCode || sessionId}</strong> (đã đóng — chỉ đọc)</>
          ) : (
            <>Đang trong phiên <strong>{sessionCode || sessionId}</strong></>
          )}
        </div>
      )}
      {(err || ok) && (
        <div className="capture-banner">
          {err && <div className="error-box">{err}</div>}
          {ok && (
            <div className="success-box">
              {ok}
              <button type="button" className="banner-link" onClick={() => go && go("detainees")}>
                Xem danh sách →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================ Block 1: CĂN CƯỚC CÔNG DÂN ================ */}
      <section className="cap-block">
        <div className="cap-block-head">
          <h2 className="cap-block-title">CĂN CƯỚC CÔNG DÂN</h2>
          <button type="button" className="btn-cccd-scan" onClick={readCCCD} disabled={reading}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" />
            </svg>
            {reading ? "Đang đọc..." : "Đọc thẻ CCCD"}
          </button>
        </div>

        <div className="cccd-body cccd-body-2col">
          <div className="cccd-col cccd-col-form">
            <Field label="Họ và tên">
              <input className="control" value={form.full_name}
                onChange={(e) => setField("full_name", e.target.value)} placeholder="Nguyễn Văn A" />
            </Field>
            <Field label="Mã can phạm">
              <input className="control" value={form.code}
                onChange={(e) => setField("code", e.target.value.toUpperCase())} placeholder="CP2024-000000" />
            </Field>
            <Field label="Số CCCD">
              <input className="control" value={form.cccd_number}
                onChange={(e) => setField("cccd_number", e.target.value.replace(/\D/g, "").slice(0, 12))}
                placeholder="079204012345" inputMode="numeric" />
            </Field>
            <Field label="Ngày sinh">
              <input className="control" value={form.dob}
                onChange={(e) => setField("dob", e.target.value)} placeholder="dd/mm/yyyy" />
            </Field>
            <Field label="Giới tính">
              <select className="control" value={form.gender}
                onChange={(e) => setField("gender", e.target.value)}>
                <option value="male">Nam</option>
                <option value="female">Nữ</option>
              </select>
            </Field>
            <Field label="Quốc tịch">
              <input className="control" value={form.nationality}
                onChange={(e) => setField("nationality", e.target.value)} />
            </Field>
            <Field label="Quê quán">
              <input className="control" value={form.hometown}
                onChange={(e) => setField("hometown", e.target.value)} placeholder="Xã ..., Huyện ..., Tỉnh ..." />
            </Field>
            <Field label="Nơi thường trú">
              <input className="control" value={form.address}
                onChange={(e) => setField("address", e.target.value)} placeholder="Số nhà, phường, quận, TP" />
            </Field>
            <Field label="Ngày cấp">
              <input className="control" value={form.issued_date}
                onChange={(e) => setField("issued_date", e.target.value)} placeholder="dd/mm/yyyy" />
            </Field>
            <Field label="Ngày hết hạn">
              <input className="control" value={form.expiry_date}
                onChange={(e) => setField("expiry_date", e.target.value)} placeholder="dd/mm/yyyy" />
            </Field>
            <Field label="Nơi cấp">
              <input className="control" value={form.issued_place}
                onChange={(e) => setField("issued_place", e.target.value)} placeholder="Cục Cảnh sát QLHC về TTXH" />
            </Field>
          </div>

          <div className="cccd-preview-col">
            <CccdCardUpload
              form={form}
              photos={photos}
              onUpload={(url) => setPhoto("cccd_front", url)}
              onClear={() => setPhoto("cccd_front", "")}
            />
          </div>

        </div>
      </section>

      {/* ================ Block 2: Sinh trắc | Chân dung ================ */}
      <div className="cap-row">
        <section className="cap-block">
          <div className="cap-block-head">
            <h2 className="cap-block-title">DỮ LIỆU SINH TRẮC HỌC</h2>
          </div>
          <div className="bio-body">
            <div className="bio-fp">
              <div className="bio-sub-title">Vân tay (10 ngón)</div>
              <div className="fp-grid">
                {FINGERS.map((f) => (
                  <div key={f.key} className="fp-item">
                    <PhotoSlot compact label={f.label} value={photos[f.key]}
                      onChange={(u) => setPhoto(f.key, u)} aspect="3 / 4" />
                    <span className="fp-item-label">{f.label}</span>
                  </div>
                ))}
              </div>
              <div className={"bio-status " + (fpCount === 10 ? "ok" : "warn")}>
                <CheckDot ok={fpCount === 10} />
                {fpCount === 10 ? `Đã thu thập đủ 10/10 vân tay` : `Đã thu thập ${fpCount}/10 vân tay`}
              </div>
            </div>

            <div className="bio-iris">
              <div className="bio-sub-title">Mống mắt (2 mắt)</div>
              <div className="iris-grid">
                <div className="iris-item">
                  <PhotoSlot label="Mắt trái" value={photos.iris_left}
                    onChange={(u) => setPhoto("iris_left", u)} aspect="1.4 / 1" />
                  <span className="iris-item-label">Mắt trái</span>
                </div>
                <div className="iris-item">
                  <PhotoSlot label="Mắt phải" value={photos.iris_right}
                    onChange={(u) => setPhoto("iris_right", u)} aspect="1.4 / 1" />
                  <span className="iris-item-label">Mắt phải</span>
                </div>
              </div>
              <div className={"bio-status " + (irisCount === 2 ? "ok" : "warn")}>
                <CheckDot ok={irisCount === 2} />
                {irisCount === 2 ? `Đã thu thập đủ 2/2 mống mắt` : `Đã thu thập ${irisCount}/2 mống mắt`}
              </div>
            </div>
          </div>
        </section>

        <section className="cap-block">
          <div className="cap-block-head">
            <h2 className="cap-block-title">ẢNH CHÂN DUNG ĐA GÓC</h2>
          </div>
          <div className="portrait-body">
            {PORTRAITS.map((p) => (
              <div key={p.key} className="portrait-item">
                <div className="portrait-frame">
                  <div className="ruler ruler-l">
                    {[190, 180, 170, 160, 150, 140].map((n) => (<span key={n}>{n} cm</span>))}
                  </div>
                  <div className="ruler ruler-r">
                    {[190, 180, 170, 160, 150, 140].map((n) => (<span key={n}>{n} cm</span>))}
                  </div>
                  <PhotoSlot label={p.label} value={photos[p.key]}
                    onChange={(u) => setPhoto(p.key, u)} aspect="3 / 4" />
                </div>
                <span className="portrait-label">{p.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ================ Block 3: Bổ sung | Validate ================ */}
      <div className="cap-row cap-row-3">
        <section className="cap-block">
          <div className="cap-block-head">
            <h2 className="cap-block-title">THÔNG TIN BỔ SUNG / CHỈ SỐ NHẬN DẠNG</h2>
          </div>
          <div className="extra-body">
            <div className="extra-grid">
              <Field label="Chiều cao (cm)">
                <input className="control" type="number" min="50" max="250" value={form.height_cm}
                  onChange={(e) => setField("height_cm", e.target.value)} placeholder="170" />
              </Field>
              <Field label="Cân nặng (kg)">
                <input className="control" type="number" min="20" max="200" value={form.weight_kg}
                  onChange={(e) => setField("weight_kg", e.target.value)} placeholder="65" />
              </Field>
              <Field label="Mã can phạm">
                <input className="control" value={form.code}
                  onChange={(e) => setField("code", e.target.value.toUpperCase())} placeholder="CP2024-000000" />
              </Field>
              <Field label="Buồng giam">
                <select className="control" value={form.cell_code}
                  onChange={(e) => setField("cell_code", e.target.value)}>
                  <option value="">-- Chọn buồng --</option>
                  {cells.map((c) => {
                    const full = c.capacity != null && c.current >= c.capacity;
                    return (
                      <option key={c.code} value={c.code} disabled={full && form.cell_code !== c.code}>
                        {c.code} — {c.name} ({c.current}/{c.capacity}){full ? " · Đầy" : ""}
                      </option>
                    );
                  })}
                </select>
              </Field>
            </div>
            <div className="extra-note">
              <InfoDot />
              Vui lòng nhập đầy đủ thông tin bổ sung để hoàn thiện hồ sơ.
            </div>
          </div>
        </section>

        <section className="cap-block">
          <div className="cap-block-head">
            <h2 className="cap-block-title">KẾT QUẢ KIỂM TRA DỮ LIỆU / XÁC NHẬN HỢP LỆ</h2>
          </div>
          <div className="validate-body">
            <div className="validate-grid">
              {checks.map((c) => {
                const tone = c.ok ? "ok" : c.required ? "warn" : "muted";
                const status = c.ok
                  ? "Đã có"
                  : c.required
                    ? "Chưa hợp lệ"
                    : "Tuỳ chọn";
                return (
                  <div key={c.key} className={"validate-cell " + tone}>
                    <CheckDot ok={c.ok} tone={tone} />
                    <div>
                      <strong>
                        {c.label}
                        {!c.required && <em className="opt-tag"> (tuỳ chọn)</em>}
                      </strong>
                      <span>{status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={"validate-note " + (allRequiredValid ? "ok" : "warn")}>
              <InfoDot />
              {allRequiredValid
                ? allValid
                  ? "Kết quả kiểm tra: TẤT CẢ DỮ LIỆU HỢP LỆ. Có thể lưu hồ sơ."
                  : "Đã đủ thông tin CCCD bắt buộc. Có thể lưu hồ sơ (các mục còn lại là tuỳ chọn)."
                : "Kết quả kiểm tra: Chưa đủ thông tin CCCD. Vui lòng bổ sung."}
            </div>
          </div>
        </section>
      </div>

      {/* ================ Block 4: Actions ================ */}
      <section className="cap-block save-block">
        <div className="cap-block-head">
          <h2 className="cap-block-title">LƯU DỮ LIỆU</h2>
        </div>
        <div className="save-actions">
          <button type="button" className="save-btn save-primary"
            disabled={!allRequiredValid || saving} onClick={submit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <path d="M17 21v-8H7v8M7 3v5h8" />
            </svg>
            {saving ? "Đang lưu..." : isEdit ? "Cập nhật hồ sơ" : "Lưu dữ liệu vào hồ sơ"}
          </button>
          <button type="button" className="save-btn save-secondary" disabled={saving}
            onClick={() => window.alert("Chức năng xem trước hồ sơ sẽ có ở bản kế tiếp.")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6M8 13h8M8 17h6" />
            </svg>
            Xem trước hồ sơ
          </button>
          <button type="button" className="save-btn save-danger" disabled={saving} onClick={resetAll}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
            </svg>
            Xóa dữ liệu
          </button>
        </div>
      </section>
    </div>
  );
}

function CheckDot({ ok, tone }) {
  const cls = tone ? tone : ok ? "ok" : "warn";
  return (
    <span className={"chk-dot " + cls}>
      {ok ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" /><path d="M12 8v5M12 16h.01" />
        </svg>
      )}
    </span>
  );
}

function InfoDot() {
  return (
    <span className="info-dot">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" />
      </svg>
    </span>
  );
}

