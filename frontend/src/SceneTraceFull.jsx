import { useState } from "react";
import { useI18n } from "./i18n";
import { demoFiles, demoMatch, minutiae } from "./sceneDemo";
import { traceCode } from "./SceneTracesPage";
import { IcChevDown, IcExport, IcPagePrev } from "./sceneMatchIcons";

// Trang chi tiet 1 dau vet — mo tu 1 dong bang KET QUA DOI SANH.
// Bo cuc 1:1 design D:\Downloads\Phan tich doi sanh:
//   breadcrumb + chip -> grid 300px|1fr|1fr (anh latent | thong tin | ket qua)
//   -> grid 1.05fr|1fr (4.1 folder 4 the | 4.2 bao cao C09) -> dai verification.
//
// Field co that lay tu scene_traces (ma, dia diem, thoi gian, can bo, anh, ghi chu).
// So lieu doi sanh (diem minutiae, ngon tay, C09, chat luong, do tin cay) la
// DEMO — he thong chua co engine trich minutiae. Xem sceneDemo.js.

export default function SceneTraceFull({ item, row, session, onBack }) {
  const { t, formatDateTime } = useI18n();
  const [zoom, setZoom] = useState(null);

  if (!item || !row) return null;

  const m = demoMatch(item, row);
  // Cham minutiae: CUNG bo toa do cho anh 03 va 04 => cham thu k tren 2 anh la
  // 1 cap diem khop. So cham = so diem tim duoc (18/22) cho khop bang ket qua.
  const dots = minutiae(item.seq ?? 1, m.found);
  const Dots = () => (
    <span className="stf-dots" aria-hidden="true">
      {dots.map((d, i) => (
        <span className="stf-dot-m" key={i} style={{ left: `${d.x}%`, top: `${d.y}%` }}>
          <i>{i + 1}</i>
        </span>
      ))}
    </span>
  );
  const files = demoFiles(item);
  const matched = m.verdict === "match";
  const code = traceCode(item);
  const fmt = (v) => (formatDateTime ? formatDateTime(v) : v);

  // Thong tin dau vet: 6 field dau tu DB, Trang thai la chip nen render rieng.
  const info = [
    [t("scene.col.code"), code],
    [t("scene.col.type"), item.trace_type || "—"],
    [t("scene.col.source"), item.collection_source || "—"],
    [t("scene.col.place"), m.place],
    [t("scene.col.time"), fmt(item.captured_at)],
    [t("scene.detail.officer"), item.created_by || item.device_id || "—"],
  ];

  const result = [
    [t("scene.match.points"), `${m.found}/${m.total}`],
    [t("scene.match.finger"), m.finger],
    [t("scene.match.subject"), m.subject],
    [t("scene.match.at"), m.analyzed_at],
    [t("scene.match.by"), m.analyst],
  ];

  return (
    <div className="stf">
      {/* Breadcrumb + chip trang thai + nut quay lai */}
      <div className="stf-crumbbar">
        <div className="stf-crumb-main">
          <div className="stf-crumb">
            <span>{session?.case_name || t("scene.no_case")}</span>
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
          {/* Menu Hanh dong chua co muc nao -> disabled, khong lam nut chet. */}
          <button type="button" className="smp-btn-ghost" disabled>
            {t("scene.detail.actions")}
            <IcChevDown />
          </button>
        </div>
      </div>

      <p className="stf-notice">{t("scene.demo.notice")}</p>

      {/* Anh latent | Thong tin dau vet | Ket qua doi sanh */}
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

      {/* 4.1 Folder matching | 4.2 Bao cao C09 */}
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
                  {f.dots && <Dots />}
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
                  <a className="smp-btn-line" href={f.url} download target="_blank" rel="noreferrer">
                    {t("scene.file.dl")}
                  </a>
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
                <span>{session?.case_name || t("scene.no_case_name")}</span>
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
                  <div className="stf-doc-col-h">{t("scene.report.latent")}</div>
                  <img src={files[0]?.url} alt={t("scene.report.latent")} loading="lazy" />
                  <div className="stf-doc-cap">{code}</div>
                </div>
                <div className="stf-doc-col">
                  <div className="stf-doc-col-h">{t("scene.report.candidate")}</div>
                  <img src={files[1]?.url} alt={t("scene.report.candidate")} loading="lazy" />
                  <div className="stf-doc-cap">{m.finger} — {m.subject}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="stf-c09-act">
            <button type="button" className="smp-btn-ghost" disabled>{t("scene.report.view")}</button>
            <button type="button" className="smp-btn-ghost" disabled>{t("scene.report.pdf")}</button>
            <button type="button" className="stf-btn-usb" disabled>
              <IcExport />
              {t("scene.report.usb")}
            </button>
          </div>
        </section>
      </div>

      {/* Dai verification */}
      <section className="stf-card stf-verify">
        <h3 className="stf-h">{t("scene.verify.title")}</h3>
        <div className="stf-verify-row">
          <span className="stf-verify-finger">{m.finger}</span>
          <div className="stf-verify-imgs">
            <img src={files[2]?.url} alt={t("scene.report.latent")} loading="lazy" />
            <img src={files[3]?.url} alt={t("scene.report.candidate")} loading="lazy" />
          </div>
          <div className="stf-stat">
            <span className="stf-k">{t("scene.verify.found")}</span>
            <div className="stf-stat-big">
              {m.found}{" "}
              <span className="stf-stat-of">
                {t("scene.verify.of", { total: m.total, pct: m.percent })}
              </span>
            </div>
          </div>
          <div className="stf-stat">
            <span className="stf-k">{t("scene.verify.quality")}</span>
            <div className="stf-stat-ok">● {m.quality}</div>
          </div>
          <div className="stf-stat">
            <span className="stf-k">{t("scene.verify.confidence")}</span>
            <div className="stf-stat-ok">● {m.confidence}</div>
          </div>
        </div>
      </section>

      {zoom && (
        <div className="scene-zoom-backdrop" onMouseDown={() => setZoom(null)}>
          <div className="stf-zoom-wrap">
            <img src={zoom.url} alt={code} />
            {zoom.dots && <Dots />}
          </div>
        </div>
      )}
    </div>
  );
}
