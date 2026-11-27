import { classResults, formatScore, maxFor, parseSpan, periodsIn, spanKey, type Span } from "@eu/schools";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { EmptyRow, Notice, Section } from "@/components/ui";
import { can, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { param, type SP } from "../../../flash";
import { classLabel, studentName } from "../../labels";
import { MarksNav } from "../nav";
import { PrintButton } from "../print-button";
import { marksContext, periodLong, spanLabel, termLabel } from "../shared";
import "../marks.css";

/** Class results sheet for a period, a trimester or the year: totals, percentage, rank and mention. Printable. */
export default async function Results({ params, searchParams }: { params: Promise<{ locale: string; siteId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const d = await schoolFor(me, p.siteId);
  const ctx = marksContext(d, p.siteId, today(), param(sp, "class"), locale);
  const base = `/${locale}/schools/${p.siteId}/marks`;
  const canConfigure = can(me, "school.configure", p.siteId);
  const cls = ctx.cls ?? ctx.classes[0];
  const nav = <MarksNav base={base} active="results" siteId={p.siteId} locale={locale} tr={tr} canConfigure={canConfigure} classId={cls?.id} />;
  if (!cls) {
    return <div className="stack">{nav}<EmptyRow icon="list" title={tr("ux.noClasses")}>{tr("ux.noClassesHint")}</EmptyRow></div>;
  }

  const idx = ctx.index(cls.id);
  // Default: the latest period that has marks in this class, else the first.
  const withMarks = ctx.periods.filter((x) => [...idx.values()].some((m) => m.period === x.key));
  const fallback: Span = { kind: "period", key: (withMarks.at(-1) ?? ctx.periods[0]!).key };
  const asked = parseSpan(param(sp, "span"));
  const span = asked && periodsIn(ctx.scheme, asked).length ? asked : fallback;
  const periods = periodsIn(ctx.scheme, span);
  const subjects = ctx.subjectsOf(cls.level).subjects;
  const pupils = ctx.pupilsOf(cls.id);
  const res = classResults({ studentIds: pupils.map((s) => s.id), subjects, periods, marks: idx, scheme: ctx.scheme });
  const byId = new Map(res.rows.map((r) => [r.studentId, r]));
  const order = [...pupils].sort((a, b) => {
    const ra = byId.get(a.id)?.rank ?? Infinity, rb = byId.get(b.id)?.rank ?? Infinity;
    return ra - rb || studentName(a).localeCompare(studentName(b));
  });
  const subjectMax = (code: string) => {
    const s = subjects.find((x) => x.code === code)!;
    return periods.reduce((n, x) => n + maxFor(s, x, ctx.scheme), 0);
  };
  const fullMax = subjects.reduce((n, s) => n + subjectMax(s.code), 0);
  const num = (n: number) => formatScore(Math.round(n * 2) / 2, locale);
  const pct = (n: number | null) => (n == null ? "—" : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(n)} %`);
  const mention = (m: { en: string; fr: string } | null) => (m ? m[locale] : "—");
  const title = `${classLabel(cls, tr)} · ${spanLabel(span, ctx.periods, locale, tr, ctx.sem)}`;
  const sep = locale === "fr" ? " : " : ": ";
  const terms = [...new Set(ctx.periods.map((x) => x.term))];

  return (
    <div className="stack marks-root">
      {nav}
      <form method="get" className="filterbar inset marks-filter no-print">
        <label className="tb-field">{tr("common.class")}
          <select className="ctl" name="class" defaultValue={cls.id}>
            {ctx.classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c, tr)}</option>)}
          </select>
        </label>
        <label className="tb-field">{tr("marks.span")}
          <select className="ctl" name="span" defaultValue={spanKey(span)}>
            <optgroup label={tr("marks.periods")}>
              {ctx.periods.map((x) => <option key={x.key} value={x.key}>{x.key} · {periodLong(x, locale, tr, ctx.sem)}</option>)}
            </optgroup>
            <optgroup label={tr("marks.terms")}>
              {terms.map((n) => <option key={n} value={`T${n}`}>{termLabel(n, locale, tr, ctx.sem)}</option>)}
            </optgroup>
            <option value="Y">{tr("marks.wholeYear")}</option>
          </select>
        </label>
        <button className="btn secondary" type="submit">{tr("ux.show")}</button>
      </form>

      <div className="print-head">
        <h1>{d.site.name}</h1>
        <p>{tr("marks.sheetTitle")} · {title} · {ctx.year?.label}</p>
        <p>{tr("marks.schemeLine", { name: ctx.scheme.name, pass: ctx.scheme.passPercent })}</p>
      </div>

      <Section className="marks-sec" id="sheet" flush icon="chart" title={title} description={span.kind === "year" ? ctx.year?.label : `${ctx.year?.label ?? ""} · ${periods.map((x) => x.key).join(" + ")}`} count={pupils.length}
        actions={<><Link className="btn secondary sm no-print" href={`${base}/bulletin?class=${cls.id}`}>{tr("marks.bulletins")}</Link><PrintButton label={tr("marks.print")} /><Link className="btn ghost sm no-print" href={`${base}?class=${cls.id}${span.kind === "period" ? `&period=${span.key}` : ""}`}>{tr("marks.toEntry")}</Link></>}>
        {res.missing > 0 && <div className="no-print" style={{ margin: "0 20px 12px" }}><Notice tone="warning">{tr("marks.incomplete", { n: res.missing })}</Notice></div>}
        {pupils.length === 0 ? <EmptyRow icon="users" title={tr("ux.noRoster")} /> : (
          <>
            <div className="marks-grid-wrap">
              <table className="grid marks-sheet">
                <thead>
                  <tr>
                    <th className="num">{tr("marks.rank")}</th>
                    <th className="mg-pupil">{tr("marks.pupil")}</th>
                    {subjects.map((s) => <th key={s.code} className="num mg-col"><span className="mg-title">{s.name}</span><span className="mg-max">/ {num(subjectMax(s.code))}</span></th>)}
                    <th className="num">{tr("common.total")}<span className="ms-sub">/ {num(fullMax)}</span></th>
                    <th className="num">%</th>
                    <th>{tr("marks.mention")}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.map((s) => {
                    const r = byId.get(s.id)!;
                    return (
                      <tr key={s.id}>
                        <td className="num ms-strong">{r.rank ?? "—"}</td>
                        <th scope="row" className="mg-pupil">
                          <Link href={`${base}/pupil/${s.id}?class=${cls.id}`}>{studentName(s)}</Link>
                          <span className="ms-sub">{s.studentNumber}</span>
                        </th>
                        {subjects.map((sub) => {
                          const x = r.bySubject.get(sub.code)!;
                          return <td key={sub.code} className="num" title={x.missing ? tr("marks.missingN", { n: x.missing }) : undefined}>{x.max === 0 ? <span className="muted">—</span> : <>{num(x.obtained)}{x.absent > 0 && <span className="ms-sub">{tr("marks.absentN", { n: x.absent })}</span>}</>}</td>;
                        })}
                        <td className="num ms-strong">{r.max === 0 ? "—" : num(r.obtained)}{r.missing > 0 && r.max > 0 && <span className="ms-missing">{tr("marks.missingN", { n: r.missing })}</span>}</td>
                        <td className="num ms-strong">{pct(r.percent)}</td>
                        <td>{r.mention ? <span className={`pill ${r.passed ? "good" : "bad"}`}>{mention(r.mention)}</span> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="marks-summary">
              <span>{tr("marks.ranked")}{sep}<b>{res.ranked}</b> / {pupils.length}</span>
              <span>{tr("marks.passed", { pass: ctx.scheme.passPercent })}{sep}<b>{res.passed}</b> / {res.ranked}</span>
              <span>{tr("marks.average")}{sep}<b>{pct(res.average)}</b></span>
            </div>
            <div className="print-sign"><span>{tr("marks.signTeacher")}</span><span>{tr("marks.signHead")}</span></div>
          </>
        )}
      </Section>
    </div>
  );
}
