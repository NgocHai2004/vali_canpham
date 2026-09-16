import { useEffect, useState } from "react";
import { api } from "../api";

// Co bat/tat 3 thiet bi ngoai vi, doc tu GET /api/config/features (nguon: .env).
//
// LUU Y QUAN TRONG: tat may CHI an phan dieu khien thiet bi. Moi truong nhap tay
// van giu nguyen — so CCCD, ho ten, ngay sinh, que quan, dia chi, dan toc, ton
// giao, height_cm, weight_kg deu nhap va luu binh thuong.
const ALL_ON = { cccd_reader: true, weight_scale: true, height_yolo: true };

let cache = null;      // ket qua da fetch (dung chung cho moi component)
let inflight = null;   // promise dang bay, tranh goi API nhieu lan song song

function normalize(raw) {
  if (!raw || typeof raw !== "object") return ALL_ON;
  return {
    cccd_reader: raw.cccd_reader !== false,
    weight_scale: raw.weight_scale !== false,
    height_yolo: raw.height_yolo !== false,
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
      // Fetch loi (mat mang, backend cu chua co endpoint) -> coi nhu BAT het,
      // giu dung hanh vi truoc day. Khong cache de lan sau thu lai.
      return ALL_ON;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

// Hook doc co. Tra ve ALL_ON cho lan render dau (truoc khi fetch xong) de UI
// khong nhay: an roi hien lai con te hon hien roi an.
export function useFeatures() {
  const [features, setFeatures] = useState(cache || ALL_ON);

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
