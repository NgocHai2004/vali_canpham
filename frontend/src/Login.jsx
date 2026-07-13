import { useState } from "react";
import { api } from "./api";

/* ---------- Lucide-style icons (thin 2px, round caps) ---------- */
const IconUser = ({ s = 20 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const IconLock = ({ s = 20 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="11" width="17" height="10.5" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IconEye = ({ s = 20, off = false }) => off ? (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.6 19.6 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.55 19.55 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
) : (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const IconArrow = ({ s = 20 }) => (
  <svg className="lg-arrow" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);
const IconShieldCheck = ({ s = 22 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
const IconAlert = ({ s = 16 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

/* ---------- Login screen ---------- */
export default function Login({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const data = await api.login(username.trim(), password);
      onLogin(data.username);
    } catch (ex) {
      setErr(ex.message || "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lg-wrap">

      <div className="lg-inner">
        <div className="lg-card" role="dialog" aria-labelledby="lg-title">
          <div className="lg-emblem">
            <img src="/emblem-cand.png" alt="Huy hiệu Công an nhân dân" />
          </div>

          <h1 id="lg-title" className="lg-title">
            Hệ thống Quản lý dự án CCCD
          </h1>
          <p className="lg-subtitle">Cổng nội bộ &middot; Đăng nhập quản trị</p>
          <div className="lg-divider" aria-hidden="true" />

          <form onSubmit={submit} autoComplete="off" noValidate>
            {err && (
              <div className="lg-err" role="alert" aria-live="assertive">
                <IconAlert />
                <span>{err}</span>
              </div>
            )}

            <div className="lg-field">
              <label htmlFor="fld-user">Tên đăng nhập</label>
              <div className="lg-input">
                <span className="lg-lead"><IconUser /></span>
                <input
                  id="fld-user"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nhập tên đăng nhập"
                  autoComplete="username"
                  autoFocus={!username}
                  required
                />
              </div>
            </div>

            <div className="lg-field">
              <label htmlFor="fld-pw">Mật khẩu</label>
              <div className="lg-input">
                <span className="lg-lead"><IconLock /></span>
                <input
                  id="fld-pw"
                  name="password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  autoComplete="current-password"
                  autoFocus={!!username && !password}
                  required
                />
                <button
                  type="button"
                  className="lg-trail"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  <IconEye off={showPw} />
                </button>
              </div>
            </div>

            <div className="lg-row">
              <label className="lg-check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span className="lg-box" aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="12" height="12">
                    <path d="M3 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>Ghi nhớ đăng nhập</span>
              </label>
              <button
                type="button"
                className="lg-link"
                onClick={() => alert("Vui lòng liên hệ quản trị viên hệ thống")}
              >
                Quên mật khẩu?
              </button>
            </div>

            <button type="submit" className="lg-submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="lg-spin" aria-hidden="true" /> Đang đăng nhập&hellip;
                </>
              ) : (
                <>
                  Đăng nhập <IconArrow />
                </>
              )}
            </button>

            <div className="lg-or">
              <span>hoặc đăng nhập với</span>
            </div>

            <div className="lg-alt">
              <button
                type="button"
                className="lg-shield"
                aria-label="Đăng nhập bằng tài khoản nội bộ"
                onClick={() => alert("Tính năng đăng nhập nội bộ đang phát triển")}
              >
                <IconShieldCheck s={24} />
              </button>
              <div className="lg-alt-label">Tài khoản nội bộ</div>
            </div>
          </form>
        </div>

        <div className="lg-footer">
          <div>© {new Date().getFullYear()} · Dự án CCCD lưu động</div>
          <div className="lg-meta">
            <span>v1.0.0</span>
            <span className="lg-dot" aria-hidden="true">•</span>
            <span>Demo: admin / admin123</span>
          </div>
        </div>
      </div>
    </div>
  );
}
