// Data gia cho man "Phan tich doi sanh" (design D:\Downloads\Phan tich doi sanh).
// He thong chua co engine trich minutiae nen diem tuong dong / ket luan la so dung.
// Anh van tay doi tuong lay lai tu enrolledUrl() — anh that trong backend/uploads/.
//
// Xoa file nay khi backend co bang doi tuong + ket qua doi sanh that.
import { enrolledUrl } from "./sceneDemo";

const NAMES = [
  ["Nguyễn Văn An", "012345678912", "12/03/1992", "Nam"],
  ["Trần Quốc Bảo", "012345678913", "05/09/1988", "Nam"],
  ["Lê Thị Cẩm", "012345678914", "22/11/1995", "Nữ"],
  ["Phạm Hữu Dũng", "012345678915", "30/07/1990", "Nam"],
  ["Hoàng Minh Đức", "012345678916", "18/01/1985", "Nam"],
  ["Vũ Thị Én", "012345678917", "09/06/1998", "Nữ"],
  ["Đỗ Văn Giang", "012345678918", "27/04/1993", "Nam"],
  ["Bùi Thanh Hà", "012345678919", "14/12/1991", "Nữ"],
  ["Ngô Quang Huy", "012345678920", "02/08/1987", "Nam"],
];

const FINGERS = [
  "Ngón trỏ phải", "Ngón giữa phải", "Ngón cái phải",
  "Ngón trỏ trái", "Ngón áp út phải", "Ngón cái trái",
];

export const FINGER_LABELS = ["Cái", "Trỏ", "Giữa", "Áp út", "Út"];

// 4 doi tuong: 1 mo rong san (doi tuong chinh) + 3 thu gon.
export const SUBJECTS = NAMES.map(([name, cccd, dob, sex], i) => ({
  id: `sub-${i + 1}`,
  name,
  cccd,
  dob,
  sex,
  primary: i === 0,
  photoCount: 10,
  // 10 ngon: 5 tay phai + 5 tay trai, anh that khac nhau moi ngon.
  right: FINGER_LABELS.map((label, k) => ({ label, url: enrolledUrl(i * 10 + k + 1) })),
  left: FINGER_LABELS.map((label, k) => ({ label, url: enrolledUrl(i * 10 + k + 6) })),
}));

// 12 cap trung khop — dung so lieu trong design (12 cap).
export const MATCH_TOTAL = 12;

export const MATCH_ROWS = Array.from({ length: MATCH_TOTAL }, (_, i) => {
  const sub = SUBJECTS[i % SUBJECTS.length];
  // Diem giam dan theo thu tu => bang trong nhu da sort theo do tin cay.
  const score = 182 - i * 7;
  const pct = (96.4 - i * 1.35).toFixed(1);
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
    time: `03/09/2026 ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
  };
});
