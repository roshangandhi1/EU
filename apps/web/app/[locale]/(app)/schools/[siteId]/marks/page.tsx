import { BEHAVIOUR, formatScore, lettersOf, maxFor } from "@eu/schools";
import { t } from "@eu/core/i18n";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { EmptyRow, Notice, Section } from "@/components/ui";
import { can, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { Flash, param, type SP } from "../../flash";
import { classLabel, studentName } from "../labels";
import { saveMarks } from "./actions";
import { MarksGrid, type GridColumn } from "./grid";
import { MarksNav } from "./nav";
import { marksContext, periodLong } from "./shared";
import "./marks.css";

/** Marks entry: pick a class and a period, then type the paper mark sheet into the grid. */
export default async function Marks({ params, searchParams }: { params: Promise<{ locale: string; siteId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const d = await schoolFor(me, p.siteId);
  const ctx = marksContext(d, p.siteId, today(), param(sp, "class"), locale);
  const base = `/${locale}/schools/${p.siteId}/marks`;
  const canWrite = can(me, "marks.write", p.siteId);
  const canConfigure = can(me, "school.configure", p.siteId);
  const period = ctx.periods.find((x) => x.key === param(sp, "period")) ?? ctx.periods[0]!;
  const cls = ctx.cls;

  if (!ctx.year || ctx.classes.length === 0) {
    return (
      <div className="stack">
        <MarksNav base={base} active="entry" siteId={p.siteId} locale={locale} tr={tr} canConfigure={canConfigure} />
        <div className="empty-state">
          <div className="es-icon"><Icon name="list" size={28} /></div>
          <h3>{tr("ux.noClasses")}</h3>
          <p>{tr("ux.noClassesHint")}</p>
        </div>
      </div>
    );
  }

  const messages = (
    <>
      {param(sp, "error") === "marks_bad" ? <Notice tone="error">{tr("marks.badSaved", { n: param(sp, "n") })}</Notice> : <Flash sp={sp} tr={tr} />}
      {param(sp, "marks_saved") && <Notice tone="success">{tr("marks.saved", { n: param(sp, "marks_saved") })}</Notice>}
      {param(sp, "marks_nothing") && <Notice>{tr("marks.nothing")}</Notice>}
    </>
  );

  const filter = (
    <form method="get" className="filterbar inset marks-filter">
      <label className="tb-field">{tr("common.class")}
        <select className="ctl" name="class" defaultValue={cls?.id ?? ""}>
          <option value="">{tr("marks.chooseClass")}</option>
          {ctx.classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c, tr)}</option>)}
        </select>
      </label>
      <label className="tb-field">{tr("marks.period")}
        <select className="ctl" name="period" defaultValue={period.key}>
          {ctx.periods.map((x) => <option key={x.key} value={x.key}>{x.key} · {periodLong(x, locale, tr)}</option>)}
        </select>
      </label>
      {cls && (
        <label className="tb-field">{tr("marks.subject")}
          <select className="ctl" name="subject" defaultValue={param(sp, "subject")}>
            <option value="">{tr("marks.allSubjects")}</option>
            {ctx.subjectsOf(cls.level).subjects.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </label>
      )}
      <button className="btn secondary" type="submit">{tr("ux.show")}</button>
    </form>
  );

  // Without a class: how far each class has got, period by period.
  if (!cls) {
    return (
      <div className="stack">
        <MarksNav base={base} active="entry" siteId={p.siteId} locale={locale} tr={tr} canConfigure={canConfigure} />
        {messages}
        {ctx.schemeSource === "default" && <Notice>{tr("marks.defaultScheme", { name: ctx.scheme.name })}</Notice>}
        <Section className="marks-sec" id="progress" flush icon="list" title={tr("marks.progressTitle")} description={tr("marks.progressIntro")}>
          <div className="marks-grid-wrap">
            <table className="grid marks-progress">
              <thead>
                <tr>
                  <th className="mg-pupil">{tr("common.class")}</th>
                  {ctx.periods.map((x) => <th key={x.key} className="num" title={periodLong(x, locale, tr)}>{x.key}</th>)}
                </tr>
              </thead>
              <tbody>
                {ctx.classes.map((c) => {
                  const pupils = ctx.pupilsOf(c.id);
                  const subjects = ctx.subjectsOf(c.level).subjects;
                  const idx = ctx.index(c.id);
                  return (
                    <tr key={c.id}>
                      <th scope="row" className="mg-pupil"><Link href={`${base}?class=${c.id}&period=${period.key}`}>{classLabel(c, tr)}</Link><span className="muted small"> · {tr("ux.showing", { n: pupils.length })}</span></th>
                      {ctx.periods.map((x) => {
                        const expected = pupils.length * subjects.length;
                        let got = 0;
                        for (const s of pupils) for (const sub of subjects) if (idx.has(`${s.id}|${sub.code}|${x.key}`)) got++;
                        const pct = expected ? Math.round((got / expected) * 100) : 0;
                        return (
                          <td key={x.key} className="num">
                            <Link href={`${base}?class=${c.id}&period=${x.key}`} className={`pill ${got === 0 ? "" : pct >= 100 ? "good" : "warn"}`} title={tr("marks.entered", { n: got, total: expected })}>
                              {got === 0 ? "—" : `${pct} %`}
                            </Link>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
        <Section className="marks-sec" id="pick" icon="list" title={tr("marks.enterTitle")} description={tr("marks.enterIntro")}>
          {filter}
        </Section>
      </div>
    );
  }

  const subjects = ctx.subjectsOf(cls.level).subjects;
  const shown = subjects.filter((s) => !param(sp, "subject") || s.code === param(sp, "subject"));
  const pupils = ctx.pupilsOf(cls.id);
  const idx = ctx.index(cls.id);
  const columns: GridColumn[] = shown.map((s) => {
    const max = maxFor(s, period, ctx.scheme);
    return { key: s.code, subject: s.code, period: period.key, title: s.branch ? `${s.branch} · ${s.name}` : s.name, sub: `/ ${max}`, max };
  });
  // Application and Conduite: a letter per period (not for exams), after the subjects.
  if (period.kind === "period" && !param(sp, "subject"))
    for (const code of BEHAVIOUR) columns.push({ key: code, subject: code, period: period.key, title: tr(`marks.${code.slice(1)}`), sub: lettersOf(ctx.scheme).join(" "), max: 0, letters: lettersOf(ctx.scheme) });
  const values: Record<string, string> = {};
  for (const s of pupils) for (const c of columns) {
    const m = idx.get(`${s.id}|${c.subject}|${c.period}`);
    if (m) values[`${s.id}|${c.subject}|${c.period}`] = m.letter ?? (m.absent ? "A" : m.score != null ? formatScore(m.score, locale) : "");
  }

  return (
    <div className="stack">
      <MarksNav base={base} active="entry" siteId={p.siteId} locale={locale} tr={tr} canConfigure={canConfigure} classId={cls.id} />
      {messages}
      {filter}
      <Section className="marks-sec" id="sheet" flush icon="list" title={`${classLabel(cls, tr)} · ${period.key}`} description={periodLong(period, locale, tr)} count={pupils.length}
        actions={<Link className="btn ghost sm" href={`${base}/results?class=${cls.id}&span=${period.key}`}><Icon name="chart" size={15} />{tr("marks.seeResults")}</Link>}>
        {pupils.length === 0 ? <EmptyRow icon="users" title={tr("ux.noRoster")} /> : !canWrite ? <Notice tone="warning">{tr("common.forbidden")}</Notice> : (
          <MarksGrid
            key={`${cls.id}:${period.key}:${param(sp, "subject")}:${param(sp, "t")}`}
            action={saveMarks}
            hidden={{ locale, siteId: p.siteId, classId: cls.id, period: period.key, subject: param(sp, "subject") }}
            pupils={pupils.map((s) => ({ id: s.id, name: studentName(s), number: s.studentNumber }))}
            columns={columns}
            values={values}
            locale={locale}
            l={{
              pupil: tr("marks.pupil"), total: tr("common.total"), save: tr("marks.save"), saving: t(locale, "ui.form.saving"), unsaved: t(locale, "ui.form.unsaved"),
              noChanges: tr("marks.nothing"), hint: tr("marks.gridHint"),
              errors: { format: tr("marks.errFormat"), step: tr("marks.errStep"), range: tr("marks.errRange"), letter: tr("marks.errLetter") },
              badCount: tr("marks.badCount"), filled: tr("marks.filled"), absentShort: tr("marks.absentShort"),
            }}
          />
        )}
      </Section>
    </div>
  );
}
