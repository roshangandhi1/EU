import { activeOn, colKey, feeGrid, feeNames, formatCdf, levelsOf, live, termKindFor } from "@eu/schools";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { t } from "@eu/core/i18n";
import { EmptyRow, Field, Fields, FormFooter, Notice, Section, SubmitButton } from "@/components/ui";
import { can, mySchools, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { Flash, param, type SP } from "../../../flash";
import { classLabel, studentName } from "../../labels";
import { FormGuard, SelectAll } from "../../../guard";
import { plural } from "../../../text";
import { bulkExempt, copyFees, saveFeeSchedule } from "./actions";

/** Whole francs with a plain space between thousands (the save action strips spaces). */
const groupDigits = (n: number, locale: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n).replace(/[\s\u00a0\u202f.,]/g, " ");

/** Fee schedule: levels down the side, terms across, one amount per cell. */
export default async function FeeSchedule({ params, searchParams }: { params: Promise<{ locale: string; siteId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  if (!can(me, "school.configure", p.siteId)) return <Notice tone="warning">{tr("setup.configureOnly")}</Notice>;
  const d = await schoolFor(me, p.siteId);
  const LV = levelsOf(d.school);
  const fc = (n: number) => formatCdf(n, locale);
  const base = `/${locale}/schools/${p.siteId}/setup`;
  const date = today();

  const years = live(d.years).sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1));
  const current = years.find((y) => y.startsOn <= date && y.endsOn >= date) ?? years[0];
  const year = years.find((y) => y.id === param(sp, "year")) ?? current;

  if (!year) {
    return (
      <div className="empty-state">
        <div className="es-icon"><Icon name="coins" size={28} /></div>
        <h3>{tr("feeGrid.noYear")}</h3>
        <p>{tr("feeGrid.noYearText")}</p>
        <div className="es-actions"><Link className="btn" href={base}>{tr("feeGrid.toSetup")}</Link></div>
      </div>
    );
  }

  const names = feeNames(d.feeItems, year.id);
  const fee = param(sp, "fee") && param(sp, "fee") !== "__new" ? param(sp, "fee") : param(sp, "fee") === "__new" ? "" : (names[0] ?? "");
  // Trimesters, then semesters: trimester levels fill the first, semester levels the second.
  const terms = live(d.terms).filter((t) => t.academicYearId === year.id).sort((a, b) => (b.kind ?? "trimester").localeCompare(a.kind ?? "trimester") || a.number - b.number);
  const defs = levelsOf(d.school);
  const columns: { termId: string | null; label: string; kind: string | null }[] = [{ termId: null, label: tr("feeGrid.wholeYear"), kind: null },
    ...terms.map((t) => ({ termId: t.id, label: tr(t.kind === "semester" ? "feeGrid.semester" : "feeGrid.term", { n: t.number }), kind: t.kind ?? "trimester" }))];
  const g = feeGrid(d.feeItems, year.id, fee);
  const cell = (c: string, l: number) => g.amounts.get(`${c}:${l}`);
  const levelTotal = (l: number) => columns.reduce((n, c) => n + (cell(colKey(c.termId), l) ?? 0), 0);
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="siteId" value={p.siteId} />
      <input type="hidden" name="yearId" value={year.id} />
    </>
  );

  // Copy sources: every year at every school this user may configure, except the one shown.
  const sources: { value: string; label: string }[] = [];
  for (const s of await mySchools(me)) {
    if (!can(me, "school.configure", s.id)) continue;
    const sd = s.id === p.siteId ? d : await schoolFor(me, s.id);
    for (const y of live(sd.years)) {
      if (s.id === p.siteId && y.id === year.id) continue;
      if (!live(sd.feeItems).some((i) => i.academicYearId === y.id)) continue;
      sources.push({ value: `${s.id}|${y.id}`, label: `${s.name} · ${y.label}` });
    }
  }

  // Pupils for bulk exemptions.
  const cls = param(sp, "class");
  const students = new Map(d.students.map((s) => [s.id, s]));
  const classes = new Map(d.classes.map((c) => [c.id, c]));
  const pupils = activeOn(d.enrolments, date, d.years)
    .filter((e) => !cls || e.classId === cls)
    .map((e) => ({ s: students.get(e.studentId), c: classes.get(e.classId) }))
    .filter((r): r is { s: NonNullable<typeof r.s>; c: NonNullable<typeof r.c> } => !!r.s && !!r.c)
    .sort((a, b) => a.c.level - b.c.level || studentName(a.s).localeCompare(studentName(b.s)));
  const exempted = new Set(live(d.exemptions).map((e) => e.studentId));
  const yearItems = live(d.feeItems).filter((i) => i.academicYearId === year.id);
  const yearClasses = live(d.classes).filter((c) => c.academicYearId === year.id).sort((a, b) => a.level - b.level || a.section.localeCompare(b.section));

  // Messages from the actions.
  const saved = param(sp, "fee_saved").split(".");
  const errors: Record<string, string> = { fee_amount: tr("feeGrid.badAmount"), fee_due: tr("feeGrid.needDue"), fee_pupils: tr("feeGrid.choosePupils") };
  const err = errors[param(sp, "error")];


  return (
    <div className="stack fee-page">
      {err ? <Notice tone="error">{err}</Notice> : <Flash sp={sp} tr={tr} />}
      {saved.length === 3 && <Notice tone="success">{tr("feeGrid.saved", { created: saved[0]!, updated: saved[1]!, voided: saved[2]! })}</Notice>}
      {param(sp, "fee_nothing") && <Notice>{tr("feeGrid.nothing")}</Notice>}
      {param(sp, "fee_copied") && <Notice tone="success">{plural(locale, tr, "feeGrid.copied", Number(param(sp, "fee_copied")))}</Notice>}
      {param(sp, "fee_skipped") && <Notice tone="warning">{tr("feeGrid.copySkipped", { names: param(sp, "fee_skipped") })}</Notice>}
      {param(sp, "fee_noterm") && <Notice tone="warning">{tr("feeGrid.copyNoTerm", { count: param(sp, "fee_noterm") })}</Notice>}
      {param(sp, "fee_terms") && <Notice>{tr("feeGrid.copyTerms", { count: param(sp, "fee_terms") })}</Notice>}
      {param(sp, "fee_exempted") && <Notice tone="success">{plural(locale, tr, "feeGrid.exempted", Number(param(sp, "fee_exempted")))}</Notice>}

      <Section id="grid" icon="coins" title={tr("feeGrid.title")} description={tr("feeGrid.intro")}
        actions={<Link className="btn ghost sm" href={base}>{tr("nav.setup")}</Link>}>
        <form method="get" className="filterbar inset">
          <label className="tb-field">{tr("feeGrid.year")}
            <select className="ctl" name="year" defaultValue={year.id}>{years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select>
          </label>
          <label className="tb-field">{tr("feeGrid.fee")}
            <select className="ctl" name="fee" defaultValue={fee || "__new"}>
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value="__new">+ {tr("feeGrid.newFee")}</option>
            </select>
          </label>
          <button className="btn secondary" type="submit">{tr("feeGrid.show")}</button>
        </form>

        {terms.length === 0 && (
          <div className="notice-tight"><Notice>{tr("feeGrid.noTerms", { year: year.label })} <Link href={`${base}#terms`}>{tr("ux.addTermsLink")}</Link></Notice></div>
        )}
        <form action={saveFeeSchedule} id="fee-grid-form">
          <FormGuard formId="fee-grid-form" message={tr("att.leave")} />
          {hidden}
          <input type="hidden" name="fee" value={fee} />
          {!fee && (
            <Fields>
              <Field span={6} label={tr("feeGrid.newFee")} hint={tr("feeGrid.newFeeHint")}><input name="newFee" required /></Field>
            </Fields>
          )}
          <div className="fee-grid-wrap">
            <table className="grid fee-grid">
              <thead>
                <tr>
                  <th className="fee-level">{tr("common.level")}</th>
                  {columns.map((c) => <th key={colKey(c.termId)} className="num">{c.label}</th>)}
                  <th className="num">{tr("feeGrid.yearTotal")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="fee-due-row">
                  <td className="muted fee-level" style={{ verticalAlign: "middle" }}>{tr("feeGrid.due")}</td>
                  {columns.map((c) => (
                    <td key={colKey(c.termId)} className="num">
                      <input className="ctl" type="date" name={`due:${colKey(c.termId)}`} defaultValue={g.dues.get(colKey(c.termId)) ?? ""} aria-label={`${tr("feeGrid.due")} · ${c.label}`} />
                    </td>
                  ))}
                  <td />
                </tr>
                {defs.map(({ level: l, name: lname }) => (
                  <tr key={l}>
                    <th scope="row" className="fee-level" style={{ top: "auto", fontSize: 14.5, color: "var(--text)", verticalAlign: "middle" }}>{lname}</th>
                    {columns.map((c) => {
                      const k = colKey(c.termId);
                      if (c.kind && termKindFor(defs, l) !== c.kind) return <td key={k} className="fee-na" aria-hidden>—</td>;
                      return (
                        <td key={k} className="num">
                          <input className="ctl num-input" name={`amt:${k}:${l}`} inputMode="numeric" pattern="[0-9 ,.]*" defaultValue={cell(k, l) != null ? groupDigits(cell(k, l)!, locale) : ""} placeholder="—" aria-label={`${lname} · ${c.label} (FC)`} />
                        </td>
                      );
                    })}
                    <td className="num" style={{ verticalAlign: "middle", fontWeight: 600 }}>{levelTotal(l) ? fc(levelTotal(l)) : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="savebar">
            <span className="savebar-status"><span className="savebar-dot" aria-hidden /><span>{fee || tr("feeGrid.newFee")} · {year.label}</span></span>
            <span className="savebar-actions"><SubmitButton variant="lime" icon="check" pending={t(locale, "ui.form.saving")}>{tr("feeGrid.save")}</SubmitButton></span>
          </div>
        </form>
      </Section>

      <Section id="copy" icon="layers" title={tr("feeGrid.copyTitle")} description={tr("feeGrid.copyIntro", { year: year.label })}>
        {sources.length === 0 ? (
          <EmptyRow icon="layers" title={tr("feeGrid.copyNone")} />
        ) : (
          <form action={copyFees}>
            {hidden}
            <Fields>
              <Field span={8} label={tr("feeGrid.copyFrom")}>
                <select name="source" required>{sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
              </Field>
            </Fields>
            <FormFooter><SubmitButton variant="secondary" pending={t(locale, "ui.form.saving")}>{tr("feeGrid.copy")}</SubmitButton></FormFooter>
          </form>
        )}
      </Section>

      <Section id="exempt" icon="tag" title={tr("feeGrid.exemptTitle")} description={tr("feeGrid.exemptIntro")}>
        <form method="get" className="filterbar inset">
          <input type="hidden" name="year" value={year.id} />
          {fee && <input type="hidden" name="fee" value={fee} />}
          <label className="tb-field">{tr("feeGrid.filterClass")}
            <select className="ctl" name="class" defaultValue={cls}>
              <option value="">{tr("feeGrid.allClasses")}</option>
              {yearClasses.map((c) => <option key={c.id} value={c.id}>{classLabel(c, tr, LV)}</option>)}
            </select>
          </label>
          <button className="btn secondary" type="submit">{tr("feeGrid.show")}</button>
        </form>
        {pupils.length === 0 ? (
          <EmptyRow icon="users" title={tr("ux.noPupils")} />
        ) : (
          <form action={bulkExempt}>
            {hidden}
            {fee && <input type="hidden" name="fee" value={fee} />}
            <SelectAll name="studentId" label={tr("feeGrid.selectAll")} />
            <div className="pick-list">
              <table className="grid fee-pupils">
                <tbody>
                  {pupils.map(({ s, c }) => (
                    <tr key={s.id}>
                      <td style={{ width: 44 }}><input className="tick" type="checkbox" name="studentId" value={s.id} aria-label={studentName(s)} /></td>
                      <td>
                        <strong>{studentName(s)}</strong> <span className="muted">· {s.studentNumber}</span>
                        <div className="fee-pupil-sub muted">{classLabel(c, tr, LV)}{exempted.has(s.id) && <span className="pill warn">{tr("feeGrid.already")}</span>}</div>
                      </td>
                      <td className="fee-wide">{classLabel(c, tr, LV)}</td>
                      <td className="fee-wide">{exempted.has(s.id) && <span className="pill warn">{tr("feeGrid.already")}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Fields>
              <Field span={6} label={tr("setup.feeName")}>
                <select name="feeItemId" defaultValue="">
                  <option value="">{tr("feeGrid.allFees")}</option>
                  {yearItems.map((i) => <option key={i.id} value={i.id}>{i.name} · {i.levels.join(", ")} · {fc(i.amount)}</option>)}
                </select>
              </Field>
              <Field span={3} label={tr("setup.kind")}>
                <select name="kind" defaultValue="full">{(["full", "percent", "fixed"] as const).map((k) => <option key={k} value={k}>{tr(`setup.kinds.${k}`)}</option>)}</select>
              </Field>
              <Field span={3} label={tr("setup.value")} hint={tr("ux.valueHint")}><input name="value" inputMode="numeric" placeholder="0" className="num-input" /></Field>
              <Field span={12} label={tr("setup.reason")}><input name="reason" required /></Field>
            </Fields>
            <FormFooter><SubmitButton icon="tag" pending={t(locale, "ui.form.saving")}>{tr("feeGrid.exempt")}</SubmitButton></FormFooter>
          </form>
        )}
      </Section>
    </div>
  );
}
