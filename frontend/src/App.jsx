import { useEffect, useState } from "react";
import { auth, api, setOnAuthExpired } from "./api";
import Login from "./Login";
import Dashboard from "./Dashboard";

export default function App() {
  const [user, setUser] = useState(auth.getUser());
  const [checking, setChecking] = useState(!!auth.getToken());

  useEffect(() => {
    setOnAuthExpired(() => {
      setUser(null);
    });
  }, []);

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

  const handleLogin = (username) => setUser(username);
  const handleLogout = () => {
    auth.clear();
    setUser(null);
  };

  if (checking) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #f4f7ff 0%, #e6eeff 100%)",
        color: "#5b6b85",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 14,
      }}>
        Đang kiểm tra phiên đăng nhập...
      </div>
    );
  }

  if (!user) return <Login onLogin={handleLogin} />;
  return <Dashboard username={user} onLogout={handleLogout} />;
}
