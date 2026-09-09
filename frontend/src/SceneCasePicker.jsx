import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n";
import { IcChevRight, IcClose, IcInfo, IcPageNext, IcPagePrev, IcPlus, IcReanalyze, IcSearch } from "./sceneMatchIcons";

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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  // Gõ tới đâu gọi API tới đó là mỗi ký tự một request; chờ 300ms cho người dùng
  // gõ xong. Ô nhập vẫn hiện ngay vì q là state riêng.
  const [qSent, setQSent] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQSent(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await api.listSessions({
        status: statusFilter,
        q: qSent,
        date_from: dateFrom,
        // Ô "Đến" chọn theo ngày => backend parse ra 00:00, $lte sẽ loại hết vụ
        // án trong chính ngày đó. Kéo tới cuối ngày cho khoảng lọc bao trọn.
        date_to: dateTo ? `${dateTo}T23:59:59` : "",
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
  }, [statusFilter, qSent, dateFrom, dateTo, page, t]);

  useEffect(() => { load(); }, [load]);
  // Đổi điều kiện lọc mà giữ nguyên page thì đang ở trang 3 của kết quả cũ sẽ ra
  // bảng rỗng dù kết quả mới có hàng.
  useEffect(() => { setPage(1); }, [statusFilter, qSent, dateFrom, dateTo]);

  const [newCase, setNewCase] = useState(null);   // null = đóng form

  // Lọc chạy ở server (tên / mã / cán bộ / địa chỉ / ngày) nên items đã là kết
  // quả của trang hiện tại và total là tổng đã lọc.
  const rows = items;
  const hasFilter = !!(qSent || dateFrom || dateTo);

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
            {/* type=date chứ không phải datetime-local: cán bộ lọc theo ngày,
                không ai nhớ phút mở vụ án. */}
            <div className="scp-dates">
              <label className="scp-date">
                <span className="smp-dim">{t("common.from")}</span>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </label>
              <label className="scp-date">
                <span className="smp-dim">{t("common.to")}</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </label>
            </div>
            <div
              className="scp-seg"
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
            <button
              type="button"
              className="smp-btn-primary scp-new"
              onClick={() => setNewCase({
                case_name: "", officer_full_name: "", location: "",
                occurred_at: "", note: "",
              })}
            >
              <IcPlus /> {t("scene.case.new")}
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

          {/* Rỗng vì chưa có vụ án nào khác hẳn rỗng vì điều kiện lọc không khớp:
              câu thứ hai cho cán bộ biết là phải xoá bộ lọc, không phải nhập liệu. */}
          {!loading && rows.length === 0 && (
            <div className="smp-drop scp-empty" role="status">
              <div className="smp-drop-ic"><IcInfo /></div>
              <div className="smp-drop-main">
                {hasFilter ? t("scene.case.empty_q") : t("scene.case.empty")}
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
            <span className="smp-dim" aria-live="polite">
              {hasFilter
                ? t("scene.case.matched", { n: total })
                : t("smp.showing", { from, to, total })}
            </span>
          </div>
        </div>
      </section>

      {newCase && (
        <NewCaseModal
          initial={newCase}
          onClose={() => setNewCase(null)}
          onSaved={(created) => {
            setNewCase(null);
            // Vào thẳng vụ án vừa tạo: cán bộ tạo vụ án là để nhập dấu vết ngay.
            if (created?.id && onPick) onPick(created.id);
            else load();
          }}
        />
      )}
    </div>
  );
}

function NewCaseModal({ initial, onClose, onSaved }) {
  const { t } = useI18n();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const canSave = form.case_name.trim().length > 0 && !saving;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setErr("");
    try {
      onSaved(await api.createSceneCase(form));
    } catch (ex) {
      setErr(ex.message || t("scene.case.new_err"));
      setSaving(false);
    }
  };

  return (
    <div
      className="smp-modal-bd"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form className="smp-modal" role="dialog" aria-modal="true" onSubmit={submit}>
        <div className="smp-modal-head">
          <span className="smp-modal-title">{t("scene.case.new_title")}</span>
          <button
            type="button"
            className="smp-adv-x"
            aria-label={t("common.close")}
            onClick={onClose}
          ><IcClose s={17} /></button>
        </div>

        <div className="smp-modal-body">
          {err && <div className="lg-err" role="alert">{err}</div>}

          <div>
            <div className="smp-modal-lb">{t("scene.case.f_name")}</div>
            <input
              className="smp-modal-in"
              value={form.case_name}
              onChange={set("case_name")}
              maxLength={200}
              placeholder={t("scene.case.f_name_ph")}
              autoFocus
              required
            />
          </div>

          <div>
            <div className="smp-modal-lb">{t("scene.case.f_officer")}</div>
            {/* Để trống thì backend lấy họ tên của tài khoản đang đăng nhập. */}
            <input
              className="smp-modal-in"
              value={form.officer_full_name}
              onChange={set("officer_full_name")}
              maxLength={100}
              placeholder={t("scene.case.f_officer_ph")}
            />
          </div>

          <div>
            <div className="smp-modal-lb">{t("scene.case.f_time")}</div>
            <input
              className="smp-modal-in"
              type="datetime-local"
              value={form.occurred_at}
              onChange={set("occurred_at")}
            />
            <div className="smp-modal-note">{t("scene.case.f_time_note")}</div>
          </div>

          <div>
            <div className="smp-modal-lb">{t("scene.case.f_place")}</div>
            <input
              className="smp-modal-in"
              value={form.location}
              onChange={set("location")}
              maxLength={200}
              placeholder={t("scene.case.f_place_ph")}
            />
          </div>

          <div>
            <div className="smp-modal-lb">{t("scene.case.f_note")}</div>
            <textarea
              className="smp-modal-in"
              rows="3"
              maxLength={500}
              value={form.note}
              onChange={set("note")}
              placeholder={t("scene.case.f_note_ph")}
            />
          </div>
        </div>

        <div className="smp-modal-foot">
          <button type="button" className="smp-modal-cancel" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="smp-modal-save" disabled={!canSave}>
            {saving ? t("common.loading") : t("scene.case.new_save")}
          </button>
        </div>
      </form>
    </div>
  );
}
