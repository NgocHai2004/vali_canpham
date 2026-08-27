import { useState } from "react";
import { api, auth } from "./api";
import { useI18n, LanguageSwitch } from "./i18n";

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
  const { t } = useI18n();
  // KHONG dien san "admin". Truoc day mac dinh la "admin" => o ten dang nhap
  // luon co san chu, che mat placeholder "Nhap ten dang nhap", va can bo phai
  // xoa tay truoc khi go ten minh. De trong cho giong o mat khau: chu mo huong
  // dan hien ra, con tro nhay vao la go duoc ngay.
  const [username, setUsername] = useState("");
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
      try {
        await api.verifyDongle();
      } catch (dongleEx) {
        auth.clear();
        const msg = dongleEx?.message || "";
        if (/USB service|Không kết nối được USB|Cannot reach the fingerprint|USB service is not/i.test(msg)) {
          setErr(t("login.err.usb_down"));
        } else {
          setErr(t("login.err.no_dongle"));
        }
        return;
      }
      onLogin(data.username, data.role, data.full_name || "");
    } catch (ex) {
      setErr(ex.message || t("login.err.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lg-wrap">
      <div className="lg-lang-corner"><LanguageSwitch /></div>

      <div className="lg-inner">
        <div className="lg-card" role="dialog" aria-labelledby="lg-title">
          <span className="lg-card-glow" aria-hidden="true" />
          <div className="lg-emblem">
            <img src="/pyxis-logo.png" alt={t("login.emblem_alt")} />
          </div>

          <h1 id="lg-title" className="lg-title">
            {t("login.title")}
          </h1>
          <p className="lg-subtitle">{t("login.subtitle")}</p>
          <div className="lg-divider" aria-hidden="true" />

          <form onSubmit={submit} autoComplete="off" noValidate>
            {err && (
              <div className="lg-err" role="alert" aria-live="assertive">
                <IconAlert />
                <span>{err}</span>
              </div>
            )}

            <div className="lg-field">
              <label htmlFor="fld-user">{t("login.username")}</label>
              <div className="lg-input">
                <span className="lg-lead"><IconUser /></span>
                <input
                  id="fld-user"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("login.username_ph")}
                  autoComplete="username"
                  autoFocus={!username}
                  required
                />
              </div>
            </div>

            <div className="lg-field">
              <label htmlFor="fld-pw">{t("login.password")}</label>
              <div className="lg-input">
                <span className="lg-lead"><IconLock /></span>
                <input
                  id="fld-pw"
                  name="password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("login.password_ph")}
                  autoComplete="current-password"
                  autoFocus={!!username && !password}
                  required
                />
                <button
                  type="button"
                  className="lg-trail"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? t("login.hide_pw") : t("login.show_pw")}
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
                <span>{t("login.remember")}</span>
              </label>
              <button
                type="button"
                className="lg-link"
                onClick={() => alert(t("login.forgot_alert"))}
              >
                {t("login.forgot")}
              </button>
            </div>

            <button type="submit" className="lg-submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="lg-spin" aria-hidden="true" /> {t("login.submitting")}
                </>
              ) : (
                <>
                  {t("login.submit")} <IconArrow />
                </>
              )}
            </button>

            <div className="lg-or">
              <span>{t("login.or_login_with")}</span>
            </div>

            <div className="lg-alt">
              <button
                type="button"
                className="lg-shield"
                aria-label={t("login.internal_aria")}
                onClick={() => alert(t("login.internal_alert"))}
              >
                <IconShieldCheck s={24} />
              </button>
              <div className="lg-alt-label">{t("login.internal_account")}</div>
            </div>
          </form>
        </div>

        <div className="lg-footer">
          <div>{t("login.footer", { year: new Date().getFullYear() })}</div>
          <div className="lg-meta">
            <span>Version 5.3.4.1</span>
            <span className="lg-dot" aria-hidden="true">•</span>
            <span>{t("login.demo")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
