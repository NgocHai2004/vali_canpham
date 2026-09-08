// Hằng số cho trang thu nhận dữ liệu / đăng ký can phạm.
// Tách ra từ DataCapturePage.jsx — nội dung giữ nguyên, không đổi logic.

export const FINGERS = [
  { key: "fp_l1", code: "left_thumb" },
  { key: "fp_l2", code: "left_index" },
  { key: "fp_l3", code: "left_middle" },
  { key: "fp_l4", code: "left_ring" },
  { key: "fp_l5", code: "left_little" },
  { key: "fp_r1", code: "right_thumb" },
  { key: "fp_r2", code: "right_index" },
  { key: "fp_r3", code: "right_middle" },
  { key: "fp_r4", code: "right_ring" },
  { key: "fp_r5", code: "right_little" },
];

// Hand layout: little → ring → middle → index → thumb (thumb near middle)
export const LEFT_HAND = [
  { key: "fp_l5", code: "left_little" },
  { key: "fp_l4", code: "left_ring" },
  { key: "fp_l3", code: "left_middle" },
  { key: "fp_l2", code: "left_index" },
  { key: "fp_l1", code: "left_thumb" },
];
export const RIGHT_HAND = [
  { key: "fp_r1", code: "right_thumb" },
  { key: "fp_r2", code: "right_index" },
  { key: "fp_r3", code: "right_middle" },
  { key: "fp_r4", code: "right_ring" },
  { key: "fp_r5", code: "right_little" },
];

export const FP_CODE_TO_KEY = {
  left_thumb: "fp_l1",
  left_index: "fp_l2",
  left_middle: "fp_l3",
  left_ring: "fp_l4",
  left_little: "fp_l5",
  right_thumb: "fp_r1",
  right_index: "fp_r2",
  right_middle: "fp_r3",
  right_ring: "fp_r4",
  right_little: "fp_r5",
};

// 3 cum = BO CUC LUOI (nhom 4 | 2 | 4), va la nguon THU TU cho FP_ROLL_ORDER.
//
// `step` o day KHONG con khop ten buoc nao cua morfin_service: ngon cai gio chup
// rieng tung ngon (thumb_left / thumb_right), khong con buoc "thumbs". Giu lai vi
// no vo hai va xoa ca hang thi FP_ROLL_ORDER mat nguon thu tu - dung cai loi ma
// comment duoi day canh bao. Muon tra step theo ma ngon thi dung FINGER_STEP_OF.
//
// CHI con dung cho bo cuc/thu tu - KHONG dung cho luoi 10 o van lan nua. Truoc day
// luoi 10 o nhom theo cum nay va nhap nhay CA CUM, vi 10 o do thuc chat la 10 ngon
// CAT RA tu 3 anh chum. Gio van lan chup rieng tung ngon (FP_ROLL_STEPS) nen luoi
// nhap nhay TUNG O.
export const FP_CLUSTERS = [
  { step: "left_hand", codes: ["left_little", "left_ring", "left_middle", "left_index"] },
  { step: "thumbs", codes: ["left_thumb", "right_thumb"] },
  { step: "right_hand", codes: ["right_index", "right_middle", "right_ring", "right_little"] },
];

// Ma ngon -> ten buoc CHUM cua morfin_service (khop FINGERS[].step trong api.py).
// Ngon cai co buoc RIENG tung ngon, khong dung chung "thumbs" nhu truoc.
export const FINGER_STEP_OF = {
  left_little: "left_hand", left_ring: "left_hand",
  left_middle: "left_hand", left_index: "left_hand",
  left_thumb: "thumb_left",
  right_thumb: "thumb_right",
  right_index: "right_hand", right_middle: "right_hand",
  right_ring: "right_hand", right_little: "right_hand",
};

// Van LAN: 1 ngon = 1 buoc = 1 lan StartCapture(ROLL). Phai khop DUNG thu tu
// ROLL_ORDER trong api.py, vi service tra next_step theo thu tu do.
//
// Ten buoc la "roll_<ma ngon>" - tien to roll_ de khong dung ten voi buoc chum
// ("left_hand"...) trong cung mot khong gian ten step.
//
// THU TU = DUNG THU TU CAC O TREN LUOI, TU TRAI SANG PHAI. Luoi giu nguyen bo cuc
// cu (nhom theo FP_CLUSTERS) nen o ngoai cung ben trai la UT TRAI, va o cuoi cung
// ben phai la UT PHAI. Vi vay lay thang FP_CLUSTERS lam nguon thu tu, KHONG viet
// lai tay: viet lai la mo duong cho luoi va thu tu chup lech nhau - o dang sang
// se khong phai ngon may dang doi, loi te nhat co the co o day.
export const FP_ROLL_ORDER = FP_CLUSTERS.flatMap((c) => c.codes);
export const FP_ROLL_STEP = (code) => "roll_" + code;
// Ma ngon <- ten buoc lan. Dung de biet buoc dang chay thuoc o nao.
export const FP_ROLL_CODE_BY_STEP = Object.fromEntries(
  FP_ROLL_ORDER.map((code) => [FP_ROLL_STEP(code), code]),
);

// Ảnh vân PHẲNG (plain/slap) — 3 ảnh cụm nguyên bản từ máy, khớp đúng STEPS ở trên.
// Vân LĂN (roll) vẫn dùng key fp_l1..fp_r5 như cũ để tương thích dữ liệu đã lưu.
// O "2 ngon cai" CHIA DOI: ngon cai chup TUNG NGON MOT (2 buoc thumb_left /
// thumb_right o morfin_service), nen o do chua HAI anh rieng thay vi mot anh chum.
// Ly do tach o service: SDK chi tra "Thumb A"/"Thumb B", khong noi ben nao la
// trai => chup chum 2 cai thi phai doan, doan sai la template gan nham ngon.
//
// O co `sub` thi KHONG co `step`/`key` anh cua rieng no: moi nua tu mang key va
// step cua nua do. Ba o giu nguyen (grid 4fr 2fr 4fr khong doi).
export const FP_PLAIN_SLOTS = [
  { key: "fp_plain_left", step: "left_hand", labelKey: "capture.fp.plain_left" },
  {
    key: "fp_plain_thumbs",
    labelKey: "capture.fp.plain_thumbs",
    sub: [
      { key: "fp_plain_left_thumb", step: "thumb_left", side: "left",
        labelKey: "capture.fp.plain_left_thumb" },
      { key: "fp_plain_right_thumb", step: "thumb_right", side: "right",
        labelKey: "capture.fp.plain_right_thumb" },
    ],
  },
  { key: "fp_plain_right", step: "right_hand", labelKey: "capture.fp.plain_right" },
];

// Moi o anh chum (ke ca 2 nua cua o ngon cai) duoi dang phang, de vong thu va
// bo dem khong phai tu di xuyen `sub` o moi cho dung den.
export const FP_PLAIN_CELLS = FP_PLAIN_SLOTS.flatMap((sl) => sl.sub || [sl]);

// Anh CA VUNG PLATEN (anh slap tong) cua mot buoc -> key anh trong `photos`.
// Vong thu tra bang nay de biet buoc dang chay ghi anh vao o nao.
export const FP_SHEET_KEY_BY_STEP = Object.fromEntries(
  FP_PLAIN_CELLS.map((sl) => [sl.step, sl.key]),
);

// Anh chum cu (truoc khi tach ngon cai): MOT anh 2 ngon cai o key nay. Ho so da
// luu van doc duoc - o ngon cai hien nguyen anh cu, khong chia doi, khong migrate.
export const FP_PLAIN_LEGACY_THUMBS = "fp_plain_thumbs";

// Hinh ban tay so do: 4 ngon + ngon cai, ngon dang can lan thi sang len.
// Ban tay TRAI la hinh goc (nhin tu mu ban tay, ngon cai o ben phai);
// ban tay PHAI la ban lat ngang cua no => chi 1 bo path duy nhat.
// Mau lay theo currentColor nen tu an theo class .done / .active / .empty.
export const HAND_FINGERS = [
  { name: "little", x: 4, y: 17 },
  { name: "ring", x: 10.5, y: 11 },
  { name: "middle", x: 17, y: 8.5 },
  { name: "index", x: 23.5, y: 12 },
];

// So lan chup lai toi da cho MOI cum truoc khi dung ca vong thu. Voi nguong 50%
// nguoi dan thuong can vai lan de chinh cach ap tay, nen 5 la qua it: het 5 lan
// la vong thu dung giua duong va cac cum sau khong bao gio duoc chay.
export const FP_MAX_FAILS = 15;

// So lan cho thiet bi nha lock (409) truoc khi bao loi. Dem RIENG voi FP_MAX_FAILS
// vi 409 khong phai loi cua nguoi dan: lan chup TRUOC (luc roi trang) con giu
// thiet bi, cho vai giay la xong. Moi lan cho 1s => tha 20s, du cho truong hop
// service chua kip nha.
export const FP_MAX_BUSY = 20;

export const sleepFp = (ms) => new Promise((r) => setTimeout(r, ms));

// Thu tu 3 anh 3x4 tren chi ban giay: nghieng PHAI 2/3 -> chinh dien ->
// nghieng TRAI 2/3. Khoa (key) giu nguyen portrait_left/front/right de anh da
// luu cua ho so cu khong bi lech o; chi nhan hien thi doi theo mau.
export const PORTRAITS = [
  { key: "portrait_right", labelKey: "capture.portrait.right" },
  { key: "portrait_front", labelKey: "capture.portrait.front" },
  { key: "portrait_left", labelKey: "capture.portrait.left" },
];

export const PREFERRED_CAMERA_LABEL = (import.meta.env.VITE_CCCD_CAMERA_LABEL || "").trim();

// So thu tu IN TREN CHI BAN GIAY: 1..5 tay TRAI (cai -> ut), 6..10 tay PHAI
// (ut -> cai). Luoi o van tay van nhom theo FP_CLUSTERS de khop 3 lan chup cua
// may Morfin va de nut "Xac nhan" theo cum con dung; so nay in len tung o de
// can bo doc ra duoc CA HAI thu tu tren cung mot luoi.
export const FP_SHEET_NO = {
  left_thumb: 1,
  left_index: 2,
  left_middle: 3,
  left_ring: 4,
  left_little: 5,
  right_little: 6,
  right_ring: 7,
  right_middle: 8,
  right_index: 9,
  right_thumb: 10,
};
