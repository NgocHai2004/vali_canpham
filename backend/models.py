"""Pydantic models (DTOs) — tất cả request/response schemas."""

from typing import Optional, List
from pydantic import BaseModel, Field


class LoginResp(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str = "admin"
    full_name: str = ""


class UserIn(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_.\-]+$")
    password: str = Field(min_length=6, max_length=100)
    role: str = Field(default="user", pattern=r"^(admin|user)$")
    full_name: str = Field(min_length=1, max_length=100)


class UserPatch(BaseModel):
    password: Optional[str] = Field(None, min_length=6, max_length=100)
    role: Optional[str] = Field(None, pattern=r"^(admin|user)$")
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)


class MePatch(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)
    password: Optional[str] = Field(None, min_length=6, max_length=100)
    current_password: Optional[str] = Field(None, min_length=1, max_length=100)


class SyncLogEntry(BaseModel):
    code: str = ""
    full_name: str = ""
    cccd_number: str = ""


class SyncLogBody(BaseModel):
    added: int = 0
    updated: int = 0
    duplicated: int = 0
    failed: int = 0
    added_items: List[SyncLogEntry] = Field(default_factory=list)
    updated_items: List[SyncLogEntry] = Field(default_factory=list)
    duplicate_items: List[SyncLogEntry] = Field(default_factory=list)
    failed_items: List[SyncLogEntry] = Field(default_factory=list)
    error: Optional[str] = None
    remote: Optional[str] = None


class CellIn(BaseModel):
    code: str = Field(default="", max_length=20)
    name: str = Field(min_length=1, max_length=100)
    capacity: int = Field(ge=0, le=500)
    note: str = ""
    # ---- Phân cấp cơ sở giam giữ (cây) ----
    # level: facility (Trại tạm giam / Nhà tạm giữ)
    #      | sub_camp (Phân trại — con của Trại tạm giam)
    #      | cell (Buồng — con của sub_camp hoặc facility)
    level: str = Field(default="cell", pattern=r"^(facility|sub_camp|cell)$")
    parent: Optional[str] = None        # code của node cha
    custody_type: Optional[str] = None  # tam_giam | tam_giu — chỉ đặt ở cấp facility


class DetaineeIn(BaseModel):
    # full_name KHONG con bat buoc: chi ban chi bat 2 truong (personal_id +
    # cccd_number). De min_length=1 thi pydantic tra 422 truoc khi vao
    # _require_capture_fields, tuc van chan luu du da noi rang buoc o duoi.
    full_name: str = Field("", max_length=100)
    alias: Optional[str] = Field(None, max_length=200)   # bi danh / ten khac
    dob: Optional[str] = None
    gender: str = "male"
    cccd_number: Optional[str] = Field(None, pattern=r"^\d{12}$")
    personal_id: Optional[str] = Field(None, min_length=1, max_length=50)
    cmnd_old: Optional[str] = Field(None, max_length=20)
    nationality: Optional[str] = "Việt Nam"
    hometown: Optional[str] = None
    address: Optional[str] = None
    ethnicity: Optional[str] = None
    religion: Optional[str] = None
    # ---- Noi cu tru: the CCCD chi co ho khau (address); tam tru / cho o hien nay
    # phai khai tay vi can pham thuong khong o dung dia chi tren the ----
    temp_address: Optional[str] = None               # noi tam tru
    current_address: Optional[str] = None            # noi o hien nay
    occupation: Optional[str] = None                 # nghe nghiep
    issued_date: Optional[str] = None
    expiry_date: Optional[str] = None
    issued_place: Optional[str] = None              # cơ quan cấp
    distinguishing_features: Optional[str] = None    # đặc điểm nhận dạng
    mrz: Optional[str] = None                       # MRZ 2-3 dòng
    # ---- Quan hệ gia đình ----
    # [{relation, full_name, birth_year, address}] — số dòng do cán bộ thêm/bớt
    family: Optional[list[dict]] = None
    # Cha / me tach rieng khoi family[] vi chi ban giay co 2 dong CO DINH cho
    # cha va me; family[] van dung cho vo/chong, con, anh chi em...
    father_name: Optional[str] = None                # ho ten cha
    mother_name: Optional[str] = None                # ho ten me
    # Vo/chong tach rieng khoi family[] vi mau 208 cua danh ban co 2 dong CO DINH
    # "Vo (chong)" + "Cho o". family[] van dung cho con, anh chi em...
    spouse_name: Optional[str] = None                # ho ten vo/chong
    spouse_residence: Optional[str] = None           # cho o cua vo/chong
    # ---- Thông tin vụ án ----
    case_about: Optional[str] = None                 # lap ve viec
    # C/T van tay = cong thuc van tay, can bo tra cuu roi nhap. In tren CA HAI to
    # (danh ban 204 + chi ban 205); truoc day hai to do luon in dong nay trong.
    fp_formula: Optional[str] = None                 # C/T vân tay
    charge_detail: Optional[str] = None              # tội danh chi tiết
    arrest_date: Optional[str] = None                # ngày bắt
    arrest_agency: Optional[str] = None              # cơ quan thụ lý
    decision_no: Optional[str] = None                # số quyết định
    # ---- Đặc điểm nhận dạng ----
    scars: Optional[str] = None                      # vết tích, hình xăm
    blood_type: Optional[str] = None                 # nhóm máu
    face_shape: Optional[str] = None                 # dạng mặt
    nose: Optional[str] = None                       # mũi
    ear_features: Optional[str] = None               # nếp tai dưới
    earlobe: Optional[str] = None                    # dái tai
    physical_abnormalities: Optional[str] = None     # dị hình dị dạng
    # ---- So hieu ho so (thanh tom tat dau trang) ----
    record_sheet_no: Optional[str] = None            # số danh bản
    fp_sheet_no: Optional[str] = None                # số chỉ bản vân tay
    # "Lan ngay" tren chi ban giay: lap lan thu N, ngay dd/mm/yyyy. Tach 2 truong
    # vi so lan va ngay lap cua lan do la 2 du kien khac nhau.
    record_times: Optional[str] = None               # lập lần thứ N
    record_date: Optional[str] = None                # ngày lập của lần đó
    ak_no: Optional[str] = None                      # số hồ sơ AK
    record_scope: Optional[str] = None               # local | central
    # Can bo lap danh ban: in san ten o cuoi mau 208 (van ky tay). Khac
    # work_sessions.officer_full_name — do la nguoi mo PHIEN, con day la nguoi
    # lap TO DANH BAN nay, co the khac khi mot phien nhieu can bo cung lam.
    officer_name: Optional[str] = None               # cán bộ lập danh bản
    # Mau 205 (chi ban) co RIENG mot khoi 4 o can bo o cuoi to. O dau tien
    # ("Can bo lap CB") dung chung officer_name — cung la nguoi lap ho so, khong
    # tach lam hai truong cho cung mot thong tin. Ba o con lai la cong doan
    # LUU TRU/TRA CUU sau khi lap, nguoi khac lam, nen phai co truong rieng.
    officer_sorter: Optional[str] = None             # cán bộ sắp xếp
    officer_classifier: Optional[str] = None         # cán bộ phân loại
    officer_class_checker: Optional[str] = None      # cán bộ KT phân loại
    height_cm: Optional[float] = Field(None, ge=50, le=250)
    weight_kg: Optional[float] = Field(None, ge=20, le=200)
    cell_code: Optional[str] = None
    custody_type: Optional[str] = None     # tam_giu | tam_giam — Diện giam giữ
    facility_code: Optional[str] = None    # Nơi giam giữ (Trại tạm giam / Nhà tạm giữ)
    sub_camp_code: Optional[str] = None    # Phân trại (chỉ khi custody_type = tam_giam)
    charge: Optional[str] = None
    date_in: Optional[str] = None
    note: Optional[str] = None
    photo_url: Optional[str] = None
    photos: Optional[dict] = None
    session_id: Optional[str] = None


class WorkSessionIn(BaseModel):
    location: str = Field(default="", max_length=200)
    note: str = Field(default="", max_length=500)
    officer_full_name: Optional[str] = Field(default=None, max_length=100)
    # ---- Noi giam giu cua CA PHIEN ----
    # Mot phien thu nhan dien ra tai MOT cho cu the, nen chot dien + co so + buong
    # ngay luc mo phien. Nho vay form ho so khong phai chon lai cho tung can pham:
    # ca 3 gia tri nay duoc dien san tu phien dang mo.
    custody_type: Optional[str] = Field(default=None, pattern=r"^(tam_giam|tam_giu)$")
    facility_code: Optional[str] = None
    sub_camp_code: Optional[str] = None
    cell_code: Optional[str] = None


class TransferBody(BaseModel):
    cell_code: str


class MatchFingerprintReq(BaseModel):
    # FE gom du N ngon (theo FP_FINGER_CODES) roi gui len. Backend chi dung
    # FP_MATCH_FINGER (left_thumb) de so sanh va ket luan.
    fingers: dict[str, str]   # {"left_thumb": "<b64>", "left_index": "<b64>", ...}


class MatchFingerprintSingleReq(BaseModel):
    template_b64: str


class FingerprintConfigIn(BaseModel):
    by_finger: dict
