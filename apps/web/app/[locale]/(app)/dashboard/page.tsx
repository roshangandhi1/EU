import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { notFound, redirect } from "next/navigation";
import { isLocale, t } from "@eu/core/i18n";
import type { CountingMode } from "@eu/forestry";
import { currentPrincipal } from "@/lib/session";
import { permissions } from "@/lib/registry";
import { isIsoDate, todayDrc } from "@/lib/dates";
import { loadDashboard, milestone, PERIODS, totals, type IndicatorRow } from "@/lib/dashboard";
import { NoAccess } from "@/components/no-access";
import { CsvButton } from "@/components/csv-button";
import { fmtDate, fmtEur, tn } from "@/lib/format";
import { titled } from "@/lib/meta";

export const dynamic = "force-dynamic";
export const generateMetadata = titled("dashboard.title");

const LINK: Partial<Record<IndicatorRow["source"], string>> = { boreholes: "boreholes", miombo: "forestry/miombo", bamboo: "forestry/bamboo", schools: "schools" };

export default async function Dashboard({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ asAt?: string; mode?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  if (!permissions.can(me.user, "dashboard.read", { stream: "platform" })) {
    return <NoAccess locale={locale} reason={t(locale, "dashboard.forbidden")} />;
  }
  const sp = await searchParams;
  const today = todayDrc();
  const asAt = isIsoDate(sp.asAt) ? sp.asAt : today;
  const mode: CountingMode = sp.mode === "evidence" ? "evidence" : "captured";
  const rows = await loadDashboard(asAt, mode, today);
  const sum = totals(rows);
  const nf = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 2 });
  const eur = { format: (v: number) => fmtEur(v, locale) };
  const canReview = permissions.can(me.user, "evidence.manage", { stream: "platform" });
  const name = (r: IndicatorRow) => t(locale, `dashboard.name.i${r.code.replaceAll(".", "")}`);
  const c = (k: string) => t(locale, `dashboard.col.${k}`);
  const csvRows: (string | number | null)[][] = [
    [c("code"), c("name"), c("value"), c("p1"), c("p2"), c("p2units"), c("final"), c("finalYear"), c("eur"), c("cap"), t(locale, "dashboard.csvCols.status"), t(locale, "dashboard.csvCols.source"), t(locale, "dashboard.csvCols.asAt"), t(locale, "dashboard.csvCols.mode")],
    ...rows.map((r) => [r.code, name(r), r.value, r.p1.validated, milestone(r), r.p2.units, r.finalTarget, r.finalYear, r.valueEur, r.capEur, t(locale, `dashboard.status.${r.status}`), t(locale, `dashboard.source.${r.source}`), asAt, t(locale, `forestry.mode.${mode}`)]),
  ];
  const d = (iso: string) => fmtDate(iso, locale);
  const [p1, p2] = PERIODS;
  const daysLeft = Math.round((Date.parse(`${p2.to}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const n = (v: number | null) => (v === null ? "–" : nf.format(v));

  return (
    <section className="module dashboard" data-stream="platform">
      <PageHeader icon={<Icon name="chart" size={24} />} title={t(locale, "dashboard.title")} subtitle={t(locale, "dashboard.intro")}
        actions={<CsvButton rows={csvRows} locale={locale} filename={`${t(locale, "dashboard.csvFile")}-${asAt}`} label={t(locale, "dashboard.csv")} />} />

      <form className="asat" method="get">
        <label>{t(locale, "forestry.as_at")}<input type="date" name="asAt" defaultValue={asAt} /></label>
        <label>{t(locale, "dashboard.csvCols.mode")}
          <select name="mode" defaultValue={mode}>
            <option value="captured">{t(locale, "forestry.mode.captured")}</option>
            <option value="evidence">{t(locale, "forestry.mode.evidence")}</option>
          </select>
        </label>
        <button className="btn" type="submit">{t(locale, "forestry.update")}</button>
      </form>

      <h2>{t(locale, "dashboard.periods.title")}</h2>
      <div className="periods">
        <article className="card period" data-period="1">
          <header>
            <h3>{t(locale, "dashboard.periods.name", { n: 1 })}</h3>
            <span className="pill good">{t(locale, "dashboard.periods.validated")}</span>
          </header>
          <p className="muted small">{d(p1.from)} – {d(p1.to)}</p>
          <dl>
            <div><dt>{t(locale, "dashboard.periods.validatedEur")}</dt><dd className="big">{eur.format(p1.validatedEur ?? 0)}</dd></div>
            <div><dt>{t(locale, "dashboard.periods.budget")}</dt><dd>{eur.format(p1.budgetEur)}</dd></div>
          </dl>
          <p className="small">{t(locale, "dashboard.periods.p1note", { from: d(p1.tpaVisit!.from), to: d(p1.tpaVisit!.to) })}</p>
        </article>
        <article className="card period" data-period="2">
          <header>
            <h3>{t(locale, "dashboard.periods.name", { n: 2 })}</h3>
            <span className="pill info">{daysLeft > 0 ? tn(locale, "dashboard.periods.daysLeft", daysLeft) : t(locale, "dashboard.periods.ended")}</span>
          </header>
          <p className="muted small">{d(p2.from)} – {d(p2.to)}</p>
          <dl>
            <div><dt>{t(locale, "dashboard.periods.forecastEur")}</dt><dd className="big">{eur.format(p2.budgetEur)}</dd></div>
            <div><dt>{t(locale, "dashboard.periods.nextTpa")}</dt><dd>{t(locale, "dashboard.periods.after", { date: d(p2.to) })}</dd></div>
          </dl>
          <p className="small">{t(locale, "dashboard.periods.p2note")}</p>
        </article>
      </div>

      <h2>{t(locale, "dashboard.inApp")}</h2>
      <div className="indicator">
        <dl>
          <div><dt>{t(locale, "dashboard.total.earned")}</dt><dd className="big">{eur.format(sum.earned)}</dd></div>
          <div><dt>{t(locale, "dashboard.total.tracked")}</dt><dd>{eur.format(sum.tracked)}</dd></div>
          <div><dt>{t(locale, "dashboard.total.ceiling")}</dt><dd>{eur.format(sum.ceiling)}</dd></div>
        </dl>
      </div>

      <div className="table-wrap">
        <table className="dash">
          <thead>
            <tr>
              <th>{t(locale, "dashboard.col.code")}</th>
              <th>{t(locale, "dashboard.col.name")}</th>
              <th className="num">{t(locale, "dashboard.col.value")}</th>
              <th className="num">{t(locale, "dashboard.col.p1")}</th>
              <th className="num">{t(locale, "dashboard.col.p2")}</th>
              <th className="num">{t(locale, "dashboard.col.final")}</th>
              <th className="num">{t(locale, "dashboard.col.eur")}</th>
              <th className="num">{t(locale, "dashboard.col.cap")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const href = LINK[r.source];
              const goal = milestone(r);
              const pct = r.value === null ? null : Math.min(100, Math.round((r.value / r.finalTarget) * 100));
              const mark = Math.min(100, Math.round((goal / r.finalTarget) * 100));
              const toGo = r.value === null ? null : Math.max(0, goal - r.value);
              return (
                <tr key={r.code} data-status={r.status}>
                  <td className="code">{r.code}</td>
                  <td className="ind">
                    {href && r.status === "live" ? <Link href={`/${locale}/${href}`}>{name(r)}</Link> : name(r)}
                    <div className="muted small">{t(locale, `dashboard.source.${r.source}`)} · {t(locale, `dashboard.status.${r.status}`)}</div>
                    {r.secondary && <div className="muted small">{t(locale, `dashboard.${r.secondary.key}`, { n: nf.format(r.secondary.value) })}</div>}
                    {!!r.late && <div className="warn small">{tn(locale, "dashboard.late", r.late)}{canReview && <> · <Link href={`/${locale}/admin/evidence`}>{t(locale, "dashboard.lateLink")}</Link></>}</div>}
                    {pct !== null && (
                      <div className="bar" role="img" aria-label={t(locale, "dashboard.pct", { n: pct, m: mark })}>
                        <span style={{ width: `${pct}%` }} />
                        {mark < 100 && <i style={{ left: `${mark}%` }} title={t(locale, "dashboard.col.p2")} />}
                      </div>
                    )}
                  </td>
                  <td className="num big" data-label={c("value")}>{n(r.value)}</td>
                  <td className="num" data-label={c("p1")}>{nf.format(r.p1.validated)}</td>
                  <td className="num milestone" data-label={c("p2")}>
                    <b>{nf.format(goal)}</b>
                    <div className="muted small">{r.p2.units > 0 ? t(locale, "dashboard.inPeriod", { n: nf.format(r.p2.units) }) : t(locale, "dashboard.noneInPeriod")}</div>
                    {toGo !== null && <div className={`small ${toGo === 0 ? "good" : ""}`}>{toGo === 0 ? t(locale, "dashboard.reached") : t(locale, "dashboard.toGo", { n: nf.format(toGo) })}</div>}
                  </td>
                  <td className="num" data-label={c("final")}>{nf.format(r.finalTarget)}<div className="muted small">{t(locale, "dashboard.by", { y: r.finalYear })}</div></td>
                  <td className="num" data-label={c("eur")}>{r.valueEur === null ? "–" : eur.format(r.valueEur)}</td>
                  <td className="num muted" data-label={c("cap")}>{eur.format(r.capEur)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
