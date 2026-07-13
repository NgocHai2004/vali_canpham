
import { useEffect, useState } from "react";
import { api } from "./api";
import DetaineeForm from "./DetaineeForm";

const Icon = {
  dashboard: (
    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
  ),
  users: (
    <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  ),
  building: (
    <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1" /></svg>
  ),
  file: (
    <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></svg>
  ),
  log: (
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24"><path d="M20 6v5h-5M4 18v-5h5" /><path d="M6.1 9A7 7 0 0 1 18 6l2 5M4 13l2 5a7 7 0 0 0 11.9-3" /></svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19V3" /></svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>
  ),
  server: (
    <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" /><path d="M7 7h.01M7 17h.01" /></svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
  ),
};

const NAV = [
  { key: "dashboard", label: "Tổng quan", icon: Icon.dashboard },
  { key: "detainees", label: "Danh sách can phạm", icon: Icon.users },
  { key: "cells", label: "Buồng giam", icon: Icon.building },
  { key: "import", label: "Nhập / Xuất Excel", icon: Icon.file },
  { key: "logs", label: "Nhật ký hệ thống", icon: Icon.log },
];

export default function Dashboard({ username = "admin", onLogout }) {
  const [page, setPage] = useState("dashboard");
  const [dbOk, setDbOk] = useState(true);

  useEffect(() => {
    api.health().then((r) => setDbOk(Boolean(r.ok))).catch(() => setDbOk(false));
  }, []);

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <Header username={username} dbOk={dbOk} onLogout={onLogout} />

        <aside className="sidebar">
          <div className="sidebar-title">CHỨC NĂNG</div>

          <nav className="nav">
            {NAV.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${page === item.key ? "active" : ""}`}
                onClick={() => setPage(item.key)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="security-card">
            <div className="security-icon">{Icon.shield}</div>
            <div>
              <strong>Bảo mật & an toàn</strong>
              <p>Hệ thống nội bộ được giám sát và bảo vệ liên tục.</p>
            </div>
          </div>
        </aside>

        <main className="content">
          {page === "dashboard" && <DashboardHome go={setPage} />}
          {page === "detainees" && <DetaineesPage />}
          {page === "cells" && <CellsPage />}
          {page === "import" && <ImportExportPage />}
          {page === "logs" && <LogsPage />}
        </main>
      </div>
    </>
  );
}

function Header({ username, dbOk, onLogout }) {
  return (
    <header className="header">
      <div className="brand">
        <div className="brand-logo">
          <img src="/brand-logo.png" alt="Công an Nhân dân Việt Nam" />
        </div>
        <div>
          <div className="brand-title">HỆ THỐNG QUẢN LÝ CCCD CAN PHẠM</div>
          <div className="brand-subtitle">Cổng nội bộ • Phiên bản 1.0</div>
        </div>
      </div>

      <div className="header-actions">
        <div className={`server-status ${dbOk ? "online" : "offline"}`}>
          <span />
          {dbOk ? "Kết nối máy chủ" : "Mất kết nối"}
        </div>

        <button className="icon-button" aria-label="Thông báo">
          {Icon.bell}
          <b>3</b>
        </button>

        <div className="user-box">
          <div className="avatar">{username.slice(0, 1).toUpperCase()}</div>
          <div className="user-info">
            <strong>{username}</strong>
            <span>Quản trị viên</span>
          </div>
        </div>

        <button className="logout-button" onClick={onLogout}>
          {Icon.logout}
          Đăng xuất
        </button>
      </div>
    </header>
  );
}

function DashboardHome({ go }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.stats().then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <StateBox type="error">Lỗi: {error}</StateBox>;
  if (!stats) return <StateBox>Đang tải dữ liệu...</StateBox>;

  const malePct = stats.total ? Math.round((stats.male / stats.total) * 100) : 0;

  return (
    <div className="page">
      <PageTitle
        title="Tổng quan"
        subtitle="Bảng điều khiển quản lý hồ sơ can phạm"
        icon={Icon.chart}
      />

      <div className="stat-grid">
        <StatCard
          tone="blue"
          icon={Icon.file}
          label="Tổng hồ sơ"
          value={stats.total}
          note="Đang quản lý"
        />
        <StatCard
          tone="green"
          icon={Icon.file}
          label="Hồ sơ hôm nay"
          value={stats.today}
          note="Mới lập"
        />
        <StatCard
          tone="orange"
          icon={Icon.building}
          label="Số buồng giam"
          value={stats.cells_count}
          note="Đang vận hành"
        />
        <StatCard
          tone="purple"
          icon={Icon.users}
          label="Tỉ lệ Nam / Nữ"
          value={`${stats.male} / ${stats.female}`}
          note={`${malePct}% nam`}
          ring={malePct}
        />
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <PanelHeader
            title="Sức chứa các buồng"
            action="Quản lý buồng"
            onAction={() => go("cells")}
          />

          <div className="cell-list">
            {stats.by_cell.map((cell, index) => {
              const percent = cell.capacity
                ? Math.min(100, Math.round((cell.current / cell.capacity) * 100))
                : 0;

              return (
                <div className="cell-row" key={cell.code}>
                  <div className={`cell-symbol cell-symbol-${index % 4}`}>
                    {Icon.building}
                  </div>
                  <div className="cell-main">
                    <div className="cell-line">
                      <div>
                        <strong>{cell.code}</strong>
                        <span> - {cell.name}</span>
                      </div>
                      <div className="cell-number">
                        {cell.current}/{cell.capacity}
                      </div>
                    </div>
                    <div className="progress">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                  <div className="cell-percent">{percent}%</div>
                </div>
              );
            })}

            {!stats.by_cell.length && (
              <div className="empty">Chưa có dữ liệu buồng giam.</div>
            )}
          </div>
        </section>

        <section className="panel">
          <PanelHeader
            title="Hồ sơ mới nhất"
            action="Xem tất cả"
            onAction={() => go("detainees")}
          />

          <div className="recent-list">
            {stats.recent.map((item) => (
              <div className="recent-item" key={item.id}>
                <div className="recent-avatar">
                  {item.photo_url ? (
                    <img src={item.photo_url} alt="" />
                  ) : (
                    (item.full_name || "?").slice(0, 1).toUpperCase()
                  )}
                </div>

                <div className="recent-content">
                  <strong>{item.full_name}</strong>
                  <span>
                    {item.code} • Buồng {item.cell_code || "—"} •{" "}
                    {item.gender === "female" ? "Nữ" : "Nam"}
                  </span>
                </div>

                <div className="recent-time">Hôm nay</div>
              </div>
            ))}

            {!stats.recent.length && (
              <div className="empty">Chưa có hồ sơ mới.</div>
            )}
          </div>
        </section>
      </div>

      <div className="system-strip">
        <SystemItem icon={Icon.users} label="Tổng can phạm" value={stats.total} note="Đang quản lý" />
        <SystemItem icon={Icon.shield} label="An ninh hệ thống" value="100%" note="An toàn" />
        <SystemItem icon={Icon.server} label="Trạng thái server" value="Ổn định" note="Hoạt động tốt" />
        <SystemItem icon={Icon.log} label="Thời gian hoạt động" value="99.9%" note="Uptime" />
      </div>
    </div>
  );
}

function StatCard({ tone, icon, label, value, note, ring }) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
      {typeof ring === "number" ? (
        <div
          className="stat-ring"
          style={{ background: `conic-gradient(#2563eb ${ring}%, #e8eef9 0)` }}
        >
          <span>{ring}%</span>
        </div>
      ) : (
        <div className="sparkline">⌁</div>
      )}
    </div>
  );
}

function SystemItem({ icon, label, value, note }) {
  return (
    <div className="system-item">
      <div className="system-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </div>
  );
}

function PanelHeader({ title, action, onAction }) {
  return (
    <div className="panel-header">
      <h3>{title}</h3>
      <button onClick={onAction}>
        {action}
        {Icon.arrow}
      </button>
    </div>
  );
}

function PageTitle({ title, subtitle, icon }) {
  return (
    <div className="page-title">
      {icon && <div className="page-title-icon">{icon}</div>}
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function DetaineesPage() {
  const [items, setItems] = useState([]);
  const [cells, setCells] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [cellCode, setCellCode] = useState("");
  const [gender, setGender] = useState("");
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const limit = 20;

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(limit),
      });

      if (q.trim()) params.set("q", q.trim());
      if (cellCode) params.set("cell_code", cellCode);
      if (gender) params.set("gender", gender);

      const result = await api.request(`/api/detainees?${params}`);
      setItems(result.items || []);
      setTotal(result.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.listCells().then(setCells).catch(() => { });
  }, []);

  useEffect(() => {
    load();
  }, [skip, cellCode, gender]);

  const deleteItem = async (item) => {
    if (!window.confirm(`Xoá hồ sơ ${item.code} - ${item.full_name}?`)) return;
    try {
      await api.deleteDetainee(item.id);
      load();
    } catch (e) {
      window.alert(`Lỗi: ${e.message}`);
    }
  };

  const pages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.floor(skip / limit) + 1;

  return (
    <div className="page">
      <PageHeader title="Danh sách can phạm" subtitle={`Tổng ${total} hồ sơ`}>
        <button
          className="button primary"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          {Icon.plus}
          Thêm hồ sơ mới
        </button>
      </PageHeader>

      <form
        className="filter-bar"
        onSubmit={(e) => {
          e.preventDefault();
          setSkip(0);
          load();
        }}
      >
        <input
          className="control search-control"
          placeholder="Tìm theo tên, số CCCD, mã hồ sơ..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <select
          className="control"
          value={cellCode}
          onChange={(e) => {
            setCellCode(e.target.value);
            setSkip(0);
          }}
        >
          <option value="">Tất cả buồng</option>
          {cells.map((cell) => (
            <option key={cell.code} value={cell.code}>
              {cell.code} - {cell.name}
            </option>
          ))}
        </select>

        <select
          className="control"
          value={gender}
          onChange={(e) => {
            setGender(e.target.value);
            setSkip(0);
          }}
        >
          <option value="">Tất cả giới tính</option>
          <option value="male">Nam</option>
          <option value="female">Nữ</option>
        </select>

        <button className="button primary" type="submit">Tìm kiếm</button>
      </form>

      <div className="table-card">
        {loading ? (
          <StateBox>Đang tải...</StateBox>
        ) : error ? (
          <StateBox type="error">{error}</StateBox>
        ) : !items.length ? (
          <StateBox>Không có hồ sơ nào.</StateBox>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ảnh</th>
                <th>Mã hồ sơ</th>
                <th>Họ và tên</th>
                <th>Giới tính</th>
                <th>Ngày sinh</th>
                <th>Số CCCD</th>
                <th>Buồng</th>
                <th>Tội danh</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="table-avatar">
                      {item.photo_url ? (
                        <img src={item.photo_url} alt="" />
                      ) : (
                        (item.full_name || "?").slice(0, 1).toUpperCase()
                      )}
                    </div>
                  </td>
                  <td><strong>{item.code}</strong></td>
                  <td>{item.full_name}</td>
                  <td>{item.gender === "female" ? "Nữ" : "Nam"}</td>
                  <td>{item.dob ? new Date(item.dob).toLocaleDateString("vi-VN") : "-"}</td>
                  <td>{item.cccd_number || "-"}</td>
                  <td>{item.cell_code || "-"}</td>
                  <td className="ellipsis">{item.charge || "-"}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => setViewing(item)}>Xem</button>
                      <button onClick={() => { setEditing(item); setShowForm(true); }}>Sửa</button>
                      <button className="danger-text" onClick={() => deleteItem(item)}>Xoá</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pages > 1 && (
        <div className="pagination">
          <button disabled={!skip} onClick={() => setSkip(Math.max(0, skip - limit))}>← Trước</button>
          <span>Trang {currentPage} / {pages}</span>
          <button disabled={currentPage >= pages} onClick={() => setSkip(skip + limit)}>Sau →</button>
        </div>
      )}

      {showForm && (
        <DetaineeForm
          initial={editing}
          cells={cells}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            load();
          }}
        />
      )}

      {viewing && <DetailModal detainee={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function DetailModal({ detainee, onClose }) {
  const d = detainee;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Chi tiết hồ sơ {d.code}</h3>
          <button onClick={onClose}>×</button>
        </div>

        <div className="detail-layout">
          <div className="detail-photo">
            {d.photo_url ? <img src={d.photo_url} alt="" /> : <span>Không có ảnh</span>}
          </div>

          <div className="detail-grid">
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
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CellsPage() {
  const [cells, setCells] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      setCells(await api.listCells());
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const deleteCell = async (cell) => {
    if (!window.confirm(`Xoá buồng ${cell.code}?`)) return;
    try {
      await api.deleteCell(cell.id);
      load();
    } catch (e) {
      window.alert(`Lỗi: ${e.message}`);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Quản lý buồng giam" subtitle={`${cells.length} buồng`}>
        <button
          className="button primary"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          {Icon.plus}
          Thêm buồng
        </button>
      </PageHeader>

      {error && <StateBox type="error">{error}</StateBox>}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên buồng</th>
              <th>Sức chứa</th>
              <th>Hiện tại</th>
              <th>Tỉ lệ</th>
              <th>Ghi chú</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((cell) => {
              const percent = cell.capacity
                ? Math.round((cell.current / cell.capacity) * 100)
                : 0;

              return (
                <tr key={cell.id}>
                  <td><strong>{cell.code}</strong></td>
                  <td>{cell.name}</td>
                  <td>{cell.capacity}</td>
                  <td>{cell.current}</td>
                  <td>
                    <div className="mini-progress"><span style={{ width: `${Math.min(100, percent)}%` }} /></div>
                    <small>{percent}%</small>
                  </td>
                  <td>{cell.note || "-"}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => { setEditing(cell); setShowForm(true); }}>Sửa</button>
                      <button className="danger-text" onClick={() => deleteCell(cell)}>Xoá</button>
                    </div>
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
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            load();
          }}
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
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        capacity: Number(capacity),
        note,
      };

      if (initial) await api.updateCell(initial.id, payload);
      else await api.createCell(payload);

      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{initial ? "Sửa buồng giam" : "Thêm buồng giam"}</h3>
          <button onClick={onClose}>×</button>
        </div>

        <form className="form" onSubmit={submit}>
          {error && <div className="error-box">{error}</div>}

          <FieldRow label="Mã buồng *">
            <input className="control" value={code} onChange={(e) => setCode(e.target.value)} required disabled={Boolean(initial)} />
          </FieldRow>

          <FieldRow label="Tên buồng *">
            <input className="control" value={name} onChange={(e) => setName(e.target.value)} required />
          </FieldRow>

          <FieldRow label="Sức chứa *">
            <input className="control" type="number" min="0" max="500" value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
          </FieldRow>

          <FieldRow label="Ghi chú">
            <input className="control" value={note} onChange={(e) => setNote(e.target.value)} />
          </FieldRow>

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose}>Huỷ</button>
            <button type="submit" className="button primary" disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportExportPage() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const importFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setResult(null);
    setError("");

    try {
      const data = new FormData();
      data.append("file", file);
      setResult(await api.importXlsx(data));
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="page">
      <PageHeader title="Nhập / Xuất Excel" subtitle="Quản lý dữ liệu hồ sơ bằng file Excel" />

      <div className="feature-grid">
        <section className="feature-card">
          <div className="feature-icon">{Icon.file}</div>
          <h3>Xuất dữ liệu</h3>
          <p>Tải toàn bộ hồ sơ hiện có trong hệ thống ra file Excel.</p>
          <button className="button primary" onClick={() => api.downloadExport()}>
            Xuất Excel
          </button>
        </section>

        <section className="feature-card">
          <div className="feature-icon">{Icon.file}</div>
          <h3>Nhập dữ liệu</h3>
          <p>Tải file mẫu hoặc chọn file .xlsx để nhập dữ liệu hàng loạt.</p>

          <div className="feature-actions">
            <button className="button secondary" onClick={() => api.downloadTemplate()}>
              Tải file mẫu
            </button>

            <label className="button primary">
              {uploading ? "Đang nhập..." : "Chọn file"}
              <input type="file" accept=".xlsx" onChange={importFile} hidden disabled={uploading} />
            </label>
          </div>

          {error && <div className="error-box">{error}</div>}
          {result && (
            <div className="success-box">
              Nhập thành công {result.inserted} hồ sơ.
              {result.errors?.length ? ` Có ${result.errors.length} dòng lỗi.` : ""}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLogs(await api.listLogs());
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const labels = {
    login: "Đăng nhập",
    create: "Tạo mới",
    update: "Cập nhật",
    delete: "Xoá",
    import: "Nhập Excel",
  };

  return (
    <div className="page">
      <PageHeader title="Nhật ký hệ thống" subtitle={`${logs.length} bản ghi gần nhất`}>
        <button className="button secondary" onClick={load}>
          {Icon.refresh}
          Làm mới
        </button>
      </PageHeader>

      {error && <StateBox type="error">{error}</StateBox>}

      <div className="table-card">
        <table>
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
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.at).toLocaleString("vi-VN")}</td>
                <td><strong>{log.actor}</strong></td>
                <td><span className={`status-badge ${log.action}`}>{labels[log.action] || log.action}</span></td>
                <td>{log.resource}</td>
                <td>{log.ref}</td>
                <td>{log.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="page-header-actions">{children}</div>
    </div>
  );
}

function StateBox({ type = "", children }) {
  return <div className={`state-box ${type}`}>{children}</div>;
}

export function FieldRow({ label, children }) {
  return (
    <label className="field-row">
      <span>{label}</span>
      {children}
    </label>
  );
}

const styles = `
  :root {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #0f2344;
    background: #f5f8fd;
    font-synthesis: none;
  }

  * { box-sizing: border-box; }
  body { margin: 0; background: #f5f8fd; }
  button, input, select { font: inherit; }
  button { cursor: pointer; }
  svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .app {
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    display: grid;
    grid-template-columns: 244px minmax(0, 1fr);
    grid-template-rows: 72px minmax(0, 1fr);
    background:
      radial-gradient(circle at 75% 10%, rgba(50, 107, 230, .08), transparent 28%),
      #f5f8fd;
  }

  .header {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 30px;
    color: white;
    background:
      radial-gradient(circle at 45% -140%, rgba(41, 118, 242, .85), transparent 54%),
      linear-gradient(120deg, #0d4dc0 0%, #062a69 100%);
    box-shadow: 0 8px 28px rgba(16, 47, 103, .18);
    z-index: 5;
  }

  .brand, .header-actions, .user-box, .server-status, .logout-button {
    display: flex;
    align-items: center;
  }

  .brand { gap: 14px; }
  .brand-logo {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    overflow: hidden;
    background: transparent;
    flex-shrink: 0;
  }
  .brand-logo img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    filter: drop-shadow(0 2px 6px rgba(0,0,0,.25));
  }

  .brand-title {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: .1px;
  }

  .brand-subtitle {
    margin-top: 5px;
    font-size: 14px;
    color: #d9e8ff;
  }

  .header-actions { gap: 14px; }
  .server-status {
    gap: 9px;
    height: 44px;
    padding: 0 16px;
    border: 1px solid rgba(255,255,255,.18);
    border-radius: 14px;
    background: rgba(2, 28, 79, .28);
    font-size: 14px;
    font-weight: 700;
  }

  .server-status > span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #24d777;
    box-shadow: 0 0 0 5px rgba(36,215,119,.12);
  }

  .server-status.offline > span { background: #ff6b6b; }

  .icon-button {
    position: relative;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 13px;
    color: white;
    background: rgba(255,255,255,.08);
  }

  .icon-button b {
    position: absolute;
    top: -4px;
    right: -2px;
    min-width: 19px;
    height: 19px;
    display: grid;
    place-items: center;
    padding: 0 5px;
    border-radius: 10px;
    background: #ef4444;
    color: white;
    font-size: 11px;
  }

  .user-box { gap: 10px; }
  .avatar {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: linear-gradient(145deg, #4c85e9, #2c5fb7);
    font-size: 18px;
    font-weight: 800;
  }

  .user-info { display: flex; flex-direction: column; min-width: 100px; }
  .user-info strong { font-size: 15px; }
  .user-info span { color: #ccdefd; font-size: 12px; margin-top: 3px; }

  .logout-button {
    gap: 8px;
    height: 44px;
    padding: 0 16px;
    border: 1px solid rgba(255,255,255,.2);
    border-radius: 12px;
    color: white;
    background: rgba(255,255,255,.08);
    font-weight: 700;
  }
  .logout-button:hover { background: rgba(255,255,255,.15); }

  .sidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 18px 16px 16px;
    overflow: hidden;
    background: white;
    border-right: 1px solid #e3eaf5;
  }

  .sidebar-title {
    padding: 0 16px 15px;
    color: #75839b;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .6px;
  }

  .nav { display: flex; flex-direction: column; gap: 8px; }
  .nav-item {
    width: 100%;
    height: 56px;
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 0 17px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: #203653;
    text-align: left;
    font-weight: 600;
    transition: .18s ease;
  }
  .nav-item:hover { background: #f2f6ff; color: #0e5ae4; }
  .nav-item.active {
    color: white;
    background: linear-gradient(135deg, #1471f2, #0755d6);
    box-shadow: 0 10px 22px rgba(12, 91, 224, .25);
  }

  .nav-icon {
    width: 25px;
    display: grid;
    place-items: center;
  }

  .security-card {
    margin-top: auto;
    display: flex;
    gap: 14px;
    padding: 18px;
    border: 1px solid #dbe6f8;
    border-radius: 16px;
    background: linear-gradient(145deg, #f8fbff, #edf5ff);
  }
  .security-card strong { display: block; margin-bottom: 6px; color: #0e459e; font-size: 14px; }
  .security-card p { margin: 0; color: #667791; font-size: 12px; line-height: 1.6; }
  .security-icon {
    flex: 0 0 auto;
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    color: #0d62e3;
    background: #e2edff;
  }

  .content {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 18px 22px;
  }

  .page {
    max-width: 1500px;
    margin: 0 auto;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .page-title {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 0;
    flex-shrink: 0;
  }
  .page-title-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    color: white;
    background: linear-gradient(145deg, #1a68e8, #0e4ebc);
    box-shadow: 0 6px 14px rgba(11, 80, 192, .2);
  }
  .page-title-icon svg { width: 18px; height: 18px; }
  .page-title h1, .page-header h1 {
    margin: 0;
    color: #102441;
    font-size: 22px;
    letter-spacing: -.4px;
  }
  .page-title p, .page-header p {
    margin: 4px 0 0;
    color: #70809a;
    font-size: 13px;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    flex-shrink: 0;
  }

  .stat-card {
    min-height: 96px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border: 1px solid #e4eaf4;
    border-left: 3px solid var(--accent);
    border-radius: 14px;
    background: white;
    box-shadow: 0 4px 14px rgba(18, 52, 97, .05);
  }
  .stat-card.blue { --accent: #2371f4; --soft: #eaf2ff; }
  .stat-card.green { --accent: #12af64; --soft: #e8f9f0; }
  .stat-card.orange { --accent: #ff6b21; --soft: #fff0e7; }
  .stat-card.purple { --accent: #7745db; --soft: #f1ebff; }

  .stat-icon {
    width: 52px;
    height: 52px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--accent);
    background: var(--soft);
  }

  .stat-content {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .stat-content > span {
    color: #6a7891;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .stat-content strong {
    margin-top: 4px;
    color: #071a37;
    font-size: 24px;
    line-height: 1;
  }
  .stat-content small {
    margin-top: 5px;
    color: #75839a;
    font-size: 12px;
  }

  .sparkline {
    margin-left: auto;
    align-self: flex-end;
    color: var(--accent);
    font-size: 38px;
    font-weight: 800;
    transform: rotate(-8deg);
  }

  .stat-ring {
    width: 58px;
    height: 58px;
    margin-left: auto;
    display: grid;
    place-items: center;
    border-radius: 50%;
  }
  .stat-ring span {
    width: 43px;
    height: 43px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: white;
    color: #1d5ccb;
    font-size: 12px;
    font-weight: 800;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: 1.05fr .95fr;
    gap: 14px;
    margin-top: 0;
    flex: 1 1 auto;
    min-height: 0;
  }

  .panel, .table-card, .feature-card, .system-strip {
    border: 1px solid #e2e9f3;
    border-radius: 14px;
    background: white;
    box-shadow: 0 4px 14px rgba(18, 52, 97, .05);
  }

  .panel {
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .panel-header {
    height: 52px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
    border-bottom: 1px solid #e9eef6;
  }
  .panel-header h3 {
    margin: 0;
    color: #102441;
    font-size: 17px;
  }
  .panel-header button {
    display: flex;
    align-items: center;
    gap: 3px;
    border: 0;
    color: #075bea;
    background: transparent;
    font-weight: 700;
  }
  .panel-header button svg { width: 16px; height: 16px; }

  .cell-list {
    padding: 6px 18px 12px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .cell-row {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) 44px;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid #f0f3f8;
  }
  .cell-row:last-child { border-bottom: 0; }
  .cell-symbol {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 10px;
  }
  .cell-symbol svg { width: 16px; height: 16px; }
  .cell-symbol-0 { color: #1267e8; background: #e9f2ff; }
  .cell-symbol-1 { color: #08a860; background: #e8f9f0; }
  .cell-symbol-2 { color: #f26a21; background: #fff0e7; }
  .cell-symbol-3 { color: #7649d6; background: #f1ebff; }

  .cell-line {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 9px;
    color: #2e405a;
    font-size: 14px;
  }
  .cell-line strong { color: #0a1d39; }
  .cell-number {
    padding: 4px 9px;
    border-radius: 8px;
    color: #079452;
    background: #dcf8e9;
    font-size: 12px;
    font-weight: 800;
  }
  .progress, .mini-progress {
    height: 8px;
    overflow: hidden;
    border-radius: 999px;
    background: #e8eef6;
  }
  .progress span, .mini-progress span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #11b865, #2ad57e);
  }
  .cell-percent { color: #6a7890; font-size: 13px; font-weight: 700; }

  .recent-list {
    padding: 4px 18px 12px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .recent-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid #edf1f6;
  }
  .recent-item:last-child { border-bottom: 0; }
  .recent-avatar, .table-avatar {
    overflow: hidden;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #0c61e4;
    background: #e5efff;
    font-weight: 800;
  }
  .recent-avatar { width: 40px; height: 40px; flex: 0 0 auto; font-size: 14px; }
  .recent-avatar img, .table-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .recent-content { min-width: 0; display: flex; flex: 1; flex-direction: column; }
  .recent-content strong { color: #102441; font-size: 13.5px; }
  .recent-content span { margin-top: 3px; color: #6f7f98; font-size: 12px; }
  .recent-time { align-self: flex-start; margin-top: 3px; color: #58708f; font-size: 11px; }

  .system-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    margin-top: 0;
    overflow: hidden;
    flex-shrink: 0;
  }
  .system-item {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 70px;
    padding: 12px 16px;
    border-right: 1px solid #e6ecf4;
  }
  .system-item:last-child { border-right: 0; }
  .system-icon {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 50%;
    color: #1666e7;
    background: #eaf2ff;
  }
  .system-icon svg { width: 16px; height: 16px; }
  .system-item span, .system-item strong, .system-item small { display: block; }
  .system-item span { color: #6d7e97; font-size: 11px; text-transform: uppercase; letter-spacing: .3px; }
  .system-item strong { margin-top: 3px; color: #102441; font-size: 15px; }
  .system-item small { margin-top: 2px; color: #0ba45d; font-size: 11px; }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 24px;
  }
  .page-header-actions { display: flex; gap: 10px; }

  .button {
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 16px;
    border-radius: 10px;
    border: 1px solid transparent;
    font-weight: 700;
    text-decoration: none;
  }
  .button svg { width: 16px; height: 16px; }
  .button.primary {
    color: white;
    background: linear-gradient(135deg, #1672ef, #0755d4);
    box-shadow: 0 7px 16px rgba(12, 91, 224, .18);
  }
  .button.secondary {
    color: #23517e;
    border-color: #d9e4f2;
    background: white;
  }
  .button:disabled { opacity: .55; cursor: not-allowed; }

  .filter-bar {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) 210px 180px auto;
    gap: 12px;
    margin-bottom: 18px;
    padding: 18px;
    border: 1px solid #e2e9f3;
    border-radius: 14px;
    background: white;
  }
  .control {
    width: 100%;
    height: 42px;
    padding: 0 13px;
    border: 1px solid #d9e3f0;
    border-radius: 9px;
    outline: none;
    color: #233b59;
    background: white;
  }
  .control:focus {
    border-color: #4b8df4;
    box-shadow: 0 0 0 3px rgba(34, 113, 236, .12);
  }

  .table-card { overflow: auto; }
  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 920px;
  }
  th, td {
    padding: 15px 16px;
    border-bottom: 1px solid #edf1f6;
    color: #344962;
    text-align: left;
    font-size: 13px;
    vertical-align: middle;
  }
  th {
    color: #62738b;
    background: #f8faff;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .2px;
  }
  tbody tr:hover { background: #fbfdff; }
  .table-avatar { width: 38px; height: 38px; }
  .ellipsis {
    max-width: 210px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .row-actions { display: flex; gap: 7px; }
  .row-actions button {
    padding: 6px 9px;
    border: 1px solid #dce5f1;
    border-radius: 7px;
    color: #23517e;
    background: white;
  }
  .row-actions .danger-text { color: #dc3545; }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-top: 20px;
  }
  .pagination button {
    padding: 8px 12px;
    border: 1px solid #dce5f1;
    border-radius: 8px;
    color: #23517e;
    background: white;
  }

  .mini-progress { width: 120px; margin-bottom: 5px; }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 22px;
  }
  .feature-card { padding: 28px; }
  .feature-icon {
    width: 54px;
    height: 54px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    color: #0c61e4;
    background: #eaf2ff;
  }
  .feature-card h3 { margin: 20px 0 8px; color: #102441; }
  .feature-card p { margin: 0 0 22px; color: #697b95; line-height: 1.6; }
  .feature-actions { display: flex; gap: 10px; flex-wrap: wrap; }

  .status-badge {
    display: inline-block;
    padding: 5px 9px;
    border-radius: 999px;
    color: #1458aa;
    background: #e8f1ff;
    font-size: 11px;
    font-weight: 800;
  }
  .status-badge.delete { color: #bd2636; background: #ffeaed; }
  .status-badge.create { color: #07854b; background: #e6f8ef; }

  .state-box, .empty {
    padding: 36px;
    color: #6c7d95;
    text-align: center;
  }
  .state-box.error { color: #d93649; }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(6, 21, 44, .55);
    backdrop-filter: blur(4px);
  }
  .modal {
    width: min(920px, 100%);
    max-height: 90vh;
    overflow: auto;
    border-radius: 17px;
    background: white;
    box-shadow: 0 30px 80px rgba(0,0,0,.28);
  }
  .small-modal { width: min(520px, 100%); }
  .modal-header {
    height: 68px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    border-bottom: 1px solid #e8edf5;
  }
  .modal-header h3 { margin: 0; color: #102441; }
  .modal-header button {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 8px;
    color: #58708f;
    background: #f1f5fa;
    font-size: 23px;
  }

  .detail-layout {
    display: grid;
    grid-template-columns: 230px 1fr;
    gap: 24px;
    padding: 24px;
  }
  .detail-photo {
    min-height: 270px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 14px;
    color: #8491a4;
    background: #eef3f9;
  }
  .detail-photo img { width: 100%; height: 100%; object-fit: cover; }
  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0,1fr));
    gap: 12px;
  }
  .detail-row {
    padding: 13px;
    border: 1px solid #e6ecf4;
    border-radius: 10px;
    background: #fbfcfe;
  }
  .detail-row span, .detail-row strong { display: block; }
  .detail-row span { color: #7b899e; font-size: 12px; }
  .detail-row strong { margin-top: 5px; color: #253a57; font-size: 14px; }

  .form { padding: 24px; }
  .field-row {
    display: block;
    margin-bottom: 16px;
  }
  .field-row > span {
    display: block;
    margin-bottom: 7px;
    color: #40546e;
    font-size: 13px;
    font-weight: 700;
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 22px;
  }
  .error-box, .success-box {
    margin-top: 16px;
    padding: 12px 14px;
    border-radius: 9px;
    font-size: 13px;
  }
  .error-box { color: #c63142; background: #fff0f2; }
  .success-box { color: #087c48; background: #e8f9f1; }

  @media (max-width: 1180px) {
    .app { grid-template-columns: 220px minmax(0, 1fr); }
    .header { padding: 0 20px; }
    .brand-title { font-size: 17px; }
    .user-info { display: none; }
    .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .system-strip { grid-template-columns: repeat(2, 1fr); }
    .system-item:nth-child(2) { border-right: 0; }
    .system-item:nth-child(-n+2) { border-bottom: 1px solid #e6ecf4; }
  }

  @media (max-width: 900px) {
    .app {
      display: block;
      padding-top: 82px;
    }
    .header {
      position: fixed;
      inset: 0 0 auto 0;
      height: 82px;
      z-index: 20;
    }
    .sidebar { display: none; }
    .content { padding: 22px 16px; }
    .brand-subtitle, .server-status, .icon-button { display: none; }
    .logout-button span { display: none; }
    .dashboard-grid, .feature-grid { grid-template-columns: 1fr; }
    .filter-bar { grid-template-columns: 1fr; }
  }

  @media (max-width: 620px) {
    .brand-title { font-size: 13px; }
    .brand-logo { width: 44px; height: 44px; border-width: 5px; }
    .header-actions { gap: 8px; }
    .avatar { width: 40px; height: 40px; }
    .logout-button { width: 40px; padding: 0; justify-content: center; }
    .stat-grid, .system-strip { grid-template-columns: 1fr; }
    .system-item { border-right: 0; border-bottom: 1px solid #e6ecf4; }
    .system-item:last-child { border-bottom: 0; }
    .page-header { align-items: flex-start; flex-direction: column; }
    .detail-layout, .detail-grid { grid-template-columns: 1fr; }
  }
`;
