import React, { useState, useEffect } from "react";
import api from "../api";
import { useI18n } from "../i18n";
import { Icon } from "../components/Icons";
import DetailModal from "../components/DetailModal";
import { PageHeader, StateBox } from "../components/CommonUI";
import { notify } from "../notifications";
import DetaineeForm from "../DetaineeForm";

function DetaineesPage({ onEdit }) {
  const { t, formatDate } = useI18n();
  const [items, setItems] = useState([]);
  const [cells, setCells] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const limit = 10;

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(limit),
      });
      const result = await api.request(`/api/detainees?${params}`);
      setItems(result.items || []);
      setTotal(result.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.listCells().then(setCells).catch(() => { });
  }, []);

  useEffect(() => {
    load();
  }, [skip]);

  const deleteItem = async (item) => {
    if (!window.confirm(t("detainee.confirm.delete", { code: item.code, name: item.full_name }))) return;
    try {
      await api.deleteDetainee(item.id);
      notify.add();
      load();
    } catch (e) {
      window.alert(t("common.error_prefix", { message: e.message }));
    }
  };

  const pages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.floor(skip / limit) + 1;

  return (
    <div className="page">
      <PageHeader title={t("detainee.list.title")} subtitle={t("detainee.list.total", { n: total })}>
      </PageHeader>

      <div className="detainees-table-wrap">
        {loading ? (
          <StateBox>{t("common.loading")}</StateBox>
        ) : error ? (
          <StateBox type="error">{error}</StateBox>
        ) : !items.length ? (
          <StateBox>{t("detainee.empty")}</StateBox>
        ) : (
          <table className="detainees-table">
            <thead>
              <tr>
                <th>{t("detainee.col.photo")}</th>
                <th>{t("detainee.col.code")}</th>
                <th>{t("detainee.col.name")}</th>
                <th>{t("detainee.col.gender")}</th>
                <th>{t("detainee.col.dob")}</th>
                <th>{t("detainee.col.cccd")}</th>
                <th>{t("detainee.col.cell")}</th>
                <th>{t("detainee.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="table-avatar">
                      {item.photo_url ? (
                        <img src={item.photo_url} alt="" />
                      ) : (
                        (item.full_name || "?").slice(0, 1).toUpperCase()
                      )}
                    </div>
                  </td>
                  <td><strong>{item.personal_id || item.code}</strong></td>
                  <td>{item.full_name}</td>
                  <td>{item.gender === "female" ? t("common.female") : t("common.male")}</td>
                  <td>{item.dob ? formatDate(item.dob) : "-"}</td>
                  <td>{item.cccd_number || "-"}</td>
                  <td>{item.cell_code || "-"}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => setViewing(item)}>{t("detainee.action.view")}</button>
                      <button
                        onClick={async () => {
                          try {
                            const full = await api.getDetainee(item.id);
                            onEdit?.(full);
                          } catch {
                            onEdit?.(item);
                          }
                        }}
                      >{t("detainee.action.edit")}</button>
                      <button className="danger-text" onClick={() => deleteItem(item)}>{t("detainee.action.delete")}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="session-list-toolbar">
          <div className="session-list-total">{t("common.total", { n: total })}</div>
          <div className="pagination">
            <button disabled={!skip || loading} onClick={() => setSkip(Math.max(0, skip - limit))}>{t("common.prev")}</button>
            <span>{t("common.page_of", { page: currentPage, total: pages })}</span>
            <button disabled={currentPage >= pages || loading} onClick={() => setSkip(skip + limit)}>{t("common.next")}</button>
          </div>
        </div>
      </div>

      {showForm && (
        <DetaineeForm
          initial={editing}
          cells={cells}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            load();
          }}
        />
      )}

      {viewing && <DetailModal detainee={viewing} onClose={() => setViewing(null)} onEdit={onEdit} />}
    </div>
  );
}


export default DetaineesPage;
