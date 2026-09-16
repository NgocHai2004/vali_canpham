import React, { useState, useEffect, Fragment } from "react";
import api from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icons";
import { PageHeader, StateBox } from "../components/CommonUI";
import { toast } from "../Toast";

const FP_QUALITY_RECOMMENDED = 50;

// Thu tu hien thi: tung ban tay tu ngon cai ra ngon ut. Phai khop thu tu
// FP_FINGER_CODES cua backend de admin doc bang theo dung thu tu quen thuoc.
const FP_SETTINGS_HANDS = [
  { hand: "left", codes: ["left_thumb", "left_index", "left_middle", "left_ring", "left_little"] },
  { hand: "right", codes: ["right_thumb", "right_index", "right_middle", "right_ring", "right_little"] },
];
const FP_SETTINGS_CODES = FP_SETTINGS_HANDS.flatMap((h) => h.codes);
// Tieu de 5 cot cua ma tran. Thu tu phai khop codes cua tung ban tay o tren.
const FP_SETTINGS_DIGITS = ["thumb", "index", "middle", "ring", "little"];

function SettingsPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  // { left_thumb: "50", ... } - giu dang STRING de o input trong duoc trong khi
  // dang sua, khong bi Number("") = 0 bien thanh nguong 0.
  const [fpQ, setFpQ] = useState({});
  const [fpSaving, setFpSaving] = useState(false);
  const [fpError, setFpError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.fingerprintConfig()
      .then((fp) => {
        if (cancelled) return;
        const by = fp?.by_finger || {};
        const def = Number(fp?.default);
        const fallback = Number.isFinite(def) ? def : FP_QUALITY_RECOMMENDED;
        const next = {};
        for (const c of FP_SETTINGS_CODES) {
          const q = Number(by[c]);
          next[c] = String(Number.isFinite(q) ? q : fallback);
        }
        setFpQ(next);
      })
      .catch((err) => {
        console.warn("[settings] doc nguong van tay loi:", err);
        const next = {};
        for (const c of FP_SETTINGS_CODES) {
          next[c] = String(FP_QUALITY_RECOMMENDED);
        }
        setFpQ(next);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const submitFp = async (e) => {
    e.preventDefault();
    const payload = {};
    for (const c of FP_SETTINGS_CODES) {
      const raw = (fpQ[c] ?? "").trim();
      const n = Number(raw);
      if (raw === "" || !Number.isInteger(n) || n < 0 || n > 100) {
        setFpError(t("settings.fp.err.invalid_at", {
          f: t(`fp.finger.${c}.long`),
        }));
        return;
      }
      payload[c] = n;
    }
    setFpSaving(true);
    setFpError("");
    try {
      const res = await api.updateFingerprintConfig({ by_finger: payload });
      const by = res?.by_finger || {};
      setFpQ((prev) => {
        const next = { ...prev };
        for (const c of FP_SETTINGS_CODES) {
          if (by[c] !== undefined) next[c] = String(by[c]);
        }
        return next;
      });
      toast.success(res?.applied === false
        ? t("settings.fp.saved_pending")
        : t("settings.saved"));
    } catch (e) {
      setFpError(e.message);
    } finally {
      setFpSaving(false);
    }
  };

  const fpLowCodes = FP_SETTINGS_CODES.filter((c) => {
    const raw = (fpQ[c] ?? "").trim();
    if (raw === "") return false;
    const n = Number(raw);
    return Number.isFinite(n) && n < FP_QUALITY_RECOMMENDED;
  });

  return (
    <div className="page">
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      {loading ? (
        <div className="table-card" style={{ padding: 20 }}>
          <StateBox>{t("common.loading")}</StateBox>
        </div>
      ) : (
        <div className="settings-grid">
          <section className="table-card settings-card settings-card-fp">
            <form className="form" onSubmit={submitFp}>
              <div className="settings-card-head settings-card-head-row">
                <span className="settings-card-icon">{Icon.gear}</span>
                <div>
                  <h2>{t("settings.fp.title")}</h2>
                  <p>{t("settings.fp.min_quality.desc", { v: FP_QUALITY_RECOMMENDED })}</p>
                </div>
                <button type="submit" className="button primary" disabled={fpSaving}>
                  {fpSaving ? t("common.saving") : t("common.save")}
                </button>
              </div>
              {fpError && <StateBox type="error">{fpError}</StateBox>}
              {/* Ma tran: hang tieu de 5 ngon, roi 1 hang cho moi ban tay. */}
              <div className="settings-fp-matrix">
                <span />
                {FP_SETTINGS_DIGITS.map((d) => (
                  <div key={d} className="settings-fp-col-head">
                    {t(`settings.fp.digit.${d}`)}
                  </div>
                ))}
                {FP_SETTINGS_HANDS.map((h) => (
                  <Fragment key={h.hand}>
                    <span className="settings-fp-hand-label">
                      {t(`settings.fp.hand.${h.hand}`)}
                    </span>
                    {h.codes.map((c) => {
                      const raw = (fpQ[c] ?? "").trim();
                      const n = Number(raw);
                      const low = raw !== "" && Number.isFinite(n)
                        && n < FP_QUALITY_RECOMMENDED;
                      return (
                        <div key={c} className="settings-fp-cell">
                          <input
                            className="control settings-fp-input"
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={fpQ[c] ?? ""}
                            onChange={(e) => setFpQ((p) => ({ ...p, [c]: e.target.value }))}
                            aria-label={t("settings.fp.aria_input", {
                              f: t(`fp.finger.${c}.long`),
                            })}
                            aria-invalid={low ? "true" : undefined}
                            required
                          />
                          <span className="settings-fp-unit">%</span>
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
              {fpLowCodes.length > 0 ? (
                <p className="settings-fp-note" style={{ color: "var(--danger, #e5484d)" }}>
                  {t("settings.fp.warn_low", {
                    v: FP_QUALITY_RECOMMENDED,
                    list: fpLowCodes.map((c) => t(`fp.finger.${c}.long`)).join(", "),
                  })}
                </p>
              ) : (
                <p className="settings-fp-note">{t("settings.fp.desc")}</p>
              )}
            </form>
          </section>
        </div>
      )}
    </div>
  );
}


export default SettingsPage;
