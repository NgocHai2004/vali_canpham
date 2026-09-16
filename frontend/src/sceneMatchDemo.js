import { enrolledUrl, SCORE_TOTAL } from "./sceneDemo";

const REAL_HAI_FPS = {
  right_thumb: "/uploads/20260916080128_6aaa4cd86264fc758e900994.png",
  right_index: "/uploads/20260916080136_6aaa4ce06264fc758e900995.png",
  right_middle: "/uploads/20260916080140_6aaa4ce46264fc758e900996.png",
  right_ring: "/uploads/20260916080144_6aaa4ce86264fc758e900997.png",
  right_little: "/uploads/20260916080153_6aaa4cf16264fc758e900998.png",
  left_thumb: "/uploads/20260916080124_6aaa4cd46264fc758e900993.png",
  left_index: "/uploads/20260916080118_6aaa4cce6264fc758e900992.png",
  left_middle: "/uploads/20260916080110_6aaa4cc66264fc758e900991.png",
  left_ring: "/uploads/20260916080106_6aaa4cc26264fc758e900990.png",
  left_little: "/uploads/20260916080058_6aaa4cba6264fc758e90098f.png",
};

const NAMES = [
  ["Nguyễn Ngọc Hải", "026204004933", "12/03/2004", "Nam"],
];

const FINGERS = [
  "fp.finger.right_index.long",
  "fp.finger.right_middle.long",
  "fp.finger.right_ring.long",
  "fp.finger.right_thumb.long",
  "fp.finger.right_little.long",
  "fp.finger.left_index.long",
  "fp.finger.left_middle.long",
  "fp.finger.left_ring.long",
  "fp.finger.left_thumb.long",
  "fp.finger.left_little.long",
];

const FINGER_KEYS = [
  "right_index", "right_middle", "right_ring", "right_thumb", "right_little",
  "left_index", "left_middle", "left_ring", "left_thumb", "left_little",
];

export const FINGER_LABELS = [
  "settings.fp.digit.thumb", "settings.fp.digit.index", "settings.fp.digit.middle",
  "settings.fp.digit.ring", "settings.fp.digit.little",
];

export const SUBJECTS = NAMES.map(([name, cccd, dob, sex], i) => ({
  id: `sub-${i + 1}`,
  name,
  cccd,
  dob,
  sex,
  primary: true,
  photoCount: 10,
  right: [
    { label: FINGER_LABELS[0], url: REAL_HAI_FPS.right_thumb || enrolledUrl(1) },
    { label: FINGER_LABELS[1], url: REAL_HAI_FPS.right_index || enrolledUrl(2) },
    { label: FINGER_LABELS[2], url: REAL_HAI_FPS.right_middle || enrolledUrl(3) },
    { label: FINGER_LABELS[3], url: REAL_HAI_FPS.right_ring || enrolledUrl(4) },
    { label: FINGER_LABELS[4], url: REAL_HAI_FPS.right_little || enrolledUrl(5) },
  ],
  left: [
    { label: FINGER_LABELS[0], url: REAL_HAI_FPS.left_thumb || enrolledUrl(6) },
    { label: FINGER_LABELS[1], url: REAL_HAI_FPS.left_index || enrolledUrl(7) },
    { label: FINGER_LABELS[2], url: REAL_HAI_FPS.left_middle || enrolledUrl(8) },
    { label: FINGER_LABELS[3], url: REAL_HAI_FPS.left_ring || enrolledUrl(9) },
    { label: FINGER_LABELS[4], url: REAL_HAI_FPS.left_little || enrolledUrl(10) },
  ],
}));

export const MATCH_TOTAL = 8;

export const MATCH_ROWS = Array.from({ length: MATCH_TOTAL }, (_, i) => {
  const sub = SUBJECTS[0];
  const fKey = FINGER_KEYS[i % FINGER_KEYS.length];
  const score = 21 - Math.floor((i * 9) / (MATCH_TOTAL - 1));
  const pct = ((score / SCORE_TOTAL) * 100).toFixed(1);
  const h = 9 + Math.floor(i / 4);
  const m = (i * 17) % 60;
  return {
    stt: String(i + 1).padStart(2, "0"),
    code: `DVHT-2026-${String(i + 1).padStart(4, "0")}`,
    name: sub.name,
    cccd: sub.cccd,
    finger: FINGERS[i % FINGERS.length],
    score,
    pct: `(${pct}%)`,
    time: `16/09/2026 ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    candidate_url: REAL_HAI_FPS[fKey] || enrolledUrl(i + 1),
  };
});
