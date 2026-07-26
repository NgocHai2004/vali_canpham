const TOKEN_KEY = "cccd_token";
const USER_KEY = "cccd_user";
const ROLE_KEY = "cccd_role";

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  getUser: () => localStorage.getItem(USER_KEY),
  getRole: () => localStorage.getItem(ROLE_KEY) || "user",
  save: (token, username, role = "user") => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
    localStorage.setItem(ROLE_KEY, role);
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ROLE_KEY);
  },
};

let onAuthExpired = null;
export const setOnAuthExpired = (fn) => { onAuthExpired = fn; };

async function request(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = auth.getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  let res;
  try {
    res = await fetch(path, { ...opts, headers });
  } catch (netErr) {
    throw new Error("Không kết nối được máy chủ (" + netErr.message + ")");
  }
  if (res.status === 401) {
    auth.clear();
    if (onAuthExpired) onAuthExpired();
    throw new Error("Phiên đăng nhập đã hết hạn");
  }
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    console.error("[api]", path, res.status, data);
    let msg;
    if (Array.isArray(data?.detail)) {
      msg = data.detail.map((e) => `${e.loc ? e.loc.join(".") : "?"}: ${e.msg}`).join("; ");
    } else {
      msg = (data && data.detail) || (typeof data === "string" ? data : "Lỗi máy chủ");
    }
    throw new Error(msg);
  }
  return data;
}

async function downloadFile(path, defaultName) {
  const token = auth.getToken();
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error("Tải file thất bại (" + res.status + ")");
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const m = /filename="?([^"]+)"?/.exec(cd);
  const filename = m ? m[1] : defaultName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  request,

  login: async (username, password) => {
    const form = new URLSearchParams();
    form.set("username", username);
    form.set("password", password);
    let res;
    try {
      res = await fetch("/api/auth/login", {
        method: "POST",
        body: form,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    } catch (netErr) {
      throw new Error("Không kết nối được máy chủ (" + netErr.message + ")");
    }
    let data;
    try { data = await res.json(); } catch { throw new Error("Máy chủ trả về không hợp lệ"); }
    if (!res.ok) throw new Error(data.detail || `Đăng nhập thất bại (${res.status})`);
    if (!data.access_token) throw new Error("Máy chủ không trả về token");
    auth.save(data.access_token, data.username, data.role || "user");
    return data;
  },
  me: () => request("/api/auth/me"),
  verifyDongle: () => request("/api/auth/dongle-verify"),
  health: () => fetch("/api/health").then((r) => r.json()).catch(() => ({ ok: false })),

  stats: () => request("/api/stats"),

  listCells: () => request("/api/cells"),
  createCell: (body) => request("/api/cells", { method: "POST", body: JSON.stringify(body) }),
  updateCell: (id, body) => request(`/api/cells/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteCell: (id) => request(`/api/cells/${id}`, { method: "DELETE" }),

  getDetainee: (id) => request(`/api/detainees/${id}`),
  getDetaineeByPersonalId: (personalId) => request(`/api/detainees/by-personal-id/${encodeURIComponent(personalId)}`),
  createDetainee: (body) => request("/api/detainees", { method: "POST", body: JSON.stringify(body) }),
  updateDetainee: (id, body) => request(`/api/detainees/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteDetainee: (id) => request(`/api/detainees/${id}`, { method: "DELETE" }),
  transferDetainee: (id, cell_code) => request(`/api/detainees/${id}/transfer`, {
    method: "POST",
    body: JSON.stringify({ cell_code }),
  }),
  checkDuplicate: (body) => request("/api/detainees/check-duplicate", { method: "POST", body: JSON.stringify(body) }),

  matchFingerprint: (templateB64) => request("/api/detainees/match_fingerprint", {
    method: "POST",
    body: JSON.stringify({ template_b64: templateB64 }),
  }),

  uploadPhoto: async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request("/api/upload/photo", { method: "POST", body: fd });
  },


  importXlsx: async (formData) => request("/api/detainees/import/xlsx", { method: "POST", body: formData }),
  downloadExport: () => downloadFile("/api/detainees/export/xlsx", "can_pham.xlsx"),
  downloadTemplate: () => downloadFile("/api/detainees/template/xlsx", "mau_import.xlsx"),

  listLogs: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const s = qs.toString();
    return request(`/api/logs${s ? `?${s}` : ""}`);
  },

  listUsers: () => request("/api/users"),
  createUser: (body) => request("/api/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id, body) => request(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteUser: (id) => request(`/api/users/${id}`, { method: "DELETE" }),
  uploadUserAvatar: async (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request(`/api/users/${id}/avatar`, { method: "POST", body: fd });
  },

  listSessions: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.set(k, v);
    });
    const s = qs.toString();
    return request(`/api/sessions${s ? `?${s}` : ""}`);
  },
  getCurrentSession: () => request("/api/sessions/current"),
  createSession: (body) => request("/api/sessions", { method: "POST", body: JSON.stringify(body || {}) }),
  getSession: (id) => request(`/api/sessions/${id}`),
  closeSession: (id) => request(`/api/sessions/${id}/close`, { method: "POST" }),
  deleteSession: (id) => request(`/api/sessions/${id}`, { method: "DELETE" }),
  downloadSessionReport: (id, filename) => downloadFile(`/api/sessions/${id}/report`, filename || `session_report.xlsx`),
};

// ============ ZKFinger fingerprint sensor API (python service :8765) ============
async function fpRequest(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !(opts.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  let res;
  try {
    res = await fetch(path, { ...opts, headers });
  } catch (netErr) {
    throw new Error("Không kết nối được máy quét vân tay (" + netErr.message + ")");
  }
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (data && data.detail) || (typeof data === "string" ? data : "Lỗi máy quét vân tay");
    throw new Error(msg);
  }
  return data;
}

export const fpApi = {
  health: () => fpRequest("/fp/api/health"),
  listFingers: () => fpRequest("/fp/api/fingers"),
  startSession: (userName) => fpRequest("/fp/api/session/start", {
    method: "POST",
    body: JSON.stringify({ user_name: userName }),
  }),
  getSession: (sid) => fpRequest(`/fp/api/session/${sid}`),
  capture: (sid) => fpRequest(`/fp/api/session/${sid}/capture`, { method: "POST" }),
  redo: (sid, code) => fpRequest(`/fp/api/session/${sid}/redo/${code}`, { method: "POST" }),
  cancel: (sid) => fpRequest(`/fp/api/session/${sid}`, { method: "DELETE" }),
};

// ============ CCCD reader API (watch folder backend/data_cccd via /api/cccd/*) ============
async function cccdRequest(path, opts = {}, signal) {
  const headers = { ...(opts.headers || {}) };
  const token = auth.getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  let res;
  try {
    res = await fetch(path, { ...opts, headers, signal });
  } catch (netErr) {
    if (netErr.name === "AbortError") throw netErr;
    throw new Error("Không kết nối được máy chủ CCCD (" + netErr.message + ")");
  }
  if (res.status === 204) return { status: "timeout" };
  if (res.status === 401) {
    auth.clear();
    if (onAuthExpired) onAuthExpired();
    throw new Error("Phiên đăng nhập đã hết hạn");
  }
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (data && data.detail) || (typeof data === "string" ? data : "Lỗi máy chủ CCCD");
    throw new Error(msg);
  }
  return data;
}

export const cccdApi = {
  health: () => cccdRequest("/api/cccd/health"),
  startSession: () => cccdRequest("/api/cccd/session/start", { method: "POST" }),
  wait: (sid, signal, timeout = 25) =>
    cccdRequest(`/api/cccd/session/${sid}/wait?timeout=${timeout}`, {}, signal),
  readAgain: (sid) =>
    cccdRequest(`/api/cccd/session/${sid}/read_again`, { method: "POST" }),
  cancel: (sid) =>
    cccdRequest(`/api/cccd/session/${sid}`, { method: "DELETE" }),
};

// ============ Weight scale WebSocket (máy cân bên ngoài POST /api/weight/push) ============
export const weightApi = {
  // Mở WebSocket lắng nghe cân nặng. onValue({weight_kg, source, ts}) mỗi khi máy cân bắn về.
  // Trả về hàm close() để đóng kết nối khi component unmount.
  connect(onValue) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    // Dev Vite (:5173): nối thẳng vào backend :8000, tránh phụ thuộc `ws: true` trong vite.config.js.
    // Prod / khi FE serve cùng host với BE: giữ nguyên location.host.
    const host = location.port === "5173" ? `${location.hostname}:8000` : location.host;
    const url = `${proto}//${host}/api/weight/ws`;
    let ws = null;
    let closed = false;
    let retry = 0;
    let retryTimer = null;

    const open = () => {
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      ws.onopen = () => { retry = 0; };
      ws.onmessage = (e) => {
        let payload;
        try { payload = JSON.parse(e.data); } catch { return; }
        if (payload && typeof payload.weight_kg === "number") onValue(payload);
      };
      ws.onerror = () => { /* để onclose xử lý reconnect */ };
      ws.onclose = () => {
        if (closed) return;
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      retry = Math.min(retry + 1, 4);
      const delay = Math.min(1000 * 2 ** (retry - 1), 10000);
      retryTimer = setTimeout(open, delay);
    };

    open();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      try { ws && ws.close(); } catch { /* noop */ }
    };
  },
};

// base64 PNG (không kèm data:image/png;base64,) → File
export async function b64PngToFile(b64, filename) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const blob = new Blob([buf], { type: "image/png" });
  return new File([blob], filename, { type: "image/png" });
}
