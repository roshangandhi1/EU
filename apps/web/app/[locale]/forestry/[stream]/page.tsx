import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isLocale, t } from "@eu/core/i18n";
import { computeIndicator, fa, miomboRegeneratingHa, UNIT_EUR, type CountingMode, type ForestryStream } from "@eu/forestry";
import { loadSettings, loadStream, rulesFrom } from "@eu/forestry/server";
import { currentPrincipal } from "@/lib/session";
import { db } from "@/lib/http";
import { permissions } from "@/lib/registry";
import { isIsoDate, todayDrc } from "@/lib/dates";
import { PlotsView } from "./plots-view";

export const dynamic = "force-dynamic";

const TARGETS = { bamboo: { code: "2.2.1", t2027: 100, t2030: 500 }, miombo: { code: "2.1.1", t2027: 200, t2030: 3000 } } as const;

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
    return <p className="error">{t(locale, "forestry.forbidden")}</p>;
  }
  const sp = await searchParams;
  const asAt = isIsoDate(sp.asAt) ? sp.asAt : todayDrc();
  const mode: CountingMode = sp.mode === "evidence" ? "evidence" : "captured";

  const [{ plots, inputs }, settings] = await Promise.all([loadStream(db(), s), loadSettings(db(), s)]);
  const result = computeIndicator(inputs, asAt, mode, rulesFrom(s, settings));
  const target = TARGETS[s];
  const unit = UNIT_EUR[target.code];
  const late = result.plots.reduce((n, p) => n + p.lateSynced.length, 0);
  const canImport = permissions.can(me.user, fa(s, "import.run"), { stream: s });
  const fmt = (n: number, d = 2) => n.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: d });

  return (
    <section className="module" data-stream={s}>
      <div className="module-head">
        <h1>{t(locale, `forestry.${s}`)}</h1>
        {canImport && <Link className="btn secondary" href={`/${locale}/forestry/${s}/import`}>{t(locale, "forestry.import.kmz")}</Link>}
      </div>

      <form className="asat" method="get">
        <label>{t(locale, "forestry.as_at")}<input type="date" name="asAt" defaultValue={asAt} /></label>
        <label>
          <select name="mode" defaultValue={mode}>
            <option value="captured">{t(locale, "forestry.mode.captured")}</option>
            <option value="evidence">{t(locale, "forestry.mode.evidence")}</option>
          </select>
        </label>
        <button className="btn" type="submit">{t(locale, "forestry.update")}</button>
      </form>

      <div className="indicator" aria-live="polite">
        <p className="ind-title">{t(locale, s === "bamboo" ? "forestry.indicator.221" : "forestry.indicator.211")}</p>
        {s === "miombo" && <p className="muted">{t(locale, "forestry.indicator.211a")}</p>}
        <dl>
          <div><dt>{t(locale, "forestry.ha_counted")}</dt><dd className="big">{fmt(result.hectaresCounted)}</dd></div>
          <div><dt>{t(locale, "forestry.value_eur")}</dt><dd>{fmt(result.hectaresCounted * unit, 0)}</dd></div>
          <div><dt>{t(locale, "forestry.target_2027")}</dt><dd>{fmt(target.t2027, 0)}</dd></div>
          <div><dt>{t(locale, "forestry.target_2030")}</dt><dd>{fmt(target.t2030, 0)}</dd></div>
          <div><dt>{t(locale, "forestry.ha_pipeline")}</dt><dd>{fmt(result.hectaresPipeline)}</dd></div>
          {s === "miombo" && <div><dt>{t(locale, "forestry.regenerating_ha")}</dt><dd>{fmt(miomboRegeneratingHa(result))}</dd></div>}
        </dl>
        {late > 0 && <p className="warn">{t(locale, "forestry.late_synced", { n: late })}</p>}
      </div>

      {plots.length === 0 ? (
        <p>{t(locale, "forestry.no_plots")}</p>
      ) : (
        <PlotsView
          locale={locale}
          stream={s}
          plots={plots.map((p) => {
            const r = result.plots.find((x) => x.siteId === p.siteId)!;
            return { ...p, areaHa: r.areaHa, plantedPerHa: r.plantedPerHa, outcome: r.outcome };
          })}
          labels={{
            plot: t(locale, "forestry.plot"),
            village: t(locale, "forestry.village"),
            area: t(locale, "forestry.area_ha"),
            perHa: t(locale, "forestry.planted_per_ha"),
            outcome: t(locale, "forestry.outcome_label"),
            unapproved: t(locale, "forestry.boundary.unapproved"),
            outcomes: Object.fromEntries(["counted", "below_density", "no_authoritative_boundary", "not_planted", "missing_evidence"].map((o) => [o, t(locale, `forestry.outcome.${o}`)])),
            statuses: Object.fromEntries(["planned", "pegged", "planted", "established", "failed", "harvested"].map((o) => [o, t(locale, `forestry.status.${o}`)])),
          }}
        />
      )}
    </section>
  );
}
