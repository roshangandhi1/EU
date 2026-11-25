import { classResults, formatScore, periodsIn, type Span } from "@eu/schools";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyRow, Section } from "@/components/ui";
import { can, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { param, type SP } from "../../../../flash";
import { classLabel, studentName } from "../../../labels";
import { MarksNav } from "../../nav";
import { PrintButton } from "../../print-button";
import { marksContext, periodLong, termLabel } from "../../shared";
import "../../marks.css";

/** One pupil's marks for the year: subjects down, periods and trimester totals across, with rank and mention. */
export default async function PupilResults({ params, searchParams }: { params: Promise<{ locale: string; siteId: string; studentId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const d = await schoolFor(me, p.siteId);
  const student = d.students.find((s) => s.id === p.studentId);
  if (!student) notFound();
  // The class: the one asked for, else the pupil's current class this year.
  const guess = d.enrolments.find((e) => !e.voidedAt && e.studentId === student.id && e.status === "active")?.classId ?? "";
  const ctx = marksContext(d, p.siteId, today(), param(sp, "class") || guess, locale);
  const base = `/${locale}/schools/${p.siteId}/marks`;
  const nav = <MarksNav base={base} active="results" siteId={p.siteId} locale={locale} tr={tr} canConfigure={can(me, "school.configure", p.siteId)} classId={ctx.cls?.id} />;
  const cls = ctx.cls;
  if (!cls) return <div className="stack">{nav}<EmptyRow icon="users" title={tr("marks.noClassForPupil")} /></div>;

  const subjects = ctx.subjectsOf(cls.level).subjects;
  const idx = ctx.index(cls.id);
  const ids = ctx.pupilsOf(cls.id).map((s) => s.id);
  if (!ids.includes(student.id)) ids.push(student.id);
  const terms = [...new Set(ctx.periods.map((x) => x.term))];
  type Col = { key: string; label: string; title: string; span: Span; strong?: boolean };
  const cols: Col[] = [];
  for (const n of terms) {
    for (const x of ctx.periods.filter((y) => y.term === n)) cols.push({ key: x.key, label: x.key, title: periodLong(x, locale, tr), span: { kind: "period", key: x.key } });
    cols.push({ key: `T${n}`, label: `T${n}`, title: termLabel(n, locale, tr), span: { kind: "term", term: n }, strong: true });
  }
  cols.push({ key: "Y", label: tr("marks.yearShort"), title: tr("marks.wholeYear"), span: { kind: "year" }, strong: true });
  const results = new Map(cols.map((c) => {
    const r = classResults({ studentIds: ids, subjects, periods: periodsIn(ctx.scheme, c.span), marks: idx, scheme: ctx.scheme });
    return [c.key, { me: r.rows.find((x) => x.studentId === student.id)!, ranked: r.ranked }];
  }));
  const num = (n: number) => formatScore(Math.round(n * 2) / 2, locale);
  const pct = (n: number | null) => (n == null ? "—" : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(n)} %`);
  const cellCls = (c: Col) => `num${c.strong ? " ms-strong ms-col-total" : ""}`;

  return (
    <div className="stack marks-root">
      {nav}
      <div className="print-head">
        <h1>{d.site.name}</h1>
        <p>{tr("marks.pupilSheet")} · {studentName(student)} ({student.studentNumber}) · {classLabel(cls, tr)} · {ctx.year?.label}</p>
        <p>{tr("marks.schemeLine", { name: ctx.scheme.name, pass: ctx.scheme.passPercent })}</p>
      </div>
      <Section className="marks-sec" id="pupil" flush icon="user" title={studentName(student)} description={`${student.studentNumber} · ${classLabel(cls, tr)} · ${ctx.year?.label ?? ""}`}
        actions={<><PrintButton label={tr("marks.print")} /><Link className="btn ghost sm no-print" href={`${base}/results?class=${cls.id}`}>{tr("marks.backToClass")}</Link></>}>
        <div className="marks-grid-wrap">
          <table className="grid marks-sheet">
            <thead>
              <tr>
                <th className="mg-pupil">{tr("marks.subject")}</th>
                {cols.map((c) => <th key={c.key} className={`num${c.strong ? " ms-col-total" : ""}`} title={c.title}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.code}>
                  <th scope="row" className="mg-pupil">{s.name}<span className="ms-sub">{tr("marks.perPeriod", { max: s.maxPoints })}</span></th>
                  {cols.map((c) => {
                    const x = results.get(c.key)!.me.bySubject.get(s.code)!;
                    const single = c.span.kind === "period";
                    const m = single ? idx.get(`${student.id}|${s.code}|${c.key}`) : undefined;
                    return (
                      <td key={c.key} className={cellCls(c)}>
                        {single ? (m ? (m.absent ? <span className="pill warn">{tr("marks.absentShort")}</span> : num(m.score ?? 0)) : <span className="muted">·</span>)
                          : x.max === 0 ? <span className="muted">—</span> : <>{num(x.obtained)}<span className="ms-sub">/ {num(x.max)}</span></>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="mg-pupil">{tr("common.total")}</th>
                {cols.map((c) => { const r = results.get(c.key)!.me; return <td key={c.key} className={cellCls(c)}>{r.max ? num(r.obtained) : "—"}</td>; })}
              </tr>
              <tr>
                <th scope="row" className="mg-pupil">{tr("marks.maximum")}</th>
                {cols.map((c) => { const r = results.get(c.key)!.me; return <td key={c.key} className={cellCls(c)}>{r.max ? num(r.max) : "—"}</td>; })}
              </tr>
              <tr>
                <th scope="row" className="mg-pupil">%</th>
                {cols.map((c) => <td key={c.key} className={cellCls(c)}>{pct(results.get(c.key)!.me.percent)}</td>)}
              </tr>
              <tr>
                <th scope="row" className="mg-pupil">{tr("marks.rank")}</th>
                {cols.map((c) => { const r = results.get(c.key)!; return <td key={c.key} className={cellCls(c)}>{r.me.rank ? `${r.me.rank}/${r.ranked}` : "—"}</td>; })}
              </tr>
              <tr>
                <th scope="row" className="mg-pupil">{tr("marks.mention")}</th>
                {cols.map((c) => { const m = results.get(c.key)!.me.mention; return <td key={c.key} className={cellCls(c)}>{m ? m[locale] : "—"}</td>; })}
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="print-sign"><span>{tr("marks.signTeacher")}</span><span>{tr("marks.signHead")}</span><span>{tr("marks.signParent")}</span></div>
      </Section>
    </div>
  );
}
