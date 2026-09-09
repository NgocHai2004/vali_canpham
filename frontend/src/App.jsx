import { useEffect, useState } from "react";
import { auth, api, setOnAuthExpired } from "./api";
import Login from "./Login";
import Dashboard from "./Dashboard";
import ToastHost from "./Toast";
import { useI18n } from "./i18n";

export default function App() {
  const { t } = useI18n();
  const [user, setUser] = useState(auth.getUser());
  const [checking, setChecking] = useState(!!auth.getToken());

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
