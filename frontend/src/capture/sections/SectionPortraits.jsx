import { useI18n } from "../../i18n";
import { LiveCamShot } from "../components/LiveCamShot";
import { PORTRAITS } from "../constants";
import { useFeatures } from "../../lib/features";

// IV. ANH NHAN DANG (3x4) — nghieng phai 2/3, chinh dien, nghieng trai 2/3.
// Trang thai tung anh chi co Chua chup / Da chup, suy tu photos[key]; khong co
// buoc danh gia dat/khong dat — can bo thay anh xau thi chup lai.
export function SectionPortraits({
  photos, setPhoto,
  applyMeasuredHeight, onPortraitRecognize,
  heightImage, heightOffset,
}) {
  const { t } = useI18n();
  // YOLO tat -> khong ve thuoc do, khong do chieu cao tu anh. Van chup anh
  // chan dung binh thuong; height_cm nhap tay o muc thong tin nhan dang.
  const features = useFeatures();
  const yoloOn = features.height_yolo;

  return (
    <div className="body-shots">
      {PORTRAITS.map((p) => {
        const shot = photos[p.key];
        return (
          <div key={p.key} className="body-shot">
            <div className="body-shot-head">
              <span className="body-shot-label">{t(p.labelKey).toUpperCase()}</span>
              <span className={"cap-chip" + (shot ? "" : " warn")}>
                {shot ? "✓ " + t("capture.state.shot_taken") : "○ " + t("capture.portrait.pending")}
              </span>
            </div>
            <LiveCamShot
              label={t(p.labelKey)}
              shortLabel={t(p.labelKey).toUpperCase()}
              value={shot}
              onCapture={(u) => setPhoto(p.key, u)}
              showRuler={yoloOn && p.key === "portrait_front"}
              onMeasureHeight={yoloOn && p.key === "portrait_front" ? applyMeasuredHeight : undefined}
              onPortraitRecognize={onPortraitRecognize}
              heightImage={heightImage}
              heightOffset={heightOffset}
              useYolo={yoloOn && p.key === "portrait_front"}
            />
          </div>
        );
      })}
    </div>
  );
}
