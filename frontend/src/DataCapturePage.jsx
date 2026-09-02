import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import DuplicateWarnModal from "./DuplicateWarnModal";
import { toast } from "./Toast";
import UsbDrivePickerModal from "./UsbDrivePickerModal";
import { api, fpApi, cccdApi, b64PngToFile, usbApi } from "./api";
import { HandGlyph } from "./capture/components/HandGlyph";
import { FINGERS, LEFT_HAND, RIGHT_HAND, FP_CODE_TO_KEY, FP_CLUSTERS, FP_SHEET_NO, FP_MAX_FAILS, FP_MAX_BUSY, sleepFp, PORTRAITS, FP_PLAIN_SLOTS } from "./capture/constants";
import { RecordSummary } from "./capture/sections/RecordSummary";
import { SectionCase } from "./capture/sections/SectionCase";
import { SectionPersonal } from "./capture/sections/SectionPersonal";
import { SectionPortraits } from "./capture/sections/SectionPortraits";
import { SectionIdentify } from "./capture/sections/SectionIdentify";
import { EMPTY_FORM, normalizeInitial, toDobInput } from "./capture/formSchema";
import { FpSheetPreviewModal } from "./capture/FpSheetPreview";
import { NameSheetPreviewModal } from "./capture/NameSheetPreview";
import { useI18n, apiT } from "./i18n";
import { tryOpenOnSecondaryScreen, clearSecondaryScreenPreview } from "./lib/dualMonitorPreview";
import { buildProfilePdfBlob, makePdfFileName } from "./lib/exportProfilePdf";
import { getMeasurementHeight } from "./lib/heightMeasurement";
import { notify } from "./notifications";

export default function DataCapturePage({ go, initial, onDone, sessionId, sessionCode, sessionReadOnly = false, onSavedInSession, onEditProfile }) {
  const { t, formatDateLong } = useI18n();
  const isEdit = Boolean(initial && initial.id);
  const seed = useMemo(() => normalizeInitial(initial), [initial]);
  const [form, setForm] = useState(seed.form);
  const [photos, setPhotos] = useState(seed.photos);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [reading, setReading] = useState(false);
  const cccdSidRef = useRef(null);
  const cccdAbortRef = useRef(null);
  const fpRunningRef = useRef(false);                    // ref phản chiếu fpRunning cho auto-start effect
  const fpCountRef = useRef(0);                          // ref phản chiếu số ngón đã thu cho auto-start effect
  const [cells, setCells] = useState([]);
  const [fpRunning, setFpRunning] = useState(false);
  const [fpNextCode, setFpNextCode] = useState(null);
  // Morfin slap: ca CUM nhap nhay cung luc (4 ngon / 2 ngon cai), khong phai 1 ngon.
  const [fpActiveCodes, setFpActiveCodes] = useState([]);
  // Quality (%) tung ngon cua lan chup hien tai, key = ma ngon (left_index...).
  // Chi song trong phien thu; mo lai ho so cu se khong co (service moi tra).
  const [fpQuality, setFpQuality] = useState({});
  // Nguong dat RIENG tung ngon do service tra ve (ngon ut thap hon 50 vi tren
  // platen phang chi dau ngon tiep xuc). Hardcode 50 o day se to do ngon ut du
  // no da dat nguong cua chinh no.
  const [fpMinQ, setFpMinQ] = useState({});
  const [fpStatus, setFpStatus] = useState("");
  // fpError truoc day la STATE CHET: 28 cho goi setFpError ma khong mot JSX nao
  // doc no => moi loi chup roi vao hu khong. Can bo dat 3 ngon (cum cho 4) thi
  // service tra 408 kem huong dan "danh dau khong co van tay", nhung man hinh im
  // lang tuyet doi - tuong app treo chu khong biet la thieu ngon.
  //
  // Bo state, chi con setter ban ra toast: giu state ma khong ai doc chi gay
  // re-render vo ich. Dung toast chu KHONG dung panel duoi grid vi panel day
  // layout he thong xuong (da bo mot lan vi dung ly do nay), toast la overlay.
  // KHONG toast do nua. Vong thu chup lai lien tuc, moi lan that bai la mot
  // toast do 8s => man hinh dan dan phu kin canh bao do trong khi may VAN dang
  // chay binh thuong. Voi nguoi dan dang ngoi truoc man hinh thi trong nhu he
  // thong loi nang, that ra chi la "chua ap du ngon".
  //
  // Ghi ra console, KHONG do len man hinh. (Da thu route sang fpStatus nhung
  // fpStatus cung la state chet - chi co useState, khong JSX nao doc - nen do
  // la tai tao dung cai bug "loi roi vao hu khong" vua sua xong.)
  //
  // Chap nhan danh doi: can bo khong doc duoc ly do that bai tren man hinh nua.
  // Bu lai bang dong huong dan TINH duoi day (khong phai canh bao do, khong tu
  // bat tat) de nguoi thieu ngon van biet phai bam "Ngón thiếu".
  const setFpError = useCallback((msg) => {
    if (msg) console.warn("[FP]", msg);
  }, []);
  // Cum vua chup xong, dang CHO CAN BO XAC NHAN: {sid, step, low, noneCodes}.
  // Moi cum deu di qua day - ke ca khi ca 4 ngon vuot nguong. Vong tu dong tam
  // dung, can bo xem anh ca cum roi bam Xac nhan (sang cum sau) hoac chup lai.
  const [fpConfirm, setFpConfirm] = useState(null);
  // Ma ngon dang danh dau "khong co van tay" (ghi none, khong co anh). Giu o
  // state rieng de o ngon hien duoc dau none NGAY, ke ca truoc khi co session.
  const [fpNoneCodes, setFpNoneCodes] = useState([]);
  // Ref nhan banh cua fpNoneCodes de doc gia tri MOI NHAT trong startFpCollect /
  // retryFingerprint khi duoc goi tu closure auto-start (effect khong co deps moi,
  // giu closure render dau => state fpNoneCodes trong do la []) . Neu khong dung
  // ref, session moi mo ra se khong biet ngon thieu -> SDK doi du 4 ngon -> timeout.
  const fpNoneCodesRef = useRef([]);
  useEffect(() => { fpNoneCodesRef.current = fpNoneCodes; }, [fpNoneCodes]);
  // Mode "chon ngon thieu": bat qua nut "Ngón thiếu" o header. Khi dang bat,
  // bam vao O NGON (single click) se danh dau/bỏ đánh dấu ngon do la thieu
  // (ghi none), thay vi chup lai cum. Bat lai nut de thoat ve trang thai thu.
  const [fpNoneMode, setFpNoneMode] = useState(false);
  const fpNoneModeRef = useRef(false);                 // ref cho auto-start effect
  useEffect(() => { fpNoneModeRef.current = fpNoneMode; }, [fpNoneMode]);
  const fpAbortRef = useRef(false);
  // Bat: lan chup hien tai bi CHINH TA cat (do can bo vua danh dau ngon thieu),
  // khong phai may loi. Vong lap doc co nay de KHONG toast loi cho lan chup do —
  // toast "khong tach duoc ngon nao" ngay sau khi bam ngon thieu chi lam can bo
  // tuong minh vua bam sai. Co tu tat sau khi vong lap doc.
  const fpStopExpectedRef = useRef(false);
  // Session id dang mo tren service vân tay. PHAI giu o ref (khong chi bien local
  // trong startFpCollect) de cleanup luc roi trang con biet ma nao can dong —
  // khong dong thi service giu thiet bi, vao lai trang khong thu duoc nua.
  const fpSidRef = useRef(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewOnSecondary, setPreviewOnSecondary] = useState(false);
  // Xem truoc CHI BAN — to rieng, khong dung chung state voi xem truoc HO SO de
  // mo cai nay khong dong cai kia.
  const [fpSheetOpen, setFpSheetOpen] = useState(false);
  // Xem truoc DANH BAN — to thu ba, state rieng nhu hai to tren.
  const [nameSheetOpen, setNameSheetOpen] = useState(false);
  const [heightImage, setHeightImage] = useState(100);
  const [heightOffset, setHeightOffset] = useState(103);

  const lastCheckedCccdRef = useRef("");   // tránh gọi check-cccd lặp lại cùng 1 số
  const [dupModal, setDupModal] = useState({ open: false, matches: [] });  // cảnh báo trùng lúc Lưu
  const [checkingDup, setCheckingDup] = useState(false);   // đang gộp check khi bấm Lưu

  // Cảnh báo "đối tượng đã có trong danh sách" → đẩy vào chuông thông báo header.
  // Click thông báo (kind:"match") sẽ mở hồ sơ đối tượng đã đăng ký.
  const raiseAlert = useCallback((match) => {
    const who = match?.detainee?.full_name || match?.detainee?.cccd_number || "";
    const msg = t("capture.alert.on_list", { name: who });
    // TRUNG DOI TUONG PHAI BAO LEN MAN HINH. Day la canh bao nghiep vu that,
    // co noi dung ro rang (ten nguoi trung) - khac han cac vach do trong khong
    // chu ma da bo. Can bo phai thay ngay, khong the doi mo chuong moi biet.
    try { toast.error(msg, 6000); } catch { /* noop */ }
    try {
      notify.add(msg, {
        kind: "match",
        source: match.source,
        detainee: match.detainee,
        score: match.score,
        finger: match.finger,
      });
    } catch { /* noop */ }
  }, [t]);

  // Dedup đối sánh vân tay: 1 can phạm đã đăng ký = 1 cảnh báo trong 1 phiên chụp.
  const fpMatchedIdsRef = useRef(new Set());
  useEffect(() => { fpMatchedIdsRef.current = new Set(); }, [seed]);

  // (Đã bỏ tra cứu realtime sau mỗi ngón — backend giờ yêu cầu đủ 10 ngón.
  //  Tra cứu được thực hiện 1 lần sau khi thu xong 10 ngón, dùng left_thumb.)

  // Dedup face recognition: 1 người = 1 toast trong 1 phiên chụp (reset khi seed đổi)
  const recognizedIdsRef = useRef(new Set());
  useEffect(() => {
    recognizedIdsRef.current = new Set();
  }, [seed]);

  // Gọi nhận diện sau khi upload 1 ảnh portrait góc. Mỗi người match = 1 toast.
  const raiseFaceAlerts = useCallback(async (portraitUrl) => {
    try {
      const r = await api.faceRecognize(portraitUrl);
      if (!r || !r.ready || !Array.isArray(r.matches)) return;
      for (const m of r.matches) {
        const did = m?.detainee?._id || m?.detainee?.id;
        if (!did || recognizedIdsRef.current.has(did)) continue;
        recognizedIdsRef.current.add(did);
        const who = m?.detainee?.full_name || m?.detainee?.cccd_number || "";
        const msg = t("capture.alert.on_list", { name: who });
        // Giu bao do - cung loai canh bao trung nhu raiseAlert (co noi dung + vao
        // chuong thong bao).
        try { toast.error(msg, 6000); } catch { /* noop */ }
        try {
          notify.add(msg, {
            kind: "face",
            source: t("capture.alert.source_face"),
            detainee: m.detainee,
            score: m.score,
          });
        } catch { /* noop */ }
      }
    } catch { /* recognize fail → không hỏng flow chụp */ }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    api.measurementConfig()
      .then((cfg) => {
        const next = Number(cfg?.height_image);
        if (!cancelled && Number.isFinite(next) && next > 0) setHeightImage(next);
        const off = Number(cfg?.height_offset);
        if (!cancelled && Number.isFinite(off) && off > 0) setHeightOffset(off);
      })
      .catch(() => {
        if (!cancelled) { setHeightImage(100); setHeightOffset(103); }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!previewOnSecondary) return;
    const onKey = (ev) => {
      if (ev.key === "Escape") {
        clearSecondaryScreenPreview();
        setPreviewOnSecondary(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOnSecondary]);

  useEffect(() => {
    return () => {
      if (previewOnSecondary) clearSecondaryScreenPreview();
    };
  }, [previewOnSecondary]);

  useEffect(() => {
    setForm(seed.form);
    setPhotos(seed.photos);
    setErr("");
    setOk("");
  }, [seed]);

  // cells chi con dung cho ProfilePreviewContent (in ra ten buong cua ho so CU).
  // Trang thu nhan khong con o chon dien giam giu / co so / phan trai / buong,
  // nen cung khong con effect reset theo cay — reset o day se XOA du lieu buong
  // cua ho so cu ngay khi mo ra sua.
  useEffect(() => {
    api.listCells().then(setCells).catch(() => setCells([]));
  }, []);

  // "Don vi lap" = dia diem cua phien lam viec. Truoc day suy ra tu Noi giam giu
  // (facility_code) — truong da bo khoi trang.
  const [sessionLocation, setSessionLocation] = useState("");
  useEffect(() => {
    if (!sessionId) {
      setSessionLocation("");
      return;
    }
    let cancelled = false;
    api.getSession(sessionId)
      .then((s) => { if (!cancelled) setSessionLocation(s?.location || ""); })
      .catch(() => { if (!cancelled) setSessionLocation(""); });
    return () => { cancelled = true; };
  }, [sessionId]);

  // Cooldown 10s: banner ok/err tự ẩn sau 10 giây
  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => setOk(""), 10000);
    return () => clearTimeout(t);
  }, [ok]);
  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(""), 10000);
    return () => clearTimeout(t);
  }, [err]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setPhoto = (k, v) =>
    setPhotos((p) => {
      const next = { ...p };
      if (v) next[k] = v;
      else delete next[k];
      return next;
    });

  const applyMeasuredHeight = useCallback(({ linePixelHeight, imageHeight }) => {
    const measured = getMeasurementHeight({ linePixelHeight, imageHeight, heightImage, heightOffset });
    if (!measured || measured < 50 || measured > 250) return;
    setForm((f) => ({ ...f, height_cm: String(measured) }));
  }, [heightImage, heightOffset]);

  // Nhap DOI 1 o van tay => chup lai CA CUM chua ngon do (4 ngon ban tay hoac
  // 2 ngon cai). Morfin la slap scanner: 4 ngon den tu cung 1 anh, khong tach
  // le 1 ngon de chup rieng duoc.
  const retryFingerprint = async (photoKey, fingerCode) => {
    if (fpRunning) {
      setFpError(t("capture.err.fp_running"));
      return;
    }
    if (!photoKey || !fingerCode) {
      setFpError(t("capture.err.unknown_finger", { key: photoKey, code: fingerCode }));
      return;
    }

    // Tim cum chua ngon nay tu /api/steps (nguon su that la backend).
    let group;
    try {
      const steps = await fpApi.listSteps();
      group = steps.find((s) => s.codes.includes(fingerCode));
    } catch (e) {
      setFpError(e.message);
      return;
    }
    if (!group) {
      setFpError(t("capture.err.unknown_finger", { key: photoKey, code: fingerCode }));
      return;
    }

    // KHONG xoa anh/template cu o day.
    //
    // Truoc day cho nay xoa ca cum NGAY, truoc khi biet lan chup moi co thanh
    // cong hay khong. Sau cho xoa co 6 duong thoat (health !ok, health throw,
    // startSession throw, capture 422, abort, uploadPhoto throw) va khong duong
    // nao hoan lai => mot lan 422 la mat luon anh cu, o trong vinh vien. Voi
    // nguong 50% thi 422 la chuyen thuong xuyen, nen loi nay gan nhu chac chan
    // xay ra chu khong phai truong hop hiem.
    //
    // Khong can xoa: setPhotos({...p, [key]: up.url}) ben duoi da GHI DE key khi
    // thanh cong, va service tu choi ca cum (all-or-nothing) nen khong co canh
    // nua cu nua moi. O dang chup da nhap nhay qua fpActiveCodes roi.
    // => Giu anh cu den khi co anh moi tot hon de THAY THE.
    setFpError("");
    setFpStatus(t("capture.status.check_scanner"));
    fpAbortRef.current = false;

    try {
      const h = await fpApi.health();
      if (!h.ok) {
        setFpError(h.error || t("capture.err.fp_not_ready"));
        setFpStatus("");
        return;
      }
    } catch (e) {
      setFpError(e.message);
      setFpStatus("");
      return;
    }

    // Chot co NGAY (ref) nhu startFpCollect. setFpRunning la async => neu chi
    // dua vao no thi vong auto-start 3s/lan doc fpRunningRef con false, goi
    // startFpCollect, startSession moi => next_step ve left_hand va nhay cum.
    fpRunningRef.current = true;
    setFpRunning(true);
    setFpNextCode(group.codes[0]);
    setFpActiveCodes(group.codes);   // ca cum nhap nhay cung luc
    // KHONG xoa quality cu o day - cung ly do nhu khong xoa anh: neu chup lai
    // that bai thi o se vua mat anh vua mat so %. Quality moi duoc ghi de ben
    // duoi khi chup thanh cong.
    const groupName = t(`fpenroll.step.${group.step}`);
    setFpStatus(t("fpenroll.status.reading_step", { step: groupName }));

    let sid = null;
    try {
      const r = await fpApi.startSession("__retry__" + group.step);
      sid = r.session_id;
      fpSidRef.current = sid;

      // Session moi cung quen cac ngon thieu da danh dau o session cu (markNone
      // chi ap len session cu). Phai danh dau lai de cum chi cho dung so ngon
      // that su co, neu khong SDK doi du 4 ngon -> timeout o ngay vong retry.
      const noneSync = fpNoneCodesRef.current;
      if (noneSync.length) {
        try { await fpApi.markNone(sid, noneSync, true); } catch (e) { setFpError(e.message); }
      }

      // Chup lai CA CUM, THU NHIEU LAN nhu vong thu chinh.
      //
      // Truoc day chi goi capture() DUNG MOT LAN: 422 la thua ngay. Ghep voi
      // viec xoa anh cu truoc do thi mot lan 422 = mat anh cu, khong co anh moi.
      // Voi nguong 50% thi 422 la chuyen thuong xuyen nen phai cho thu lai,
      // giong vong thu chinh (FP_MAX_FAILS).
      //
      // Anh cu duoc giu nguyen suot qua trinh nay: chi ghi de khi da co ket qua
      // dat nguong. Bo cuoc giua duong thi o van con anh cu.
      let capRes = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= FP_MAX_FAILS; attempt++) {
        if (fpAbortRef.current) return;
        try {
          capRes = await fpApi.capture(sid, group.step);
          break;
        } catch (e) {
          lastErr = e;
          if (fpAbortRef.current) return;
          // Hien loi cua lan nay + so lan da thu, de nguoi dan biet dang tien
          // trien chu khong phai treo.
          setFpError(e.message);
          setFpStatus(t("capture.status.retry_attempt", {
            name: groupName, n: attempt, max: FP_MAX_FAILS,
          }));
        }
      }
      if (!capRes) {
        // Het luot: anh cu VAN CON, chi bao loi.
        throw new Error(lastErr
          ? t("capture.err.fp_too_many_fails", { count: FP_MAX_FAILS })
          : t("capture.err.fp_not_ready"));
      }
      if (fpAbortRef.current) return;

      try {
        // Quality tung ngon de hien % de len anh trong luoi 10 o.
        setFpQuality((prev) => {
          const nx = { ...prev };
          for (const c of capRes.captured || []) nx[c.code] = c.quality;
          return nx;
        });
        for (const c of capRes.captured || []) {
          const key = FP_CODE_TO_KEY[c.code];
          if (!key) continue;
          const file = await b64PngToFile(c.image_b64, `${key}.png`);
          const up = await api.uploadPhoto(file);
          setPhotos((p) => {
            const next = { ...p, [key]: up.url };
            if (c.template_b64) {
              next.fp_templates = { ...(p.fp_templates || {}), [c.code]: c.template_b64 };
            }
            return next;
          });
        }
        setFpStatus(t("capture.status.retook", { name: groupName }));
        setOk(t("capture.status.updated", { name: groupName }));
        // (Đã bỏ tra cứu ngay sau thu lại — BE cần đủ 10 ngón. Tra cứu chỉ
        //  chạy sau khi thu đủ 10 ngón ở vòng tự động.)
      } catch (e) {
        setFpError(t("capture.err.save_photo", { message: e.message }));
      }
    } catch (e) {
      setFpError(e.message);
    } finally {
      if (sid) {
        try { await fpApi.cancel(sid); } catch { /* noop */ }
      }
      if (fpSidRef.current === sid) fpSidRef.current = null;
      // Nha co ngay tai day (xem giai thich o finally cua startFpCollect).
      fpRunningRef.current = false;
      setFpRunning(false);
      setFpNextCode(null);
      setFpActiveCodes([]);
    }
  };

  // Chay vong thu tu mot cum bat dau (startStep), dung khi: xong het 10 ngon,
  // that bai qua gioi han, bi abort, HOAC gap partial (con ngon loi trong cum) —
  // luc do tam dung setFpPartial de can bo quyet dinh, va tra ve ma khong lam
  // post-loop (chua du 10 ngon nen khong duoc so match).
  //
  // Duoc goi lai boi 2 nut cua panel partial (xac nhan thieu / chup lai cum),
  // de tiep tuc vong tu diem da dung. Nho do, vong khong phai lap lai phan da
  // chup xong (session cua service van giu trang thai cum da done).
  const collectFingers = async (sid, startStep) => {
    // Bat dau chup => thoat mode chon ngon thieu (neu dang bat): luc chup ngon
    // thieu da duoc loai khoi cum, khong con ly do dung o mode chon nua.
    setFpNoneMode(false);
    fpRunningRef.current = true;
    setFpRunning(true);
    try {
      await collectFingersRun(sid, startStep);
    } finally {
      // Giai phong running state MOI lan goi (ca khi duoc nut panel goi lai):
      // tam dung o partial => fpRunning=false de nut panel kich hoat; xong/loi
      // cung nha. Khong cancel session o day - khi dung o partial, session phai
      // con song de nut panel tiep tuc vong.
      fpRunningRef.current = false;
      setFpRunning(false);
      setFpNextCode(null);
      setFpActiveCodes([]);
    }
  };

  const collectFingersRun = async (sid, startStep) => {
    let step = startStep;
    let fails = 0;
    let busy = 0;
    let paused = false;

    while (step && !fpAbortRef.current) {
      setFpNextCode(step.codes[0]);
      setFpActiveCodes(step.codes);   // ca cum nhap nhay cung luc
      setFpStatus(t("fpenroll.status.reading_step", { step: t(`fpenroll.step.${step.step}`) }));
      let capRes;
      try {
        capRes = await fpApi.capture(sid, step.step);
      } catch (e) {
        if (fpAbortRef.current) break;
        // KHONG dung vong vi loi. Truoc day het 15 lan la break => vong thu chet
        // giua duong, va startFpCollect (finally) da set fpAutoStoppedRef = true
        // nen auto-start KHONG BAO GIO chay lai => man hinh dung han, cac cum sau
        // khong bao gio duoc chup. Moi lan 408 mat ~20s (timeout SDK) nen 15 lan
        // la chi ~5 phut: can bo dang chinh cach ap tay thi may tu bo cuoc.
        //
        // Chi co 2 duong dung: can bo bam Khoa/Dung (fpAbortRef), hoac chup xong.
        // May phai kien nhan hon nguoi - khong tu quyet dinh la "het cuu".
        if (/dang co lenh chup khac/i.test(e.message || "")) {
          // 409: lan chup truoc con giu thiet bi, tu nha sau vai giay. Chi bao
          // moi FP_MAX_BUSY lan de khong toast moi giay.
          if (++busy % FP_MAX_BUSY === 0) setFpError(t("capture.err.fp_device_busy"));
          setFpStatus(t("capture.status.fp_waiting_device"));
          await sleepFp(1000);
          continue;
        }
        // Toast moi lan de can bo biet may VAN dang thu va thu vi sao that bai.
        setFpError(e.message);
        // Backoff cho loi bung ngay lap tuc (500 MorfinError, mat mang): 408 da
        // mat 20s nen khong can cho, nhung loi tuc thi ma chi cho 600ms se quay
        // vong ~100 lan/phut, dot log va spam toast. Tran o 5s.
        fails++;
        await sleepFp(Math.min(600 * fails, 5000));
        continue;
      }
      fails = 0;
      if (fpAbortRef.current) break;

      // Quality tung ngon de hien % de len anh trong luoi 10 o.
      setFpQuality((prev) => {
        const nx = { ...prev };
        for (const c of capRes.captured || []) nx[c.code] = c.quality;
        return nx;
      });
      // Nguong rieng tung ngon do service tra ve (ngon ut thap hon).
      if (capRes.min_quality_by_code) {
        setFpMinQ((prev) => ({ ...prev, ...capRes.min_quality_by_code }));
      }
      for (const c of capRes.captured || []) {
        const key = FP_CODE_TO_KEY[c.code];
        if (!key) continue;
        try {
          const file = await b64PngToFile(c.image_b64, `${key}.png`);
          const up = await api.uploadPhoto(file);
          setPhotos((p) => {
            const np = { ...p, [key]: up.url };
            if (c.template_b64) {
              np.fp_templates = { ...(p.fp_templates || {}), [c.code]: c.template_b64 };
            }
            return np;
          });
        } catch (e) {
          setFpError(t("capture.err.save_photo", { message: e.message }));
        }
      }

      // MOI cum deu dung o day cho can bo xac nhan, ke ca khi ca 4 ngon vuot
      // nguong: anh da hien len luoi 10 o (setPhotos o tren), can bo xem roi bam
      // Xac nhan (sang cum sau) hoac Chup lai. KHONG advance step tu day - cum
      // chua confirm thi service van tra next_step la chinh no.
      if (capRes.needs_confirm) {
        setFpStatus(capRes.message || "");
        setFpConfirm({
          sid,
          step: step.step,
          low: capRes.low || [],
          noneCodes: capRes.none_codes || [],
        });
        paused = true;
        break;
      }

      setFpStatus(capRes.message || "");
      step = capRes.next_step;
    }

    // Chua pause cho xac nhan => vong ket thuc do xong / het lan / abort. Kiem
    // tra trang thai service de phan biet "xong that" voi "chua xong".
    if (!paused && !fpAbortRef.current) {
      let srvDone = false;
      try {
        const st = await fpApi.getSession(sid);
        srvDone = !!st.finished;
      } catch { /* khong doc duoc trang thai => coi nhu chua xong */ }

      if (!srvDone) {
        setFpError(t("capture.err.fp_incomplete"));
        setFpStatus("");
      } else {
        setFpStatus(t("capture.status.done_10"));
        setOk(t("capture.status.done_10_full"));
        // Sau khi thu đủ 10 ngón: tra cứu dùng left_thumb (theo logic BE mới).
        // BE chỉ so left_thumb với left_thumb của can phạm, khớp nếu score > 80.
        try {
          const latestPhotos = await new Promise((resolve) => {
            setPhotos((p) => { resolve(p); return p; });
          });
          const tpls = latestPhotos?.fp_templates || {};
          const fingers = {};
          let count = 0;
          for (const [code, b64] of Object.entries(tpls)) {
            if (b64) { fingers[code] = b64; count++; }
          }
          if (count > 0) {
            const r = await api.matchFingerprint(fingers);
            if (r && r.matched && Array.isArray(r.items) && r.items.length > 0) {
              const best = r.items[0];
              const did = best?._id || best?.id;
              if (did && !fpMatchedIdsRef.current.has(did)) {
                fpMatchedIdsRef.current.add(did);
                raiseAlert({
                  source: "fp",
                  detainee: best,
                  score: best.match_score,
                  finger: best.match_finger,
                });
              }
            }
          }
        } catch (e) {
          console.error("[FP] match lookup failed:", e);
        }
      }
    }
  };

  // Nut "Xac nhan" - chap nhan CA CUM vua chup (ke ca ngon duoi nguong: anh +
  // template van luu binh thuong), roi TIEP TUC vong tu cum ke tiep.
  const fpConfirmCluster = async () => {
    if (!fpConfirm) return;
    const { sid, step } = fpConfirm;
    if (!sid || !step) return;
    setFpError("");
    try {
      const r = await fpApi.confirmStep(sid, step);
      setFpConfirm(null);
      // Xac nhan xong => cum do done. next_step tu chinh response, khong can
      // goi getSession lan nua.
      await collectFingers(sid, r.next_step);
    } catch (e) {
      setFpError(e.message);
    }
  };

  // Nut "Chup lai cum" - khong chap nhan cum vua chup, thu lai chinh cum do.
  // KHONG can redo(): cum chua confirm nen next_step van la chinh no, va
  // capture() ghi de anh/template cu.
  const fpRetakeCluster = async () => {
    if (!fpConfirm) return;
    const { sid, step } = fpConfirm;
    if (!sid || !step) return;
    setFpError("");
    setFpConfirm(null);
    try {
      const st = await fpApi.getSession(sid);
      const stepObj = (st.steps || []).find((s) => s.step === step);
      await collectFingers(sid, stepObj || st.next_step);
    } catch (e) {
      setFpError(e.message);
    }
  };

  // Bam vao 1 o ngon de danh dau / bo danh dau "khong co van tay" (ghi none).
  // Danh dau TRUOC khi chup thi cum chi cho dung so ngon that su co - do la
  // cach duy nhat de nguoi thieu ngon di qua duoc cum (xem api.py capture()).
  const fpToggleNone = async (code) => {
    // KHONG chan khi dang thu. Truoc day chan => can bo chi danh dau duoc ngon
    // thieu TRUOC khi bam Thu thap, nhung vong thu tu dong chay ngay khi vao
    // trang (auto-start 3s) va gio khong bao gio tu dung => fpRunning luon true
    // => nut ngon thieu vinh vien mo duoc. Dung luc phat hien nguoi thieu ngon
    // (may dang chay het timeout vi cho du 4 ngon) la luc can nut nay nhat.
    const next = !fpNoneCodes.includes(code);
    setFpError("");
    // Cap nhat local truoc: danh dau none phai dung duoc CA KHI chua co session
    // (can bo nhin thay ngon mat la danh dau ngay, truoc khi bam Thu thap).
    setFpNoneCodes((prev) => (next ? [...prev, code] : prev.filter((c) => c !== code)));
    setPhotos((p) => {
      const cur = new Set(p.fp_missing || []);
      if (next) cur.add(code); else cur.delete(code);
      const np = { ...p, fp_missing: Array.from(cur) };
      // Ngon "khong co van tay" khong co anh/template - xoa neu tung chup duoc.
      if (next) {
        np[FP_CODE_TO_KEY[code]] = "";
        if (p.fp_templates) {
          const tpls = { ...p.fp_templates };
          delete tpls[code];
          np.fp_templates = tpls;
        }
      }
      return np;
    });
    if (next) setFpQuality((prev) => { const nx = { ...prev }; delete nx[code]; return nx; });
    // Co session dang mo thi day sang service luon, de cum tinh lai so ngon can cho.
    const sid = fpSidRef.current;
    if (sid) {
      try {
        await fpApi.markNone(sid, [code], next);
        // Cat lan chup DANG chay. SDK chot danh sach `exceptions` ngay luc
        // StartCapture, nen lan chup dang do van cho DU so ngon cu - danh dau
        // giua chung khong co tac dung cho den khi no chay het timeout (~20s).
        // Cat de vong lap chup lai ngay voi `absent` moi.
        if (fpRunningRef.current) {
          // Bao truoc cho catch cua vong lap: loi sap toi la do TA cat, khong
          // phai may loi => khong toast (toast "khong tach duoc ngon nao" ngay
          // sau khi bam ngon thieu chi lam can bo tuong minh bam sai).
          fpStopExpectedRef.current = true;
          try { await fpApi.stopCapture(); } catch { /* noop */ }
        }
      } catch (e) {
        setFpError(e.message);
      }
    }
  };

  const startFpCollect = async () => {
    // Chot co NGAY (ref, khong qua setState) de auto-start effect 3s/lan khong
    // kip chen vao giua. Truoc day chi dua vao fpRunningRef do effect cap nhat
    // => co khe hoi khien vong thu 2 start_session moi va nhay ve cum dau.
    if (fpRunning || fpRunningRef.current) return;
    fpRunningRef.current = true;
    setFpError("");
    setFpStatus(t("capture.status.check_scanner"));
    fpAbortRef.current = false;

    try {
      const h = await fpApi.health();
      if (!h.ok) {
        setFpError(h.error || t("capture.err.fp_not_ready"));
        setFpStatus("");
        return;
      }
    } catch (e) {
      setFpError(e.message);
      setFpStatus("");
      return;
    }

    let sid = null;
    try {
      const r = await fpApi.startSession(form.full_name.trim() || t("fpenroll.anon"));
      sid = r.session_id;
      fpSidRef.current = sid;
      // Dong bo cac ngon da danh dau thieu (neu co) len backend: session moi
      // khoi tao voi tat ca ngon binh thuong, phai danh dau lai cac ngon thieu
      // de cum chi cho dung so ngon that su co. Neu khong, SDK doi du 4 ngon ->
      // timeout khi nguoi chi co 3 ngon. (Truong hop chon thieu sau khi co
      // session thi fpToggleNone da goi markNone truc tiep roi.)
      const noneSync = fpNoneCodesRef.current;
      if (noneSync.length) {
        try { await fpApi.markNone(sid, noneSync, true); } catch (e) { setFpError(e.message); }
      }
      // Morfin slap: moi lan chup lay CA CUM (4 ngon trai -> 2 ngon cai ->
      // 4 ngon phai). Vong thu chay trong collectFingers; gap partial (con ngon
      // loi trong cum) thi tam dung hoi can bo, roi nut panel tiep tuc.
      await collectFingers(sid, r.next_step);
    } catch (e) {
      setFpError(e.message);
    } finally {
      if (sid && fpAbortRef.current) {
        try { await fpApi.cancel(sid); } catch { /* noop */ }
      }
      if (fpSidRef.current === sid) fpSidRef.current = null;
      // Nha co NGAY tai day, khong cho effect [fpRunning] cap nhat.
      // fpRunningRef duoc chot = true o dau ham; neu chi de effect nha thi co
      // 1 nhip render ma fpRunning=false nhung anh chua upload xong => vong
      // auto-start (3s/lan) chen vao, startSession moi, next_step ve left_hand
      // => dang thu 4 ngon phai bi nhay ve 4 ngon dau.
      fpRunningRef.current = false;
      // DUNG HAN sau khi vong thu ket thuc (du xong het, that bai, hay abort).
      // Auto-start chi de lo khi may quet chua san sang luc vao trang; mot khi
      // da chup duoc thi KHONG bao gio tu chay lai, vi startSession moi luon
      // tra next_step = left_hand => nhay ve 4 ngon dau. Muon thu lai thi nhay
      // doi vao o ngon (retryFingerprint), dung tu dong. Khi dung o panel
      // partial (chua abort), session van mo de nut panel tiep tuc vong.
      fpAutoStoppedRef.current = true;
      setFpRunning(false);
      setFpNextCode(null);
      setFpActiveCodes([]);
    }
  };

  const applyCccdData = async (d) => {
    if (!d) return;
    setForm((f) => ({
      ...f,
      full_name: d.full_name || f.full_name,
      cccd_number: d.cccd_number || f.cccd_number,
      personal_id: f.personal_id,
      dob: d.dob || f.dob,
      gender: d.gender || f.gender,
      hometown: d.hometown || f.hometown,
      address: d.address || d.hometown || f.address,
      ethnicity: d.ethnicity || f.ethnicity,
      religion: d.religion || f.religion,
      nationality: d.nationality || f.nationality,
      issued_date: d.issued_date || f.issued_date,
      expiry_date: d.expiry_date || f.expiry_date,
      issued_place: d.issued_place || f.issued_place,
      cmnd_old: d.cmnd_old || f.cmnd_old,
      distinguishing_features: d.distinguishing_features || d.personal_identification || f.distinguishing_features,
      mrz: d.mrz || f.mrz,
    }));
    // Anh chan dung trong chip the: trang thu nhan khong con hien khoi anh the,
    // nhung van luu vao photos.cccd_front de ban in ho so (ProfilePreview) dung.
    if (d.facePhoto) {
      const fp = d.facePhoto;
      if (fp.startsWith("/uploads/") || fp.startsWith("http://") || fp.startsWith("https://") || fp.startsWith("data:")) {
        setPhoto("cccd_front", fp);
      } else {
        try {
          const file = await b64PngToFile(fp, `cccd_face_${d.cccd_number || Date.now()}.jpg`);
          const jpgFile = new File([file], file.name, { type: "image/jpeg" });
          const res = await api.uploadPhoto(jpgFile);
          setPhoto("cccd_front", res.url);
        } catch (uploadEx) {
          console.error("[CCCD] portrait upload failed:", uploadEx);
          setErr(t("capture.err.cccd_saved_photo", { message: uploadEx.message }));
        }
      }
    }

    // Cảnh báo nếu số CCCD vừa quét đã có trong danh sách (toàn hệ thống).
    const cccd = (d.cccd_number || "").replace(/\D/g, "");
    if (cccd && cccd.length >= 9 && cccd !== lastCheckedCccdRef.current) {
      lastCheckedCccdRef.current = cccd;
      try {
        const r = await api.checkCccd(cccd);
        if (r && r.matched && r.detainee) {
          raiseAlert({ source: "cccd", detainee: r.detainee });
        }
      } catch (e) {
        console.error("[CCCD] check duplicate failed:", e);
      }
    }
  };

  // Tự động lắng nghe đầu đọc CCCD ngay khi vào trang, chạy liên tục.
  // Mỗi lần backend trả thẻ mới, nó tự dời baseline nên vòng lặp chỉ nhận thẻ mới,
  // không lặp lại thẻ cũ. Thẻ mới vào thì chèn dữ liệu lên form.
  useEffect(() => {
    if (sessionReadOnly) return;

    let stopped = false;
    const ac = new AbortController();
    cccdAbortRef.current = ac;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      try {
        const h = await cccdApi.health();
        if (stopped) return;
        if (!h.ok) {
          setErr(apiT("capture.err.cccd_dir", { dir: h.data_dir || "" }));
          return;
        }
      } catch (e) {
        if (!stopped) setErr(e.message);
        return;
      }

      let sid = null;
      while (!stopped && !ac.signal.aborted) {
        // Session hết hạn (TTL backend) hoặc chưa có -> mở phiên mới rồi đọc tiếp
        if (!sid) {
          try {
            const s = await cccdApi.startSession();
            if (stopped) break;
            sid = s.session_id;
            cccdSidRef.current = sid;
            setReading(true);
          } catch {
            if (stopped || ac.signal.aborted) break;
            setReading(false);
            await sleep(3000);
            continue;
          }
        }

        try {
          const r = await cccdApi.wait(sid, ac.signal, 25);
          if (stopped || ac.signal.aborted) break;
          if (r && r.status === "ok" && r.data) {
            applyCccdData(r.data);
            setOk(t("capture.status.cccd_read"));
          }
        } catch (e) {
          if (stopped || ac.signal.aborted || e.name === "AbortError") break;
          // 404 = phiên đã bị GC; mọi lỗi khác cũng thử mở lại phiên
          sid = null;
          cccdSidRef.current = null;
          await sleep(1000);
        }
      }
      if (!stopped) setReading(false);
    })();

    return () => {
      stopped = true;
      try { ac.abort(); } catch { /* noop */ }
      const sid = cccdSidRef.current;
      cccdSidRef.current = null;
      cccdAbortRef.current = null;
      if (sid) {
        cccdApi.cancel(sid).catch(() => { /* noop */ });
      }
    };
  }, [sessionReadOnly]);

  // Tự động bật quét vân tay khi vào trang. Máy quét chưa sẵn sàng thì thử lại
  // âm thầm mỗi 3s (không hiện lỗi đỏ) — giống vòng CCCD, cắm máy vào là tự chạy.
  const fpAutoStoppedRef = useRef(false);   // cán bộ đã bấm Dừng thủ công -> không auto-start lại
  useEffect(() => {
    if (sessionReadOnly) return;
    let stopped = false;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      while (!stopped) {
        // Chỉ auto-start khi: chưa đủ 10 ngón, không đang chạy, chưa bị dừng tay,
        // và KHÔNG đang ở chế độ chọn ngón thiếu (đang chọn thì không được tự
        // chụp giữa chừng).
        if (!fpAutoStoppedRef.current && !fpRunningRef.current
            && !fpNoneModeRef.current && fpCountRef.current < 10) {
          try {
            const h = await fpApi.health();
            if (stopped) return;
            if (h.ok) {
              startFpCollect();   // tự chạy vòng enroll; lỗi bên trong tự xử lý
            }
          } catch { /* máy quét chưa sẵn sàng -> thử lại vòng sau, không báo lỗi */ }
        }
        await sleep(3000);
        if (stopped) return;
      }
    })();

    return () => {
      stopped = true;
      // Roi trang giua luc dang cho tay: chi set cac ref la KHONG du —
      // startFpCollect van tiep tuc await capture() va session tren service van
      // song, giu thiet bi => vao lai trang bi 409, khong thu duoc nua.
      fpAbortRef.current = true;
      fpRunningRef.current = false;
      const sid = fpSidRef.current;
      fpSidRef.current = null;
      // THU TU BAT BUOC: stopCapture() truoc, cancel() sau.
      fpApi.stopCapture()
        .then(() => { if (sid) return fpApi.cancel(sid); })
        .catch(() => { /* noop */ });
    };
  }, [sessionReadOnly]);

  const fpCount = FINGERS.filter((f) => photos[f.key]).length;
  // Ngon nao da thu -> sang len tren 2 icon ban tay tong quan o khoi KPI.
  const fpDoneByHand = useMemo(() => {
    const out = { left: [], right: [] };
    for (const f of FINGERS) {
      if (!photos[f.key]) continue;
      const hand = f.code.startsWith("left") ? "left" : "right";
      out[hand].push(f.code.replace(/^(left|right)_/, ""));
    }
    return out;
  }, [photos]);
  // Ngon dang lan -> nhay tren icon KPI. Mo rong ra CA CUM vi may Morfin chup
  // ca cum 1 lan => cum thumbs nhay ngon cai o CA HAI ban tay.
  const fpBlinkByHand = useMemo(() => {
    const out = { left: [], right: [] };
    if (!fpRunning) return out;
    const cluster = FP_CLUSTERS.find((c) =>
      fpActiveCodes.length
        ? c.codes.some((x) => fpActiveCodes.includes(x))
        : c.codes.includes(fpNextCode)
    );
    if (!cluster) return out;
    for (const code of cluster.codes) {
      const hand = code.startsWith("left") ? "left" : "right";
      out[hand].push(code.replace(/^(left|right)_/, ""));
    }
    return out;
  }, [fpRunning, fpActiveCodes, fpNextCode]);
  const portraitCount = PORTRAITS.filter((p) => photos[p.key]).length;
  useEffect(() => { fpRunningRef.current = fpRunning; }, [fpRunning]);
  useEffect(() => { fpCountRef.current = fpCount; }, [fpCount]);

  const checks = useMemo(() => {
    const personalOk = !!(form.personal_id || "").trim();
    const cccdOk =
      !!form.full_name.trim() &&
      /^\d{12}$/.test(form.cccd_number || "") &&
      !!form.dob;
    return [
      { key: "personal_id", label: t("capture.verify.item.code"), ok: personalOk, required: true },
      { key: "cccd", label: t("capture.verify.item.cccd"), ok: cccdOk, required: true },
      { key: "portrait", label: t("capture.verify.item.portrait"), ok: portraitCount === 3, required: false },
      { key: "fp", label: t("capture.verify.item.fp"), ok: fpCount === 10, required: false },
      // Can nang da bo khoi trang => "thong tin bo sung" chi con do chieu cao.
      { key: "extra", label: t("capture.verify.item.extra"), ok: !!form.height_cm, required: false },
      { key: "device", label: t("capture.verify.item.devices"), ok: true, required: false },
    ];
  }, [form, fpCount, portraitCount, t]);

  const allRequiredValid = checks.filter((c) => c.required).every((c) => c.ok);
  const allValid = checks.every((c) => c.ok);

  // Thực hiện lưu thật sự (sau khi đã qua bước kiểm tra trùng lúc bấm Lưu).
  const doSave = async () => {
    setSaving(true);
    setErr("");
    setOk("");
    try {
      const strOrNull = (v) => {
        const s = (v ?? "").toString().trim();
        return s === "" ? null : s;
      };
      const digitsOrNull = (v) => {
        const s = (v ?? "").toString().replace(/\D/g, "");
        return /^\d{12}$/.test(s) ? s : null;
      };
      const body = {
        session_id: sessionId || null,
        // ---- Thông tin hồ sơ (thanh trên cùng) ----
        personal_id: strOrNull(form.personal_id),
        record_sheet_no: strOrNull(form.record_sheet_no),
        fp_sheet_no: strOrNull(form.fp_sheet_no),
        record_times: strOrNull(form.record_times),
        record_date: strOrNull(form.record_date),
        ak_no: strOrNull(form.ak_no),
        record_scope: strOrNull(form.record_scope),
        // ---- I. Thông tin nhân thân ----
        full_name: form.full_name.trim(),
        alias: strOrNull(form.alias),
        gender: form.gender || "male",
        dob: strOrNull(form.dob),
        cccd_number: digitsOrNull(form.cccd_number),
        nationality: strOrNull(form.nationality),
        ethnicity: strOrNull(form.ethnicity),
        hometown: strOrNull(form.hometown),
        address: strOrNull(form.address),
        temp_address: strOrNull(form.temp_address),
        current_address: strOrNull(form.current_address),
        occupation: strOrNull(form.occupation),
        father_name: strOrNull(form.father_name),
        mother_name: strOrNull(form.mother_name),
        // ---- II. Thông tin vụ việc ----
        arrest_date: strOrNull(form.arrest_date),
        arrest_agency: strOrNull(form.arrest_agency),
        case_about: strOrNull(form.case_about),
        // ---- III. Đặc điểm nhận dạng ----
        face_shape: strOrNull(form.face_shape),
        height_cm: form.height_cm ? Math.round(Number(form.height_cm)) : null,
        nose: strOrNull(form.nose),
        ear_features: strOrNull(form.ear_features),
        earlobe: strOrNull(form.earlobe),
        scars: strOrNull(form.scars),
        physical_abnormalities: strOrNull(form.physical_abnormalities),
        // ---- IV. Ảnh nhận dạng ----
        photo_url: photos.portrait_front || null,
        photos,
        // ---- Trường cũ KHÔNG còn ô nhập trên trang này. Backend `update` làm
        // $set cả model_dump() nên phải gửi lại, nếu không hồ sơ cũ (buồng giam,
        // tôn giáo, quan hệ gia đình...) sẽ bị ghi None ngay lần lưu đầu. ----
        religion: strOrNull(form.religion),
        issued_date: strOrNull(form.issued_date),
        expiry_date: strOrNull(form.expiry_date),
        issued_place: strOrNull(form.issued_place),
        cmnd_old: strOrNull(form.cmnd_old),
        distinguishing_features: strOrNull(form.distinguishing_features),
        mrz: strOrNull(form.mrz),
        weight_kg: form.weight_kg ? Math.round(Number(form.weight_kg)) : null,
        blood_type: strOrNull(form.blood_type),
        cell_code: strOrNull(form.cell_code),
        custody_type: strOrNull(form.custody_type),
        facility_code: strOrNull(form.facility_code),
        sub_camp_code: strOrNull(form.sub_camp_code),
        note: strOrNull(form.note),
        family: Array.isArray(form.family)
          ? form.family.filter((r) => r && String(r.full_name || "").trim())
          : [],
        charge: strOrNull(form.charge),
        charge_detail: strOrNull(form.charge_detail),
        decision_no: strOrNull(form.decision_no),
        date_in: strOrNull(form.date_in),
      };
      if (isEdit) {
        const updated = await api.updateDetainee(initial.id, body);
        notify.add();
        setOk(t("capture.updated", { code: updated.code, name: updated.full_name }));
        if (onDone) onDone();
        if (sessionId && onSavedInSession) {
          setTimeout(() => onSavedInSession(), 600);
        } else if (go) {
          setTimeout(() => go("sessions"), 800);
        }
      } else {
        const created = await api.createDetainee(body);
        notify.add();
        setOk(t("capture.saved", { code: created.code, name: created.full_name }));
        setForm(EMPTY_FORM);
        setPhotos({});
        if (sessionId && onSavedInSession) {
          setTimeout(() => onSavedInSession(), 800);
        }
      }
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  // Bấm Lưu: gộp check-cccd + check-duplicate chạy song song 1 lần. Nếu phát hiện
  // hồ sơ trùng → mở modal xác nhận (officer tự quyết). Không trùng → lưu luôn.
  const submit = async () => {
    if (!allRequiredValid) return;
    const cccd = (form.cccd_number || "").replace(/\D/g, "");
    const dupBody = {
      full_name: form.full_name.trim(),
      gender: form.gender || "male",
      dob: form.dob || null,
    };
    setCheckingDup(true);
    setErr("");
    try {
      const [cccdRes, dupRes] = await Promise.allSettled([
        cccd.length >= 9 ? api.checkCccd(cccd) : Promise.resolve({ matched: false }),
        api.checkDuplicate(dupBody),
      ]);

      const matches = [];
      const seen = new Set();
      if (isEdit && initial?.id) seen.add(initial.id);   // bỏ chính hồ sơ đang sửa

      const pushMatch = (detainee, source) => {
        const id = detainee?.id || detainee?._id;
        if (!id || seen.has(id)) return;
        seen.add(id);
        matches.push({ source, detainee });
      };

      if (cccdRes.status === "fulfilled" && cccdRes.value?.matched && cccdRes.value.detainee) {
        pushMatch(cccdRes.value.detainee, "cccd");
      }
      if (dupRes.status === "fulfilled" && Array.isArray(dupRes.value?.duplicates)) {
        dupRes.value.duplicates.forEach((d) => pushMatch(d, "info"));
      }

      // Cả 2 check đều lỗi mạng → không chặn officer vì lỗi hạ tầng, cho lưu luôn.
      if (cccdRes.status === "rejected" && dupRes.status === "rejected") {
        console.error("[dup-check] cả 2 API lỗi:", cccdRes.reason, dupRes.reason);
      }

      if (matches.length > 0) {
        setDupModal({ open: true, matches });
        return;   // chờ officer quyết định trong modal
      }
      await doSave();
    } catch (e) {
      console.error("[dup-check] lỗi ngoài dự kiến:", e);
      await doSave();   // lỗi bất ngờ vẫn cho lưu, không kẹt
    } finally {
      setCheckingDup(false);
    }
  };

  const onDupProceed = () => {
    setDupModal({ open: false, matches: [] });
    doSave();
  };

  const onDupCancel = () => setDupModal({ open: false, matches: [] });

  const onDupOpenProfile = (detainee) => {
    setDupModal({ open: false, matches: [] });
    // Đẩy vào chuông thông báo (kind:"match") — click thông báo sẽ mở hồ sơ đã đăng ký,
    // dùng chung cơ chế với raiseAlert (Dashboard xử lý điều hướng khi click).
    raiseAlert({ source: "cccd", detainee });
  };

  const onDupEdit = (detainee) => {
    setDupModal({ open: false, matches: [] });
    if (onEditProfile) onEditProfile(detainee);
  };

  const resetAll = () => {
    if (!window.confirm(isEdit ? t("capture.confirm.cancel_edit") : t("capture.confirm.clear_all"))) return;
    if (isEdit && onDone) onDone();
    setForm(EMPTY_FORM);
    setPhotos({});
    setErr("");
    setOk("");
  };

  const backToList = () => {
    if (onDone) onDone();
    if (sessionId && onSavedInSession) {
      onSavedInSession();
    } else if (go) {
      go("sessions");
    }
  };

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const captureTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  const plainCount = FP_PLAIN_SLOTS.filter((sl) => photos[sl.key]).length;
  // Khong con anh the CCCD trong mau chi ban => "san sang" chi con 3 anh 3x4,
  // 10 van tay va cac truong bat buoc.
  const readyState = fpCount === 10 && portraitCount === 3 && allRequiredValid;
  const todayStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  // Don vi lap = dia diem cua phien lam viec (truoc day suy ra tu noi giam giu).
  const unitName = sessionLocation;

  return (
    <div className="page capture-page cap-flat">
      {(err || ok) && (
        <div className="capture-banner">
          {/* role=alert cho loi (chen ngang), aria-live=polite cho thanh cong
              (khong cat loi doc dang doc). Truoc do bang chi la mau + chu. */}
          {err && <div className="error-box" role="alert">{err}</div>}
          {ok && (
            <div className="success-box" role="status" aria-live="polite">
              {ok}
              <button type="button" className="banner-link" onClick={backToList}>
                {t("capture.view_list")}
              </button>
            </div>
          )}
        </div>
      )}

      <RecordSummary
        form={form}
        setField={setField}
        dateStr={todayStr}
        unitName={unitName}
        ready={allRequiredValid}
        disabled={sessionReadOnly}
      />

      <div className="case-main cap-sheet cap-sheet--split">
        {/* ---- Cot trai: khai bao nhan than / vu viec / dac diem ---- */}
        <div className="cap-col">
        {/* ================ I. THONG TIN NHAN THAN ================ */}
        <section className="cap-sec" id="cap-sec-personal">
          <h2 className="cap-sec-title">{t("capture.roman.1")}</h2>
          <div className="cap-sec-body">
            <SectionPersonal form={form} setField={setField} disabled={sessionReadOnly} />
          </div>
        </section>

        {/* ================ II. THONG TIN VU VIEC ================ */}
        <section className="cap-sec" id="cap-sec-case">
          <h2 className="cap-sec-title">{t("capture.roman.2")}</h2>
          <div className="cap-sec-body">
            <SectionCase form={form} setField={setField} disabled={sessionReadOnly} />
          </div>
        </section>

        </div>

        {/* ---- Cot phai: chi anh nhan dang. Van tay (V) da tach xuong hang
             rieng ben duoi vi luoi 10 o + 3 anh chum khong du cho trong nua o
             ngang; de canh muc III thi o van tay bi bop nho. ---- */}
        <div className="cap-col">
        {/* ================ IV. ANH NHAN DANG (3x4) ================ */}
        <section className="cap-sec" id="cap-sec-photo">
          <h2 className="cap-sec-title">
            {t("capture.roman.4")}
            <span className="fp-row-count">{portraitCount} / 3</span>
          </h2>
          <div className="cap-sec-body">
            <SectionPortraits
              photos={photos}
              setPhoto={setPhoto}
              applyMeasuredHeight={applyMeasuredHeight}
              onPortraitRecognize={raiseFaceAlerts}
              heightImage={heightImage}
              heightOffset={heightOffset}
            />
          </div>
        </section>
        </div>

        {/* ---- Hang giua, trai het be ngang: dac diem nhan dang ---- */}
        <div className="cap-col cap-col--full">
        {/* ================ III. DAC DIEM NHAN DANG ================ */}
        <section className="cap-sec" id="cap-sec-identify">
          <h2 className="cap-sec-title">{t("capture.roman.3")}</h2>
          <div className="cap-sec-body">
            <SectionIdentify form={form} setField={setField} disabled={sessionReadOnly} />
          </div>
        </section>
        </div>

        {/* ---- Hang duoi, trai het be ngang: chi ban van tay ---- */}
        <div className="cap-col cap-col--full">
        {/* ================ V. CHI BAN VAN TAY ================ */}
        <section className="cap-sec" id="cap-sec-fp">
          <div className="cap-sec-head">
            <h2 className="cap-sec-title">{t("capture.roman.5")}</h2>
              <div className="fp-header-actions">
                {fpConfirm && (
                  <>
                    <button
                      type="button"
                      className="btn-cccd-scan fp-confirm-btn"
                      onClick={fpConfirmCluster}
                      disabled={fpRunning || fpNoneMode}
                      title={t("fpenroll.confirm.title", {
                        step: t(`fpenroll.step.${fpConfirm.step}`),
                      })}
                    >
                      {t("fpenroll.confirm_btn")}
                    </button>
                    <button
                      type="button"
                      className="btn-cccd-scan fp-retake-btn"
                      onClick={fpRetakeCluster}
                      disabled={fpRunning || fpNoneMode}
                    >
                      {t("fpenroll.retake_cluster_btn")}
                    </button>
                  </>
                )}
                {/* Nut "Ngón thiếu": bat/tat mode chon ngon khong co van tay. Khi
                    mode bat, bam vao O NGON (single click) se danh dau thieu thay
                    vi chup lai cum. Bat lai nut de thoat ve trang thai thu. */}
                <button
                  type="button"
                  className={"btn-cccd-scan fp-none-mode-btn" + (fpNoneMode ? " active" : "")}
                  onClick={() => {
                    const next = !fpNoneMode;
                    setFpNoneMode(next);
                    // Vao mode chon ngon thieu => huy xac nhan cum dang cho: neu
                    // can bo danh dau them ngon thieu giua chung thi cum phai xem
                    // lai va xac nhan lai (service da rut confirmed o phia backend).
                    if (next) setFpConfirm(null);
                  }}
                  title={fpNoneMode
                    ? t("capture.fp.none_mode_exit")
                    : t("capture.fp.none_mode_enter")}
                  aria-pressed={fpNoneMode}
                >
                  {fpNoneMode
                    ? t("capture.fp.none_mode_on_btn")
                    : t("capture.fp.none_mode_btn")}
                </button>
              </div>
            </div>
            <div className="cap-sec-body">
            {/* Muc V trai het be ngang => tach noi dung thanh 2 cot: van LAN
                (10 o) ben trai, van CHUM 4-2-4 (3 anh) ben phai. */}
            <div className="fp-two-col">
            <div className="fp-block">
            <h3 className="cap-sub-title cap-sub-title--fp">
              {t("capture.fp.roll_full")}
              <span className="fp-row-count">{fpCount} / 10</span>
            </h3>
            <div className="fp-preview-grid fp-preview-grid--single-row">
              {FP_CLUSTERS.map((cluster) => {
                // Ca cum nhap nhay cung luc = dung 1 lan chup cua may Morfin.
                const clusterActive = fpRunning && (
                  fpActiveCodes.length
                    ? cluster.codes.some((c) => fpActiveCodes.includes(c))
                    : cluster.codes.includes(fpNextCode)
                );
                const clusterDone = cluster.codes.every((c) => photos[FP_CODE_TO_KEY[c]]);
                return (
                  <div
                    key={cluster.step}
                    className={
                      "fp-cluster fp-cluster--" + cluster.step +
                      (clusterDone ? " done" : "") +
                      (clusterActive ? " active neon-active" : "")
                    }
                  >
                    {cluster.codes.map((fpCode) => {
                      const key = FP_CODE_TO_KEY[fpCode];
                      const label = t(`fp.finger.${fpCode}.long`);
                      const isNone = fpNoneCodes.includes(fpCode);
                      const filled = !isNone && !!photos[key];
                      const q = fpQuality[fpCode];
                      return (
                        <div
                          key={key}
                          className={
                            "fp-preview-cell " + (filled ? "done" : "empty") +
                            (isNone ? " fp-cell-none" : "") +
                            (fpNoneMode ? " fp-cell-select" : "")
                          }
                          // Mode "chon ngon thieu": bam vao O (single click) se
                          // danh dau / bo danh dau ngon do la thieu. Ngoai mode,
                          // single-click khong lam gi (chi double-click de chup lai).
                          // KHONG chan theo fpRunning: day la chot bi bo sot lam
                          // "bam Ngón thiếu roi bam vao o van khong chon duoc" -
                          // vong thu chay ngay khi vao trang nen fpRunning gan
                          // nhu luon true, phai Khoa moi bam duoc. fpToggleNone
                          // tu lo phan con lai (cat lan chup dang chay).
                          onClick={fpNoneMode ? () => fpToggleNone(fpCode) : undefined}
                          onDoubleClick={() => !fpRunning && !fpNoneMode && !isNone && retryFingerprint(key, fpCode)}
                          title={
                            fpNoneMode
                              ? (isNone
                                  ? t("capture.fp.none_mode_tap_off", { name: label })
                                  : t("capture.fp.none_mode_tap_on", { name: label }))
                              : isNone
                                ? t("capture.fp.none_hint")
                                : filled ? t("capture.fp.dbl_retake") : t("capture.fp.dbl_take")
                          }
                          style={{ cursor: fpRunning || (isNone && !fpNoneMode) ? "default" : "pointer" }}
                        >
                          {/* So 1..10 theo thu tu in tren chi ban giay. O van
                              nhom theo cum chup nen so khong lien tiep — day la
                              co y: doc duoc ca thu tu giay va cum chup. */}
                          <span className="fp-cell-no" aria-hidden="true">{FP_SHEET_NO[fpCode]}</span>
                          <div className="fp-preview-thumb">
                            {filled ? (
                              <img src={photos[key]} alt={label} />
                            ) : (
                              <HandGlyph
                                side={fpCode.startsWith("left") ? "left" : "right"}
                                active={[fpCode.replace(/^(left|right)_/, "")]}
                              />
                            )}
                            {isNone ? (
                              <span className="fp-cell-quality none">
                                {t("capture.fp.none_badge")}
                              </span>
                            ) : typeof q === "number" && (() => {
                              // Nguong RIENG tung ngon (service tra min_quality_by_code).
                              // Ngon ut thap hon 50 vi tren platen phang chi dau ngon
                              // tiep xuc => hardcode 50 se to do du no da dat.
                              // Duoi nguong KHONG con bi tu choi - chi to do de can bo
                              // thay ma quyet dinh khi bam Xac nhan.
                              const need = fpMinQ[fpCode] ?? 50;
                              const cls = q >= need + 20 ? "good" : q >= need ? "ok" : "bad";
                              return <span className={"fp-cell-quality " + cls}>{q}%</span>;
                            })()}
                            {/* Bat/tat "khong co van tay" cho rieng o nay. Phai la nut
                                that (khong phai double-click o) vi double-click da danh
                                cho chup lai cum, va danh dau none can dung duoc CA KHI
                                chua co session. */}
                            <button
                              type="button"
                              className={"fp-cell-none-btn" + (isNone ? " on" : "")}
                              onClick={(e) => { e.stopPropagation(); fpToggleNone(fpCode); }}
                              /* Khong chan theo fpRunning: day la nut can bam DUNG
                                 LUC may dang chay het timeout vi cho du 4 ngon.
                                 Xem fpToggleNone. */
                              title={isNone
                                ? t("capture.fp.none_off", { name: label })
                                : t("capture.fp.none_on", { name: label })}
                              aria-pressed={isNone}
                            >
                              ⊘
                            </button>
                          </div>
                          {filled && (
                            <span className="fp-cell-taken">{t("capture.fp.taken")}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* KHONG co panel giai thich o day: khoi text chen vao giua luoi va
                KPI lam day khoi vân tay, day layout xuong va che phan duoi. Ngon
                yeu da tu the hien bang % do tren o + badge, nen chi can 1 nut
                Xac nhan canh nut khoa la du. */}

            </div>

            {/* Hang van PHANG: 3 anh cum nguyen ban tu may, khop dung 3 STEPS
                cua morfin_service. Van LAN o tren van dung key fp_l1..fp_r5. */}
            <div className="fp-block">
            <h3 className="cap-sub-title cap-sub-title--fp">
              {t("capture.fp.plain_full")}
              <span className="fp-row-count">{plainCount} / 3</span>
            </h3>
            <div className="fp-plain-row">
              {FP_PLAIN_SLOTS.map((slot) => {
                const filled = !!photos[slot.key];
                const active = fpRunning && fpConfirm?.step === slot.step;
                return (
                  <div
                    key={slot.key}
                    className={"fp-plain-cell " + (filled ? "done" : "empty") +
                      (active ? " active neon-active" : "")}
                    title={t(slot.labelKey)}
                  >
                    <div className="fp-plain-thumb">
                      {filled
                        ? <img src={photos[slot.key]} alt={t(slot.labelKey)} />
                        : <span className="fp-plain-ph">—</span>}
                    </div>
                    <span className="fp-plain-label">{t(slot.labelKey)}</span>
                  </div>
                );
              })}
            </div>
            </div>
            </div>

            {/* KPI dem 10 ngon: nam ngoai 2 cot, tinh cho ca muc V. */}
            <div className="fp-kpi fp-kpi-inline fp-kpi-2col">
              <div className="fp-kpi-cell">
                <span className="fp-kpi-num">{fpCount}</span>
                <span className="fp-kpi-divider">/ 10</span>
              </div>
              <div className="fp-kpi-cell fp-kpi-hands">
                <HandGlyph side="left" active={fpDoneByHand.left}
                  blink={fpBlinkByHand.left} className="kpi" />
                <HandGlyph side="right" active={fpDoneByHand.right}
                  blink={fpBlinkByHand.right} className="kpi" />
              </div>
            </div>
          </div>
        </section>
        </div>

      </div>


      {/* ================ Action bar ================ */}
      <div className="case-action-bar">
        <button type="button" className="button primary"
          disabled={!allRequiredValid || saving} onClick={submit}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <path d="M17 21v-8H7v8M7 3v5h8" />
          </svg>
          {saving ? t("common.saving") : isEdit ? t("capture.actions.update") : t("capture.actions.save")}
        </button>
        <button type="button" className="button secondary" disabled={saving}
          onClick={async () => {
            const payload = { form, photos, cells };
            const opened = await tryOpenOnSecondaryScreen(payload);
            if (opened) setPreviewOnSecondary(true);
            else setPreviewOpen(true);
          }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M8 13h8M8 17h6" />
          </svg>
          {t("capture.actions.preview")}
        </button>
        {/* Xem truoc CHI BAN: to rieng theo mau chi ban giay (van tay + nhan than
            toi thieu), khong phai to ho so can pham o nut ben canh. */}
        <button type="button" className="button secondary" disabled={saving}
          onClick={() => setFpSheetOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M7 8h4M7 12h4M7 16h2M15 8v8" />
          </svg>
          {t("capture.actions.preview_fpsheet")}
        </button>
        {/* Xem truoc DANH BAN: mau 204 + 208 (nhan than + 2 ngon tro + 3 anh 3x4). */}
        <button type="button" className="button secondary" disabled={saving}
          onClick={() => setNameSheetOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="2.2" />
            <path d="M5.5 17c0.6-2 1.9-3 3.5-3s2.9 1 3.5 3M15 9h4M15 13h4" />
          </svg>
          {t("capture.actions.preview_namesheet")}
        </button>
        <button type="button" className="button danger" disabled={saving} onClick={resetAll}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
          </svg>
          {t("capture.actions.clear")}
        </button>
      </div>

      {nameSheetOpen && (
        <NameSheetPreviewModal
          form={form}
          photos={photos}
          unitName={unitName}
          onClose={() => setNameSheetOpen(false)}
        />
      )}

      {fpSheetOpen && (
        <FpSheetPreviewModal
          form={form}
          photos={photos}
          onClose={() => setFpSheetOpen(false)}
        />
      )}

      {previewOpen && (
        <ProfilePreviewModal
          form={form}
          photos={photos}
          cells={cells}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      <DuplicateWarnModal
        open={dupModal.open}
        matches={dupModal.matches}
        onProceed={onDupProceed}
        onOpenProfile={onDupOpenProfile}
        onEditProfile={onEditProfile ? onDupEdit : undefined}
        onCancel={onDupCancel}
      />
    </div>
  );
}

export const ProfilePreviewContent = forwardRef(function ProfilePreviewContent(
  { form, photos, cells = [] },
  ref,
) {
  const { t, formatDateLong } = useI18n();
  const genderVi = form.gender === "female"
    ? t("common.female")
    : form.gender === "male"
      ? t("common.male")
      : "";
  const dateLong = formatDateLong(new Date());
  const val = (v) => (v && String(v).trim() ? v : t("pdf.blank"));
  const custLabel = (v) => {
    if (!v) return t("pdf.blank");
    if (v === "tam_giu") return t("detainee.custody_type.temporary_hold");
    if (v === "tam_giam") return t("detainee.custody_type.detention");
    return v;
  };
  const cellName = (code) => {
    if (!code) return t("pdf.blank");
    const c = cells.find((x) => x.code === code);
    return c ? c.name : code;
  };
  const alcoholLabel = (v) => {
    if (v === true || v === "true") return t("common.yes");
    if (v === false || v === "false") return t("common.no");
    return val(v);
  };

  return (
    <div ref={ref} className="preview-a4 preview-a4-portrait">
      {/* ===== Header: ảnh CCCD (góc trên trái) + emblem/motto (bên phải) ===== */}
      <div className="pv-header-row pv-header-row-v3">
        <div className="pv-cccd-strip">
          {photos.cccd_front
            ? <img src={photos.cccd_front} alt={t("pdf.cccd_photo")} />
            : <span className="pv-cccd-strip-empty">{t("pdf.cccd_photo")}</span>}
          {photos.cccd_back
            ? <img src={photos.cccd_back} alt={t("pdf.cccd_photo")} />
            : null}
        </div>
        <div className="pv-header-left pv-header-left-v3">
          <div className="pv-org1">{t("pdf.emblem")}</div>
          <div className="pv-org2">{t("pdf.motto")}</div>
          <div className="pv-org-underline" />
        </div>
      </div>

      {/* ===== Title ===== */}
      <div className="pv-title-row">
        <h1 className="pv-title">{t("pdf.title")}</h1>
        <div className="pv-subtitle">
          {t("pdf.record_id")} <b>{val(form.personal_id || form.cccd_number)}</b>
        </div>
      </div>

      {/* ===== 2 cột: I. Thông tin cá nhân (+Hồ sơ) | II. Diện giam + Sức khỏe + Trình độ ===== */}
      <div className="pv-info-cols">
        {/* ---- Cột trái ---- */}
        <div className="pv-info-col">
          <h3 className="pv-section">{t("pdf.section1")}</h3>
          <table className="pv-table pv-info-table pv-info-single">
            <tbody>
              <tr><td className="pv-label">{t("pdf.field.full_name")}</td><td>{val(form.full_name)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.dob")}</td><td>{val(form.dob)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.gender")}</td><td>{val(genderVi)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.cccd")}</td><td>{val(form.cccd_number)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.nationality")}</td><td>{val(form.nationality)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.ethnicity")}</td><td>{val(form.ethnicity)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.religion")}</td><td>{val(form.religion)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.hometown")}</td><td>{val(form.hometown)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.address")}</td><td>{val(form.address)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.issued_date")}</td><td>{val(form.issued_date)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.expiry")}</td><td>{val(form.expiry_date)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.issued_place")}</td><td>{val(form.issued_place)}</td></tr>
              <tr><td className="pv-label">{t("detainee.field.distinguishing_features")}</td><td>{val(form.distinguishing_features)}</td></tr>
              <tr><td className="pv-label">{t("detainee.field.mrz")}</td><td><pre className="pv-mrz">{val(form.mrz)}</pre></td></tr>
              <tr><td className="pv-label">{t("detainee.field.scars")}</td><td>{val(form.scars)}</td></tr>
            </tbody>
          </table>

          <h3 className="pv-section pv-section-sub">{t("pdf.section2.case")}</h3>
          <table className="pv-table pv-info-table pv-info-single">
            <tbody>
              <tr><td className="pv-label">{t("detainee.field.charge")}</td><td>{val(form.charge)}</td></tr>
              <tr><td className="pv-label">{t("detainee.field.charge_detail")}</td><td>{val(form.charge_detail)}</td></tr>
              <tr><td className="pv-label">{t("detainee.field.arrest_date")}</td><td>{val(form.arrest_date)}</td></tr>
              <tr><td className="pv-label">{t("detainee.field.arrest_agency")}</td><td>{val(form.arrest_agency)}</td></tr>
              <tr><td className="pv-label">{t("detainee.field.decision_no")}</td><td>{val(form.decision_no)}</td></tr>
              <tr><td className="pv-label">{t("pdf.field.note")}</td><td>{val(form.note)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* ---- Cột phải ---- */}
        <div className="pv-info-col">
          <h3 className="pv-section">{t("pdf.section2.custody")}</h3>
          <div className="pv-info-grid">
            <div className="pv-g-label">{t("detainee.field.custody_type")}</div>
            <div>{custLabel(form.custody_type)}</div>
            <div className="pv-g-label">{t("detainee.field.facility_type")}</div>
            <div>{cellName(form.facility_code)}</div>
            {form.custody_type === "tam_giam" && (
              <>
                <div className="pv-g-label">{t("detainee.field.sub_camp")}</div>
                <div>{cellName(form.sub_camp_code)}</div>
              </>
            )}
            <div className="pv-g-label">{t("detainee.field.cell")}</div>
            <div>{cellName(form.cell_code)}</div>
            <div className="pv-g-label">{t("pdf.field.date_in")}</div>
            <div>{toDobInput(form.date_in) || toDobInput(new Date())}</div>
          </div>

          <h3 className="pv-section pv-section-sub">{t("pdf.section2.identify")}</h3>
          <div className="pv-info-grid">
            <div className="pv-g-label">{t("pdf.field.height")}</div>
            <div>{val(form.height_cm)}</div>
            <div className="pv-g-label">{t("pdf.field.weight")}</div>
            <div>{val(form.weight_kg)}</div>
            <div className="pv-g-label">{t("detainee.field.blood_type")}</div>
            <div>{val(form.blood_type)}</div>
          </div>
        </div>
      </div>

      {/* ===== III. Portrait photos (3 frames) ===== */}
      <h3 className="pv-section">{t("pdf.section3")}</h3>
      <div className="pv-portraits">
        {PORTRAITS.map((p) => (
          <div key={p.key} className="pv-portrait-item">
            <div className="pv-portrait-frame">
              {photos[p.key]
                ? <img src={photos[p.key]} alt={t(p.labelKey)} />
                : <span className="pv-empty">{t("pdf.no_photo")}</span>}
            </div>
            <span>{t(p.labelKey)}</span>
          </div>
        ))}
      </div>

      {/* ===== IV. Ten-finger prints (2 rows x 5 cols by hand) ===== */}
      <h3 className="pv-section">{t("pdf.section4")}</h3>
      <div className="pv-fp-wrap">
        <div className="pv-fp-hand">
          <div className="pv-fp-grid">
            {LEFT_HAND.map((f) => {
              const label = t(`fp.finger.${f.code}.long`);
              return (
                <div key={f.key} className="pv-fp-item">
                  <div className="pv-fp-frame">
                    {photos[f.key]
                      ? <img src={photos[f.key]} alt={label} />
                      : <span className="pv-empty">—</span>}
                  </div>
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="pv-fp-hand">
          <div className="pv-fp-grid">
            {RIGHT_HAND.map((f) => {
              const label = t(`fp.finger.${f.code}.long`);
              return (
                <div key={f.key} className="pv-fp-item">
                  <div className="pv-fp-frame">
                    {photos[f.key]
                      ? <img src={photos[f.key]} alt={label} />
                      : <span className="pv-empty">—</span>}
                  </div>
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== Signatures ===== */}
      <div className="pv-signatures">
        <div className="pv-sig-block">
          <div className="pv-sig-place">&nbsp;</div>
          <div className="pv-sig-role">{t("pdf.declarant")}</div>
          <div className="pv-sig-note">{t("pdf.sign_note")}</div>
          <div className="pv-sig-space" />
        </div>
        <div className="pv-sig-block">
          <div className="pv-sig-place">{dateLong}</div>
          <div className="pv-sig-role">{t("pdf.officer")}</div>
          <div className="pv-sig-note">{t("pdf.sign_note")}</div>
          <div className="pv-sig-space" />
        </div>
      </div>
    </div>
  );
});

function ProfilePreviewModal({ form, photos, cells = [], onClose }) {
  const { t } = useI18n();
  const a4Ref = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [usbPicker, setUsbPicker] = useState({ open: false, drives: [], resolve: null });

  const pickDrive = (drives) => new Promise((resolve) => {
    setUsbPicker({ open: true, drives, resolve });
  });

  const handlePrint = async () => {
    const node = a4Ref.current;
    if (!node) return;
    setExporting(true);
    try {
      const info = await usbApi.listWritable();
      const drives = info.drives || [];
      const dongles = info.dongle_drives || [];
      if (drives.length === 0) {
        if (dongles.length > 0) throw new Error(apiT("usb.export.err.only_dongle"));
        throw new Error(apiT("usb.export.err.no_drive"));
      }
      const chosen = drives.length === 1 ? drives[0] : await pickDrive(drives);
      if (!chosen) return;
      const blob = await buildProfilePdfBlob(node);
      const filename = makePdfFileName(form.personal_id || form.cccd_number, form.full_name);
      const saved = await usbApi.saveExport(chosen.path, filename, blob);
      const okMsg = t("usb.export.success", { path: saved?.path || chosen.path });
      notify.add(okMsg);
      toast.success(okMsg);
    } catch (ex) {
      console.error("[Export PDF] error:", ex);
      toast.error(t("capture.pdf.err_export", { message: ex?.message || ex }));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="preview-backdrop" onClick={onClose}>
      <div className="preview-toolbar no-print" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="preview-btn" onClick={handlePrint} disabled={exporting}>
          {exporting ? t("capture.pdf.exporting") : t("capture.pdf.export")}
        </button>
        <button type="button" className="preview-btn preview-close" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>

      <div className="preview-scroll" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()}>
          <ProfilePreviewContent ref={a4Ref} form={form} photos={photos} cells={cells} />
        </div>
      </div>

      {usbPicker.open && (
        <UsbDrivePickerModal
          drives={usbPicker.drives}
          onPick={(d) => {
            const r = usbPicker.resolve;
            setUsbPicker({ open: false, drives: [], resolve: null });
            r && r(d);
          }}
          onCancel={() => {
            const r = usbPicker.resolve;
            setUsbPicker({ open: false, drives: [], resolve: null });
            r && r(null);
          }}
        />
      )}
    </div>
  );
}
