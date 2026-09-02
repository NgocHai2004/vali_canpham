import { useRef, useState } from "react";
import { api } from "../../api";
import cccdBackTemplateBg from "../../assets/cccd-back-template.jpg";
import cccdTemplateBg from "../../assets/cccd-template.png";
import { useI18n } from "../../i18n";
import { cropPortraitFromCCCD } from "../imageUtils";
import { CccdField } from "./CccdField";

export function CccdCardUpload({ form, photos, cardPortrait, onUpload, onClear, onCardPortraitPreview, onFieldChange }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const setF = onFieldChange || (() => {});

  const pick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setErr("");

    if (onCardPortraitPreview) {
      try {
        const portraitFile = await cropPortraitFromCCCD(f);
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = () => reject(new Error("read fail"));
          r.readAsDataURL(portraitFile);
        });
        onCardPortraitPreview(dataUrl);
      } catch (cropEx) {
        console.error("[CCCD crop] error:", cropEx);
      }
    }

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
    <div className="cccd-card-mock" onClick={() => inputRef.current?.click()} style={{ cursor: "pointer" }}>
      <img className="cccd-card-mock-bg" src={cccdTemplateBg} alt="" />
      <div className="cccd-card-mock-photo">
        {cardPortrait && <img src={cardPortrait} alt="" />}
      </div>
      <div className="cccd-card-mock-fields">
        <CccdField className="cccd-mf cccd-mf-no" value={form.cccd_number || ""}
          onChange={(v) => setF("cccd_number", v.replace(/\D/g, "").slice(0, 12))} />
        <CccdField className="cccd-mf cccd-mf-name" value={form.full_name || ""}
          onChange={(v) => setF("full_name", v)} />
        <CccdField className="cccd-mf cccd-mf-dob" value={form.dob || ""}
          onChange={(v) => setF("dob", v)} />
        <CccdField className="cccd-mf cccd-mf-sex"
          value={form.gender ? (form.gender === "female" ? t("common.female") : t("common.male")) : ""}
          onChange={(v) => {
            const s = (v || "").trim().toLowerCase();
            setF("gender", s.startsWith("n") && s.includes("ữ") ? "female"
              : s === "female" || s === "nữ" || s === "nu" ? "female"
              : s ? "male" : "");
          }} />
        <CccdField className="cccd-mf cccd-mf-nat" value={form.nationality || ""}
          onChange={(v) => setF("nationality", v)} />
        <CccdField className="cccd-mf cccd-mf-origin" value={form.hometown || ""}
          onChange={(v) => setF("hometown", v)} />
        <CccdField className="cccd-mf cccd-mf-res" value={form.address || ""}
          onChange={(v) => setF("address", v)} />
        <CccdField className="cccd-mf cccd-mf-exp" value={form.expiry_date || ""}
          onChange={(v) => setF("expiry_date", v)} />
      </div>
      {uploaded && (
        <button
          type="button"
          className="cccd-card-mock-clear"
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          aria-label={t("capture.cccd.aria_delete")}
        >×</button>
      )}
      {(uploading || err) && (
        <div className="cccd-card-mock-hint">
          {uploading ? t("capture.cccd.loading") : err}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
    </div>
  );
}

export function CccdCardBackUpload({ form, onFieldChange }) {
  const { t } = useI18n();
  const setF = onFieldChange || (() => {});
  // MRZ chuẩn TD1 = 3 dòng × 30 ký tự. Máy đọc push lên thường là 1 chuỗi
  // liền 90 ký tự (không có \n) — tự chia 30 ký tự/dòng cho giống thẻ thật.
  // Nếu chuỗi đã có sẵn xuống dòng thì tôn trọng nguyên trạng.
  const mrzRaw = (form.mrz || "").trim();
  const mrzLines = mrzRaw.includes("\n")
    ? mrzRaw.split(/\r?\n/).filter((ln) => ln.length > 0)
    : (mrzRaw.match(/.{1,30}/g) || []);
  return (
    <div className="cccd-card-back">
      <img className="cccd-card-mock-bg" src={cccdBackTemplateBg} alt="" />
      <div className="cccd-card-mock-fields">
        {/* Tọa độ căn theo template mặt sau thật (cccd-back-template.jpg, 1024x601) */}
        {/* Đặc điểm nhận dạng — 2 dòng kẻ phía trên */}
        <CccdField className="cccd-mf cccd-mf-back-features" value={form.distinguishing_features || ""}
          onChange={(v) => setF("distinguishing_features", v)} />
        {/* Ngày cấp */}
        <CccdField className="cccd-mf cccd-mf-back-issued" value={form.issued_date || ""}
          onChange={(v) => setF("issued_date", v)} />
        {/* Nơi cấp */}
        <CccdField className="cccd-mf cccd-mf-back-place" value={form.issued_place || ""}
          onChange={(v) => setF("issued_place", v)} />
        {/* MRZ — 3 dòng monospace, chữ to, căn đều hai bên. Sửa tại chỗ: click mở ô nhập,
            các ký tự < biểu diễn khoảng trắng chuẩn MRZ; onBlur ghép lại thành 1 chuỗi. */}
        <div className="cccd-mf cccd-mf-back-mrz"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            // gộp mọi dòng thành 1 chuỗi, bỏ khoảng trắng thừa, viết hoa
            const raw = (e.currentTarget.textContent || "").replace(/\s+/g, "").toUpperCase();
            setF("mrz", raw);
          }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
        >
          {mrzLines.length > 0 ? mrzLines.map((ln, i) => (
            <div className="cccd-mf-mrz-line" key={i}>
              {Array.from(ln).map((ch, j) => (
                <span className="cccd-mf-mrz-char" key={j}>{ch}</span>
              ))}
            </div>
          )) : null}
        </div>
      </div>
    </div>
  );
}
