import { useEffect, useState } from "react";
import { useI18n } from "./i18n";
import { demoShots } from "./sceneDemo";

// Panel chi tiết dấu vết, cố định bên phải danh sách (không phải modal).
// 4 khung ảnh xếp 2x2: 2 ảnh gốc cán bộ gửi + 2 ảnh đã chấm đặc trưng.
// Backend chỉ lưu 1 ảnh/dấu vết nên với dữ liệu thật, ô nào không có ảnh
// để trống; dữ liệu mẫu thì lấy đủ 4 từ sceneDemo.

export default function SceneTraceDetail({ item, busy, onClose, onSaveNote, onOpenFull }) {
  const { t, formatDateTime } = useI18n();
  const [editNote, setEditNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [zoomShot, setZoomShot] = useState(null);

  useEffect(() => {
    setEditNote(false);
    setNoteText(item?.note || "");
  }, [item?.id, item?.note]);

  if (!item) {
    return (
      <aside className="panel scene-detail">
        <div className="scene-detail-head">
          <h3>{t("scene.detail.title")}</h3>
        </div>
        <div className="scene-detail-blank">{t("scene.detail.empty")}</div>
      </aside>
    );
  }

  const saveNote = () => {
    onSaveNote?.(item.id, noteText);
    setEditNote(false);
  };

  // Dấu vết thật: ảnh duy nhất vào ô "gốc 01", 3 ô còn lại chưa có.
  const shots = item.demo
    ? demoShots(item)
    : [
        { key: "raw1", labelKey: "scene.shot.raw1", url: item.url },
        { key: "raw2", labelKey: "scene.shot.raw2", url: "" },
        { key: "dot1", labelKey: "scene.shot.dot1", url: "" },
        { key: "dot2", labelKey: "scene.shot.dot2", url: "" },
      ];

  const rows = [
    [t("scene.col.code"), item.code || "—"],
    [t("scene.col.type"), item.trace_type || "—"],
    [t("scene.col.source"), item.collection_source || "—"],
    [t("scene.col.time"), formatDateTime ? formatDateTime(item.captured_at) : item.captured_at],
    [t("scene.detail.collected_by"), item.created_by || item.device_id || "—"],
  ];

  return (
    <aside className="panel scene-detail">
      <div className="scene-detail-head">
        <h3>{t("scene.detail.title")}</h3>
        <button
          className="scene-detail-close"
          onClick={onClose}
          aria-label={t("common.close")}
          title={t("common.close")}
        >
          ×
        </button>
      </div>

      <div className="scene-detail-body">
        <div className="scene-shots">
          {shots.map((s) => (
            <figure className="scene-shot" key={s.key}>
              <figcaption>{t(s.labelKey)}</figcaption>
              <div className="scene-shot-img">
                {s.url ? (
                  <>
                    <img src={s.url} alt={t(s.labelKey)} loading="lazy" />
                    <button
                      className="scene-shot-zoom"
                      onClick={() => setZoomShot(s)}
                      aria-label={t("scene.img.zoom_in")}
                      title={t("scene.img.zoom_in")}
                    >
                      ⌕
                    </button>
                  </>
                ) : (
                  <span className="scene-shot-none">{t("scene.shot.none")}</span>
                )}
              </div>
            </figure>
          ))}
        </div>

        <dl className="scene-info">
          {rows.map(([k, v]) => (
            <div className="scene-info-row" key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

        <section className="scene-sec">
          <div className="scene-sec-head">
            <h4>{t("scene.detail.note")}</h4>
            {!editNote && (
              <button
                className="scene-note-pen"
                onClick={() => setEditNote(true)}
                aria-label={t("scene.note_edit")}
                title={t("scene.note_edit")}
              >
                ✎
              </button>
            )}
          </div>
          {editNote ? (
            <div className="scene-note-edit">
              <textarea
                className="control"
                rows={3}
                maxLength={500}
                autoFocus
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
              <div className="scene-note-act">
                <button className="btn-primary" onClick={saveNote} disabled={busy}>
                  {t("common.save")}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => { setEditNote(false); setNoteText(item.note || ""); }}
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          ) : (
            <p className="scene-note-text">{item.note || t("scene.detail.no_note")}</p>
          )}
        </section>

        <button className="btn-primary scene-detail-more" onClick={() => onOpenFull?.(item)}>
          {t("scene.detail.btn")} ›
        </button>
      </div>

      {zoomShot && (
        <div className="scene-zoom-backdrop" onMouseDown={() => setZoomShot(null)}>
          <img src={zoomShot.url} alt={t(zoomShot.labelKey)} />
        </div>
      )}
    </aside>
  );
}
