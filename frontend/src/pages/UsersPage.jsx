import React, { useState, useEffect } from "react";
import api from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icons";
import { FieldRow } from "../components/FieldRow";
import { PageHeader, StateBox } from "../components/CommonUI";

function UsersPage({ currentUser }) {
  const { t, formatDateTime } = useI18n();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeOk, setNoticeOk] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await api.listUsers());
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onDelete = async (u) => {
    if (!window.confirm(t("users.confirm_delete", { u: u.username }))) return;
    try {
      await api.deleteUser(u.id);
      setNotice(t("users.deleted", { u: u.username }));
      setNoticeOk(true);
      load();
    } catch (e) {
      setNotice(t("common.error_prefix", { message: e.message }));
      setNoticeOk(false);
    }
  };

  const onUploadAvatar = async (u, file) => {
    if (!file) return;
    try {
      await api.uploadUserAvatar(u.id, file);
      setNotice(t("users.avatar_updated", { u: u.username }));
      setNoticeOk(true);
      load();
    } catch (e) {
      setNotice(t("common.error_prefix", { message: e.message }));
      setNoticeOk(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title={t("users.title")} subtitle={t("users.subtitle", { n: users.length })}>
        <button className="button primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          {Icon.plus}
          {t("users.add")}
        </button>
      </PageHeader>

      {error && <StateBox type="error">{error}</StateBox>}
      {notice && <div className={noticeOk ? "success-box" : "error-box"}>{notice}</div>}

      <div className="table-card">
        {loading ? <StateBox>{t("common.loading")}</StateBox> : (
          <table>
            <thead>
              <tr>
                <th>{t("users.col.photo")}</th>
                <th>{t("users.col.username")}</th>
                <th>{t("users.col.full_name")}</th>
                <th>{t("users.col.role")}</th>
                <th>{t("users.col.created")}</th>
                <th>{t("users.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const initials = ((u.full_name || u.username || "?").trim()[0] || "?").toUpperCase();
                return (
                <tr key={u.id}>
                  <td>
                    <div className="users-avatar-cell">
                      {u.avatar_url ? (
                        <img className="officer-avatar" src={u.avatar_url} alt="" />
                      ) : (
                        <span className="officer-avatar officer-avatar-fallback">{initials}</span>
                      )}
                      <label className="avatar-upload-btn" title={t("users.avatar_title")}>
                        {t("users.change")}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => onUploadAvatar(u, e.target.files?.[0])}
                        />
                      </label>
                    </div>
                  </td>
                  <td><strong>{u.username}</strong></td>
                  <td>{u.full_name || "-"}</td>
                  <td>
                    <span className={`status-badge ${u.role === "admin" ? "delete" : "create"}`}>
                      {u.role === "admin" ? t("common.role.admin") : t("common.role.officer")}
                    </span>
                  </td>
                  <td>{u.created_at ? formatDateTime(u.created_at) : "-"}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => { setEditing(u); setShowForm(true); }}>{t("common.edit")}</button>
                      <button
                        className="danger-text"
                        disabled={u.username === "admin" || u.username === currentUser}
                        onClick={() => onDelete(u)}
                        title={u.username === "admin" ? t("users.cannot_delete_admin") : u.username === currentUser ? t("users.cannot_delete_self") : ""}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {!users.length && (
                <tr><td colSpan={6}><div className="empty">{t("users.empty")}</div></td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <UserForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={(msg) => {
            setShowForm(false); setEditing(null);
            setNotice(msg || t("users.saved"));
            setNoticeOk(true);
            load();
          }}
        />
      )}
    </div>
  );
}

// Nguong nghiep vu da thong nhat cho chat luong van tay. Admin duoc phep ha
// xuong duoi muc nay nhung phai thay canh bao - ha nguong = chap nhan template
// kem, lam sai ket qua tra cuu ve sau.

function UserForm({ initial, onClose, onSaved }) {
  const { t } = useI18n();
  const isEdit = Boolean(initial);
  const [username, setUsername] = useState(initial?.username || "");
  const [fullName, setFullName] = useState(initial?.full_name || "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) { setError(t("userform.err.name_required")); return; }
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        const body = { full_name: fullName.trim() };
        if (password) body.password = password;
        await api.updateUser(initial.id, body);
        onSaved(t("userform.updated", { u: initial.username }));
      } else {
        await api.createUser({
          username: username.trim(),
          password,
          role: "user",
          full_name: fullName.trim(),
        });
        onSaved(t("userform.created", { u: username }));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small-modal userform-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? t("userform.title.edit", { u: initial.username }) : t("userform.title.new")}</h3>
          <button onClick={onClose}>×</button>
        </div>
        <form className="form" onSubmit={submit}>
          {error && <div className="error-box">{error}</div>}
          <div className="userform-grid">
            <FieldRow label={t("userform.field.username")}>
              <input
                className="control"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isEdit}
                required
                minLength={3}
                maxLength={40}
                pattern="[a-zA-Z0-9_.\-]+"
              />
            </FieldRow>
            <FieldRow label={t("userform.field.full_name")}>
              <input className="control" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} required />
            </FieldRow>
            <FieldRow label={isEdit ? t("userform.field.pw_change") : t("userform.field.pw")}>
              <input
                className="control"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!isEdit}
                minLength={isEdit ? 0 : 6}
                maxLength={100}
              />
            </FieldRow>
            <FieldRow label={t("userform.field.role")}>
              <input
                className="control"
                value={isEdit ? (initial.role === "admin" ? t("userform.role.admin") : t("userform.role.user")) : t("userform.role.user")}
                disabled
                readOnly
              />
            </FieldRow>
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


export default UsersPage;
