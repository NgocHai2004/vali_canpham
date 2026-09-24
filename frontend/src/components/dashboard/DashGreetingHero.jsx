import React from "react";
import { useI18n } from "../../i18n";
import { Icon } from "../Icons";

/**
 * Khối chào + thẻ phiên đang mở.
 *
 * @param session  Phiên đang mở (null nếu không có)
 * @param onEnter  Handler nút "Vào phiên"
 * @param onNew    Handler khi chưa có phiên nào
 */
export function DashGreetingHero({ fullName = "", now, session, onEnter, onNew }) {
  const { t, greeting, dayNames } = useI18n();

  const greet = greeting(now.getHours());
  const name = session?.officer_full_name || fullName || t("dashboard.greet_officer_default");

  // Dựng chuỗi ngày bằng tay (không dùng formatDate của i18n): hàm đó đi qua
  // toISOString() nên sẽ lệch mất một ngày sau 17:00 giờ VN (UTC+7).
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const dateStr = `${dayNames[now.getDay()]}, ${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  return (
    <section className="dh-hero">
      {/* Lớp nền riêng để CẮT các dải aurora trong khung bo góc — chúng dài hơn
          khung rất nhiều, không cắt sẽ tràn khắp trang. Ảnh vali nằm CÙNG lớp
          này nên cũng được cắt theo khung (mockup chỉ thấy phần trên của vali;
          nếu để ảnh tự do thì nó thò xuống đè các hàng bên dưới). */}
      <div className="dh-hero__bg" aria-hidden="true">
        <span className="dh-hero__aurora" />
        <span className="dh-hero__aurora dh-hero__aurora--alt" />
        <span className="dh-hero__aurora dh-hero__aurora--wide" />
        <span className="dh-hero__aurora dh-hero__aurora--thin" />
        <img className="dh-hero__photo" src="/device-case.png" alt="" />
      </div>

      <div className="dh-hero__greet">
        <div className="dh-hero__text">
          <h2 className="dh-hero__title">{greet}, {name}</h2>
          <p className="dh-hero__time">
            <span>{hh}:{mm}</span>
            <span className="dh-hero__dot" aria-hidden="true">-</span>
            <span>{dateStr}</span>
          </p>
        </div>
      </div>

      <div className="dh-hero__side">

        <div className="dh-hero__device">
          <span className="dh-hero__info">
            {session ? (
              <>
                <span className="dh-hero__open">
                  <span className="dh-hero__pulse dh-pulse" aria-hidden="true" />
                  {t("dashboard.device.open")}
                </span>
                <strong className="dh-hero__code">{session.code}</strong>
                <span className="dh-hero__count">
                  {t("dashboard.session.detainee_count", { n: session.detainee_count || 0 })}
                </span>
              </>
            ) : (
              <>
                <span className="dh-hero__open dh-hero__open--idle">
                  {t("dashboard.session.idle_badge")}
                </span>
                <span className="dh-hero__count">{t("dashboard.session.idle_hint")}</span>
              </>
            )}
          </span>

          {session ? (
            <button type="button" className="dh-cta" onClick={onEnter}>
              <span>{t("dashboard.session.enter")}</span>
              <span className="dh-cta__icon" aria-hidden="true">{Icon.arrow}</span>
            </button>
          ) : (
            <button type="button" className="dh-cta" onClick={onNew}>
              <span className="dh-cta__icon" aria-hidden="true">{Icon.plus}</span>
              <span>{t("dashboard.session.new")}</span>
            </button>
          )}
        </div>

      </div>
    </section>
  );
}

export default DashGreetingHero;
