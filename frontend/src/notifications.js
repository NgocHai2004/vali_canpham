const STORAGE_KEY = "notif_count_v1";
const EVENT_NAME = "notif:changed";

function readCount() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = Number.parseInt(raw || "0", 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeCount(n) {
  try {
    localStorage.setItem(STORAGE_KEY, String(n));
  } catch {
    /* noop */
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { count: n } }));
}

export const notify = {
  add() {
    const next = readCount() + 1;
    writeCount(next);
    return next;
  },
  reset() {
    writeCount(0);
  },
  count() {
    return readCount();
  },
  subscribe(fn) {
    const handler = () => fn(readCount());
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) fn(readCount());
    });
    return () => window.removeEventListener(EVENT_NAME, handler);
  },
};
