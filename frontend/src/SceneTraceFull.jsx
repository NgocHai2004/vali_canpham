import { useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "./i18n";
import { demoFiles, demoMatch, minutiae } from "./sceneDemo";
import { SUBJECTS } from "./sceneMatchDemo";
import { traceCode } from "./SceneTracesPage";
import { IcChevDown, IcClose, IcEye, IcPagePrev } from "./sceneMatchIcons";

// Trang chi tiet 1 dau vet — mo tu 1 dong bang KET QUA DOI SANH.
// Bo cuc 1:1 design D:\Downloads\Phan tich doi sanh:
//   breadcrumb + chip -> grid 300px|1fr|1fr (anh latent | thong tin | ket qua)
//   -> 4.1 folder 4 the file | 4.2 thong tin nghi pham.
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

  // Ty le + dia diem lap lai so lieu da co o dai verification / panel thong tin
  // dau vet — de o day de doc het ket luan trong 1 panel.
  // Chat luong anh + do tin cay CO Y khong dua vao day: da co o dai verification
  // duoi cung, dua len nua la hien 2 lan tren cung 1 trang.
  const result = [
    [t("scene.match.points"), `${m.found}/${m.total}`],
    [t("scene.match.percent"), `${m.percent}%`],
    [t("scene.match.finger"), t(m.finger)],
    [t("scene.match.subject"), m.subject],
    [t("scene.match.place"), m.place],
    [t("scene.match.at"), m.analyzed_at],
    [t("scene.match.by"), m.analyst],
  ];

  const subject = { ...SUBJECTS.find((s) => s.cccd === row.cccd), ...row };
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

      {/* 4.1 Folder matching | 4.2 Thong tin nghi pham */}
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
                    onClick={() => setZoom({ url: f.url, dots: f.dots, title: `${t(f.groupKey)} - ${t(f.kindKey)} (${f.name})` })}
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

      {/* Dai verification */}

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
                {zoom.dots && <Dots />}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
