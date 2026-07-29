const CHANNEL_NAME = "cccd-preview";
const READY_TIMEOUT_MS = 3000;

export function isDualMonitorSupported() {
  return typeof window !== "undefined" && "getScreenDetails" in window;
}

async function pickSecondaryScreen() {
  const details = await window.getScreenDetails();
  const current = details.currentScreen;
  const others = details.screens.filter((s) => s !== current);
  return others.length > 0 ? others[0] : null;
}

function popupFeatures(screen) {
  const left = Math.round(screen.availLeft);
  const top = Math.round(screen.availTop);
  const width = Math.round(screen.availWidth);
  const height = Math.round(screen.availHeight);
  return `popup=yes,left=${left},top=${top},width=${width},height=${height}`;
}

export async function tryOpenOnSecondaryScreen(payload) {
  if (!isDualMonitorSupported()) return false;

  let screen;
  try {
    screen = await pickSecondaryScreen();
  } catch (err) {
    console.warn("[dual-preview] getScreenDetails failed:", err?.message || err);
    return false;
  }
  if (!screen) return false;

  const url = `${window.location.origin}${window.location.pathname}?preview=1`;
  const popup = window.open(url, "cccd-preview", popupFeatures(screen));
  if (!popup) {
    console.warn("[dual-preview] window.open returned null (popup blocked?)");
    return false;
  }
  try { popup.focus(); } catch { /* noop */ }

  const channel = new BroadcastChannel(CHANNEL_NAME);
  const send = () => channel.postMessage({ type: "payload", payload });

  let sent = false;
  const sendOnce = () => {
    if (sent) return;
    sent = true;
    send();
    setTimeout(() => channel.close(), 500);
  };

  channel.onmessage = (ev) => {
    if (ev?.data?.type === "ready") sendOnce();
  };
  setTimeout(sendOnce, READY_TIMEOUT_MS);

  return true;
}

export const PREVIEW_CHANNEL_NAME = CHANNEL_NAME;
