import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";
import { useI18n } from "./i18n";
import { demoImage, demoMatch, minutiae } from "./sceneDemo";
import { SUBJECTS } from "./sceneMatchDemo";
import { traceCode } from "./SceneTracesPage";
import { IcChevDown, IcClose, IcEye, IcPagePrev } from "./sceneMatchIcons";

// Chuyển đổi toạ độ pixel hoặc toạ độ % điểm đặc trưng sang % hiển thị trên ảnh
function toPercentageDots(points = [], width = 800, height = 750) {
  if (!points || !points.length) return [];
  const w = width > 0 ? width : 800;
  const h = height > 0 ? height : 750;
  return points.map((p, idx) => {
    const rawX = p.x != null ? p.x : (p.x_pixel != null ? p.x_pixel : (Array.isArray(p) ? p[0] : 0));
    const rawY = p.y != null ? p.y : (p.y_pixel != null ? p.y_pixel : (Array.isArray(p) ? p[1] : 0));
    const isPixel = rawX > 100 || rawY > 100;
    const xPct = isPixel ? (rawX / w) * 100 : rawX;
    const yPct = isPixel ? (rawY / h) * 100 : rawY;
    return {
      x: Math.max(0, Math.min(100, +xPct.toFixed(2))),
      y: Math.max(0, Math.min(100, +yPct.toFixed(2))),
      d: p.d,
      q: p.q,
      t: p.t,
      idx: idx + 1,
    };
  });
}

function DotsOverlay({ dots }) {
  if (!dots || !dots.length) return null;
  return (
    <span className="stf-dots" aria-hidden="true">
      {dots.map((d, i) => (
        <span
          className="stf-dot-m"
          key={i}
          style={{ left: `${d.x}%`, top: `${d.y}%` }}
          title={d.q != null ? `Điểm đặc trưng #${i + 1} (Chất lượng: ${d.q}%)` : `Điểm đặc trưng #${i + 1}`}
        />
      ))}
    </span>
  );
}

// Tải ảnh về kèm các điểm đặc trưng được vẽ trực tiếp bằng Canvas (gọn gàng, không đè số)
async function downloadImageWithDots(imgUrl, dots, filename) {
  if (!dots || !dots.length) {
    const a = document.createElement("a");
    a.href = imgUrl;
    a.download = filename;
    a.target = "_blank";
    a.click();
    return;
  }
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imgUrl;
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || 800;
    canvas.height = img.naturalHeight || 750;
    const ctx = canvas.getContext("2d");

    // Vẽ ảnh nền
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Vẽ các điểm đặc trưng nhỏ gọn, sắc nét
    const scale = Math.max(1, canvas.width / 800);
    dots.forEach((d) => {
      const px = (d.x / 100) * canvas.width;
      const py = (d.y / 100) * canvas.height;
      const r = 3.5 * scale;

      // Vòng ngoài bóng đen
      ctx.beginPath();
      ctx.arc(px, py, r + 1.5 * scale, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
      ctx.fill();

      // Vòng tròn điểm hồng/đỏ
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = "#ff2d87";
      ctx.fill();
      ctx.lineWidth = 1.2 * scale;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      // Tâm điểm
      ctx.beginPath();
      ctx.arc(px, py, 1.2 * scale, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    });

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }, "image/png");
  } catch {
    const a = document.createElement("a");
    a.href = imgUrl;
    a.download = filename;
    a.target = "_blank";
    a.click();
  }
}

// Trang chi tiết 1 dấu vết — mở từ 1 dòng bảng KẾT QUẢ ĐỐI SÁNH.
export default function SceneTraceFull({ item, row = {}, session, detainees = [], subjects = [], onBack }) {
  const { t, formatDateTime } = useI18n();
  const [zoom, setZoom] = useState(null);
  const [fetchedDetainee, setFetchedDetainee] = useState(null);

  if (!item) return null;
  const safeRow = row || {};

  const m = demoMatch(item, safeRow);
  const seq = item.seq ?? 1;
  const code = traceCode(item);

  // 1. Ảnh vết hiện trường thật
  const latentUrl = item.url || safeRow.trace_url || safeRow.url || demoImage(seq, "raw", "latent");
  
  // 2. Ảnh đối sánh thật (từ row hoặc detainee)
  const candidateUrl = safeRow.candidate_url || safeRow.fp_url || demoImage(seq, "raw", "candidate");

  // 3. Toạ độ điểm đặc trưng vết hiện trường (từ item.landmark hoặc safeRow.latent_landmarks)
  const latentPoints = safeRow.latent_landmarks?.points || item.landmark?.points || (Array.isArray(item.landmark) ? item.landmark : []) || [];
  const latentW = safeRow.latent_dim?.width || item.img_width || 800;
  const latentH = safeRow.latent_dim?.height || item.img_height || 750;
  const latentDots = useMemo(() => {
    if (latentPoints.length > 0) {
      return toPercentageDots(latentPoints, latentW, latentH);
    }
    return toPercentageDots(minutiae(seq, 68, false), 800, 750);
  }, [latentPoints, latentW, latentH, seq]);

  // 4. Toạ độ điểm đặc trưng ảnh đối sánh (từ safeRow.candidate_landmarks)
  const candidatePoints = safeRow.candidate_landmarks?.points || (Array.isArray(safeRow.candidate_landmarks) ? safeRow.candidate_landmarks : []) || [];
  const candidateW = safeRow.candidate_dim?.width || 800;
  const candidateH = safeRow.candidate_dim?.height || 750;
  const candidateDots = useMemo(() => {
    if (candidatePoints.length > 0) {
      return toPercentageDots(candidatePoints, candidateW, candidateH);
    }
    return toPercentageDots(minutiae(seq, 72, true), 800, 750);
  }, [candidatePoints, candidateW, candidateH, seq]);

  const files = useMemo(() => [
    {
      n: 1,
      key: "raw1",
      name: "01_latent_original.png",
      groupKey: "scene.file.g_raw",
      kindKey: "scene.file.k_latent",
      url: latentUrl,
      size: 1.2,
      dots: null,
    },
    {
      n: 2,
      key: "raw2",
      name: "02_candidate_original.png",
      groupKey: "scene.file.g_raw",
      kindKey: "scene.file.k_candidate",
      url: candidateUrl,
      size: 1.1,
      dots: null,
    },
    {
      n: 3,
      key: "dot1",
      name: "03_latent_minutiae.png",
      groupKey: "scene.file.g_dots",
      kindKey: "scene.file.k_latent",
      url: latentUrl,
      size: 1.3,
      dots: latentDots,
    },
    {
      n: 4,
      key: "dot2",
      name: "04_candidate_minutiae.png",
      groupKey: "scene.file.g_dots",
      kindKey: "scene.file.k_candidate",
      url: candidateUrl,
      size: 1.3,
      dots: candidateDots,
    },
  ], [latentUrl, candidateUrl, latentDots, candidateDots]);

  const matched = (safeRow.verdict || m.verdict) === "match";
  const fmt = (v) => (formatDateTime ? formatDateTime(v) : v);

  const foundCount = latentDots.length || m.found;
  const totalCount = candidateDots.length || m.total;
  const percentStr = safeRow.pct || `${m.percent}%`;
  const fingerLabel = safeRow.finger ? t(safeRow.finger) : t(m.finger);
  const subjectLabel = safeRow.name ? `Nghi phạm: ${safeRow.name}${safeRow.cccd && safeRow.cccd !== "—" ? ` (CCCD ${safeRow.cccd})` : ""}` : m.subject;

  // Thông tin dấu vết: 6 field đầu từ DB
  const info = [
    [t("scene.col.code"), code],
    [t("scene.col.type"), item.trace_type || "—"],
    [t("scene.col.source"), item.collection_source || "—"],
    [t("scene.col.place"), session?.location || m.place],
    [t("scene.col.time"), fmt(item.captured_at)],
    [t("scene.detail.officer"), item.created_by || item.device_id || "—"],
  ];

  const result = [
    [t("scene.match.points"), `${foundCount}/${totalCount}`],
    [t("scene.match.percent"), percentStr],
    [t("scene.match.finger"), fingerLabel],
    [t("scene.match.subject"), subjectLabel],
    [t("scene.match.place"), session?.location || m.place],
    [t("scene.match.at"), safeRow.time || m.analyzed_at],
    [t("scene.match.by"), item.created_by || m.analyst],
  ];

  // Tìm đối tượng khớp trực tiếp từ props
  const directDetainee = useMemo(() => {
    const list = [
      ...(Array.isArray(detainees) ? detainees : []),
      ...(Array.isArray(session?.detainees) ? session.detainees : []),
    ];
    const rowName = (safeRow.name || "").trim().toLowerCase();
    const rowCccd = (safeRow.cccd || "").trim();
    const rowDetaineeId = safeRow.detainee_id || safeRow.raw?.detainee_id || safeRow.raw?.suspect_id || "";

    if (rowDetaineeId) {
      const byId = list.find((d) => (d.id && d.id === rowDetaineeId) || (d._id && d._id === rowDetaineeId));
      if (byId) return byId;
    }
    if (rowCccd && rowCccd !== "—") {
      const byCccd = list.find((d) => 
        (d.cccd_number && d.cccd_number === rowCccd) ||
        (d.cccd && d.cccd === rowCccd) ||
        (d.personal_id && d.personal_id === rowCccd)
      );
      if (byCccd) return byCccd;
    }
    if (rowName) {
      const byName = list.find((d) => 
        (d.full_name && d.full_name.trim().toLowerCase() === rowName) ||
        (d.name && d.name.trim().toLowerCase() === rowName)
      );
      if (byName) return byName;
    }
    return list[0] || null;
  }, [detainees, session, safeRow]);

  const matchedSub = useMemo(() => {
    const list = Array.isArray(subjects) ? subjects : [];
    const rowName = (safeRow.name || "").trim().toLowerCase();
    const rowCccd = (safeRow.cccd || "").trim();
    return list.find((s) => 
      (s.cccd && rowCccd && s.cccd === rowCccd) ||
      (s.name && rowName && s.name.trim().toLowerCase() === rowName)
    ) || list[0] || null;
  }, [subjects, safeRow]);

  // Nếu chưa có detainee từ props thì fetch từ API
  useEffect(() => {
    if (directDetainee) return;
    let cancel = false;
    const fetchSuspect = async () => {
      try {
        if (safeRow.detainee_id) {
          const d = await api.getDetainee(safeRow.detainee_id).catch(() => null);
          if (d && !cancel) { setFetchedDetainee(d); return; }
        }
        if (safeRow.cccd && safeRow.cccd !== "—") {
          const res = await api.checkCccd(safeRow.cccd).catch(() => null);
          if (res?.detainee && !cancel) { setFetchedDetainee(res.detainee); return; }
          const byPid = await api.getDetaineeByPersonalId(safeRow.cccd).catch(() => null);
          if (byPid && !cancel) { setFetchedDetainee(byPid); return; }
        }
        const caseId = session?.id || session?.case_id || "";
        if (caseId) {
          const listRes = await api.listDetainees({ case_id: caseId }).catch(() => null);
          if (listRes?.items?.length && !cancel) {
            const rowName = (safeRow.name || "").trim().toLowerCase();
            const rowCccd = (safeRow.cccd || "").trim();
            const found = listRes.items.find((d) => 
              (rowName && ((d.full_name && d.full_name.toLowerCase() === rowName) || (d.name && d.name.toLowerCase() === rowName))) ||
              (rowCccd && (d.cccd_number === rowCccd || d.cccd === rowCccd || d.personal_id === rowCccd))
            ) || listRes.items[0];
            if (found) { setFetchedDetainee(found); return; }
          }
        }
        const allRes = await api.listDetainees().catch(() => null);
        if (allRes?.items?.length && !cancel) {
          const rowName = (safeRow.name || "").trim().toLowerCase();
          const rowCccd = (safeRow.cccd || "").trim();
          const found = allRes.items.find((d) => 
            (rowName && ((d.full_name && d.full_name.toLowerCase() === rowName) || (d.name && d.name.toLowerCase() === rowName))) ||
            (rowCccd && (d.cccd_number === rowCccd || d.cccd === rowCccd || d.personal_id === rowCccd))
          ) || allRes.items[0];
          if (found) { setFetchedDetainee(found); return; }
        }
      } catch (e) {
        console.warn("[SceneTraceFull] could not fetch suspect details", e);
      }
    };
    fetchSuspect();
    return () => { cancel = true; };
  }, [directDetainee, safeRow, session]);

  const activeDetainee = directDetainee || fetchedDetainee;
  const demoSubject = SUBJECTS.find((s) => s.cccd === safeRow.cccd || s.name === safeRow.name) || SUBJECTS[0] || {};
  const subject = {
    ...demoSubject,
    ...(matchedSub || {}),
    ...(activeDetainee || {}),
    ...(activeDetainee?.photos || {}),
    ...safeRow,
  };

  const portraitUrl =
    activeDetainee?.portrait ||
    activeDetainee?.portrait_cropped_url ||
    activeDetainee?.portrait_original_url ||
    activeDetainee?.photos?.portrait_front ||
    activeDetainee?.photos?.portrait_cropped ||
    activeDetainee?.photos?.portrait ||
    activeDetainee?.photos?.cccd_front ||
    activeDetainee?.photo_url ||
    activeDetainee?.photo ||
    matchedSub?.photo ||
    matchedSub?.portrait ||
    matchedSub?.portrait_cropped_url ||
    matchedSub?.portrait_original_url ||
    safeRow.portrait_url ||
    safeRow.portrait ||
    safeRow.photo ||
    safeRow.raw?.portrait ||
    safeRow.raw?.portrait_cropped_url ||
    safeRow.raw?.photos?.portrait_front ||
    safeRow.raw?.photos?.cccd_front ||
    subject?.portrait ||
    subject?.photo ||
    "";
  const gender = subject.gender || subject.sex;
  const subjectInfo = [
    ["detainee.field.full_name", subject.full_name || subject.name],
    ["capture.personal.alias", subject.alias],
    ["detainee.field.gender", ["male", "Nam"].includes(gender) ? t("common.male") : ["female", "Nữ"].includes(gender) ? t("common.female") : gender],
    ["capture.personal.dob", subject.dob || subject.birth_year],
    ["capture.personal.id_doc", subject.cccd_number || subject.cccd],
    ["detainee.field.nationality", subject.nationality],
    ["detainee.field.ethnicity", subject.ethnicity],
    ["detainee.field.occupation", subject.occupation],
    ["detainee.field.hometown", subject.hometown],
    ["detainee.field.address", subject.address],
    ["detainee.field.temp_address", subject.temp_address],
    ["detainee.field.current_address", subject.current_address],
    ["detainee.field.father_name", subject.father_name],
    ["detainee.field.mother_name", subject.mother_name],
    ["detainee.field.note", subject.note],
  ];

  return (
    <div className="stf">
      {/* Breadcrumb + chip trạng thái + nút quay lại */}
      <div className="stf-crumbbar">
        <div className="stf-crumb-main">
          <div className="stf-crumb">
            <span>{session?.name || session?.case_name || (session?.code ? `Vụ án ${session.code}` : t("scene.no_case"))}</span>
            <span className="stf-sep">/</span>
            <span>{t("scene.crumb.traces")}</span>
            <span className="stf-sep">/</span>
            <span className="stf-crumb-cur">{code}</span>
          </div>
          <div className="stf-chips">
            <span className="stf-chip stf-chip-ok">
              <span className="stf-dot" />
              {t("scene.tag.analyzed")}
            </span>
            <span className="stf-chip stf-chip-fill">{t("scene.tag.files", { n: files.length })}</span>
            <span className="stf-chip">{t("scene.tag.report", { n: 1 })}</span>
          </div>
        </div>
        <div className="stf-crumb-act">
          <button type="button" className="smp-btn-ghost" onClick={onBack}>
            <IcPagePrev />
            {t("scene.back")}
          </button>
          <button type="button" className="smp-btn-ghost" disabled>
            {t("scene.detail.actions")}
            <IcChevDown />
          </button>
        </div>
      </div>

      {/* Ảnh chính diện của đối tượng | Thông tin dấu vết | Kết quả đối sánh */}
      <div className="stf-top">
        <div className="stf-latent stf-portrait-box">
          {portraitUrl ? (
            <button
              type="button"
              className="stf-latent-btn"
              onClick={() => setZoom({ url: portraitUrl, title: `${subject.full_name || subject.name || "Đối tượng"} - Ảnh chính diện` })}
            >
              <img src={portraitUrl} alt={subject.full_name || subject.name || "Ảnh chính diện"} loading="lazy" />
            </button>
          ) : (
            <div className="stf-portrait-empty">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35, marginBottom: "8px" }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>{t("scene.no_portrait")}</span>
            </div>
          )}
        </div>

        <section className="stf-card">
          <h3 className="stf-h">{t("scene.detail.title")}</h3>
          <div className="stf-kv">
            {info.map(([k, v]) => (
              <div className="stf-kv-row" key={k}>
                <span className="stf-k">{k}</span>
                <span className="stf-v">{v}</span>
              </div>
            ))}
            <div className="stf-kv-row">
              <span className="stf-k">{t("scene.col.status")}</span>
              <span>
                <span className="stf-chip stf-chip-ok">{t("scene.tag.analyzed")}</span>
              </span>
            </div>
            <div className="stf-kv-row">
              <span className="stf-k">{t("scene.detail.note")}</span>
              <span className="stf-k">{item.note || "—"}</span>
            </div>
          </div>
        </section>

        <section className="stf-card">
          <h3 className="stf-h">{t("scene.match.title")}</h3>
          <div className="stf-kv stf-kv-spread">
            <div className="stf-kv-row">
              <span className="stf-k">{t("scene.match.verdict")}</span>
              <strong className={matched ? "stf-verdict ok" : "stf-verdict warn"}>
                {matched ? t("scene.match.v_match") : t("scene.match.v_review")}
              </strong>
            </div>
            {result.map(([k, v]) => (
              <div className="stf-kv-row" key={k}>
                <span className="stf-k">{k}</span>
                <span className="stf-v">{v}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 4.1 Folder matching | 4.2 Thông tin nghi phạm */}
      <div className="stf-mid">
        <section className="stf-card stf-folder">
          <h3 className="stf-h">
            {t("scene.folder.title")}{" "}
            <span className="stf-h-sub">{t("scene.folder.count", { n: files.length })}</span>
          </h3>
          <div className="stf-files">
            {files.map((f) => (
              <div className="stf-file" key={f.n}>
                <div className="stf-file-head">
                  <span className="stf-file-n">{f.n}</span>
                  <span className="stf-file-title">
                    {t(f.groupKey)}
                    <span className="stf-file-sub">{t(f.kindKey)}</span>
                  </span>
                </div>
                <button
                  type="button"
                  className="stf-file-img"
                  onClick={() => setZoom({ url: f.url, dots: f.dots, title: `${t(f.groupKey)} - ${t(f.kindKey)} (${f.name})` })}
                >
                  <img src={f.url} alt={f.name} loading="lazy" />
                  {f.dots && <DotsOverlay dots={f.dots} />}
                </button>
                <div className="stf-file-name">{f.name}</div>
                <div className="stf-file-meta">
                  <span>PNG</span>
                  <span>{f.size.toFixed(1)} MB</span>
                </div>
                <div className="stf-file-act">
                  <button
                    type="button"
                    className="smp-btn-line"
                    onClick={() => setZoom({ url: f.url, dots: f.dots, title: `${t(f.groupKey)} - ${t(f.kindKey)} (${f.name})` })}
                  >
                    {t("scene.file.view")}
                  </button>
                  <button
                    type="button"
                    className="smp-btn-line"
                    onClick={() => downloadImageWithDots(f.url, f.dots, f.name)}
                  >
                    {t("scene.file.dl")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="stf-card stf-subject">
          <h3 className="stf-h">{t("detainee.detail.subtitle")}</h3>
          <dl className="stf-subject-info">
            {subjectInfo.map(([key, value]) => (
              <div className="stf-subject-row" key={key}>
                <dt>{t(key)}</dt>
                <dd>{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {zoom && createPortal(
        <div className="scene-zoom-backdrop" onClick={() => setZoom(null)}>
          <div className="scene-zoom-modal" onClick={(e) => e.stopPropagation()}>
            <div className="scene-zoom-head">
              <span className="scene-zoom-title">{zoom.title || code}</span>
              <button
                type="button"
                className="scene-zoom-close"
                onClick={() => setZoom(null)}
                title={t("common.close") || "Đóng"}
                aria-label={t("common.close") || "Đóng"}
              >
                <IcClose s={18} />
              </button>
            </div>
            <div className="scene-zoom-body">
              <div className="stf-zoom-wrap">
                <img src={zoom.url} alt={zoom.title || code} />
                {zoom.dots && <DotsOverlay dots={zoom.dots} />}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
