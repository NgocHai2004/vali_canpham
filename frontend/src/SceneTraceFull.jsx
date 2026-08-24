import { useState } from "react";
import { useI18n } from "./i18n";
import { demoFiles, demoMatch, demoShots } from "./sceneDemo";
import { traceCode } from "./SceneTracesPage";

// Trang chi tiết đầy đủ 1 dấu vết: mở từ nút "Chi tiết" ở panel bên phải.
// Gồm 5 khối: thông tin dấu vết, kết quả đối sánh, 4.1 folder matching,
// 4.2 báo cáo đã gửi C09, và minh họa verification.
//
// Toàn bộ số liệu đối sánh là dữ liệu mẫu — hệ thống chưa có engine trích
// minutiae nên chưa thể tính điểm tương đồng thật. Xem sceneDemo.js.

export default function SceneTraceFull({ item, session, onBack }) {
  const { t, formatDateTime } = useI18n();
  const [zoom, setZoom] = useState(null);

  if (!item) return null;

  const m = demoMatch(item);
  const files = demoFiles(item);
  const shots = item.demo
    ? demoShots(item)
    : [{ key: "raw1", labelKey: "scene.shot.raw1", url: item.url }];
  const matched = m.verdict === "match";

  const info = [
    [t("scene.col.code"), traceCode(item)],
    [t("scene.col.type"), item.trace_type || "—"],
    [t("scene.col.source"), item.collection_source || "—"],
    [t("scene.col.time"), formatDateTime ? formatDateTime(item.captured_at) : item.captured_at],
    [t("scene.detail.officer"), item.created_by || item.device_id || "—"],
    [t("scene.col.place"), m.place],
  ];

  const result = [
    [t("scene.match.points"), `${m.found}/${m.total} (${m.percent}%)`],
    [t("scene.match.finger"), m.finger],
    [t("scene.match.subject"), m.subject],
    [t("scene.match.at"), m.analyzed_at],
    [t("scene.match.by"), m.analyst],
  ];

  return (
    <div className="scene-full">
      <div className="scene-full-bar">
        <button className="btn-ghost" onClick={onBack}>‹ {t("scene.back")}</button>
        <div className="scene-full-bar-main">
          <h2>{traceCode(item)}</h2>
          <span className="scene-full-case">{session?.case_name || t("scene.no_case")}</span>
        </div>
        <div className="scene-full-tags">
          <span className="scene-tag on">{t("scene.tag.analyzed")}</span>
          <span className="scene-tag">{t("scene.tag.files", { n: files.length })}</span>
          <span className="scene-tag">{t("scene.tag.report", { n: 1 })}</span>
        </div>
      </div>

      <p className="scene-full-notice">{t("scene.demo.notice")}</p>

      <div className="scene-full-grid">
        <section className="panel scene-blk">
          <h3>{t("scene.detail.title")}</h3>
          <div className="scene-blk-body">
            <div className="scene-full-shots">
              {shots.map((s) => (
                <figure key={s.key}>
                  <button className="scene-full-shot" onClick={() => setZoom(s.url)}>
                    <img src={s.url} alt={t(s.labelKey)} loading="lazy" />
                  </button>
                  <figcaption>{t(s.labelKey)}</figcaption>
                </figure>
              ))}
            </div>
            <dl className="scene-info">
              {info.map(([k, v]) => (
                <div className="scene-info-row" key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="panel scene-blk">
          <h3>{t("scene.match.title")}</h3>
          <div className="scene-blk-body">
            <div className={"scene-verdict" + (matched ? " ok" : " warn")}>
              <span className="scene-verdict-lb">{t("scene.match.verdict")}</span>
              <strong>{matched ? t("scene.match.v_match") : t("scene.match.v_review")}</strong>
              <span className="scene-verdict-pc">{m.percent}%</span>
            </div>
            <dl className="scene-info">
              {result.map(([k, v]) => (
                <div className="scene-info-row" key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </div>

      <section className="panel scene-blk">
        <h3>{t("scene.folder.title")}</h3>
        <div className="scene-blk-body">
          <table className="scene-ftable">
            <tbody>
              {files.map((f) => (
                <tr key={f.n}>
                  <td className="sf-n">{String(f.n).padStart(2, "0")}</td>
                  <td className="sf-th">
                    <img src={f.url} alt={f.name} loading="lazy" />
                  </td>
                  <td className="sf-name">{f.name}</td>
                  <td>{t(f.groupKey)}</td>
                  <td>{t(f.kindKey)}</td>
                  <td className="sf-size">{f.size.toFixed(1)} MB</td>
                  <td className="sf-act">
                    <button className="scene-mini" onClick={() => setZoom(f.url)}>
                      {t("scene.file.view")}
                    </button>
                    <a className="scene-mini" href={f.url} target="_blank" rel="noreferrer">
                      {t("scene.file.dl")}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="scene-full-grid">
        <section className="panel scene-blk">
          <h3>{t("scene.report.title")}</h3>
          <div className="scene-blk-body">
            <dl className="scene-info">
              <div className="scene-info-row">
                <dt>{t("scene.col.code")}</dt>
                <dd>{m.report_code}</dd>
              </div>
              <div className="scene-info-row">
                <dt>{t("scene.match.at")}</dt>
                <dd>{m.report_at}</dd>
              </div>
            </dl>
            <div className="scene-blk-act">
              <button className="btn-ghost" disabled>{t("scene.report.view")}</button>
              <button className="btn-ghost" disabled>{t("scene.report.pdf")}</button>
              <button className="btn-ghost" disabled>{t("scene.report.usb")}</button>
            </div>
          </div>
        </section>

        <section className="panel scene-blk">
          <h3>{t("scene.verify.title")}</h3>
          <div className="scene-blk-body">
            <div className="scene-vstat">
              <div>
                <span>{t("scene.verify.found")}</span>
                <strong>{m.found}</strong>
              </div>
              <div>
                <span>{t("scene.verify.quality")}</span>
                <strong>{m.quality}</strong>
              </div>
              <div>
                <span>{t("scene.verify.confidence")}</span>
                <strong>{m.confidence}</strong>
              </div>
            </div>
            <div className="scene-blk-act">
              <button className="btn-ghost" disabled>{t("scene.verify.open")}</button>
            </div>
          </div>
        </section>
      </div>

      {zoom && (
        <div className="scene-zoom-backdrop" onMouseDown={() => setZoom(null)}>
          <img src={zoom} alt={traceCode(item)} />
        </div>
      )}
    </div>
  );
}
