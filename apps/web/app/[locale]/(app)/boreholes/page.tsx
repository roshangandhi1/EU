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
import { PublishButton } from "@/components/publish-button";
import { canPublish } from "@/lib/public-map";
import { PageHeader, Section } from "@/components/ui";
import { Icon } from "@/components/icons";
import { NoAccess } from "@/components/no-access";
import { boreholeExtras } from "@/lib/borehole-detail";
import { publishLabels } from "@/lib/publish-labels";
import { fmtEur, fmtNum } from "@/lib/format";
import { titled } from "@/lib/meta";

export const dynamic = "force-dynamic";
export const generateMetadata = titled("boreholes.title");

const LIFECYCLE = ["planned", "drilled", "equipped", "commissioned", "handed_over", "operational", "needs_repair", "non_functional"];
const DUE = ["ok", "due_soon", "due", "overdue"];
const FAILS = ["commissioned", "pump_delivers", "flow_min", "tank_taps", "water_quality", "caretaker", "sop", "no_recent_check"];

export default async function BoreholesPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ asAt?: string; mode?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  if (!permissions.can(me.user, "boreholes.read", { stream: "boreholes" })) return <NoAccess locale={locale} reason={t(locale, "boreholes.forbidden")} />;
  const sp = await searchParams;
  const today = todayDrc();
  const asAt = isIsoDate(sp.asAt) ? sp.asAt : today;
  const mode = sp.mode === "evidence" ? "evidence" : "captured";
  const [{ rows, counted }, extras] = await Promise.all([loadBoreholes(db(), asAt, mode, today), boreholeExtras()]);
  const canWrite = permissions.can(me.user, "boreholes.write", { stream: "boreholes" });
  const canTemplates = permissions.can(me.user, "boreholes.template.write", { stream: "boreholes" });
  const pub = canPublish(me.user, "boreholes") ? await publishLabels(locale, "boreholes") : null;
  const errors = Object.fromEntries(["already_exists", "invalid_request", "forbidden", "network", "unknown", "coords"].map((k) => [k, t(locale, `boreholes.err.${k}`)]));

  return (
    <section className="module" data-stream="boreholes">
      <PageHeader
        icon={<Icon name="drop" size={24} />}
        title={t(locale, "boreholes.title")}
        subtitle={t(locale, "ui.home.boreholes.sub")}
        actions={<>
          {canTemplates && <Link className="btn secondary" href={`/${locale}/boreholes/templates`}><Icon name="wrench" size={16} />{t(locale, "boreholes.template.edit")}</Link>}
          {pub && <PublishButton layer="boreholes" locale={locale} labels={pub} />}
        </>}
      />
      <form className="filterbar" method="get">
        <label className="tb-field">{t(locale, "boreholes.as_at")}<input className="ctl" type="date" name="asAt" defaultValue={asAt} /></label>
        <label className="tb-field">{t(locale, "ui.form.mode")}
          <select className="ctl" name="mode" defaultValue={mode}>
            <option value="captured">{t(locale, "forestry.mode.captured")}</option>
            <option value="evidence">{t(locale, "forestry.mode.evidence")}</option>
          </select>
        </label>
        <button className="btn secondary" type="submit">{t(locale, "boreholes.update")}</button>
      </form>
      <div className="indicator">
        <p className="ind-title">{t(locale, "boreholes.indicator.111")}</p>
        <dl>
          <div><dt>{t(locale, "boreholes.counted")}</dt><dd className="big">{counted}</dd></div>
          <div><dt>{t(locale, "boreholes.value_eur")}</dt><dd>{fmtEur(counted * UNIT_EUR_111, locale)}</dd></div>
          <div><dt>{t(locale, "boreholes.target_2027")}</dt><dd>{fmtNum(30, locale)}</dd></div>
          <div><dt>{t(locale, "boreholes.target_2030")}</dt><dd>{fmtNum(140, locale)}</dd></div>
        </dl>
      </div>
      {rows.length === 0 ? <div className="empty-state"><div className="es-icon"><Icon name="drop" size={28} /></div><p>{t(locale, "boreholes.no_boreholes")}</p></div> : (
        <BoreholesView
          locale={locale}
          rows={rows.map((r) => ({ siteId: r.siteId, code: r.code, village: r.village, lifecycle: r.lifecycle, lat: r.lat, lng: r.lng, lastVisitOn: r.lastVisitOn, worstDue: r.worstDue, openFaults: r.openFaults, counted: r.indicator.counted, fails: r.indicator.fails,
            population: extras.get(r.siteId)?.population ?? null, flowLpm: extras.get(r.siteId)?.flowLpm ?? null }))}
          labels={{
            people: t(locale, "boreholes.people"), flow: t(locale, "boreholes.flow"), lpm: t(locale, "boreholes.lpm"), search: t(locale, "boreholes.search"),
            noMatch: t(locale, "boreholes.no_match"), shown: t(locale, "boreholes.shown"), open: t(locale, "boreholes.open"),
            filters: { all: t(locale, "boreholes.filter.all"), overdue: t(locale, "boreholes.filter.overdue"), faults: t(locale, "boreholes.filter.faults"), not_counted: t(locale, "boreholes.filter.not_counted") },
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
        <Section id="new" icon="plus" title={t(locale, "boreholes.new")}>
          <NewBoreholeForm locale={locale} labels={{
            code: t(locale, "boreholes.code"), village: t(locale, "boreholes.village"), lat: t(locale, "boreholes.lat"), lng: t(locale, "boreholes.lng"),
            pump: t(locale, "boreholes.pump_kw"), stage: t(locale, "boreholes.lifecycle_label"), create: t(locale, "boreholes.create"),
            created: t(locale, "boreholes.created_named"), open: t(locale, "boreholes.open"), errors, optional: t(locale, "ui.form.optional"), saving: t(locale, "ui.form.saving"),
            latLngHint: t(locale, "ui.form.latLngHint"), coordsError: t(locale, "ui.form.coordsError"),
            lifecycle: Object.fromEntries(LIFECYCLE.map((k) => [k, t(locale, `boreholes.lifecycle.${k}`)])),
          }} />
        </Section>
      )}
    </section>
  );
}
