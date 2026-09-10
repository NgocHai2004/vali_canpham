// Schema form + chuan hoa du lieu vao cho trang thu nhan.
//
// Tap truong = dung 5 muc cua mau chi ban giay (I nhan than, II vu viec,
// III dac diem nhan dang, IV anh nhan dang, V chi ban van tay) + thanh
// "Thong tin ho so" dau trang. Moi truong khac da bo khoi giao dien.
//
// LEGACY_FORM: cac truong KHONG con o tren trang nhung VAN phai di theo form.
// Ly do: PUT /api/detainees/{id} lam `upd = body.model_dump()` roi $set toan bo,
// nen truong nao khong nam trong payload se bi ghi None. Bo han chung khoi form
// => mo mot ho so cu ra sua ten la xoa sach dien giam giu / ton giao / ghi chu
// cua ho so do. Vi vay giu lai duoi dang du lieu di qua (doc vao, luu ra), khong
// render o nao.
export const LEGACY_FORM = {
  religion: "",
  issued_date: "",
  expiry_date: "",
  issued_place: "",
  cmnd_old: "",
  distinguishing_features: "",
  mrz: "",
  blood_type: "",
  cell_code: "",
  custody_type: "",
  facility_code: "",
  sub_camp_code: "",
  note: "",
  family: [],
  charge: "",
  charge_detail: "",
  decision_no: "",
  date_in: "",
};

export const EMPTY_FORM = {
  // ---- Thong tin ho so (thanh tom tat dau trang) ----
  personal_id: "",
  record_sheet_no: "",   // so danh ban
  fp_sheet_no: "",       // so chi ban van tay
  record_times: "",      // lap lan thu N
  record_date: "",       // ngay lap
  ak_no: "",             // so ho so AK
  record_scope: "",      // local (DP) | central (TW)
  // ---- I. Thong tin nhan than ----
  full_name: "",
  alias: "",              // ten goi khac / bi danh
  gender: "",
  dob: "",
  cccd_number: "",        // CMND / CCCD / ho chieu
  nationality: "",
  ethnicity: "",
  hometown: "",           // que quan
  address: "",            // noi thuong tru
  temp_address: "",       // noi tam tru
  current_address: "",    // noi o hien nay
  occupation: "",
  father_name: "",
  mother_name: "",
  // ---- II. Thong tin vu viec ----
  arrest_date: "",        // bat ngay
  arrest_agency: "",      // don vi bat
  case_about: "",         // lap ve viec / ly do lap ho so
  fp_formula: "",         // C/T van tay (cong thuc van tay, can bo tra cuu)
  // ---- III. Dac diem nhan dang ----
  face_shape: "",              // khuon mat
  height_cm: "",
  nose: "",                    // song mui
  ear_features: "",            // nep tai duoi
  earlobe: "",                 // dai tai
  scars: "",                   // dau vet rieng
  physical_abnormalities: "",  // di hinh
  weight_kg: "",               // can nang — mau 208 khong in, nhung layer 2 co
  // ---- Mau 208: ho so AK + vo/chong + can bo lap ----
  // Truoc day 3 dong nay tren to danh ban luon in TRONG (bang family[] da bo,
  // khong co truong nao mang du lieu). Gio co o nhap that.
  spouse_name: "",             // ho ten vo/chong
  spouse_residence: "",        // cho o cua vo/chong
  officer_name: "",            // can bo lap danh ban + "Can bo lap CB" mau 205
  // ---- Mau 205: khoi 4 o can bo cuoi to chi ban ----
  // O dau ("Can bo lap CB") KHONG co truong rieng: dung chung officer_name vi
  // cung la nguoi lap ho so. Ba o duoi la cong doan luu tru/tra cuu sau khi lap,
  // nguoi khac lam, nen phai co truong rieng.
  officer_sorter: "",          // can bo sap xep
  officer_classifier: "",      // can bo phan loai
  officer_class_checker: "",   // can bo KT phan loai
  // ---- IV. Anh nhan dang: chi la 3 anh trong photos, khong co truong form ----
  ...LEGACY_FORM,
};

export function toDobInput(v) {
  if (!v) return "";
  const s = String(v);
  if (s.includes("/")) return s;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  }
  return s;
}

export function normalizeInitial(initial) {
  if (!initial) return { form: EMPTY_FORM, photos: {} };
  const photos = initial.photos && typeof initial.photos === "object" ? { ...initial.photos } : {};
  if (initial.photo_url && !photos.portrait_front) photos.portrait_front = initial.photo_url;
  return {
    form: {
      ...EMPTY_FORM,
      // ---- Thong tin ho so ----
      personal_id: initial.personal_id || "",
      record_sheet_no: initial.record_sheet_no || "",
      fp_sheet_no: initial.fp_sheet_no || "",
      record_times: initial.record_times != null ? String(initial.record_times) : "",
      record_date: toDobInput(initial.record_date),
      ak_no: initial.ak_no || "",
      record_scope: initial.record_scope || "",
      // ---- I. Thong tin nhan than ----
      full_name: initial.full_name || "",
      alias: initial.alias || "",
      gender: initial.gender || "",
      dob: toDobInput(initial.dob),
      cccd_number: initial.cccd_number || "",
      nationality: initial.nationality || "",
      ethnicity: initial.ethnicity || "",
      hometown: initial.hometown || "",
      address: initial.address || "",
      temp_address: initial.temp_address || "",
      current_address: initial.current_address || "",
      occupation: initial.occupation || "",
      father_name: initial.father_name || "",
      mother_name: initial.mother_name || "",
      // ---- II. Thong tin vu viec ----
      arrest_date: toDobInput(initial.arrest_date),
      arrest_agency: initial.arrest_agency || "",
      case_about: initial.case_about || "",
      // ---- III. Dac diem nhan dang ----
      face_shape: initial.face_shape || "",
      height_cm: initial.height_cm != null ? String(initial.height_cm) : "",
      nose: initial.nose || "",
      ear_features: initial.ear_features || "",
      earlobe: initial.earlobe || "",
      scars: initial.scars || "",
      physical_abnormalities: initial.physical_abnormalities || "",
      weight_kg: initial.weight_kg != null ? String(initial.weight_kg) : "",
      // ---- Mau 208: ho so AK + vo/chong + can bo lap ----
      spouse_name: initial.spouse_name || "",
      spouse_residence: initial.spouse_residence || "",
      officer_name: initial.officer_name || "",
      // ---- Mau 205: khoi can bo chi ban ----
      officer_sorter: initial.officer_sorter || "",
      officer_classifier: initial.officer_classifier || "",
      officer_class_checker: initial.officer_class_checker || "",
      // ---- C/T van tay ----
      fp_formula: initial.fp_formula || "",
      // ---- Du lieu di qua: khong hien tren trang, chi de khong bi ghi None ----
      religion: initial.religion || "",
      issued_date: toDobInput(initial.issued_date),
      expiry_date: toDobInput(initial.expiry_date),
      issued_place: initial.issued_place || "",
      cmnd_old: initial.cmnd_old || "",
      distinguishing_features: initial.distinguishing_features || "",
      mrz: initial.mrz || "",
      blood_type: initial.blood_type || "",
      cell_code: initial.cell_code || "",
      custody_type: initial.custody_type || "",
      facility_code: initial.facility_code || "",
      sub_camp_code: initial.sub_camp_code || "",
      note: initial.note || "",
      family: Array.isArray(initial.family) ? initial.family : [],
      charge: initial.charge || "",
      charge_detail: initial.charge_detail || "",
      decision_no: initial.decision_no || "",
      date_in: toDobInput(initial.date_in),
    },
    photos,
  };
}
