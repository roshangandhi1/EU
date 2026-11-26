import { DRC_SCHEME, LEVELS, live, maxFor, periodsOf, resolveScheme, resolveSubjects } from "@eu/schools";
import { t } from "@eu/core/i18n";
import Link from "next/link";
import { Check, ChoiceGroup, Chip, ConfirmButton, Field, Fields, Notice, Section, SubmitButton, Table } from "@/components/ui";
import { Icon } from "@/components/icons";
import { can, schoolFor, signedIn, tr as trFor } from "@/lib/schools";
import { Flash, param, type SP } from "../../../flash";
import { deleteScheme, restoreScheme, restoreSubjects, saveScheme, saveSubjects } from "./actions";
import { RestoreButton } from "../../marks/restore-button";
import { levelLabel } from "../../labels";
import "../../marks/marks.css";

const MAX_TERMS = 4;
const MAX_MENTIONS = 6;
const EXTRA_ROWS = 3;

/** Grading setup: the scheme (periods, exams, pass mark, mentions) and the subjects of each level. */
export default async function GradingSetup({ params, searchParams }: { params: Promise<{ locale: string; siteId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const canSchool = can(me, "school.configure", p.siteId);
  const canProgramme = can(me, "school.configure", null);
  if (!canSchool) return <Notice tone="warning">{tr("setup.configureOnly")}</Notice>;
  const d = await schoolFor(me, p.siteId);
  const programme = canProgramme && param(sp, "scope") === "programme";
  const scopeId = programme ? "schools" : p.siteId;
  const saving = t(locale, "ui.form.saving");
  const base = `/${locale}/schools/${p.siteId}/setup/grading`;
  const level = LEVELS.find((l) => String(l) === param(sp, "level")) ?? 1;

  // The scope's schemes (several, each for some levels; one may be the fallback for the rest).
  const schemes = live(d.gradingSchemes).filter((s) => s.scopeId === scopeId).sort((a, b) => (a.levels?.[0] ?? 99) - (b.levels?.[0] ?? 99) || a.name.localeCompare(b.name));
  const wantScheme = param(sp, "scheme");
  const adding = wantScheme === "new";
  const selected = adding ? undefined : (schemes.find((s) => s.id === wantScheme) ?? schemes.find((s) => (s.levels ?? []).length === 0) ?? schemes[0]);
  // What the form shows: the scheme chosen, a blank new one, or (no scheme of its own yet) what is in force.
  const inForce = programme ? resolveScheme(d.gradingSchemes.filter((s) => s.scopeId === "schools"), "") : resolveScheme(d.gradingSchemes, p.siteId);
  const scheme = selected ?? (adding ? { ...DRC_SCHEME, name: "", levels: [] } : inForce.scheme);
  const source = selected ? (programme ? "programme" : "school") : adding ? "default" : inForce.source;
  const sourceNote = { school: tr("marks.sourceSchool"), programme: tr("marks.sourceProgramme"), default: adding ? tr("marks.newScheme") : tr("marks.sourceDefault") }[source];
  const takenBy = (l: number) => schemes.find((s) => s.id !== selected?.id && (s.levels ?? []).includes(l));
  const levelsText = (ls: readonly number[] | undefined) => (ls && ls.length ? ls.map((l) => levelLabel(l, tr)).join(", ") : tr("marks.allOtherLevels"));
  const schemeHref = (id: string) => `${base}?${new URLSearchParams({ ...(programme ? { scope: "programme" } : {}), level: String(level), scheme: id })}#scheme`;
  const subj = programme
    ? (() => { const mine = live(d.subjects).filter((s) => s.scopeId === "schools" && s.level === level); return mine.length ? { subjects: mine.sort((a, b) => a.position - b.position), source: "programme" as const } : resolveSubjects([], "", level, locale); })()
    : resolveSubjects(d.subjects, p.siteId, level, locale);
  const subjSource = { school: tr("marks.sourceSchool"), programme: tr("marks.sourceProgramme"), default: tr("marks.sourceDefaultSubjects") }[subj.source];
  const periods = periodsOf(scheme);
  const marksCount = live(d.marks).length;

  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="siteId" value={p.siteId} />
      <input type="hidden" name="scope" value={programme ? "programme" : "school"} />
      <input type="hidden" name="level" value={String(level)} />
      <input type="hidden" name="schemeId" value={selected?.id ?? ""} />
    </>
  );
  // The subjects table shows exam maxima with the scheme that grades the level shown.
  const levelScheme = programme ? resolveScheme(d.gradingSchemes.filter((s) => s.scopeId === "schools"), "", level).scheme : resolveScheme(d.gradingSchemes, p.siteId, level).scheme;
  const errors: Record<string, string> = { scheme_levels: tr("marks.errLevels", { levels: param(sp, "levels") }), scheme_fallback: tr("marks.errFallback"), not_found: tr("err.notFound"), scheme_terms: tr("marks.errTerms"), scheme_mentions: tr("marks.errMentions"), scheme_invalid: tr("common.invalid"), subjects_invalid: tr("marks.errSubjects"), subjects_empty: tr("marks.errSubjectsEmpty") };
  const err = errors[param(sp, "error")];

  return (
    <div className="stack">
      {err ? <Notice tone="error">{err}</Notice> : <Flash sp={sp} tr={tr} />}
      {param(sp, "grading_saved") && <Notice tone="success">{tr("marks.setupSaved")}</Notice>}
      {param(sp, "grading_nothing") && <Notice>{tr("marks.nothing")}</Notice>}

      <div className="marks-nav">
        <Link className="btn ghost sm" href={`/${locale}/schools/${p.siteId}/marks`}>{tr("marks.backToMarks")}</Link>
        {canProgramme && (
          <nav className="marks-switch" aria-label={tr("marks.scope")}>
            <Link href={`${base}?level=${level}`} aria-current={!programme ? "page" : undefined}>{tr("marks.scopeSchool")}</Link>
            <Link href={`${base}?scope=programme&level=${level}`} aria-current={programme ? "page" : undefined}>{tr("marks.scopeProgramme")}</Link>
          </nav>
        )}
      </div>
      {programme && <Notice>{tr("marks.programmeIntro")}</Notice>}

      <Section className="marks-sec" id="schemes" icon="layers" flush title={tr("marks.schemesTitle")} description={tr("marks.schemesIntro")} count={schemes.length}
        actions={<Link className="btn secondary sm" href={schemeHref("new")}><Icon name="plus" size={15} />{tr("marks.addScheme")}</Link>}>
        <Table flush rows={schemes} rowKey={(r) => r.id} empty={tr("marks.noSchemes")} emptyIcon="layers" rowClass={(r) => (r.id === selected?.id ? "row-editing" : undefined)} columns={[
          { key: "n", header: tr("marks.schemeName"), render: (r) => <strong>{r.name}</strong> },
          { key: "l", header: tr("marks.schemeLevels"), render: (r) => levelsText(r.levels) },
          { key: "x", header: "", shrink: true, render: (r) => (
            <span className="row-actions">
              <Link className="btn ghost sm" href={schemeHref(r.id)} title={t(locale, "ui.form.edit")} aria-label={t(locale, "ui.form.edit")}><Icon name="pencil" size={15} /></Link>
              <form action={deleteScheme}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="siteId" value={p.siteId} />
                <input type="hidden" name="scope" value={programme ? "programme" : "school"} />
                <input type="hidden" name="level" value={String(level)} />
                <input type="hidden" name="schemeId" value={r.id} />
                <ConfirmButton label={t(locale, "ui.form.remove")} confirm={t(locale, "ui.form.removeConfirm")} yes={t(locale, "ui.form.yesRemove")} no={t(locale, "ui.form.keep")} />
              </form>
            </span>
          ) },
        ]} />
      </Section>

      <Section className="marks-sec" id="scheme" icon={adding ? "plus" : "pencil"} title={adding ? tr("marks.addScheme") : selected ? tr("marks.editScheme", { name: selected.name }) : tr("marks.schemeTitle")} description={tr("marks.schemeIntro")}
        actions={<span className={`pill ${source === "default" ? "info" : "good"}`}>{sourceNote}</span>}>
        <form action={saveScheme}>
          {hidden}
          <Fields>
            <Field span={6} label={tr("marks.schemeName")}><input name="name" required maxLength={80} defaultValue={scheme.name} placeholder={tr("marks.schemeNamePh")} /></Field>
            <Field span={3} label={tr("marks.passPercent")} hint={tr("marks.passHint")}><input name="passPercent" className="num-input" inputMode="numeric" required pattern="[0-9]{1,3}" defaultValue={String(scheme.passPercent)} /></Field>
            <Field span={3} label={tr("marks.examFactor")} hint={tr("marks.examFactorHint")}><input name="examFactor" className="num-input" inputMode="decimal" required pattern="[0-9]+([.,]5|[.,]0)?" defaultValue={String(scheme.examFactor).replace(".", locale === "fr" ? "," : ".")} /></Field>
            <ChoiceGroup span={12} legend={tr("marks.schemeLevels")} hint={tr("marks.schemeLevelsHint")}>
              {LEVELS.map((l) => {
                const other = takenBy(l);
                return <Chip key={l} name="levels" value={String(l)} label={levelLabel(l, tr)} sub={other ? other.name : undefined} disabled={!!other} defaultChecked={(scheme.levels ?? []).includes(l)} />;
              })}
            </ChoiceGroup>
          </Fields>

          <h3 className="marks-subhead">{tr("marks.termsTitle")}</h3>
          <p className="muted small">{tr("marks.termsIntro")}</p>
          <div className="marks-grid-wrap">
            <table className="grid marks-setup">
              <thead><tr><th>{tr("marks.term")}</th><th>{tr("marks.periodsCount")}</th><th>{tr("marks.hasExam")}</th></tr></thead>
              <tbody>
                {Array.from({ length: MAX_TERMS }, (_, i) => {
                  const term = scheme.terms[i];
                  return (
                    <tr key={i}>
                      <th scope="row">{tr("marks.termShort", { n: i + 1 })}</th>
                      <td>
                        <select className="ctl" name={`periods:${i}`} defaultValue={term ? String(term.periods) : "0"} aria-label={`${tr("marks.termShort", { n: i + 1 })} · ${tr("marks.periodsCount")}`}>
                          <option value="0">{tr("marks.notUsed")}</option>
                          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </td>
                      <td><Check name={`exam:${i}`} label={tr("marks.hasExam")} defaultChecked={term?.exam ?? false} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">{tr("marks.periodsNow")}: <b>{periods.map((x) => x.key).join(", ")}</b></p>

          <h3 className="marks-subhead">{tr("marks.mentionsTitle")}</h3>
          <p className="muted small">{tr("marks.mentionsIntro")}</p>
          <div className="marks-grid-wrap">
            <table className="grid marks-setup">
              <thead><tr><th>{tr("marks.minPercent")}</th><th>{tr("marks.labelFr")}</th><th>{tr("marks.labelEn")}</th></tr></thead>
              <tbody>
                {Array.from({ length: MAX_MENTIONS }, (_, i) => {
                  const m = [...scheme.mentions].sort((a, b) => b.minPercent - a.minPercent)[i];
                  return (
                    <tr key={i}>
                      <td><input className="ctl num-input" name={`min:${i}`} inputMode="numeric" pattern="[0-9]{1,3}" defaultValue={m ? String(m.minPercent) : ""} aria-label={`${tr("marks.minPercent")} ${i + 1}`} /></td>
                      <td><input className="ctl" name={`fr:${i}`} maxLength={40} defaultValue={m?.fr ?? ""} aria-label={`${tr("marks.labelFr")} ${i + 1}`} /></td>
                      <td><input className="ctl" name={`en:${i}`} maxLength={40} defaultValue={m?.en ?? ""} aria-label={`${tr("marks.labelEn")} ${i + 1}`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!programme && marksCount > 0 && <Notice tone="warning">{tr("marks.changeWarning", { n: marksCount })}</Notice>}
          <div className="savebar">
            <span className="savebar-status"><span className="savebar-dot" aria-hidden /><span>{programme ? tr("marks.scopeProgramme") : d.site.name}</span></span>
            <span className="savebar-actions"><SubmitButton variant="lime" icon="check" pending={saving}>{tr("marks.saveScheme")}</SubmitButton></span>
          </div>
        </form>
        {selected && <form action={restoreScheme} className="marks-restore">
          {hidden}
          <RestoreButton label={tr("marks.restoreDefault")} confirm={tr("marks.restoreSchemeConfirm")} yes={tr("marks.restore")} no={t(locale, "ui.form.cancel")} />
        </form>}
      </Section>

      <Section className="marks-sec" id="subjects" icon="list" title={tr("marks.subjectsTitle")} description={tr("marks.subjectsIntro")}
        actions={<span className={`pill ${subj.source === "default" ? "info" : "good"}`}>{subjSource}</span>}>
        <form method="get" className="filterbar inset">
          {programme && <input type="hidden" name="scope" value="programme" />}
          <label className="tb-field">{tr("common.level")}
            <select className="ctl" name="level" defaultValue={String(level)}>{LEVELS.map((l) => <option key={l} value={l}>{levelLabel(l, tr)}</option>)}</select>
          </label>
          <button className="btn secondary" type="submit">{tr("ux.show")}</button>
        </form>
        {subj.source === "default" && <Notice>{tr("marks.defaultSubjectsNote")}</Notice>}
        <form action={saveSubjects}>
          {hidden}
          <div className="marks-grid-wrap">
            <table className="grid marks-setup">
              <thead>
                <tr>
                  <th>#</th><th>{tr("marks.subjectName")}</th><th className="num">{tr("marks.maxPerPeriod")}</th>
                  <th className="num">{tr("marks.examMax")}</th><th>{tr("marks.remove")}</th>
                </tr>
              </thead>
              <tbody>
                {[...subj.subjects, ...Array.from({ length: EXTRA_ROWS }, () => null)].map((s, i) => (
                  <tr key={s?.code ?? `new-${i}`}>
                    <td className="muted">{i + 1}</td>
                    <td>
                      <input type="hidden" name={`code:${i}`} value={s?.code ?? ""} />
                      <input className="ctl" name={`name:${i}`} maxLength={60} defaultValue={s?.name ?? ""} placeholder={s ? undefined : tr("marks.newSubject")} aria-label={`${tr("marks.subjectName")} ${i + 1}`} />
                    </td>
                    <td className="num"><input className="ctl num-input mg-input" name={`max:${i}`} inputMode="numeric" pattern="[0-9]{1,3}" defaultValue={s ? String(s.maxPoints) : ""} aria-label={`${tr("marks.maxPerPeriod")} ${i + 1}`} /></td>
                    <td className="num muted">{s ? maxFor(s, { kind: "exam" }, levelScheme) : ""}</td>
                    <td>{s && <Check name={`del:${i}`} label={tr("marks.remove")} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Fields>
            <Field span={12} label={tr("marks.applyTo")}><span className="check-inline"><Check name="allLevels" label={tr("marks.allLevels")} /></span></Field>
          </Fields>
          <p className="muted small">{tr("marks.subjectsHint", { factor: String(levelScheme.examFactor).replace(".", locale === "fr" ? "," : ".") })}</p>
          <div className="savebar">
            <span className="savebar-status"><span className="savebar-dot" aria-hidden /><span>{levelLabel(level, tr)} · {tr("marks.subjectsCount", { n: subj.subjects.length })}</span></span>
            <span className="savebar-actions"><SubmitButton variant="lime" icon="check" pending={saving}>{tr("marks.saveSubjects")}</SubmitButton></span>
          </div>
        </form>
        <form action={restoreSubjects} className="marks-restore">
          {hidden}
          <RestoreButton label={tr("marks.restoreSubjects", { level: levelLabel(level, tr) })} confirm={tr("marks.restoreSubjectsConfirm")} yes={tr("marks.restore")} no={t(locale, "ui.form.cancel")} />
        </form>
      </Section>
    </div>
  );
}
