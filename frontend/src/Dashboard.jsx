import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import DetaineeForm from "./DetaineeForm";

// ==================== SVG ICON SET ====================
const Icon = {
  dashboard: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  building: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1" />
    </svg>
  ),
  fileSheet: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  ),
  log: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v16H4z" /><path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  cloud: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19a4.5 4.5 0 1 0-1.5-8.74 6 6 0 1 0-11.5 2.24A3.5 3.5 0 0 0 6 20h11.5z" />
      <polyline points="8 14 12 10 16 14" /><line x1="12" y1="10" x2="12" y2="19" />
    </svg>
  ),
  arrowUp: (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  ),
  chevronRight: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
};

const NAV = [
  { key: "dashboard", label: "Tổng quan", icon: Icon.dashboard },
  { key: "detainees", label: "Danh sách can phạm", icon: Icon.users },
  { key: "cells", label: "Buồng giam", icon: Icon.building },
  { key: "import", label: "Nhập / Xuất Excel", icon: Icon.fileSheet },
  { key: "logs", label: "Nhật ký hệ thống", icon: Icon.log },
];

export default function Dashboard({ username, onLogout }) {
  const [page, setPage] = useState("dashboard");
  const [dbOk, setDbOk] = useState(true);

  useEffect(() => {
    api.health().then((h) => setDbOk(!!h.ok)).catch(() => setDbOk(false));
  }, []);

  return (
    <div className="app-shell">
      <TopBanner username={username} onLogout={onLogout} dbOk={dbOk} />
      <aside className="side-nav">
        <div className="side-brand">
          <div className="side-brand-logo">CA</div>
          <div className="side-brand-text">
            <div className="side-brand-l1">Bộ Công An</div>
            <div className="side-brand-l2">Cổng nội bộ</div>
          </div>
        </div>
        <div className="side-title">CHỨC NĂNG</div>
        {NAV.map((n) => (
          <button
            key={n.key}
            className={"nav-item" + (page === n.key ? " active" : "")}
            onClick={() => setPage(n.key)}
          >
            <span className="nav-icon">{n.icon}</span>
            <span className="nav-label">{n.label}</span>
            {page === n.key && <span className="nav-caret">{Icon.chevronRight}</span>}
          </button>
        ))}
      </aside>
      <main className="main-area">
        {page === "dashboard" && <DashboardHome go={setPage} />}
        {page === "detainees" && <DetaineesPage />}
        {page === "cells" && <CellsPage />}
        {page === "import" && <ImportExportPage />}
        {page === "logs" && <LogsPage />}
      </main>
    </div>
  );
}

function TopBanner({ username, onLogout, dbOk }) {
  return (
    <header className="top-banner-app">
      <div className="tb-brand">
        <div className="tb-emblem">
          <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
            <defs>
              <linearGradient id="embG" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#F5C445" /><stop offset="1" stopColor="#D89614" />
              </linearGradient>
            </defs>
            <circle cx="22" cy="22" r="20" fill="url(#embG)" stroke="#B47506" strokeWidth="1.2" />
            <polygon fill="#B71C1C" points="22,10 24.4,17.4 32.2,17.4 25.9,22 28.3,29.4 22,24.8 15.7,29.4 18.1,22 11.8,17.4 19.6,17.4" />
          </svg>
        </div>
        <div className="tb-titles">
          <div className="tb-l1">HỆ THỐNG QUẢN LÝ CCCD CAN PHẠM</div>
          <div className="tb-l2">Cổng nội bộ • Phiên bản 1.0</div>
        </div>
      </div>
      <div className="tb-actions">
        <div className={"tb-status " + (dbOk ? "ok" : "off")}>
          <span className="dot" />
          <span>{dbOk ? "Kết nối máy chủ" : "Mất kết nối"}</span>
        </div>
        <button className="tb-icon-btn" aria-label="Thông báo">
          {Icon.bell}
          <span className="tb-badge">3</span>
        </button>
        <div className="tb-user">
          <div className="tb-avatar">{(username || "?").slice(0, 1).toUpperCase()}</div>
          <div className="tb-user-info">
            <div className="tb-uname">{username}</div>
            <div className="tb-urole">Quản trị viên</div>
          </div>
          <button className="tb-logout" onClick={onLogout}>
            {Icon.logout}
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    </header>
  );
}

// ==================== SPARKLINE ====================
function Sparkline({ data, color = "#1e5eff" }) {
  if (!data || data.length < 2) return null;
  const w = 120, h = 32, pad = 2;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const step = (w - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = path + ` L ${pts[pts.length - 1][0].toFixed(1)} ${h} L ${pts[0][0].toFixed(1)} ${h} Z`;
  const gid = `sp-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" className="spark">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ==================== DASHBOARD HOME ====================
function DashboardHome({ go }) {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.stats().then(setStats).catch((e) => setErr(e.message));
  }, []);

  const spark = useMemo(() => {
    if (!stats) return { total: [], today: [], cells: [], gender: [] };
    const t = Number(stats.total) || 0;
    const td = Number(stats.today) || 0;
    const cc = Number(stats.cells_count) || 0;
    const male = Number(stats.male) || 0;
    const seed = (base, jitter, steps = 14, up = true) => {
      const arr = [];
      for (let i = 0; i < steps; i++) {
        const progress = i / (steps - 1);
        const drift = up ? progress : 1 - progress;
        const noise = Math.sin(i * 1.7 + base) * jitter;
        arr.push(Math.max(0, base * (0.55 + drift * 0.45) + noise));
      }
      return arr;
    };
    return {
      total: seed(Math.max(t, 8), Math.max(t * 0.05, 1), 14, true),
      today: seed(Math.max(td, 3), Math.max(td * 0.3, 1), 14, true),
      cells: seed(Math.max(cc, 4), 0.6, 14, false),
      gender: seed(Math.max(male, 6), Math.max(male * 0.08, 1), 14, true),
    };
  }, [stats]);

  if (err) return <div className="center-msg err">Lỗi: {err}</div>;
  if (!stats) return <div className="center-msg">Đang tải...</div>;

  const malePct = stats.total ? Math.round((stats.male / stats.total) * 100) : 0;

  return (
    <div className="page-body">
      <PageHeader
        title="Tổng quan"
        subtitle="Bảng điều khiển quản lý hồ sơ can phạm"
      >
        <button className="btn-ghost" onClick={() => window.location.reload()}>
          {Icon.refresh}<span>Làm mới</span>
        </button>
        <button className="btn-primary" onClick={() => go("detainees")}>
          {Icon.plus}<span>Thêm hồ sơ</span>
        </button>
      </PageHeader>

      <SectionHeader label="Thống kê tổng quan" />
      <div className="kpi-grid">
        <KpiCard label="Tổng hồ sơ" value={stats.total} tone="blue" icon={Icon.users}
          delta="+4.2%" deltaTone="up" hint="So với tháng trước"
          spark={spark.total} sparkColor="#1e5eff" />
        <KpiCard label="Hồ sơ hôm nay" value={stats.today} tone="green" icon={Icon.fileSheet}
          delta={stats.today > 0 ? `+${stats.today}` : "0"} deltaTone="up" hint="Mới lập trong ngày"
          spark={spark.today} sparkColor="#16a34a" />
        <KpiCard label="Số buồng giam" value={stats.cells_count} tone="amber" icon={Icon.building}
          delta="Ổn định" deltaTone="flat" hint="Đang vận hành"
          spark={spark.cells} sparkColor="#ea580c" />
        <KpiCard label="Tỉ lệ Nam / Nữ" value={`${stats.male} / ${stats.female}`} tone="violet" icon={Icon.activity}
          delta={stats.total ? `${malePct}% nam` : "-"} deltaTone="flat" hint="Tỉ lệ giới tính"
          spark={spark.gender} sparkColor="#7c3aed" />
      </div>

      <SectionHeader label="Chi tiết hệ thống" />
      <div className="two-col">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Sức chứa các buồng</h3>
              <div className="panel-sub">Theo dõi trạng thái sử dụng buồng giam</div>
            </div>
            <button className="link-btn" onClick={() => go("cells")}>
              <span>Quản lý buồng</span>{Icon.chevronRight}
            </button>
          </div>
          <div className="panel-body">
            {stats.by_cell.map((c) => {
              const pct = c.capacity ? Math.min(100, Math.round((c.current / c.capacity) * 100)) : 0;
              const level = pct >= 90 ? "danger" : pct >= 70 ? "warn" : "ok";
              return (
                <div key={c.code} className="cell-row">
                  <div className="cell-row-head">
                    <div><strong>{c.code}</strong> — {c.name}</div>
                    <div className={"cell-stat " + level}>{c.current}/{c.capacity}</div>
                  </div>
                  <div className="cell-bar">
                    <div className={"cell-bar-fill " + level} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {stats.by_cell.length === 0 && <div className="empty">Chưa có buồng nào</div>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Hồ sơ mới nhất</h3>
              <div className="panel-sub">Các hồ sơ vừa được lập</div>
            </div>
            <button className="link-btn" onClick={() => go("detainees")}>
              <span>Xem tất cả</span>{Icon.chevronRight}
            </button>
          </div>
          <div className="panel-body">
            {stats.recent.map((d) => (
              <div key={d.id} className="recent-row">
                <div className="recent-avatar">
                  {d.photo_url ? <img src={d.photo_url} alt="" />
                    : <span>{(d.full_name || "?").slice(0, 1).toUpperCase()}</span>}
                </div>
                <div className="recent-info">
                  <div><strong>{d.full_name}</strong></div>
                  <div className="muted small">
                    {d.code} • Buồng {d.cell_code || "-"} • {d.gender === "female" ? "Nữ" : "Nam"}
                  </div>
                </div>
                <span className="recent-tag">Mới</span>
              </div>
            ))}
            {stats.recent.length === 0 && (
              <div className="empty">Chưa có hồ sơ nào — hãy thêm hồ sơ đầu tiên</div>
            )}
          </div>
        </section>
      </div>

    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <div className="section-header">
      <span className="section-bar" />
      <span className="section-label">{label}</span>
    </div>
  );
}

function KpiCard({ label, value, tone, icon, delta, deltaTone, hint, spark, sparkColor }) {
  return (
    <div className={"kpi kpi-" + tone}>
      <div className="kpi-top">
        <div className="kpi-info">
          <div className="kpi-label">{label}</div>
          <div className="kpi-value">{value}</div>
        </div>
        <div className={"kpi-icon kpi-icon-" + tone}>{icon}</div>
      </div>
      {delta && (
        <div className="kpi-meta">
          <span className={"kpi-delta " + (deltaTone || "flat")}>
            {deltaTone === "up" && <span className="kpi-delta-arrow">{Icon.arrowUp}</span>}
            {delta}
          </span>
          {hint && <span className="kpi-hint">{hint}</span>}
        </div>
      )}
      {spark && spark.length > 0 && (
        <div className="kpi-spark"><Sparkline data={spark} color={sparkColor} /></div>
      )}
    </div>
  );
}

// ==================== DETAINEES PAGE ====================
function DetaineesPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [cellCode, setCellCode] = useState("");
  const [gender, setGender] = useState("");
  const [skip, setSkip] = useState(0);
  const limit = 20;
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [cells, setCells] = useState([]);
  const [viewing, setViewing] = useState(null);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
      if (q) params.set("q", q);
      if (cellCode) params.set("cell_code", cellCode);
      if (gender) params.set("gender", gender);
      const res = await api.request(`/api/detainees?${params}`);
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { api.listCells().then(setCells).catch(() => {}); }, []);
  useEffect(() => { load(); }, [skip, cellCode, gender]);

  const doSearch = (e) => { e.preventDefault(); setSkip(0); load(); };

  const del = async (d) => {
    if (!confirm(`Xoá hồ sơ ${d.code} - ${d.full_name}?`)) return;
    try {
      await api.deleteDetainee(d.id);
      load();
    } catch (e) { alert("Lỗi: " + e.message); }
  };

  const pages = Math.max(1, Math.ceil(total / limit));
  const curPage = Math.floor(skip / limit) + 1;

  return (
    <div className="page-body">
      <PageHeader title="Danh sách can phạm" subtitle={`Tổng ${total} hồ sơ`}>
        <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          {Icon.plus}<span>Thêm hồ sơ mới</span>
        </button>
      </PageHeader>

      <form className="filters" onSubmit={doSearch}>
        <input
          className="input"
          placeholder="Tìm theo tên, số CCCD, mã hồ sơ..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input" value={cellCode} onChange={(e) => { setCellCode(e.target.value); setSkip(0); }}>
          <option value="">Tất cả buồng</option>
          {cells.map((c) => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}
        </select>
        <select className="input" value={gender} onChange={(e) => { setGender(e.target.value); setSkip(0); }}>
          <option value="">Tất cả giới tính</option>
          <option value="male">Nam</option>
          <option value="female">Nữ</option>
        </select>
        <button className="btn-primary" type="submit">Tìm</button>
      </form>

      <div className="table-wrap">
        {loading ? (
          <div className="center-msg">Đang tải...</div>
        ) : err ? (
          <div className="center-msg err">{err}</div>
        ) : items.length === 0 ? (
          <div className="center-msg">Không có hồ sơ nào</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Ảnh</th>
                <th>Mã HS</th>
                <th>Họ và tên</th>
                <th>Giới tính</th>
                <th>Ngày sinh</th>
                <th>Số CCCD</th>
                <th>Buồng</th>
                <th>Tội danh</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="tbl-avatar">
                      {d.photo_url
                        ? <img src={d.photo_url} alt="" />
                        : <span>{(d.full_name || "?").slice(0, 1).toUpperCase()}</span>}
                    </div>
                  </td>
                  <td><strong>{d.code}</strong></td>
                  <td>{d.full_name}</td>
                  <td>{d.gender === "female" ? "Nữ" : "Nam"}</td>
                  <td>{d.dob ? new Date(d.dob).toLocaleDateString("vi-VN") : "-"}</td>
                  <td>{d.cccd_number || "-"}</td>
                  <td>{d.cell_code || "-"}</td>
                  <td className="truncate" title={d.charge}>{d.charge || "-"}</td>
                  <td className="actions">
                    <button className="btn-mini" onClick={() => setViewing(d)}>Xem</button>
                    <button className="btn-mini" onClick={() => { setEditing(d); setShowForm(true); }}>Sửa</button>
                    <button className="btn-mini danger" onClick={() => del(d)}>Xoá</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="pagination">
          <button disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - limit))}>← Trước</button>
          <span>Trang {curPage} / {pages}</span>
          <button disabled={curPage >= pages} onClick={() => setSkip(skip + limit)}>Sau →</button>
        </div>
      )}

      {showForm && (
        <DetaineeForm
          initial={editing}
          cells={cells}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }}
        />
      )}
      {viewing && (
        <DetailModal detainee={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

function DetailModal({ detainee, onClose }) {
  const d = detainee;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Chi tiết hồ sơ {d.code}</h3>
          <button className="close-x" onClick={onClose}>×</button>
        </div>
        <div className="detail-body">
          <div className="detail-photo">
            {d.photo_url ? <img src={d.photo_url} alt="" /> : <div className="ph"><span>Không có ảnh</span></div>}
          </div>
          <div className="detail-fields">
            <DetailRow label="Họ và tên" value={d.full_name} />
            <DetailRow label="Giới tính" value={d.gender === "female" ? "Nữ" : "Nam"} />
            <DetailRow label="Ngày sinh" value={d.dob ? new Date(d.dob).toLocaleDateString("vi-VN") : "-"} />
            <DetailRow label="Số CCCD" value={d.cccd_number || "-"} />
            <DetailRow label="Dân tộc" value={d.ethnicity || "-"} />
            <DetailRow label="Tôn giáo" value={d.religion || "-"} />
            <DetailRow label="Quê quán" value={d.hometown || "-"} />
            <DetailRow label="Địa chỉ" value={d.address || "-"} />
            <DetailRow label="Buồng giam" value={d.cell_code || "-"} />
            <DetailRow label="Tội danh" value={d.charge || "-"} />
            <DetailRow label="Ngày vào" value={d.date_in ? new Date(d.date_in).toLocaleDateString("vi-VN") : "-"} />
            <DetailRow label="Ghi chú" value={d.note || "-"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{value}</div>
    </div>
  );
}

// ==================== CELLS PAGE ====================
function CellsPage() {
  const [cells, setCells] = useState([]);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      setCells(await api.listCells());
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const del = async (c) => {
    if (!confirm(`Xoá buồng ${c.code}?`)) return;
    try {
      await api.deleteCell(c.id);
      load();
    } catch (e) { alert("Lỗi: " + e.message); }
  };

  return (
    <div className="page-body">
      <PageHeader title="Quản lý buồng giam" subtitle={`${cells.length} buồng`}>
        <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          {Icon.plus}<span>Thêm buồng</span>
        </button>
      </PageHeader>
      {err && <div className="center-msg err">{err}</div>}
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên buồng</th>
              <th>Sức chứa</th>
              <th>Hiện tại</th>
              <th>Tỉ lệ</th>
              <th>Ghi chú</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cells.map((c) => {
              const pct = c.capacity ? Math.round((c.current / c.capacity) * 100) : 0;
              return (
                <tr key={c.id}>
                  <td><strong>{c.code}</strong></td>
                  <td>{c.name}</td>
                  <td>{c.capacity}</td>
                  <td>{c.current}</td>
                  <td>
                    <div className="mini-bar">
                      <div className="mini-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <span className="small muted">{pct}%</span>
                  </td>
                  <td>{c.note}</td>
                  <td className="actions">
                    <button className="btn-mini" onClick={() => { setEditing(c); setShowForm(true); }}>Sửa</button>
                    <button className="btn-mini danger" onClick={() => del(c)}>Xoá</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showForm && (
        <CellForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function CellForm({ initial, onClose, onSaved }) {
  const [code, setCode] = useState(initial?.code || "");
  const [name, setName] = useState(initial?.name || "");
  const [capacity, setCapacity] = useState(initial?.capacity ?? 20);
  const [note, setNote] = useState(initial?.note || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setSaving(true);
    try {
      const body = { code: code.trim(), name: name.trim(), capacity: Number(capacity), note };
      if (initial) await api.updateCell(initial.id, body);
      else await api.createCell(body);
      onSaved();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{initial ? "Sửa buồng giam" : "Thêm buồng giam"}</h3>
          <button className="close-x" onClick={onClose}>×</button>
        </div>
        <form onSubmit={submit} className="modal-form">
          {err && <div className="err-box">{err}</div>}
          <FieldRow label="Mã buồng *">
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} required disabled={!!initial} />
          </FieldRow>
          <FieldRow label="Tên buồng *">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </FieldRow>
          <FieldRow label="Sức chứa *">
            <input className="input" type="number" min="0" max="500" value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
          </FieldRow>
          <FieldRow label="Ghi chú">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </FieldRow>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Huỷ</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==================== IMPORT / EXPORT ====================
function ImportExportPage() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  const doImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr(""); setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.importXlsx(fd);
      setResult(r);
    } catch (e) { setErr(e.message); } finally { setUploading(false); e.target.value = ""; }
  };

  return (
    <div className="page-body">
      <PageHeader title="Nhập / Xuất Excel" subtitle="Nhập danh sách hồ sơ hàng loạt từ file .xlsx" />
      <div className="two-col">
        <section className="panel">
          <div className="panel-head"><h3>Xuất dữ liệu</h3></div>
          <div className="panel-body">
            <p className="muted">Tải xuống toàn bộ hồ sơ đang có trong hệ thống ra file Excel.</p>
            <a className="btn-primary" href="/api/detainees/export/xlsx" onClick={(e) => { e.preventDefault(); api.downloadExport(); }}>
              Xuất Excel
            </a>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h3>Nhập dữ liệu</h3></div>
          <div className="panel-body">
            <p className="muted">Chọn file .xlsx theo mẫu để nhập hàng loạt.</p>
            <a className="btn-ghost" href="/api/detainees/template/xlsx" onClick={(e) => { e.preventDefault(); api.downloadTemplate(); }}>
              Tải file mẫu
            </a>
            <label className="btn-primary" style={{ marginLeft: 8, cursor: "pointer" }}>
              {uploading ? "Đang nhập..." : "Chọn file để nhập"}
              <input type="file" accept=".xlsx" onChange={doImport} style={{ display: "none" }} disabled={uploading} />
            </label>

            {err && <div className="err-box" style={{ marginTop: 12 }}>{err}</div>}
            {result && (
              <div style={{ marginTop: 12 }}>
                <div className="ok-box">Nhập thành công {result.inserted} hồ sơ</div>
                {result.errors.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary>{result.errors.length} dòng lỗi</summary>
                    <ul className="small">
                      {result.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ==================== LOGS PAGE ====================
function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [err, setErr] = useState("");

  const load = async () => {
    try { setLogs(await api.listLogs()); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const ACTION_LABEL = {
    login: "Đăng nhập", create: "Tạo mới", update: "Cập nhật",
    delete: "Xoá", import: "Nhập Excel",
  };

  return (
    <div className="page-body">
      <PageHeader title="Nhật ký hệ thống" subtitle={`${logs.length} bản ghi gần nhất`}>
        <button className="btn-ghost" onClick={load}>{Icon.refresh}<span>Làm mới</span></button>
      </PageHeader>
      {err && <div className="center-msg err">{err}</div>}
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Người dùng</th>
              <th>Hành động</th>
              <th>Đối tượng</th>
              <th>Tham chiếu</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.at).toLocaleString("vi-VN")}</td>
                <td><strong>{l.actor}</strong></td>
                <td><span className={"badge b-" + l.action}>{ACTION_LABEL[l.action] || l.action}</span></td>
                <td>{l.resource}</td>
                <td>{l.ref}</td>
                <td className="muted small">{l.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== SHARED COMPONENTS ====================
function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="page-header-actions">{children}</div>
    </div>
  );
}

export function FieldRow({ label, children }) {
  return (
    <div className="field-row">
      <label>{label}</label>
      {children}
    </div>
  );
}
