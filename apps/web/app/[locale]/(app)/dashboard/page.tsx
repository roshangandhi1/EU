import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { notFound, redirect } from "next/navigation";
import { isLocale, t } from "@eu/core/i18n";
import type { CountingMode } from "@eu/forestry";
import { currentPrincipal } from "@/lib/session";
import { permissions } from "@/lib/registry";
import { isIsoDate, todayDrc } from "@/lib/dates";
import { loadDashboard, totals, type IndicatorRow } from "@/lib/dashboard";
import { budgetEur, loadOutcomes, loadPeriods, milestone, note, pickPeriods, validatedEur, validatedToDate, type Period } from "@/lib/periods";
import { db } from "@/lib/http";
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
  const [rows, periods, outcomes] = await Promise.all([loadDashboard(asAt, mode, today), loadPeriods(db()), loadOutcomes(db())]);
  const { last, next } = pickPeriods(periods);
  const canManage = permissions.can(me.user, "periods.manage", { stream: "platform" });
  const sum = totals(rows);
  const nf = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 2 });
  const eur = { format: (v: number) => fmtEur(v, locale) };
  const canReview = permissions.can(me.user, "evidence.manage", { stream: "platform" });
  const name = (r: IndicatorRow) => t(locale, `dashboard.name.i${r.code.replaceAll(".", "")}`);
  const c = (k: string) => t(locale, `dashboard.col.${k}`);
  const d = (iso: string) => fmtDate(iso, locale);
  const goalOf = (code: string) => (next ? milestone(periods, next.n, code) : null);
  const colP2 = next ? c("p2").replace("{date}", d(next.endsOn)) : c("p2").replace("{date}", "");
  const csvRows: (string | number | null)[][] = [
    [c("code"), c("name"), c("value"), c("p1"), colP2, next ? c("p2units").replace("{p}", String(next.n)) : "", c("final"), c("finalYear"), c("eur"), c("cap"), t(locale, "dashboard.csvCols.status"), t(locale, "dashboard.csvCols.source"), t(locale, "dashboard.csvCols.asAt"), t(locale, "dashboard.csvCols.mode")],
    ...rows.map((r) => [r.code, name(r), r.value, validatedToDate(periods, r.code), goalOf(r.code), next?.indicators[r.code]?.target ?? null, r.finalTarget, r.finalYear, r.valueEur, r.capEur, t(locale, `dashboard.status.${r.status}`), t(locale, `dashboard.source.${r.source}`), asAt, t(locale, `forestry.mode.${mode}`)]),
  ];
  const daysLeft = (p: Period) => Math.round((Date.parse(`${p.endsOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
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

      {(last || next) && (
        <>
          <div className="h2-row">
            <h2>{t(locale, "dashboard.periods.title")}</h2>
            {canManage && <Link className="btn ghost sm" href={`/${locale}/admin/periods`}><Icon name="pencil" size={16} />{t(locale, "dashboard.manage")}</Link>}
          </div>
          <div className="periods">
            {last && (
              <article className="card period" data-state="validated">
                <header>
                  <h3>{t(locale, "dashboard.periods.name", { n: last.n })}</h3>
                  <span className="pill good">{t(locale, "dashboard.periods.validated")}</span>
                </header>
                <p className="muted small">{d(last.startsOn)} – {d(last.endsOn)}</p>
                <dl>
                  <div><dt>{t(locale, "dashboard.periods.validatedEur")}</dt><dd className="big">{eur.format(validatedEur(last) ?? 0)}</dd></div>
                  <div><dt>{t(locale, "dashboard.periods.budget")}</dt><dd>{eur.format(budgetEur(last))}</dd></div>
                </dl>
                {last.tpaFrom && last.tpaTo && <p className="small">{t(locale, "dashboard.periods.visit", { from: d(last.tpaFrom), to: d(last.tpaTo) })}</p>}
                {note(last, locale) && <p className="small muted">{note(last, locale)}</p>}
              </article>
            )}
            {next && (
              <article className="card period" data-state="open">
                <header>
                  <h3>{t(locale, "dashboard.periods.name", { n: next.n })}</h3>
                  <span className="pill info">{daysLeft(next) > 0 ? tn(locale, "dashboard.periods.daysLeft", daysLeft(next)) : t(locale, "dashboard.periods.ended")}</span>
                </header>
                <p className="muted small">{d(next.startsOn)} – {d(next.endsOn)}</p>
                <dl>
                  <div><dt>{t(locale, "dashboard.periods.forecastEur")}</dt><dd className="big">{eur.format(budgetEur(next))}</dd></div>
                  <div><dt>{t(locale, "dashboard.periods.nextTpa")}</dt><dd>{t(locale, "dashboard.periods.after", { date: d(next.endsOn) })}</dd></div>
                </dl>
                {note(next, locale) && <p className="small muted">{note(next, locale)}</p>}
                <p className="small">{t(locale, "dashboard.periods.p2note")}</p>
              </article>
            )}
          </div>
        </>
      )}

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
              <th className="num">{colP2}</th>
              <th className="num">{t(locale, "dashboard.col.final")}</th>
              <th className="num">{t(locale, "dashboard.col.eur")}</th>
              <th className="num">{t(locale, "dashboard.col.cap")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const href = LINK[r.source];
              const goal = goalOf(r.code);
              const due = next?.indicators[r.code]?.target ?? 0;
              const check = next ? note(next.indicators[r.code] ?? { noteEn: null, noteFr: null }, locale) : null;
              const pct = r.value === null ? null : Math.min(100, Math.round((r.value / r.finalTarget) * 100));
              const mark = goal === null ? 100 : Math.min(100, Math.round((goal / r.finalTarget) * 100));
              const toGo = r.value === null || goal === null ? null : Math.max(0, goal - r.value);
              return (
                <tr key={r.code} data-status={r.status}>
                  <td className="code">{r.code}</td>
                  <td className="ind">
                    {href && r.status === "live" ? <Link href={`/${locale}/${href}`}>{name(r)}</Link> : name(r)}
                    <div className="muted small">{t(locale, `dashboard.source.${r.source}`)} · {t(locale, `dashboard.status.${r.status}`)}</div>
                    {r.secondary && <div className="muted small">{t(locale, `dashboard.${r.secondary.key}`, { n: nf.format(r.secondary.value) })}</div>}
                    {!!r.late && <div className="warn small">{tn(locale, "dashboard.late", r.late)}{canReview && <> · <Link href={`/${locale}/admin/evidence`}>{t(locale, "dashboard.lateLink")}</Link></>}</div>}
                    {check && <p className="assessor small"><Icon name="info" size={14} /><span><b>{t(locale, "dashboard.assessor")}:</b> {check}</span></p>}
                    {pct !== null && (
                      <div className="bar" role="img" aria-label={t(locale, "dashboard.pct", { n: pct, m: mark })}>
                        <span style={{ width: `${pct}%` }} />
                        {mark < 100 && <i style={{ left: `${mark}%` }} title={colP2} />}
                      </div>
                    )}
                  </td>
                  <td className="num big" data-label={c("value")}>{n(r.value)}</td>
                  <td className="num" data-label={c("p1")}>{nf.format(validatedToDate(periods, r.code))}</td>
                  <td className="num milestone" data-label={colP2}>
                    <b>{n(goal)}</b>
                    {next && <div className="muted small">{due > 0 ? t(locale, "dashboard.inPeriod", { n: nf.format(due), p: next.n }) : t(locale, "dashboard.noneInPeriod")}</div>}
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

      {outcomes.length > 0 && (
        <>
          <div className="h2-row">
            <h2>{t(locale, "dashboard.outcomes.title")}</h2>
            {canManage && <Link className="btn ghost sm" href={`/${locale}/admin/periods/outcomes`}><Icon name="pencil" size={16} />{t(locale, "dashboard.admin.editOutcomes")}</Link>}
          </div>
          <p className="muted">{t(locale, "dashboard.outcomes.intro")}</p>
          <div className="table-wrap">
            <table className="dash outcomes">
              <thead>
                <tr>
                  <th>{c("code")}</th>
                  <th>{c("name")}</th>
                  <th>{t(locale, "dashboard.outcomes.target")}</th>
                  <th>{t(locale, "dashboard.outcomes.reported")}</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((o) => (
                  <tr key={o.code} data-status="live">
                    <td className="code">{o.code}</td>
                    <td className="ind">{t(locale, `dashboard.outcomes.name.o${o.code.replace(".", "")}`)}</td>
                    <td className="num" data-label={t(locale, "dashboard.outcomes.target")}>{locale === "fr" ? o.targetFr : o.targetEn}</td>
                    <td className="num" data-label={t(locale, "dashboard.outcomes.reported")}>
                      {(locale === "fr" ? o.reportedFr || o.reportedEn : o.reportedEn || o.reportedFr) ?? "–"}
                      {o.reportedOn && <div className="muted small">{t(locale, "dashboard.outcomes.asOf", { date: d(o.reportedOn) })}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
