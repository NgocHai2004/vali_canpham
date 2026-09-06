import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n";
import { IcChevRight, IcInfo, IcPageNext, IcPagePrev, IcReanalyze, IcSearch } from "./sceneMatchIcons";

// Bảng chọn vụ án / phiên làm việc — bước đầu của tab Dấu vết hiện trường.
// Đọc GET /api/sessions có sẵn, không thêm endpoint. Bấm 1 hàng là sang thẳng
// màn Phân tích đối sánh, nên bảng này dùng đúng ngôn ngữ smp-* của màn đó
// (panel bo 14px, chip, ô có icon, thanh phân trang) để 2 bước không lệch hình.
// Không bọc trong .smp: .smp ẩn thanh scroll, mà bảng này cần thấy được là còn
// hàng bên dưới.
const PAGE_SIZE = 10;
const SK = [0, 1, 2, 3, 4];   // 5 hàng giả lúc tải, đủ giữ chiều cao bảng

// Chỉ in trang đầu, trang cuối và ±1 quanh trang hiện tại — total có thể lên
// hàng trăm trang, in hết là vỡ hàng nút phân trang.
function pageWindow(page, totalPages) {
  return Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1);
}

// 3 lựa chọn thì segmented bấm 1 nhịp là xong, nhanh hơn <select> 2 nhịp.
const STATUSES = [
  ["", "common.all"],
  ["open", "session.status.open"],
  ["closed", "session.status.closed"],
];

export default function SceneCasePicker({ onPick }) {
  const { t, formatDateTime } = useI18n();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await api.listSessions({
        status: statusFilter,
        skip: String((page - 1) * PAGE_SIZE),
        limit: String(PAGE_SIZE),
      });
      setItems(r.items || []);
      setTotal(r.total || 0);
    } catch (ex) {
      setErr(ex.message || t("scene.case.err_load"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [statusFilter]);

  // Lọc theo tên vụ án / mã phiên ngay trên trang hiện tại.
  const kw = q.trim().toLowerCase();
  const rows = kw
    ? items.filter((s) =>
        `${s.case_name || ""} ${s.code || ""}`.toLowerCase().includes(kw))
    : items;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="scp">
      <section className="smp-panel smp-panel-match">
        <div className="smp-panel-head">
          <div className="smp-panel-title">
            <span className="smp-h">{t("scene.case.title")}</span>
            <span className="smp-badge">{total}</span>
            <span className="smp-sub">{t("scene.case.cases")}</span>
          </div>
          <div className="smp-panel-tools">
            {/* Ô tìm kiếm có icon bên trong, đúng .smp-field của màn đối sánh. */}
            <div className="smp-field smp-field-wide">
              <IcSearch />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("scene.case.search_ph")}
                aria-label={t("common.search")}
              />
            </div>
            <div
              className="smp-viewtoggle scp-seg"
              role="group"
              aria-label={t("scene.case.filter_label")}
            >
              {STATUSES.map(([v, key]) => (
                <button
                  key={v || "all"}
                  type="button"
                  className={statusFilter === v ? "on" : ""}
                  aria-pressed={statusFilter === v}
                  onClick={() => setStatusFilter(v)}
                >
                  {t(key)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="smp-icon-btn scp-refresh"
              onClick={load}
              disabled={loading}
              aria-label={t("common.refresh")}
              title={t("common.refresh")}
            >
              <IcReanalyze />
            </button>
          </div>
        </div>

        <div className="smp-sub scp-hint">{t("scene.case.sub")}</div>

        {err && <div className="lg-err" role="alert">{err}</div>}

        <div className="scp-wrap">
          {/* <table> thật, không grid: chỉ 7 cột và không phải canh pixel theo
              design như bảng đối sánh, nên lấy luôn semantics hàng/cột của
              bảng cho trình đọc màn hình thay vì tự khai role. */}
          <table className="scp-t" aria-busy={loading || undefined}>
            <thead>
              <tr>
                <th scope="col">{t("scene.case.col.case_code")}</th>
                <th scope="col">{t("session.col.officer")}</th>
                <th scope="col" className="scp-wide-only">{t("session.col.location")}</th>
                <th scope="col" className="scp-wide-only">{t("scene.case.col.time")}</th>
                <th scope="col">{t("scene.case.col.traces")}</th>
                <th scope="col">{t("session.status")}</th>
                <th scope="col"><span className="scp-sr">{t("scene.case.col.go")}</span></th>
              </tr>
            </thead>
            <tbody>
              {/* Hàng giả giữ đúng chiều cao bảng nên lúc data về không giật. */}
              {loading && SK.map((i) => (
                <tr className="scp-sk" key={i} aria-hidden="true">
                  <td colSpan={7}><span /></td>
                </tr>
              ))}

              {/* class "on" = vạch xanh lá bên trái: quét dọc một cột là thấy
                  phiên nào còn mở; chữ trong chip vẫn là kênh chính. */}
              {!loading && rows.map((s) => {
                const name = s.case_name || t("scene.no_case");
                const isOpen = s.status === "open";
                const go = () => onPick && onPick(s.id);
                return (
                  <tr key={s.id} className={isOpen ? "on" : ""} onClick={go}>
                    <td>
                      <div className="scp-name smp-ellip" title={name}>{name}</div>
                      <div className="scp-sub2 mono smp-ellip">{s.code}</div>
                      {/* Màn hẹp bỏ 2 cột phụ nên gộp vào đây — ẩn hẳn dữ liệu
                          thì cán bộ không còn cách nào xem được. */}
                      <div className="scp-sub2 scp-narrow-only smp-ellip">
                        {(s.location || "—") + " · " + formatDateTime(s.opened_at)}
                      </div>
                    </td>
                    <td>
                      <div className="smp-ellip">{s.officer_full_name || s.officer}</div>
                      {s.officer_full_name && s.officer && (
                        <div className="scp-sub2 smp-ellip">@{s.officer}</div>
                      )}
                    </td>
                    <td className="scp-wide-only">
                      <div className="smp-ellip" title={s.location || ""}>{s.location || "—"}</div>
                    </td>
                    <td className="scp-wide-only">
                      <div className="smp-ellip">{formatDateTime(s.opened_at)}</div>
                      <div className="scp-sub2 smp-ellip">
                        {s.closed_at ? formatDateTime(s.closed_at) : t("scene.case.still_open")}
                      </div>
                    </td>
                    <td className="scp-num">
                      <span className="smp-badge">{s.scene_count ?? 0}</span>
                    </td>
                    <td>
                      {/* Ký hiệu ● / ✓ nằm sẵn trong chuỗi dịch nên trạng thái
                          không chỉ dựa vào màu. Đã đóng dùng chip xám: xanh
                          #2272e8 là màu hành động, để dành cho vụ đang mở. */}
                      <span className={"smp-chip " + (isOpen ? "smp-chip-green" : "scp-chip-grey")}>
                        {t(isOpen ? "session.status.open_dot" : "session.status.closed_dot")}
                      </span>
                    </td>
                    <td>
                      {/* Nút thật = lối vào bằng bàn phím cho từng hàng; cả
                          hàng vẫn bấm được bằng chuột. */}
                      <button
                        type="button"
                        className="scp-go"
                        aria-label={t("scene.case.open", { name })}
                        onClick={(e) => { e.stopPropagation(); go(); }}
                      >
                        <IcChevRight />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {loading && <p className="scp-sr" role="status">{t("common.loading")}</p>}

          {/* Rỗng vì hết vụ án khác hẳn rỗng vì từ khoá không khớp trang này —
              tìm kiếm chỉ lọc 10 hàng đã tải nên phải nói rõ. */}
          {!loading && rows.length === 0 && (
            <div className="smp-drop scp-empty" role="status">
              <div className="smp-drop-ic"><IcInfo /></div>
              <div className="smp-drop-main">
                {kw ? t("scene.case.empty_q", { q: q.trim() }) : t("scene.case.empty")}
              </div>
            </div>
          )}
        </div>

        <div className="smp-pg">
          <div />
          <div className="smp-pg-mid">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label={t("common.prev")}
            ><IcPagePrev /></button>
            {pageWindow(page, totalPages).map((p, i, arr) => (
              <Fragment key={p}>
                {i > 0 && p - arr[i - 1] > 1 && <span className="scp-pg-gap">…</span>}
                <button
                  type="button"
                  className={p === page ? "on" : ""}
                  aria-current={p === page ? "page" : undefined}
                  onClick={() => setPage(p)}
                >{p}</button>
              </Fragment>
            ))}
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label={t("common.next")}
            ><IcPageNext /></button>
          </div>
          <div className="smp-pg-right">
            {/* Tìm kiếm chỉ lọc trang hiện tại nên khi có từ khoá phải đổi câu,
                không để "Hiển thị 1 - 10 của 42" đứng trên 3 hàng. */}
            <span className="smp-dim" aria-live="polite">
              {kw
                ? t("scene.case.matched", { n: rows.length })
                : t("smp.showing", { from, to, total })}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
