export const PREVIEW_CHANNEL_NAME = "cccd-preview";

const HEARTBEAT_STALE_MS = 4000;

let lastHeartbeatAt = 0;
let listenerChannel = null;

function ensureHeartbeatListener() {
  if (listenerChannel) return;
  try {
    listenerChannel = new BroadcastChannel(PREVIEW_CHANNEL_NAME);
    listenerChannel.onmessage = (ev) => {
      if (ev?.data?.type === "heartbeat") lastHeartbeatAt = Date.now();
    };
  } catch (err) {
    console.warn("[dual-preview] BroadcastChannel unavailable:", err?.message || err);
    listenerChannel = null;
  }
}

export async function tryOpenOnSecondaryScreen(payload) {
  if (typeof BroadcastChannel === "undefined") return false;
  ensureHeartbeatListener();
  if (!listenerChannel) return false;

  const alive = Date.now() - lastHeartbeatAt < HEARTBEAT_STALE_MS;
  if (!alive) return false;

  try {
    listenerChannel.postMessage({ type: "payload", payload });
    return true;
  } catch (err) {
    console.warn("[dual-preview] postMessage failed:", err?.message || err);
    return false;
  }
}
