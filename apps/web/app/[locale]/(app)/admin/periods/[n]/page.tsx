import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Field, Fields, FormFooter, Notice, PageHeader, Section, SubmitButton } from "@/components/ui";
import { adminAccess } from "@/lib/access";
import { NoAccess } from "@/components/no-access";
import { titled } from "@/lib/meta";
import { t } from "@eu/core/i18n";
import { db } from "@/lib/http";
import { fmtDate, fmtEur, fmtNum } from "@/lib/format";
import { INDICATORS } from "@/lib/indicator-defs";
import { budgetEur, loadPeriods, milestone, validatedEur } from "@/lib/periods";
import { savePeriodAction } from "../actions";

export const dynamic = "force-dynamic";
export const generateMetadata = titled("ui.nav.periods");

export default async function PeriodPage({ params, searchParams }: { params: Promise<{ locale: string; n: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const p0 = await params;
  const { locale, allowed } = await adminAccess(p0.locale, "periods.manage");
  if (!allowed) return <NoAccess locale={locale} />;
  const a = (k: string, v?: Record<string, string | number>) => t(locale, `dashboard.admin.${k}`, v);
  const sp = await searchParams;
  const periods = await loadPeriods(db());
  const p = periods.find((x) => String(x.n) === p0.n);
  if (!p) notFound();
  const v = validatedEur(p);
  // Plain digits (no grouping) so the value parses back exactly; parseDecimal reads "," as a decimal mark.
  const num = (x: number | null | undefined) => (x === null || x === undefined ? "" : String(x));
  return (
    <section className="period-edit">
      <PageHeader icon={<Icon name="coins" size={24} />} eyebrow={t(locale, "ui.nav.periods")} title={a("editTitle", { n: p.n })}
        subtitle={`${fmtDate(p.startsOn, locale)} – ${fmtDate(p.endsOn, locale)} · ${a("budget")} ${fmtEur(budgetEur(p), locale)}${v !== null ? ` · ${a("validatedEur")} ${fmtEur(v, locale)}` : ""}`}
        actions={<Link className="btn ghost sm" href={`/${locale}/admin/periods`}><Icon name="back" size={15} />{a("back")}</Link>} />
      {sp.ok && <Notice tone="success">{a("saved")}</Notice>}
      {sp.error && <Notice tone="error">{a(`errors.${sp.error}`)}</Notice>}
      <form action={savePeriodAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="n" value={p.n} />
        <Section icon="calendar" title={a("details")}>
          <Fields>
            <Field span={3} label={a("startsOn")}><input type="date" name="startsOn" required defaultValue={p.startsOn} /></Field>
            <Field span={3} label={a("endsOn")}><input type="date" name="endsOn" required defaultValue={p.endsOn} /></Field>
            <Field span={6} label={a("status")}>
              <select name="status" defaultValue={p.status}>
                <option value="open">{a("open")}</option>
                <option value="validated">{a("validated")}</option>
              </select>
            </Field>
            <Field span={3} label={a("tpaFrom")} optional={t(locale, "ui.form.optional")}><input type="date" name="tpaFrom" defaultValue={p.tpaFrom ?? ""} /></Field>
            <Field span={3} label={a("tpaTo")} optional={t(locale, "ui.form.optional")}><input type="date" name="tpaTo" defaultValue={p.tpaTo ?? ""} /></Field>
            <Field span={6} label={a("noteEn")} optional={t(locale, "ui.form.optional")}><textarea name="noteEn" rows={2} defaultValue={p.noteEn ?? ""} /></Field>
            <Field span={6} label={a("noteFr")} optional={t(locale, "ui.form.optional")}><textarea name="noteFr" rows={2} defaultValue={p.noteFr ?? ""} /></Field>
          </Fields>
        </Section>
        <Section icon="chart" title={a("indicators")} description={a("editIntro")} flush>
          <div className="ptable">
            <div className="ptable-head" aria-hidden>
              <span>{a("indicator")}</span><span>{a("target")}</span><span>{a("validatedUnits")}</span><span>{a("milestone")}</span>
            </div>
            {INDICATORS.map((d) => {
              const k = d.code.replaceAll(".", "_");
              const r = p.indicators[d.code];
              const name = t(locale, `dashboard.name.i${d.code.replaceAll(".", "")}`);
              return (
                <div className="ptable-row" key={d.code}>
                  <div className="ptable-ind">
                    <b>{d.code}</b> {name}
                    <div className="muted small">{a("unit")}: {fmtEur(d.unitEur, locale)} · {t(locale, "dashboard.col.final")}: {fmtNum(d.finalTarget, locale)} ({d.finalYear})</div>
                  </div>
                  <label className="ptable-num"><span className="ptable-lbl">{a("target")}</span>
                    <input name={`t_${k}`} inputMode="decimal" aria-label={`${d.code} ${a("target")}`} defaultValue={num(r?.target ?? 0)} pattern="[0-9]+([.,][0-9]+)?" required /></label>
                  <label className="ptable-num"><span className="ptable-lbl">{a("validatedUnits")}</span>
                    <input name={`v_${k}`} inputMode="decimal" aria-label={`${d.code} ${a("validatedUnits")}`} defaultValue={num(r?.validated)} pattern="[0-9]+([.,][0-9]+)?" /></label>
                  <div className="ptable-num ptable-ms"><span className="ptable-lbl">{a("milestone")}</span>{fmtNum(milestone(periods, p.n, d.code), locale, 2)}</div>
                  <details className="ptable-note" open={!!(r?.noteEn || r?.noteFr)}>
                    <summary>{a("assessorNote")}</summary>
                    <div className="ptable-notes">
                      <label><span className="ptable-lbl">{a("noteEn")}</span><textarea name={`nen_${k}`} rows={3} defaultValue={r?.noteEn ?? ""} /></label>
                      <label><span className="ptable-lbl">{a("noteFr")}</span><textarea name={`nfr_${k}`} rows={3} defaultValue={r?.noteFr ?? ""} /></label>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        </Section>
        <FormFooter><SubmitButton icon="check">{a("save")}</SubmitButton></FormFooter>
      </form>
    </section>
  );
}
