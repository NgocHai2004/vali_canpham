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
    const safetyTimer = setTimeout(() => {
      if (!cancelled) {
        setChecking(false);
      }
    }, 3000);

    api
      .me()
      .then((data) => {
        if (cancelled) return;
        clearTimeout(safetyTimer);
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
        clearTimeout(safetyTimer);
        auth.clear();
        setUser(null);
        setChecking(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
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
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #06142A 0%, #020817 100%)",
        color: "#7E93B8",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 14,
        gap: 12,
      }}>
        <div style={{
          width: 28,
          height: 28,
          border: "3px solid rgba(53,216,255,0.2)",
          borderTopColor: "#35d8ff",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite"
        }} />
        <div>{t("app.checking_session")}</div>
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
