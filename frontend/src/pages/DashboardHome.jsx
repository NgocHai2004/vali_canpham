import React, { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { Icon, DashIcon } from "../components/Icons";
import { loadDashboardData, EMPTY_HARDWARE } from "../lib/dashboardMock";

import DashGreetingHero from "../components/dashboard/DashGreetingHero";
import DashStatCard from "../components/dashboard/DashStatCard";
import DashPanel from "../components/dashboard/DashPanel";
import DashSelect from "../components/dashboard/DashSelect";
import DashLineChart from "../components/dashboard/DashLineChart";
import DashDonut from "../components/dashboard/DashDonut";
import DashDeviceStatus from "../components/dashboard/DashDeviceStatus";
import DashTelemetry from "../components/dashboard/DashMeters";
import DashCellTable from "../components/dashboard/DashCellTable";
import DashSessionList from "../components/dashboard/DashSessionList";
import DashActivityFeed from "../components/dashboard/DashActivityFeed";

/**
 * Số dòng bảng buồng giam hiển thị trên dashboard.
 */
const CELL_ROWS = 5;
const LOG_ROWS = 5;

/** "2026-09-05" -> "5/9". Tách chuỗi thay vì new Date() để không dính múi giờ. */
function dayLabel(isoDate) {
  const [, m, d] = String(isoDate).split("-");
  return `${Number(d)}/${Number(m)}`;
}

/**
 * Trang chủ dashboard.
 */
function DashboardHome({ go, fullName = "" }) {
  const { t, formatNumber } = useI18n();
  const [now, setNow] = useState(() => new Date());
  const [metric, setMetric] = useState("new");
  const [range, setRange] = useState("today");

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    loadDashboardData().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);

  const stats = data?.stats;
  const cells = data?.cells || [];
  const hardware = data?.hardware || EMPTY_HARDWARE;
  const loading = !data;

  const total = stats?.total || 0;
  const male = stats?.male || 0;
  const female = stats?.female || 0;
  const malePct = total ? Math.round((male / total) * 100) : 0;
  const femalePct = total ? 100 - malePct : 0;

  const openSession = stats?.open_session;
  const missing = stats?.missing_data_count || 0;
  const todayDelta = (stats?.today || 0) - (stats?.yesterday || 0);

  const activity = stats?.activity_14d || [];
  const chartLabels = activity.map((a) => dayLabel(a.date));
  const chartValues = activity.map((a) => a.count);

  const todayNote =
    todayDelta === 0
      ? t("dashboard.stat.today.same")
      : todayDelta > 0
        ? t("dashboard.stat.today.up", { n: todayDelta })
        : t("dashboard.stat.today.down", { n: Math.abs(todayDelta) });

  return (
    <div className="page dh-page">
      <DashGreetingHero
        fullName={fullName}
        now={now}
        session={openSession}
        onEnter={() => go("sessions", { openSessionId: openSession?.id })}
        onNew={() => go("sessions")}
      />

      <div className="dh-row dh-row--4">
        <DashStatCard
          tone="emerald"
          icon={Icon.file}
          label={t("dashboard.stat.today")}
          value={stats?.today || 0}
          note={todayNote}
          pill={<span className="dh-pill dh-pill--emerald">{t("dashboard.stat.delta_pill", { n: Math.abs(Math.round((todayDelta / Math.max(1, stats?.yesterday || 1)) * 100)) })}</span>}
        />
        <DashStatCard
          tone="blue"
          icon={DashIcon.database}
          label={t("dashboard.stat.total")}
          value={formatNumber(total)}
          note={t("dashboard.stat.total.note")}
          onClick={() => go("detainees")}
        />
        <DashStatCard
          tone="purple"
          icon={Icon.clipboard}
          label={t("dashboard.stat.open_session")}
          value={openSession ? 1 : 0}
          note={openSession ? openSession.code : t("dashboard.stat.open_session.none")}
        />
        <DashStatCard
          tone="amber"
          icon={DashIcon.alert}
          label={t("dashboard.stat.missing")}
          value={missing}
          note={missing > 0 ? t("dashboard.stat.missing.need") : t("dashboard.stat.missing.ok")}
          onClick={() => go("detainees")}
        />
      </div>

      <div className="dh-row dh-row--3">
        <DashPanel
          title={t("dashboard.panel.activity14")}
          className="dh-panel--chart"
          right={
            <DashSelect
              value={metric}
              onChange={setMetric}
              label={t("dashboard.chart.metric.new_records")}
              options={[{ value: "new", label: t("dashboard.chart.metric.new_records") }]}
            />
          }
        >
          <DashLineChart
            labels={chartLabels}
            values={chartValues}
            yMax={40}
            formatTooltip={(label, n) => t("dashboard.hoso.for_day", { label, n })}
          />
        </DashPanel>

        <DashPanel
          title={t("dashboard.panel.gender")}
          right={
            <DashSelect
              value={range}
              onChange={setRange}
              label={t("dashboard.range.today")}
              options={[{ value: "today", label: t("dashboard.range.today") }]}
            />
          }
        >
          <DashDonut
            loading={loading}
            centerValue={`${malePct}%`}
            centerLabel={t("dashboard.donut.male").toUpperCase()}
            segments={[
              { key: "male", label: t("dashboard.donut.male"), color: "var(--dh-blue, #3b82f6)", value: male, pct: malePct },
              { key: "female", label: t("dashboard.donut.female"), color: "var(--dh-gray, #64748b)", value: female, pct: femalePct },
            ]}
          />
        </DashPanel>

        <DashPanel title="Trạng thái thiết bị">
          <DashDeviceStatus />
        </DashPanel>
      </div>

      <div className="dh-row dh-row--2">
        <DashPanel title={t("dashboard.panel.hardware")}>
          <DashTelemetry hardware={hardware} />
        </DashPanel>

        <DashPanel
          title={t("dashboard.panel.cells")}
          actionLabel={t("dashboard.panel.manage")}
          onAction={() => go("cells")}
        >
          <DashCellTable rows={cells.slice(0, CELL_ROWS)} onOpen={() => go("cells")} />
        </DashPanel>
      </div>

      <div className="dh-row dh-row--2">
        <DashPanel
          title={t("dashboard.panel.recent_sessions")}
          className="dh-panel--list"
          actionLabel={t("dashboard.panel.view_all")}
          onAction={() => go("sessions")}
        >
          <DashSessionList
            sessions={(stats?.recent_sessions || []).slice(0, 5)}
            onOpen={() => go("sessions", { openSessionId: openSession?.id })}
          />
        </DashPanel>

        <DashPanel
          title={t("dashboard.panel.logs")}
          className="dh-panel--list"
          actionLabel={t("dashboard.panel.view_report")}
          onAction={() => go("logs")}
        >
          <DashActivityFeed items={(stats?.recent_activity || []).slice(0, LOG_ROWS)} />
        </DashPanel>
      </div>
    </div>
  );
}

export default DashboardHome;
