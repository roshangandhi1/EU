import { activeOn, live, markIndex, periodsOf, resolveScheme, resolveSubjects, type PeriodDef, type SchoolData, type Span } from "@eu/schools";
import type { Locale } from "@eu/core/i18n";
import { byLevel, studentName } from "../labels";

type Tr = (k: string, v?: Record<string, string | number>) => string;

const ordFr = (n: number, fem: boolean) => (n === 1 ? (fem ? "1re" : "1er") : `${n}e`);

/** "P1" / "Ex1": the codes on paper mark sheets. */
export const periodShort = (p: Pick<PeriodDef, "key">) => p.key;

/** "1re période" / "Period 1", "Examen du 1er trimestre" / "Term 1 exam". */
export function periodLong(p: PeriodDef, locale: Locale, tr: Tr): string {
  if (p.kind === "exam") return tr("marks.examLong", { ord: locale === "fr" ? ordFr(p.term, false) : String(p.term), n: p.term });
  return tr("marks.periodLong", { ord: locale === "fr" ? ordFr(p.n, true) : String(p.n), n: p.n });
}

export function termLabel(term: number, locale: Locale, tr: Tr): string {
  return tr("marks.termLong", { ord: locale === "fr" ? ordFr(term, false) : String(term), n: term });
}

export function spanLabel(span: Span, periods: PeriodDef[], locale: Locale, tr: Tr): string {
  if (span.kind === "year") return tr("marks.wholeYear");
  if (span.kind === "term") return termLabel(span.term, locale, tr);
  const p = periods.find((x) => x.key === span.key);
  return p ? `${periodLong(p, locale, tr)} (${p.key})` : span.key;
}

/** Everything the marks pages need for one school: year, classes, scheme, and a chosen class. */
export function marksContext(d: SchoolData, siteId: string, date: string, classId: string, locale: Locale) {
  const years = live(d.years).sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1));
  const year = years.find((y) => y.startsOn <= date && y.endsOn >= date) ?? years[0];
  const classes = live(d.classes).filter((c) => c.academicYearId === year?.id).sort(byLevel);
  const cls = classes.find((c) => c.id === classId);
  const { scheme, source } = resolveScheme(d.gradingSchemes, siteId, cls?.level);
  const periods = periodsOf(scheme);
  const students = new Map(d.students.map((s) => [s.id, s]));
  const pupilsOf = (id: string) => {
    // Pupils enrolled in the class today, plus any who left but already have marks in it.
    const now = new Set(activeOn(d.enrolments, date, d.years).filter((e) => e.classId === id).map((e) => e.studentId));
    for (const m of d.marks) if (!m.voidedAt && m.classId === id) now.add(m.studentId);
    return [...now].map((sid) => students.get(sid)).filter((s): s is NonNullable<typeof s> => !!s && !s.voidedAt)
      .sort((a, b) => studentName(a).localeCompare(studentName(b)));
  };
  const subjectsOf = (level: number) => resolveSubjects(d.subjects, siteId, level, locale);
  return { year, classes, cls, scheme, schemeSource: source, periods, pupilsOf, subjectsOf, index: (id: string) => markIndex(d.marks, id) };
}
