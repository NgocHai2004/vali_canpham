import { useMemo, useState } from "react";
import { useI18n } from "./i18n";
import { demoImage, demoMatch, minutiae } from "./sceneDemo";
import { traceCode } from "./sceneTraceUtils";
import { IcChevDown, IcDownload, IcExport, IcEye, IcPagePrev } from "./sceneMatchIcons";

// Chuyển đổi toạ độ pixel điểm đặc trưng sang % hiển thị trên ảnh
function toPercentageDots(points = [], width = 800, height = 750) {
  if (!points || !points.length) return [];
  const w = width > 0 ? width : 800;
  const h = height > 0 ? height : 750;
  return points.map((p, idx) => ({
    x: Math.max(0, Math.min(100, +((p.x / w) * 100).toFixed(2))),
    y: Math.max(0, Math.min(100, +((p.y / h) * 100).toFixed(2))),
    d: p.d,
    q: p.q,
    t: p.t,
    idx: idx + 1,
  }));
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
export default function SceneTraceFull({ item, row, caseDoc, onBack }) {
  const { t, formatDateTime } = useI18n();
  const [zoom, setZoom] = useState(null);

  if (!item || !row) return null;

  const m = demoMatch(item, row);
  const seq = item.seq ?? 1;

  // Lấy toạ độ điểm đặc trưng thật từ Database:
  const latentPoints = row.latent_landmarks?.points || item.landmark?.points || [];
  const latentW = row.latent_dim?.width || item.img_width || 800;
  const latentH = row.latent_dim?.height || item.img_height || 750;
  const latentDots = useMemo(() => {
    if (latentPoints.length > 0) {
      return toPercentageDots(latentPoints, latentW, latentH);
    }
    return minutiae(seq, m.found || 18);
  }, [latentPoints, latentW, latentH, seq, m.found]);

  const candidatePoints = row.candidate_landmarks?.points || [];
  const candidateW = row.candidate_dim?.width || 800;
  const candidateH = row.candidate_dim?.height || 750;
  const candidateDots = useMemo(() => {
    if (candidatePoints.length > 0) {
      return toPercentageDots(candidatePoints, candidateW, candidateH);
    }
    return minutiae(seq, m.found || 18);
  }, [candidatePoints, candidateW, candidateH, seq, m.found]);

  const latentUrl = item.url || row.url || demoImage(seq, "raw", "latent");
  const candidateUrl = row.candidate_url || demoImage(seq, "raw", "candidate");

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

  const matched = (row.verdict || m.verdict) === "match";
  const code = traceCode(item);
  const fmt = (v) => (formatDateTime ? formatDateTime(v) : v);

  const foundCount = latentDots.length || m.found;
  const totalCount = candidateDots.length || m.total;
  const percentStr = row.pct || `${m.percent}%`;
  const fingerLabel = row.finger ? t(row.finger) : t(m.finger);
  const subjectLabel = row.name ? `Nghi phạm: ${row.name}${row.cccd && row.cccd !== "—" ? ` (CCCD ${row.cccd})` : ""}` : m.subject;

  // Thông tin dấu vết: 6 field đầu từ DB
  const info = [
    [t("scene.col.code"), code],
    [t("scene.col.type"), item.trace_type || "—"],
    [t("scene.col.source"), item.collection_source || "—"],
    [t("scene.col.place"), caseDoc?.location || m.place],
    [t("scene.col.time"), fmt(item.captured_at)],
    [t("scene.detail.officer"), item.created_by || item.device_id || "—"],
  ];

  const result = [
    [t("scene.match.points"), `${foundCount}/${totalCount}`],
    [t("scene.match.percent"), percentStr],
    [t("scene.match.finger"), fingerLabel],
    [t("scene.match.subject"), subjectLabel],
    [t("scene.match.place"), caseDoc?.location || m.place],
    [t("scene.match.at"), row.time || m.analyzed_at],
    [t("scene.match.by"), item.created_by || m.analyst],
  ];

  return (
    <div className="stf">
      {/* Breadcrumb + chip trạng thái + nút quay lại */}
      <div className="stf-crumbbar">
        <div className="stf-crumb-main">
          <div className="stf-crumb">
            <span>{caseDoc?.name || t("scene.no_case")}</span>
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

      {item.demo && <p className="stf-notice">{t("scene.demo.notice")}</p>}

      {/* Ảnh latent | Thông tin dấu vết | Kết quả đối sánh */}
      <div className="stf-top">
        <div className="stf-latent">
          <button type="button" className="stf-latent-btn" onClick={() => setZoom({ url: item.url })}>
            <img src={item.url} alt={code} loading="lazy" />
          </button>
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

      {/* 4.1 Folder matching | 4.2 Báo cáo C09 */}
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
                  onClick={() => setZoom({ url: f.url, dots: f.dots })}
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
                    onClick={() => setZoom({ url: f.url, dots: f.dots })}
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

        <section className="stf-card stf-c09">
          <h3 className="stf-h">{t("scene.c09.title")}</h3>
          <div className="stf-doc">
            <div className="stf-doc-nation">{t("scene.c09.nation")}</div>
            <div className="stf-doc-motto">{t("scene.c09.motto")}</div>
            <div className="stf-doc-title">{t("scene.report.title")}</div>
            <div className="stf-doc-sub">{t("scene.report.subtitle")}</div>

            <div className="stf-doc-grid">
              <div className="stf-doc-cell">
                <span className="stf-doc-lb">{t("scene.report.case")}</span>
                <span>{caseDoc?.name || t("scene.no_case_name")}</span>
              </div>
              <div className="stf-doc-cell">
                <span className="stf-doc-lb">{t("scene.report.code")}</span>
                <span>{m.report_code}</span>
              </div>
              <div className="stf-doc-cell">
                <span className="stf-doc-lb">{t("scene.report.scope")}</span>
                <span>{item.trace_type || "—"}</span>
              </div>
              <div className="stf-doc-cell">
                <span className="stf-doc-lb">{t("scene.report.trace_count")}</span>
                <span>{code}</span>
              </div>
              <div className="stf-doc-cell">
                <span className="stf-doc-lb">{t("scene.report.created_at")}</span>
                <span>{m.report_at}</span>
              </div>
              <div className="stf-doc-cell stf-doc-blank" />
            </div>

            <div className="stf-doc-pair">
              <div className="stf-doc-pair-h">{t("scene.report.pair", { n: "01" })}</div>
              <div className="stf-doc-pair-body">
                <div className="stf-doc-col">
                  <div className="stf-doc-col-h">{t("scene.report.latent")} ({t("scene.file.g_dots")})</div>
                  <div className="stf-doc-img-box">
                    <img src={files[2]?.url} alt={t("scene.report.latent")} loading="lazy" />
                    {files[2]?.dots && <DotsOverlay dots={files[2]?.dots} />}
                  </div>
                  <div className="stf-doc-cap">{code}</div>
                </div>
                <div className="stf-doc-col">
                  <div className="stf-doc-col-h">{t("scene.report.candidate")} ({t("scene.file.g_dots")})</div>
                  <div className="stf-doc-img-box">
                    <img src={files[3]?.url} alt={t("scene.report.candidate")} loading="lazy" />
                    {files[3]?.dots && <DotsOverlay dots={files[3]?.dots} />}
                  </div>
                  <div className="stf-doc-cap">{fingerLabel} — {row.name || m.subject}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="stf-c09-act">
            <button type="button" className="smp-btn-ghost" disabled>
              <IcEye s={15} />
              {t("scene.report.view")}
            </button>
            <button type="button" className="smp-btn-ghost" disabled>
              <IcDownload />
              {t("scene.report.pdf")}
            </button>
            <button type="button" className="stf-btn-usb" disabled>
              <IcExport />
              {t("scene.report.usb")}
            </button>
          </div>
        </section>
      </div>

      {/* Dải verification */}
      <section className="stf-card stf-verify">
        <h3 className="stf-h">{t("scene.verify.title")}</h3>
        <div className="stf-verify-row">
          <span className="stf-verify-finger">{fingerLabel}</span>
          <div className="stf-verify-imgs">
            <div style={{ position: "relative", width: 68, height: 68 }}>
              <img src={files[2]?.url} alt={t("scene.report.latent")} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              {files[2]?.dots && <DotsOverlay dots={files[2]?.dots} />}
            </div>
            <div style={{ position: "relative", width: 68, height: 68 }}>
              <img src={files[3]?.url} alt={t("scene.report.candidate")} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              {files[3]?.dots && <DotsOverlay dots={files[3]?.dots} />}
            </div>
          </div>
          <div className="stf-stat">
            <span className="stf-k">{t("scene.verify.found")}</span>
            <div className="stf-stat-big">
              {foundCount}{" "}
              <span className="stf-stat-of">
                {t("scene.verify.of", { total: totalCount, pct: percentStr })}
              </span>
            </div>
          </div>
          <div className="stf-stat">
            <span className="stf-k">{t("scene.verify.quality")}</span>
            <div className="stf-stat-ok">● {item.feature_quality ? `${item.feature_quality}%` : m.quality}</div>
          </div>
          <div className="stf-stat">
            <span className="stf-k">{t("scene.verify.confidence")}</span>
            <div className="stf-stat-ok">● {matched ? "Rất cao" : m.confidence}</div>
          </div>
        </div>
      </section>

      {zoom && (
        <div className="scene-zoom-backdrop" onMouseDown={() => setZoom(null)}>
          <div className="stf-zoom-wrap">
            <img src={zoom.url} alt={code} />
            {zoom.dots && <DotsOverlay dots={zoom.dots} />}
          </div>
        </div>
      )}
    </div>
  );
}
