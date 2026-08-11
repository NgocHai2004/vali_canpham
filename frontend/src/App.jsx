import { useEffect, useRef, useState } from "react";
import { auth, api, setOnAuthExpired, isNetworkError } from "./api";
import Login from "./Login";
import Dashboard from "./Dashboard";
import ToastHost from "./Toast";
import { useI18n } from "./i18n";

const DONGLE_POLL_MS = 5000;
const DONGLE_MAX_FAIL = 3;   // 3 poll fail liên tiếp = 15s → logout (chống clone + tránh logout nhầm khi bận USB scan)

export default function App() {
  const { t } = useI18n();
  const [user, setUser] = useState(auth.getUser());
  const [checking, setChecking] = useState(!!auth.getToken());
  const [dongleOk, setDongleOk] = useState(true);
  const [dongleWarn, setDongleWarn] = useState(""); // "" | "warning" | "service_down"
  const failCountRef = useRef(0);

  useEffect(() => {
    setOnAuthExpired(() => {
      setUser(null);
    });
  }, []);

  const [role, setRole] = useState(auth.getRole ? auth.getRole() : "admin");
  const [fullName, setFullName] = useState(auth.getFullName ? auth.getFullName() : "");

  useEffect(() => {
    if (!auth.getToken()) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    api
      .me()
      .then((data) => {
        if (cancelled) return;
        setUser(data.username);
        setRole(data.role || "user");
        if (data.full_name !== undefined) {
          setFullName(data.full_name || "");
          auth.setFullName(data.full_name || "");
        }
        setChecking(false);
      })
      .catch(() => {
        if (cancelled) return;
        auth.clear();
        setUser(null);
        setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- USB dongle poll: 5s, 3 fail liên tiếp → auto logout ----------
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    failCountRef.current = 0;

    const check = async () => {
      if (cancelled) return;
      try {
        await api.verifyDongle();
        if (cancelled) return;
        failCountRef.current = 0;
        setDongleOk(true);
        setDongleWarn("");
      } catch (err) {
        if (cancelled) return;
        const msg = err?.message || "";
        // 503 = usb_service không phản hồi (không đủ chắc chắn để logout)
        const isServiceDown = /USB service|Không kết nối được USB/i.test(msg);
        if (isServiceDown) {
          setDongleWarn("service_down");
          setDongleOk(false);
          return;
        }
        // Lỗi mạng (Vite drop / ERR_EMPTY_RESPONSE / reset / timeout) — fetch throw
        // trước khi có HTTP response. Không đáng tin để logout: chỉ cảnh báo, KHÔNG
        // tăng fail counter, để Vite/Mạng khôi phục ở poll kế tiếp.
        if (isNetworkError(err)) {
          setDongleOk(false);
          setDongleWarn("warning");
          return;
        }
        // 401 thật (dongle thực sự không có) → tăng fail counter
        failCountRef.current += 1;
        if (failCountRef.current >= DONGLE_MAX_FAIL) {
          auth.clear();
          setUser(null);
          setRole("user");
          failCountRef.current = 0;
        } else {
          setDongleOk(false);
          setDongleWarn("warning");
        }
      }
    };

    check(); // chạy ngay 1 lần
    const id = setInterval(check, DONGLE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  const handleLogin = (username, r = "user", fn = "") => {
    setUser(username);
    setRole(r);
    setFullName(fn || auth.getFullName() || "");
  };
  const handleLogout = () => {
    auth.clear();
    setUser(null);
    setRole("user");
    setFullName("");
  };

  if (checking) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #06142A 0%, #020817 100%)",
        color: "#7E93B8",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 14,
      }}>
        {t("app.checking_session")}
      </div>
    );
  }

  if (!user) return (
    <>
      <Login onLogin={handleLogin} />
      <ToastHost />
    </>
  );
  return (
    <>
      {!dongleOk && dongleWarn === "service_down" && (
        <div
          role="alert"
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0,
            zIndex: 9999,
            background: dongleWarn === "service_down" ? "#7a4a00" : "#b91c1c",
            color: "#fff",
            padding: "8px 16px",
            textAlign: "center",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 2px 8px rgba(0,0,0,.15)",
          }}
        >
          {dongleWarn === "service_down"
            ? t("app.dongle.service_down")
            : t("app.dongle.warning", { sec: (DONGLE_MAX_FAIL - failCountRef.current) * 5 })}
        </div>
      )}
      <Dashboard
        username={user}
        role={role}
        fullName={fullName}
        onFullNameChange={(fn) => {
          const v = fn || "";
          setFullName(v);
          auth.setFullName(v);
        }}
        onLogout={handleLogout}
      />
      <ToastHost />
    </>
  );
}
