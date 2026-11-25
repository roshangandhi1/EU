import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isLocale, t } from "@eu/core/i18n";
import { UNIT_EUR_111 } from "@eu/boreholes";
import { loadBoreholes } from "@eu/boreholes/server";
import { currentPrincipal } from "@/lib/session";
import { db } from "@/lib/http";
import { permissions } from "@/lib/registry";
import { isIsoDate, todayDrc } from "@/lib/dates";
import { BoreholesView } from "./boreholes-view";
import { NewBoreholeForm } from "./new-borehole";

export const dynamic = "force-dynamic";

const LIFECYCLE = ["planned", "drilled", "equipped", "commissioned", "handed_over", "operational", "needs_repair", "non_functional"];
const DUE = ["ok", "due_soon", "due", "overdue"];
const FAILS = ["commissioned", "pump_delivers", "flow_min", "flow_threshold_not_set", "tank_taps", "water_quality", "caretaker", "sop", "no_recent_check"];

export default async function BoreholesPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ asAt?: string; mode?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  if (!permissions.can(me.user, "boreholes.read", { stream: "boreholes" })) return <p className="error">{t(locale, "boreholes.forbidden")}</p>;
  const sp = await searchParams;
  const today = todayDrc();
  const asAt = isIsoDate(sp.asAt) ? sp.asAt : today;
  const mode = sp.mode === "evidence" ? "evidence" : "captured";
  const { rows, counted } = await loadBoreholes(db(), asAt, mode, today);
  const canWrite = permissions.can(me.user, "boreholes.write", { stream: "boreholes" });
  const canTemplates = permissions.can(me.user, "boreholes.template.write", { stream: "boreholes" });
  const fmt = (n: number) => n.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB");

  return (
    <section className="module" data-stream="boreholes">
      <div className="module-head">
        <h1>{t(locale, "boreholes.title")}</h1>
        {canTemplates && <Link className="btn secondary" href={`/${locale}/boreholes/templates`}>{t(locale, "boreholes.template.edit")}</Link>}
      </div>
      <form className="asat" method="get">
        <label>{t(locale, "boreholes.as_at")}<input type="date" name="asAt" defaultValue={asAt} /></label>
        <label>
          <select name="mode" defaultValue={mode}>
            <option value="captured">{t(locale, "forestry.mode.captured")}</option>
            <option value="evidence">{t(locale, "forestry.mode.evidence")}</option>
          </select>
        </label>
        <button className="btn" type="submit">{t(locale, "boreholes.update")}</button>
      </form>
      <div className="indicator">
        <p className="ind-title">{t(locale, "boreholes.indicator.111")}</p>
        <dl>
          <div><dt>{t(locale, "boreholes.counted")}</dt><dd className="big">{counted}</dd></div>
          <div><dt>{t(locale, "boreholes.value_eur")}</dt><dd>{fmt(counted * UNIT_EUR_111)}</dd></div>
          <div><dt>{t(locale, "boreholes.target_2027")}</dt><dd>30</dd></div>
          <div><dt>{t(locale, "boreholes.target_2030")}</dt><dd>140</dd></div>
        </dl>
      </div>
      {rows.length === 0 ? <p>{t(locale, "boreholes.no_boreholes")}</p> : (
        <BoreholesView
          rows={rows.map((r) => ({ siteId: r.siteId, code: r.code, village: r.village, lifecycle: r.lifecycle, lat: r.lat, lng: r.lng, lastVisitOn: r.lastVisitOn, worstDue: r.worstDue, openFaults: r.openFaults, counted: r.indicator.counted, fails: r.indicator.fails }))}
          labels={{
            code: t(locale, "boreholes.code"), village: t(locale, "boreholes.village"), stage: t(locale, "boreholes.lifecycle_label"),
            lastVisit: t(locale, "boreholes.last_visit"), maintenance: t(locale, "boreholes.maintenance"), faults: t(locale, "boreholes.faults_open"),
            status: t(locale, "boreholes.status_111"), counts: t(locale, "boreholes.counts"), none: t(locale, "boreholes.none"),
            lifecycle: Object.fromEntries(LIFECYCLE.map((k) => [k, t(locale, `boreholes.lifecycle.${k}`)])),
            due: { ...Object.fromEntries(DUE.map((k) => [k, t(locale, `boreholes.due.${k}`)])), none: "–" },
            fails: Object.fromEntries(FAILS.map((k) => [k, t(locale, `boreholes.fail.${k}`)])),
          }}
        />
      )}
      {canWrite && (
        <details className="panel">
          <summary>{t(locale, "boreholes.new")}</summary>
          <NewBoreholeForm locale={locale} labels={{
            code: t(locale, "boreholes.code"), village: t(locale, "boreholes.village"), lat: t(locale, "boreholes.lat"), lng: t(locale, "boreholes.lng"),
            pump: t(locale, "boreholes.pump_kw"), stage: t(locale, "boreholes.lifecycle_label"), create: t(locale, "boreholes.create"),
            created: t(locale, "boreholes.created"), error: t(locale, "boreholes.error"),
            lifecycle: Object.fromEntries(LIFECYCLE.map((k) => [k, t(locale, `boreholes.lifecycle.${k}`)])),
          }} />
        </details>
      )}
    </section>
  );
}
