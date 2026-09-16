import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n";
import CaseFormModal from "./CaseFormModal";
import {
  IcChevRight, IcInfo, IcPageNext, IcPagePrev, IcPencil, IcPlus,
  IcReanalyze, IcSearch, IcTick, IcTrash,
} from "./sceneMatchIcons";

// Trang quản lý vụ án — bước đầu của tab Dấu vết hiện trường.
// Bấm 1 hàng là sang thẳng màn Phân tích đối sánh, nên bảng này dùng đúng ngôn
// ngữ smp-* của màn đó (panel bo 14px, chip, ô có icon, thanh phân trang) để 2
// bước không lệch hình. Không bọc trong .smp: .smp ẩn thanh scroll, mà bảng này
// cần thấy được là còn hàng bên dưới.
//
// Vụ án không thuộc riêng cán bộ nào — mọi tài khoản thấy cùng một danh sách.
// Admin chỉ xem: backend chặn ghi (403) nên các nút sửa/kết thúc/xoá ẩn luôn cho
// khớp, không để bấm rồi mới báo lỗi.
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
  ["investigating", "case.status.investigating"],
  ["closed", "case.status.closed"],
];

export default function CasesPage({ role = "user", onPick, onOpenCase }) {
  const { t, formatDateTime } = useI18n();
  const isAdmin = role === "admin";
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [qLive, setQLive] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null);      // {} = tạo mới, {…case} = sửa
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await api.listCases({
        status: statusFilter,
        q,
        skip: String((page - 1) * PAGE_SIZE),
        limit: String(PAGE_SIZE),
      });
      setItems(r.items || []);
      setTotal(r.total || 0);
    } catch (ex) {
      setErr(ex.message || t("case.err.load"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, q, page, t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [statusFilter, q]);

  // Gõ tới đâu tìm tới đó nhưng chờ 300ms — backend lọc cả bảng (không phải chỉ
  // 10 hàng như bản cũ) nên không gọi API theo từng ký tự.
  useEffect(() => {
    const id = setTimeout(() => setQ(qLive.trim()), 300);
    return () => clearTimeout(id);
  }, [qLive]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const closeCase = async (c) => {
    if (!window.confirm(t("case.confirm.close", { code: c.code, n: c.detainee_count ?? 0 }))) return;
    setBusyId(c.id);
    try {
      await api.closeCase(c.id);
      await load();
    } catch (ex) {
      setErr(ex.message || t("case.err.close"));
    } finally {
      setBusyId("");
    }
  };

  // Xoá vụ án kéo theo dấu vết + hồ sơ bên trong nên phải nói rõ số lượng.
  const removeCase = async (c) => {
    const n = c.detainee_count ?? 0;
    const msg = n > 0
      ? t("case.confirm.delete_multi", { code: c.code, n })
      : t("case.confirm.delete_empty", { code: c.code });
    if (!window.confirm(msg)) return;
    setBusyId(c.id);
    try {
      await api.deleteCase(c.id);
      await load();
    } catch (ex) {
      setErr(ex.message || t("case.err.delete"));
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="scp">
      <section className="smp-panel smp-panel-match">
        <div className="smp-panel-head">
          <div className="smp-panel-title">
            <span className="smp-h">{t("case.title")}</span>
            <span className="smp-badge">{total}</span>
            <span className="smp-sub">{t("case.cases")}</span>
          </div>
          <div className="smp-panel-tools">
            {/* Ô tìm kiếm có icon bên trong, đúng .smp-field của màn đối sánh. */}
            <div className="smp-field smp-field-wide">
              <IcSearch />
              <input
                type="search"
                value={qLive}
                onChange={(e) => setQLive(e.target.value)}
                placeholder={t("case.search_ph")}
                aria-label={t("common.search")}
              />
            </div>
            <div className="scp-seg" role="group" aria-label={t("case.filter_label")}>
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
            {!isAdmin && (
              <button type="button" className="btn-primary scp-new" onClick={() => setForm({})}>
                <IcPlus /> {t("case.new")}
              </button>
            )}
          </div>
        </div>

        <div className="smp-sub scp-hint">{t("case.sub")}</div>

        {err && <div className="lg-err" role="alert">{err}</div>}

        <div className="scp-wrap">
          {/* <table> thật, không grid: chỉ 6 cột và không phải canh pixel theo
              design như bảng đối sánh, nên lấy luôn semantics hàng/cột của bảng
              cho trình đọc màn hình thay vì tự khai role. */}
          <table className="scp-t" aria-busy={loading || undefined}>
            <thead>
              <tr>
                <th scope="col">{t("case.col.case")}</th>
                <th scope="col">{t("case.col.officer")}</th>
                <th scope="col" className="scp-wide-only">{t("case.col.location")}</th>
                <th scope="col" className="scp-wide-only">{t("case.col.occurred_at")}</th>
                <th scope="col">{t("case.col.detainees")}</th>
                <th scope="col">{t("case.status")}</th>
                <th scope="col" className="scp-th-acts">{t("case.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {/* Hàng giả giữ đúng chiều cao bảng nên lúc data về không giật. */}
              {loading && SK.map((i) => (
                <tr className="scp-sk" key={i} aria-hidden="true">
                  <td colSpan={7}><span /></td>
                </tr>
              ))}

              {/* class "on" = vạch xanh lá bên trái: quét dọc một cột là thấy vụ
                  nào còn điều tra; chữ trong chip vẫn là kênh chính. */}
              {!loading && items.map((c) => {
                const name = c.name || t("case.no_name");
                const open = c.status === "investigating";
                const busy = busyId === c.id;
                const go = () => onPick && onPick(c.id);
                return (
                  <tr key={c.id} className={open ? "on" : ""} onClick={go}>
                    <td>
                      <div className="scp-name smp-ellip" title={name}>{name}</div>
                      <div className="scp-sub2 mono smp-ellip">{c.code}</div>
                      {/* Màn hẹp bỏ 2 cột phụ nên gộp vào đây — ẩn hẳn dữ liệu
                          thì cán bộ không còn cách nào xem được. */}
                      <div className="scp-sub2 scp-narrow-only smp-ellip">
                        {(c.location || "—") + " · " + formatDateTime(c.occurred_at)}
                      </div>
                    </td>
                    <td>
                      <div className="smp-ellip" title={`${c.officer_rank ? `${c.officer_rank} ` : ""}${c.officer_name || ""}`}>
                        {c.officer_rank ? `${c.officer_rank} ` : ""}{c.officer_name || "—"}
                      </div>
                    </td>
                    <td className="scp-wide-only">
                      <div className="smp-ellip" title={c.location || ""}>{c.location || "—"}</div>
                    </td>
                    <td className="scp-wide-only">
                      <div className="smp-ellip">{formatDateTime(c.occurred_at)}</div>
                      <div className="scp-sub2 smp-ellip">
                        {c.closed_at ? formatDateTime(c.closed_at) : t("case.still_open")}
                      </div>
                    </td>
                    <td className="scp-num">
                      <span className="smp-badge">{c.detainee_count ?? 0}</span>
                    </td>
                    <td>
                      {/* Ký hiệu ● / ✓ nằm sẵn trong chuỗi dịch nên trạng thái
                          không chỉ dựa vào màu. Đã kết thúc dùng chip xám: xanh
                          #2272e8 là màu hành động, để dành cho vụ đang điều tra. */}
                      <span className={"smp-chip " + (open ? "smp-chip-green" : "scp-chip-grey")}>
                        {t(open ? "case.status.investigating_dot" : "case.status.closed_dot")}
                      </span>
                    </td>
                    {/* stopPropagation ở cả ô: bấm nút hành động không được kéo
                        theo click-mở-vụ của cả hàng. */}
                    <td className="scp-acts" onClick={(e) => e.stopPropagation()}>
                      <div className="scp-acts-wrap">
                        <button
                          type="button"
                          className="smp-icon-btn"
                          onClick={() => onOpenCase && onOpenCase(c.id)}
                          aria-label={t("case.act.detail", { name })}
                          title={t("case.act.detail_short")}
                        >
                          <IcChevRight />
                        </button>
                        {!isAdmin && open && (
                          <>
                            <button
                              type="button"
                              className="smp-icon-btn"
                              disabled={busy}
                              onClick={() => setForm(c)}
                              aria-label={t("case.act.edit", { name })}
                              title={t("common.edit")}
                            >
                              <IcPencil />
                            </button>
                            <button
                              type="button"
                              className="smp-icon-btn"
                              disabled={busy}
                              onClick={() => closeCase(c)}
                              aria-label={t("case.act.close", { name })}
                              title={t("case.act.close_short")}
                            >
                              <IcTick />
                            </button>
                            <button
                              type="button"
                              className="smp-icon-btn scp-danger"
                              disabled={busy}
                              onClick={() => removeCase(c)}
                              aria-label={t("case.act.delete", { name })}
                              title={t("common.delete")}
                            >
                              <IcTrash />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {loading && <p className="scp-sr" role="status">{t("common.loading")}</p>}

          {/* Rỗng vì chưa có vụ án khác hẳn rỗng vì từ khoá không khớp. */}
          {!loading && items.length === 0 && (
            <div className="smp-drop scp-empty" role="status">
              <div className="smp-drop-ic"><IcInfo /></div>
              <div className="smp-drop-main">
                {q ? t("case.empty_q", { q }) : t("case.empty")}
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
              {t("smp.showing", { from, to, total })}
            </span>
          </div>
        </div>
      </section>

      {form && (
        <CaseFormModal
          initial={form.id ? form : null}
          onCancel={() => setForm(null)}
          onSaved={() => { setForm(null); load(); }}
        />
      )}
    </div>
  );
}
