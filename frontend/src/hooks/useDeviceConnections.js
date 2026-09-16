import { useState, useEffect } from "react";
import { fpApi } from "../api";

export function useDeviceConnections() {
  const [status, setStatus] = useState({ camera: false, fp: false });

  useEffect(() => {
    let cancelled = false;

    const checkCamera = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return false;
        const list = await navigator.mediaDevices.enumerateDevices();
        return list.some((d) => d.kind === "videoinput");
      } catch {
        return false;
      }
    };

    const checkFp = async () => {
      try {
        const r = await fpApi.health();
        return Boolean(r && (r.ok === true || r.status === "ok" || r.ready === true));
      } catch {
        return false;
      }
    };

    const runAll = async () => {
      const [camera, fp] = await Promise.all([
        checkCamera(),
        checkFp(),
      ]);
      if (cancelled) return;
      setStatus({ camera, fp });
    };

    runAll();
    const timer = setInterval(runAll, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return status;
}

export default useDeviceConnections;
