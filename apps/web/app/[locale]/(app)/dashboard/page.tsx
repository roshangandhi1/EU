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
import { NoAccess } from "@/components/no-access";
import { CsvButton } from "@/components/csv-button";
import { fmtEur, tn } from "@/lib/format";
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
    [c("code"), c("name"), c("value"), c("t2027"), c("t2030"), c("eur"), c("cap"), t(locale, "dashboard.csvCols.status"), t(locale, "dashboard.csvCols.source"), t(locale, "dashboard.csvCols.asAt"), t(locale, "dashboard.csvCols.mode")],
    ...rows.map((r) => [r.code, name(r), r.value, r.target2027, r.target2030, r.valueEur, r.capEur, t(locale, `dashboard.status.${r.status}`), t(locale, `dashboard.source.${r.source}`), asAt, t(locale, `forestry.mode.${mode}`)]),
  ];
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
              <th className="num">{t(locale, "dashboard.col.t2027")}</th>
              <th className="num">{t(locale, "dashboard.col.t2030")}</th>
              <th className="num">{t(locale, "dashboard.col.eur")}</th>
              <th className="num">{t(locale, "dashboard.col.cap")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const href = LINK[r.source];
              const pct = r.value === null ? null : Math.min(100, Math.round((r.value / r.target2030) * 100));
              return (
                <tr key={r.code} data-status={r.status}>
                  <td>{r.code}</td>
                  <td>
                    {href && r.status === "live" ? <Link href={`/${locale}/${href}`}>{name(r)}</Link> : name(r)}
                    <div className="muted small">{t(locale, `dashboard.source.${r.source}`)} · {t(locale, `dashboard.status.${r.status}`)}</div>
                    {r.secondary && <div className="muted small">{t(locale, `dashboard.${r.secondary.key}`, { n: nf.format(r.secondary.value) })}</div>}
                    {!!r.late && <div className="warn small">{tn(locale, "dashboard.late", r.late)}{canReview && <> · <Link href={`/${locale}/admin/evidence`}>{t(locale, "dashboard.lateLink")}</Link></>}</div>}
                    {pct !== null && (
                      <div className="bar" role="img" aria-label={t(locale, "dashboard.pct", { n: pct })}><span style={{ width: `${pct}%` }} /></div>
                    )}
                  </td>
                  <td className="num big">{n(r.value)}</td>
                  <td className="num">{r.target2027 === null ? "–" : nf.format(r.target2027)}</td>
                  <td className="num">{nf.format(r.target2030)}</td>
                  <td className="num">{r.valueEur === null ? "–" : eur.format(r.valueEur)}</td>
                  <td className="num muted">{eur.format(r.capEur)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
