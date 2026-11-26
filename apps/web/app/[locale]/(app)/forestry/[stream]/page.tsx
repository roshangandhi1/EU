import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isLocale, t } from "@eu/core/i18n";
import { areaHa, computeIndicator, fa, miomboRegeneratingHa, UNIT_EUR, type CountingMode, type ForestryStream } from "@eu/forestry";
import { loadSettings, loadStream, photoUploads, rulesFrom } from "@eu/forestry/server";
import { currentPrincipal } from "@/lib/session";
import { db } from "@/lib/http";
import { permissions } from "@/lib/registry";
import { isIsoDate, todayDrc } from "@/lib/dates";
import { PlotsView } from "./plots-view";
import { PublishButton } from "@/components/publish-button";
import { canPublish } from "@/lib/public-map";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { NoAccess } from "@/components/no-access";
import { plotExtras } from "@/lib/plot-detail";
import { publishLabels } from "@/lib/publish-labels";
import { fmtEur, fmtNum, tn } from "@/lib/format";
import { titled } from "@/lib/meta";
import { INDICATORS } from "@/lib/indicator-defs";
import { loadPeriods, milestone, pickPeriods } from "@/lib/periods";

export const dynamic = "force-dynamic";
export const generateMetadata = titled((l, p) => t(l, p.stream === "miombo" ? "ui.nav.miombo" : "ui.nav.bamboo"));

const def = (code: string) => INDICATORS.find((i) => i.code === code)!;
const TARGETS = { bamboo: def("2.2.1"), miombo: def("2.1.1") };

export default async function ForestryStreamPage({ params, searchParams }: {
  params: Promise<{ locale: string; stream: string }>;
  searchParams: Promise<{ asAt?: string; mode?: string }>;
}) {
  const { locale, stream } = await params;
  if (!isLocale(locale) || (stream !== "bamboo" && stream !== "miombo")) notFound();
  const s = stream as ForestryStream;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  if (!permissions.can(me.user, fa(s, "plot.read"), { stream: s })) {
    return <NoAccess locale={locale} reason={t(locale, "forestry.forbidden")} />;
  }
  const sp = await searchParams;
  const asAt = isIsoDate(sp.asAt) ? sp.asAt : todayDrc();
  const mode: CountingMode = sp.mode === "evidence" ? "evidence" : "captured";

  const [{ plots, inputs }, settings] = await Promise.all([loadStream(db(), s), loadSettings(db(), s)]);
  const result = computeIndicator(inputs, asAt, mode, { ...rulesFrom(s, settings), photoUploadedAt: await photoUploads(db(), inputs) });
  const target = TARGETS[s];
  const periods = await loadPeriods(db());
  const { next } = pickPeriods(periods);
  const unit = UNIT_EUR[target.code as keyof typeof UNIT_EUR];
  const late = result.plots.reduce((n, p) => n + p.lateSynced.length, 0);
  const canImport = permissions.can(me.user, fa(s, "import.run"), { stream: s });
  const fmt = (n: number, d = 2) => fmtNum(n, locale, d);
  const pub = canPublish(me.user, s) ? await publishLabels(locale, s) : null;
  const canReview = permissions.can(me.user, "evidence.manage", { stream: "platform" });

  return (
    <section className="module" data-stream={s}>
      <PageHeader
        icon={<Icon name={s === "bamboo" ? "bamboo" : "tree"} size={24} />}
        title={t(locale, `forestry.${s}`)}
        subtitle={t(locale, s === "bamboo" ? "ui.home.bamboo.sub" : "ui.home.miombo.sub")}
        actions={<>
          {canImport && <Link className="btn" href={`/${locale}/forestry/${s}/import`}><Icon name="upload" size={16} />{t(locale, "forestry.import.kmz")}</Link>}
          {pub && <PublishButton layer={s} locale={locale} labels={pub} />}
        </>}
      />

      <form className="filterbar" method="get">
        <label className="tb-field">{t(locale, "forestry.as_at")}<input className="ctl" type="date" name="asAt" defaultValue={asAt} /></label>
        <label className="tb-field">{t(locale, "ui.form.mode")}
          <select className="ctl" name="mode" defaultValue={mode}>
            <option value="captured">{t(locale, "forestry.mode.captured")}</option>
            <option value="evidence">{t(locale, "forestry.mode.evidence")}</option>
          </select>
        </label>
        <button className="btn secondary" type="submit">{t(locale, "forestry.update")}</button>
      </form>

      <div className="indicator" aria-live="polite">
        <p className="ind-title">{t(locale, s === "bamboo" ? "forestry.indicator.221" : "forestry.indicator.211")}</p>
        {s === "miombo" && <p className="muted">{t(locale, "forestry.indicator.211a")}</p>}
        <dl>
          <div><dt>{t(locale, "forestry.ha_counted")}</dt><dd className="big">{fmt(result.hectaresCounted)}</dd></div>
          <div><dt>{t(locale, "forestry.value_eur")}</dt><dd>{fmtEur(result.hectaresCounted * unit, locale)}</dd></div>
          <div><dt>{t(locale, "forestry.milestone_2027")}</dt><dd>{next ? fmt(milestone(periods, next.n, target.code), 0) : "–"}</dd></div>
          <div><dt>{t(locale, "forestry.target_2030")}</dt><dd>{fmt(target.finalTarget, 0)}</dd></div>
          <div><dt>{t(locale, "forestry.ha_pipeline")}</dt><dd>{fmt(result.hectaresPipeline)}</dd></div>
          {s === "miombo" && <div><dt>{t(locale, "forestry.regenerating_ha")}</dt><dd>{fmt(miomboRegeneratingHa(result))}</dd></div>}
        </dl>
        {late > 0 && <p className="warn">{tn(locale, "forestry.late_synced", late)}{" "}
          {canReview ? <Link href={`/${locale}/admin/evidence`}>{t(locale, "forestry.late_review")}</Link> : <span className="muted">{t(locale, "forestry.late_who")}</span>}</p>}
      </div>

      {plots.length === 0 ? (
        <div className="empty-state">
          <div className="es-icon"><Icon name={s === "bamboo" ? "bamboo" : "tree"} size={28} /></div>
          <p>{t(locale, "forestry.no_plots")}</p>
          {canImport && <div className="es-actions"><Link className="btn" href={`/${locale}/forestry/${s}/import`}><Icon name="upload" size={16} />{t(locale, "forestry.import.kmz")}</Link></div>}
        </div>
      ) : (
        <PlotsView
          locale={locale}
          stream={s}
          plots={plots.map((p) => {
            const r = result.plots.find((x) => x.siteId === p.siteId)!;
            const x = plotExtras(inputs.find((i) => i.siteId === p.siteId)!);
            return { ...p, areaHa: p.geom ? areaHa(p.geom) : r.areaHa, plantedPerHa: r.plantedPerHa, outcome: r.outcome, plantedOn: x.plantedOn, plants: x.plants, survivalPct: x.survivalPct };
          })}
          labels={{
            plot: t(locale, "forestry.plot"),
            village: t(locale, "forestry.village"),
            area: t(locale, "forestry.area_ha"),
            perHa: t(locale, "forestry.planted_per_ha"),
            outcome: t(locale, "forestry.outcome_label"),
            unapproved: t(locale, "forestry.boundary.unapproved"),
            plantedOn: t(locale, "forestry.planted_on"), plants: t(locale, "forestry.plants"), survival: t(locale, "forestry.survival"),
            search: t(locale, "forestry.search"), noMatch: t(locale, "forestry.no_match"), shown: t(locale, "forestry.shown"),
            filters: { all: t(locale, "forestry.filter.all"), unapproved: t(locale, "forestry.filter.unapproved"), not_counted: t(locale, "forestry.filter.not_counted") },
            outcomes: Object.fromEntries(["counted", "below_density", "no_authoritative_boundary", "not_planted", "missing_evidence"].map((o) => [o, t(locale, `forestry.outcome.${o}`)])),
            statuses: Object.fromEntries(["planned", "pegged", "planted", "established", "failed", "harvested"].map((o) => [o, t(locale, `forestry.status.${o}`)])),
          }}
        />
      )}
    </section>
  );
}
