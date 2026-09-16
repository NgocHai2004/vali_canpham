import React, { useState } from "react";
import api from "../api";
import { useI18n } from "../i18n";
import { FieldRow } from "./FieldRow";

export function ProfileEditModal({ username, fullName, onClose, onSaved }) {
  const { t } = useI18n();
  const [name, setName] = useState(fullName || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPwFields, setShowPwFields] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const trimmed = name.trim();
    if (!trimmed) { setError(t("profile.err.name_required")); return; }
    const nameChanged = trimmed !== (fullName || "").trim();
    const wantsPw = showPwFields && (password || password2);
    if (!nameChanged && !wantsPw) {
      onClose();
      return;
    }
    if (!currentPassword) { setError(t("profile.err.current_required")); return; }
    if (wantsPw) {
      if (password.length < 6) { setError(t("profile.err.password_short")); return; }
      if (password !== password2) { setError(t("profile.err.password_mismatch")); return; }
    }
    setSaving(true);
    try {
      const body = { current_password: currentPassword };
      if (nameChanged) body.full_name = trimmed;
      if (wantsPw) body.password = password;
      const res = await api.updateMe(body);
      onSaved(res.full_name ?? trimmed);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t("profile.title")}</h3>
          <button onClick={onClose}>×</button>
        </div>
        <form className="form" onSubmit={submit}>
          {error && <div className="error-box">{error}</div>}
          <FieldRow label={t("profile.field.username")}>
            <input className="control" value={username} disabled readOnly />
          </FieldRow>
          <FieldRow label={t("profile.field.full_name")}>
            <input
              className="control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              autoFocus
            />
          </FieldRow>
          <FieldRow label={t("profile.field.current_password")}>
            <input
              className="control"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              maxLength={100}
              placeholder={t("profile.current_password_ph")}
              required
            />
          </FieldRow>
          {!showPwFields ? (
            <div style={{ margin: "4px 0 8px" }}>
              <button
                type="button"
                onClick={() => setShowPwFields(true)}
                style={{
                  background: "none", border: "none", padding: 0,
                  color: "#2563eb", cursor: "pointer", fontSize: 13, textDecoration: "underline",
                }}
              >
                {t("profile.change_password_toggle")}
              </button>
            </div>
          ) : (
            <>
              <FieldRow label={t("profile.field.new_password")}>
                <input
                  className="control"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  maxLength={100}
                />
              </FieldRow>
              <FieldRow label={t("profile.field.confirm_password")}>
                <input
                  className="control"
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  autoComplete="new-password"
                  maxLength={100}
                />
              </FieldRow>
            </>
          )}
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

export default ProfileEditModal;
