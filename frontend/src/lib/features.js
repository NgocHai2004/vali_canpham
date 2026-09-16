import { useEffect, useState } from "react";
import { api } from "../api";

const ALL_FEATURES = {
  cccd_reader: false,
  weight_scale: false,
  height_yolo: false,
  scan_ocr: true,
};

let cache = null;
let inflight = null;

function normalize(raw) {
  if (!raw || typeof raw !== "object") return ALL_FEATURES;
  return {
    cccd_reader: Boolean(raw.cccd_reader),
    weight_scale: Boolean(raw.weight_scale),
    height_yolo: Boolean(raw.height_yolo),
    scan_ocr: raw.scan_ocr !== false,
  };
}

export function fetchFeatures() {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = api.featureConfig()
    .then((raw) => {
      cache = normalize(raw);
      return cache;
    })
    .catch(() => {
      return ALL_FEATURES;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export function useFeatures() {
  const [features, setFeatures] = useState(cache || ALL_FEATURES);

  useEffect(() => {
    if (cache) {
      setFeatures(cache);
      return;
    }
    let cancelled = false;
    fetchFeatures().then((f) => {
      if (!cancelled) setFeatures(f);
    });
    return () => { cancelled = true; };
  }, []);

  return features;
}
