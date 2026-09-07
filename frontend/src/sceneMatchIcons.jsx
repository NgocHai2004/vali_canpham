// Icon lấy nguyên văn từ design "Phân tích đối sánh" — giữ đúng size,
// stroke-width và path để khớp 1:1. Màu theo currentColor trừ khi design
// hardcode (search/chevron/info dùng #7f95b5, check dùng #fff).
const S = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" };

export const IcReanalyze = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="1.8" {...S}>
    <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8" /><path d="M20 4v4.5h-4.5" />
    <path d="M20 12a8 8 0 0 1-13.7 5.6L4 16" /><path d="M4 20v-4.5h4.5" />
  </svg>
);

export const IcExport = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="1.8" {...S}>
    <path d="M7 3h7l4 4v14H7V3Z" /><path d="M10 12h6M10 16h4" />
  </svg>
);

export const IcSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="1.8" {...S} stroke="#7f95b5">
    <circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" />
  </svg>
);

export const IcFilter = ({ s = 15 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth="1.8" {...S}>
    <path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z" />
  </svg>
);

export const IcChevDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="1.9" {...S} stroke="#7f95b5">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const IcChevRight = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth="1.8" {...S}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const IcChevUp = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="1.8" {...S}>
    <path d="m6 15 6-6 6 6" />
  </svg>
);

export const IcPagePrev = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="1.9" {...S}>
    <path d="m14 6-6 6 6 6" />
  </svg>
);

export const IcPageNext = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="1.9" {...S}>
    <path d="m10 6 6 6-6 6" />
  </svg>
);

export const IcInfo = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="1.7" {...S} stroke="#7f95b5">
    <circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><path d="M12 8h.01" />
  </svg>
);

export const IcPlus = ({ s = 15 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth="2.1" {...S}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IcUpload = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" strokeWidth="1.5" {...S}>
    <path d="M6.5 17a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 17.7 8.2 4 4 0 0 1 17.5 17" />
    <path d="M12 11v7" /><path d="m9 14 3-3 3 3" />
  </svg>
);

export const IcGrid = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="1.8" {...S}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
  </svg>
);

export const IcList = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="1.8" {...S}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const IcCheck = ({ s = 12 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth="3" {...S} stroke="#fff">
    <path d="m5 13 4 4 10-10" />
  </svg>
);

export const IcDots = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="#7f95b5">
    <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
  </svg>
);

// Ảnh chân dung placeholder — design dùng SVG người, không phải ảnh thật.
export const IcPerson = ({ w = 76, h = 96 }) => (
  <svg width={w} height={h} viewBox="0 0 76 96" fill="none">
    <circle cx="38" cy="34" r="19" fill="#4a5f7d" />
    <path d="M4 96c0-19 15-30 34-30s34 11 34 30" fill="#3b506c" />
  </svg>
);

// --- Bo loc / thao tac the (design "Phan tich doi sanh") ---
// Caret cua nut Bo loc: currentColor + xoay khi mo (IcChevDown hardcode #7f95b5).
export const IcCaret = ({ s = 14, open = false }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth="1.9" {...S}
       style={open ? { transform: "rotate(180deg)" } : undefined}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
// Tick trong dropdown: xanh #4f9dff, khac IcCheck (trang, trong dau tich chon).
export const IcTick = ({ s = 14 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth="2.4" {...S} stroke="#4f9dff">
    <path d="m5 13 4 4 10-10" />
  </svg>
);
export const IcClose = ({ s = 16 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth="1.9" {...S}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const IcEye = ({ s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth="1.9" {...S}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12S18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IcPencil = ({ s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth="1.9" {...S}>
    <path d="M15.5 4.5l4 4L8 20H4v-4L15.5 4.5Z" />
  </svg>
);
export const IcTrash = ({ s = 13 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" strokeWidth="1.9" {...S}>
    <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
  </svg>
);

// Avatar mac dinh cho the khong co anh chan dung (design "Phan tich doi sanh":
// dau + vai tren nen gradient). Dung o ca o anh 72x86 va avatar 36px nen ve
// theo viewBox + preserveAspectRatio, khong khoa px.
export const IcAvatar = () => (
  <svg
    viewBox="0 0 76 96"
    preserveAspectRatio="xMidYMax meet"
    width="100%"
    height="100%"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="38" cy="34" r="19" fill="#4a5f7d" />
    <path d="M4 96c0-19 15-30 34-30s34 11 34 30" fill="#3b506c" />
  </svg>
);
