const STORAGE_KEY = "notif_items_v1";
const EVENT_NAME = "notif:changed";
const MAX_ITEMS = 50;

function readItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeItems(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* noop */
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export const notify = {
  add(message, meta) {
    const items = readItems();
    const item = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      message: String(message || "Thao tác thành công"),
      at: new Date().toISOString(),
      read: false,
    };
    // meta (tuỳ chọn): dữ liệu kèm theo, vd { kind: "match", detainee: {...} }
    // để khi click thông báo mở được hồ sơ đối tượng.
    if (meta && typeof meta === "object") item.meta = meta;
    const next = [item, ...items].slice(0, MAX_ITEMS);
    writeItems(next);
    return item;
  },
  list() {
    return readItems();
  },
  unreadCount() {
    return readItems().filter((x) => !x.read).length;
  },
  markAllRead() {
    const items = readItems();
    if (items.every((x) => x.read)) return;
    writeItems(items.map((x) => ({ ...x, read: true })));
  },
  clearAll() {
    writeItems([]);
  },
  subscribe(fn) {
    const handler = () => fn();
    window.addEventListener(EVENT_NAME, handler);
    const storageHandler = (e) => { if (e.key === STORAGE_KEY) fn(); };
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener("storage", storageHandler);
    };
  },
};
