import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isLocale, t } from "@eu/core/i18n";
import type { CountingMode } from "@eu/forestry";
import { currentPrincipal } from "@/lib/session";
import { permissions } from "@/lib/registry";
import { isIsoDate, todayDrc } from "@/lib/dates";
import { loadDashboard, totals, type IndicatorRow } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

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
    return <p className="error">{t(locale, "dashboard.forbidden")}</p>;
  }
  const sp = await searchParams;
  const today = todayDrc();
  const asAt = isIsoDate(sp.asAt) ? sp.asAt : today;
  const mode: CountingMode = sp.mode === "evidence" ? "evidence" : "captured";
  const rows = await loadDashboard(asAt, mode, today);
  const sum = totals(rows);
  const nf = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 2 });
  const eur = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 0 });
  const n = (v: number | null) => (v === null ? "–" : nf.format(v));

  return (
    <section className="module dashboard">
      <h1>{t(locale, "dashboard.title")}</h1>
      <p className="muted">{t(locale, "dashboard.intro")}</p>

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
                    {href && r.status === "live" ? <Link href={`/${locale}/${href}`}>{t(locale, `dashboard.name.i${r.code.replaceAll(".", "")}`)}</Link> : t(locale, `dashboard.name.i${r.code.replaceAll(".", "")}`)}
                    <div className="muted small">{t(locale, `dashboard.source.${r.source}`)} · {t(locale, `dashboard.status.${r.status}`)}</div>
                    {r.secondary && <div className="muted small">{t(locale, `dashboard.${r.secondary.key}`, { n: nf.format(r.secondary.value) })}</div>}
                    {!!r.late && <div className="warn small">{t(locale, "dashboard.late", { n: r.late })}</div>}
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
