import { z } from "zod";
import { id, level, type Synced } from "./model";

/**
 * Marks ("notes") for primary schools: the grading scheme, subjects per level, marks, and the
 * pure rules that turn them into totals, percentages, ranks and mentions. Phone-safe (no
 * database code).
 *
 * Scheme and subjects resolve school first, then the programme-wide default (records scoped
 * to the stream, scope_id "schools"), then the built-in DRC primary standard below.
 */

// ---- Wire schemas ----

export const mentionBand = z.object({
  minPercent: z.number().min(0).max(100),
  en: z.string().min(1).max(40),
  fr: z.string().min(1).max(40),
});
export type MentionBand = z.infer<typeof mentionBand>;

/** A report card domain ("Domaine des langues"); sub-totals are per branch or for the whole domain. */
export const reportDomain = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,24}$/),
  en: z.string().min(1).max(80),
  fr: z.string().min(1).max(80),
  subtotal: z.enum(["branch", "domain"]),
});
export type ReportDomain = z.infer<typeof reportDomain>;

export const DEFAULT_LETTERS = ["E", "TB", "B", "AB", "M"];

export const gradingScheme = z.object({
  name: z.string().min(1).max(80),
  /**
   * The class levels this scheme grades. A level belongs to at most one scheme of a school. An
   * empty list means "every level no other scheme takes" (the school's fallback scheme).
   */
  levels: z.array(level).max(8).default([]),
  /** One entry per trimester: number of periods (1-4) and whether it ends with an exam. */
  terms: z.array(z.object({ periods: z.number().int().min(1).max(4), exam: z.boolean() })).min(1).max(4),
  examFactor: z.number().min(0.5).max(10).multipleOf(0.5),
  passPercent: z.number().int().min(1).max(100),
  mentions: z.array(mentionBand).max(8),
  /** Report card domains in order (empty: subjects are listed without domains). */
  domains: z.array(reportDomain).max(12).default([]),
  /** Letter grades for Application and Conduite, best first. */
  letters: z.array(z.string().min(1).max(4)).min(2).max(10).default(DEFAULT_LETTERS),
});
export type GradingScheme = z.infer<typeof gradingScheme>;

export const subject = z.object({
  level,
  code: z.string().regex(/^[a-z0-9_]{1,24}$/),
  name: z.string().min(1).max(60),
  maxPoints: z.number().int().min(1).max(500),
  position: z.number().int().min(0).max(99),
  /** Report card grouping: a domain key of the scheme, and the branch heading ("Français"). */
  domain: z.string().max(24).default(""),
  branch: z.string().max(60).default(""),
  /** Optional per pupil (Religion): left out of a pupil's totals for a period with no mark. */
  optional: z.boolean().default(false),
});
export type Subject = z.input<typeof subject>;

/** Points in steps of 0.5 (the maximum is checked against the subject when entered). */
export const markScore = z.number().min(0).max(1000).multipleOf(0.5);

export const mark = z.object({
  studentId: id,
  classId: id,
  subject: z.string().min(1).max(24),
  period: z.string().regex(/^(P[1-9]|Ex[1-4]|FIN)$/),
  score: markScore.nullable(),
  absent: z.boolean(),
  /** Letter grade for Application / Conduite (subject "_application" / "_conduct"). */
  letter: z.string().min(1).max(4).nullable().default(null),
});
export type Mark = z.input<typeof mark>;

/** The two letter-graded rows of the report card, stored as marks with these subject codes. */
export const BEHAVIOUR = ["_application", "_conduct"] as const;
export const isBehaviour = (code: string) => (BEHAVIOUR as readonly string[]).includes(code);

/**
 * 6e année "Résultat final" (form IMPRIGE/P.S/007): the school average out of 50 and the ENAFEP
 * national exam out of 50, kept as marks in the pseudo-period "FIN". A blank school average falls
 * back to the 6e year percentage halved.
 */
export const FINAL = { period: "FIN", school: "_ecole", exam: "_enafep", max: 50, level: 6 } as const;
export const isFinal = (code: string) => code === FINAL.school || code === FINAL.exam;

// ---- The DRC primary standard (built-in default) ----

export const DRC_MENTIONS: MentionBand[] = [
  { minPercent: 80, en: "Distinction", fr: "Distinction" },
  { minPercent: 70, en: "Merit", fr: "Satisfaction" },
  { minPercent: 50, en: "Pass", fr: "Réussite" },
  { minPercent: 0, en: "Fail", fr: "Échec" },
];

/** 3 trimesters, each with 2 periods and an exam (P1 P2 Ex1, P3 P4 Ex2, P5 P6 Ex3). */
export const DRC_SCHEME: GradingScheme = {
  name: "RDC primaire (standard)",
  levels: [],
  terms: [{ periods: 2, exam: true }, { periods: 2, exam: true }, { periods: 2, exam: true }],
  examFactor: 2,
  passPercent: 50,
  mentions: DRC_MENTIONS,
  domains: [],
  letters: DEFAULT_LETTERS,
};

/**
 * The ministry report card domains for a level. On the terminal forms (5e-6e) mathematics, science
 * and technology each get their own sub-total; on the earlier forms the domain has one.
 */
export function drcDomains(lvl?: number): ReportDomain[] {
  return [
    { key: "langues", fr: "Domaine des langues", en: "Languages", subtotal: "branch" },
    { key: "mst", fr: "Domaine des mathématiques, sciences et technologie", en: "Mathematics, science and technology", subtotal: (lvl ?? 0) >= 5 ? "branch" : "domain" },
    { key: "social", fr: "Domaine de l'univers social et environnement", en: "Social world and environment", subtotal: "domain" },
    { key: "arts", fr: "Domaine des arts", en: "Arts", subtotal: "domain" },
    { key: "perso", fr: "Domaine du développement personnel", en: "Personal development", subtotal: "domain" },
  ];
}

type Def = { fr: string; en: string; max: number; domain: string; branch?: [string, string]; optional?: boolean };
const LC: [string, string] = ["Langues congolaises", "Congolese languages"];
const FR: [string, string] = ["Français", "French"];
const MA: [string, string] = ["Mathématiques", "Mathematics"];
const SC: [string, string] = ["Sciences", "Science"];
const TE: [string, string] = ["Technologie", "Technology"];
const COMMON_TAIL: Def[] = [
  { fr: "Arts plastiques", en: "Visual arts", max: 10, domain: "arts" },
  { fr: "Arts dramatiques", en: "Drama", max: 10, domain: "arts" },
  { fr: "Éd. physique et sportive", en: "Physical education and sport", max: 10, domain: "perso" },
  { fr: "Initiation aux travaux productifs", en: "Introduction to productive work", max: 10, domain: "perso" },
  { fr: "Religion", en: "Religion", max: 10, domain: "perso", optional: true },
];

/** Degré élémentaire (1re-2e année), from the ministry bulletin IMPRIGE/P.S/004. Maxima are per period. */
const ELEMENTAIRE: Def[] = [
  { fr: "Expression orale", en: "Speaking", max: 20, domain: "langues", branch: LC },
  { fr: "Expression écrite", en: "Writing", max: 20, domain: "langues", branch: LC },
  { fr: "Vocabulaire", en: "Vocabulary", max: 10, domain: "langues", branch: FR },
  { fr: "Expression orale", en: "Speaking", max: 20, domain: "langues", branch: FR },
  { fr: "Lecture - écriture en langues congolaises", en: "Reading and writing in Congolese languages", max: 30, domain: "langues" },
  { fr: "Mesures des grandeurs", en: "Measurement", max: 10, domain: "mst", branch: MA },
  { fr: "Formes géométriques", en: "Geometric shapes", max: 10, domain: "mst", branch: MA },
  { fr: "Numération", en: "Numeracy", max: 20, domain: "mst", branch: MA },
  { fr: "Opérations", en: "Operations", max: 20, domain: "mst", branch: MA },
  { fr: "Problèmes", en: "Problems", max: 20, domain: "mst", branch: MA },
  { fr: "Sciences d'éveil", en: "Early science", max: 20, domain: "mst", branch: SC },
  { fr: "Technologie", en: "Technology", max: 10, domain: "mst", branch: TE },
  { fr: "Éd. civique et morale", en: "Civic and moral education", max: 10, domain: "social" },
  { fr: "Éd. à la santé et environnement", en: "Health and environment", max: 10, domain: "social" },
  ...COMMON_TAIL,
];

/** Degré moyen (3e-4e année), from the ministry bulletin IMPRIGE/P.S/005. */
const MOYEN: Def[] = [
  { fr: "Expr. orale et vocabulaire", en: "Speaking and vocabulary", max: 10, domain: "langues", branch: LC },
  { fr: "Grammaire et conjugaison", en: "Grammar and conjugation", max: 10, domain: "langues", branch: LC },
  { fr: "Orthographe et rédaction", en: "Spelling and composition", max: 5, domain: "langues", branch: LC },
  { fr: "Expr. orale - récitation - vocabulaire", en: "Speaking, recitation, vocabulary", max: 10, domain: "langues", branch: FR },
  { fr: "Orthographe, phraséologie écrite, rédaction", en: "Spelling, written phrasing, composition", max: 10, domain: "langues", branch: FR },
  { fr: "Grammaire - conjugaison - analyse", en: "Grammar, conjugation, analysis", max: 15, domain: "langues", branch: FR },
  { fr: "Lecture - écriture en langues congolaises", en: "Reading and writing in Congolese languages", max: 30, domain: "langues" },
  { fr: "Lecture - écriture en langue française", en: "Reading and writing in French", max: 30, domain: "langues" },
  { fr: "Numération", en: "Numeracy", max: 10, domain: "mst", branch: MA },
  { fr: "Opérations", en: "Operations", max: 10, domain: "mst", branch: MA },
  { fr: "Mesures des grandeurs", en: "Measurement", max: 10, domain: "mst", branch: MA },
  { fr: "Formes géométriques", en: "Geometric shapes", max: 10, domain: "mst", branch: MA },
  { fr: "Problèmes", en: "Problems", max: 20, domain: "mst", branch: MA },
  { fr: "Zoologie - botanique et info.", en: "Zoology, botany and IT", max: 10, domain: "mst", branch: SC },
  { fr: "Technologie", en: "Technology", max: 20, domain: "mst", branch: TE },
  { fr: "Éd. civique et morale", en: "Civic and moral education", max: 10, domain: "social" },
  { fr: "Éd. à la santé et environnement", en: "Health and environment", max: 10, domain: "social" },
  { fr: "Géographie", en: "Geography", max: 10, domain: "social" },
  { fr: "Histoire", en: "History", max: 10, domain: "social" },
  ...COMMON_TAIL,
];

/** Degré terminal (5e-6e année), from the ministry bulletins IMPRIGE/P.S/006 and /007 (same subjects). */
const TERMINAL: Def[] = [
  { fr: "Gram. & Conjugaison", en: "Grammar and conjugation", max: 10, domain: "langues", branch: LC },
  { fr: "Expr. orale & Vocab.", en: "Speaking and vocabulary", max: 10, domain: "langues", branch: LC },
  { fr: "Orth. & Rédaction", en: "Spelling and composition", max: 10, domain: "langues", branch: LC },
  { fr: "Expr. orale & Vocab.", en: "Speaking and vocabulary", max: 10, domain: "langues", branch: FR },
  { fr: "Orthographe", en: "Spelling", max: 10, domain: "langues", branch: FR },
  { fr: "Rédaction", en: "Composition", max: 10, domain: "langues", branch: FR },
  { fr: "Gram. Conj. Analyse", en: "Grammar, conjugation, analysis", max: 20, domain: "langues", branch: FR },
  { fr: "Lecture - écriture en langues congolaises", en: "Reading and writing in Congolese languages", max: 20, domain: "langues" },
  { fr: "Lecture - écriture en langue française", en: "Reading and writing in French", max: 20, domain: "langues" },
  { fr: "Numération", en: "Numeracy", max: 10, domain: "mst", branch: MA },
  { fr: "Opérations", en: "Operations", max: 10, domain: "mst", branch: MA },
  { fr: "Mesures des grandeurs", en: "Measurement", max: 10, domain: "mst", branch: MA },
  { fr: "Formes géométriques", en: "Geometric shapes", max: 10, domain: "mst", branch: MA },
  { fr: "Problèmes", en: "Problems", max: 20, domain: "mst", branch: MA },
  { fr: "Physique - Info.", en: "Physics and IT", max: 10, domain: "mst", branch: SC },
  { fr: "Anat. - Zool. - Botanique", en: "Anatomy, zoology, botany", max: 20, domain: "mst", branch: SC },
  { fr: "Technologie", en: "Technology", max: 10, domain: "mst", branch: TE },
  { fr: "Éd. civique et morale", en: "Civic and moral education", max: 10, domain: "social" },
  { fr: "Éd. à la santé et environnement", en: "Health and environment", max: 10, domain: "social" },
  { fr: "Géographie", en: "Geography", max: 10, domain: "social" },
  { fr: "Histoire", en: "History", max: 10, domain: "social" },
  { fr: "Arts plastiques", en: "Visual arts", max: 10, domain: "arts" },
  { fr: "Arts dramatiques", en: "Drama", max: 10, domain: "arts" },
  { fr: "Initiation aux travaux productifs", en: "Introduction to productive work", max: 10, domain: "perso" },
  { fr: "Éd. physique et sportive", en: "Physical education and sport", max: 10, domain: "perso" },
  { fr: "Religion", en: "Religion", max: 10, domain: "perso", optional: true },
];

/** Levels 7-8 (no ministry bulletin received yet) start from the terminal subjects; the headteacher can edit them. */
const DEGREE: Record<number, Def[]> = { 1: ELEMENTAIRE, 2: ELEMENTAIRE, 3: MOYEN, 4: MOYEN, 5: TERMINAL, 6: TERMINAL };

/** The DRC default subjects for a level, named in the given language. Codes are stable across languages. */
export function defaultSubjects(lvl: number, locale: "en" | "fr" = "fr"): Subject[] {
  const defs = DEGREE[lvl] ?? TERMINAL;
  const taken = new Set<string>();
  return defs.map((d, i) => {
    const code = subjectCode(d.branch ? `${d.branch[0].slice(0, 3)} ${d.fr}` : d.fr, taken);
    taken.add(code);
    return {
      level: lvl, code, name: locale === "en" ? d.en : d.fr, maxPoints: d.max, position: i,
      domain: d.domain, branch: d.branch ? d.branch[locale === "en" ? 1 : 0] : "", optional: !!d.optional,
    };
  });
}

/** The report card's degree for a level: élémentaire (1-2), moyen (3-4), terminal (5-6), CTEB (7-8). */
export function degreeOf(lvl: number): "elementaire" | "moyen" | "terminal" | "cteb" {
  return lvl <= 2 ? "elementaire" : lvl <= 4 ? "moyen" : lvl <= 6 ? "terminal" : "cteb";
}

/**
 * A scheme's report card domains for a level. A scheme with none, or with an unedited copy of the
 * DRC ones (saved by an earlier version), uses the ministry domains for that level.
 */
export function domainsOf(s: Partial<Pick<GradingScheme, "domains">>, lvl?: number): ReportDomain[] {
  const own = s.domains ?? [];
  const copy = JSON.stringify(own) === JSON.stringify(drcDomains(1)) || JSON.stringify(own) === JSON.stringify(drcDomains(5));
  return own.length && !copy ? own : drcDomains(lvl);
}
/** A scheme's letter grades for Application and Conduite. */
export const lettersOf = (s: Partial<Pick<GradingScheme, "letters">>): string[] => (s.letters?.length ? s.letters : DEFAULT_LETTERS);

// ---- Periods ----

export interface PeriodDef {
  /** P1..P9 for periods, Ex1..Ex4 for exams. */
  key: string;
  kind: "period" | "exam";
  /** Trimester number, from 1. */
  term: number;
  /** Period number (P3 → 3) or exam number (Ex2 → 2). */
  n: number;
}

/** The periods and exams of a scheme in year order. */
export function periodsOf(scheme: Pick<GradingScheme, "terms">): PeriodDef[] {
  const out: PeriodDef[] = [];
  let p = 0;
  scheme.terms.forEach((t, i) => {
    for (let k = 0; k < t.periods; k++) {
      p++;
      out.push({ key: `P${p}`, kind: "period", term: i + 1, n: p });
    }
    if (t.exam) out.push({ key: `Ex${i + 1}`, kind: "exam", term: i + 1, n: i + 1 });
  });
  return out;
}

/** The maximum for a subject in a period or exam. */
export function maxFor(sub: Pick<Subject, "maxPoints">, period: Pick<PeriodDef, "kind">, scheme: Pick<GradingScheme, "examFactor">): number {
  return period.kind === "exam" ? sub.maxPoints * scheme.examFactor : sub.maxPoints;
}

/** What a results view covers: one period, one trimester, or the whole year. */
export type Span = { kind: "period"; key: string } | { kind: "term"; term: number } | { kind: "year" };

export function parseSpan(raw: string): Span | null {
  if (/^(P[1-9]|Ex[1-4])$/.test(raw)) return { kind: "period", key: raw };
  const t = /^T([1-4])$/.exec(raw);
  if (t) return { kind: "term", term: Number(t[1]) };
  if (raw === "Y") return { kind: "year" };
  return null;
}

export const spanKey = (s: Span) => (s.kind === "period" ? s.key : s.kind === "term" ? `T${s.term}` : "Y");

/** The periods a span covers (empty when the span is not in the scheme). */
export function periodsIn(scheme: Pick<GradingScheme, "terms">, span: Span): PeriodDef[] {
  const all = periodsOf(scheme);
  if (span.kind === "period") return all.filter((p) => p.key === span.key);
  if (span.kind === "term") return all.filter((p) => p.term === span.term);
  return all;
}

// ---- Resolution: school, then programme, then DRC ----

type Rec<T> = Synced<T>;
const latest = <T extends { deviceTime: string }>(rows: readonly T[]) => [...rows].sort((a, b) => (a.deviceTime < b.deviceTime ? 1 : -1))[0];

export type SchemeSource = "school" | "programme" | "default";

/**
 * The scheme in force at a school for a class level. In each scope (the school, then the
 * programme) the scheme that lists the level wins, then the scope's fallback scheme (no levels).
 * `rows` may mix school and programme ("schools") records. Without a level, only fallbacks count.
 */
export function resolveScheme(rows: readonly Rec<GradingScheme>[], siteId: string, lvl?: number): { scheme: GradingScheme; source: SchemeSource; record?: Rec<GradingScheme> } {
  const live = rows.filter((r) => !r.voidedAt);
  const pick = (scopeId: string) => {
    const mine = live.filter((r) => r.scopeId === scopeId);
    return (lvl !== undefined ? latest(mine.filter((r) => (r.levels ?? []).includes(lvl))) : undefined) ?? latest(mine.filter((r) => (r.levels ?? []).length === 0));
  };
  const own = pick(siteId);
  if (own) return { scheme: own, source: "school", record: own };
  const prog = pick("schools");
  if (prog) return { scheme: prog, source: "programme", record: prog };
  return { scheme: DRC_SCHEME, source: "default" };
}

/**
 * Checks a scheme's levels against the other live schemes of the same scope: a level can be in one
 * scheme only, and only one scheme may be the fallback (no levels). Returns the clashing levels.
 */
export function schemeLevelClash(rows: readonly Rec<GradingScheme>[], scopeId: string, levels: readonly number[], self?: string): { taken: number[]; fallbackTaken: boolean } {
  const others = rows.filter((r) => !r.voidedAt && r.scopeId === scopeId && r.id !== self);
  const taken = levels.filter((l) => others.some((o) => (o.levels ?? []).includes(l)));
  const fallbackTaken = levels.length === 0 && others.some((o) => (o.levels ?? []).length === 0);
  return { taken, fallbackTaken };
}

/** The subjects for one level at a school, in order, and where they come from. */
export function resolveSubjects(rows: readonly Rec<Subject>[], siteId: string, lvl: number, locale: "en" | "fr" = "fr"): { subjects: Subject[]; source: SchemeSource } {
  const live = rows.filter((r) => !r.voidedAt && r.level === lvl);
  const order = (a: Subject, b: Subject) => a.position - b.position || a.name.localeCompare(b.name);
  const own = live.filter((r) => r.scopeId === siteId);
  if (own.length) return { subjects: own.sort(order), source: "school" };
  const prog = live.filter((r) => r.scopeId === "schools");
  if (prog.length) return { subjects: prog.sort(order), source: "programme" };
  return { subjects: defaultSubjects(lvl, locale), source: "default" };
}

/** The mention for a percentage: the band with the highest minimum the percentage reaches. */
export function mentionFor(percent: number | null, bands: readonly MentionBand[]): MentionBand | null {
  if (percent == null) return null;
  return [...bands].sort((a, b) => b.minPercent - a.minPercent).find((b) => percent >= b.minPercent) ?? null;
}

// ---- Entering marks ----

export type ScoreInput = { kind: "empty" } | { kind: "absent" } | { kind: "score"; value: number } | { kind: "letter"; value: string } | { kind: "error"; error: "format" | "step" | "range" | "letter" };

/** Reads a letter grade (Application, Conduite): blank, or one of the scheme's letters, any case. */
export function readLetter(raw: string, letters: readonly string[]): ScoreInput {
  const s = raw.trim().toUpperCase();
  if (s === "") return { kind: "empty" };
  const hit = letters.find((l) => l.toUpperCase() === s);
  return hit ? { kind: "letter", value: hit } : { kind: "error", error: "letter" };
}

/**
 * Reads what was typed in a mark cell: blank, "a"/"abs" (absent), or points such as "12",
 * "12,5" or "12.5". Points must be in steps of 0.5 and between 0 and the maximum.
 */
export function readScore(raw: string, max: number): ScoreInput {
  const s = raw.trim().toLowerCase();
  if (s === "") return { kind: "empty" };
  if (s === "a" || s === "abs" || s === "absent") return { kind: "absent" };
  if (!/^\d{1,4}([.,]\d{1,2})?$/.test(s)) return { kind: "error", error: "format" };
  const v = Number(s.replace(",", "."));
  if (Math.round(v * 2) !== v * 2) return { kind: "error", error: "step" };
  if (v < 0 || v > max) return { kind: "error", error: "range" };
  return { kind: "score", value: v };
}

/** Writes points the way the user types them: "12,5" in French, "12.5" in English. */
export function formatScore(v: number, locale: "en" | "fr"): string {
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/0$/, "");
  return locale === "fr" ? s.replace(".", ",") : s;
}

const cellKey = (studentId: string, subjectCode: string, period: string) => `${studentId}|${subjectCode}|${period}`;

/** The live mark per pupil, subject and period in a class (the latest if there are several). */
export function markIndex<T extends Rec<Mark>>(marks: readonly T[], classId: string): Map<string, T> {
  const out = new Map<string, T>();
  for (const m of marks) {
    if (m.voidedAt || m.classId !== classId) continue;
    const k = cellKey(m.studentId, m.subject, m.period);
    const prev = out.get(k);
    if (!prev || prev.deviceTime < m.deviceTime) out.set(k, m);
  }
  return out;
}
export const markKey = cellKey;

export type MarkOp =
  | { op: "create"; fields: Mark }
  | { op: "update"; id: string; fields: Partial<Pick<Mark, "score" | "absent" | "letter">> }
  | { op: "void"; id: string };

/**
 * Turns the cells of an entry grid into mark changes. Only cells that were shown are passed
 * in; a cell cleared to blank voids its mark, an unchanged cell does nothing.
 */
export function planMarks(
  existing: ReadonlyMap<string, Rec<Mark>>,
  classId: string,
  cells: readonly { studentId: string; subject: string; period: string; input: Exclude<ScoreInput, { kind: "error" }> }[],
): MarkOp[] {
  const ops: MarkOp[] = [];
  for (const c of cells) {
    const prev = existing.get(cellKey(c.studentId, c.subject, c.period));
    if (c.input.kind === "empty") {
      if (prev) ops.push({ op: "void", id: prev.id });
      continue;
    }
    const score = c.input.kind === "score" ? c.input.value : null;
    const absent = c.input.kind === "absent";
    const letter = c.input.kind === "letter" ? c.input.value : null;
    if (!prev) ops.push({ op: "create", fields: { studentId: c.studentId, classId, subject: c.subject, period: c.period, score, absent, letter } });
    else if (prev.score !== score || prev.absent !== absent || (prev.letter ?? null) !== letter) {
      // Only send what changed: a partial update must not touch the other fields.
      const fields: Partial<Pick<Mark, "score" | "absent" | "letter">> = {};
      if (prev.score !== score) fields.score = score;
      if (prev.absent !== absent) fields.absent = absent;
      if ((prev.letter ?? null) !== letter) fields.letter = letter;
      ops.push({ op: "update", id: prev.id, fields });
    }
  }
  return ops;
}

// ---- Results ----

export interface SubjectResult {
  obtained: number;
  /** Maximum of the cells that have a mark or an absence. */
  max: number;
  /** Maximum if every cell were entered. */
  fullMax: number;
  missing: number;
  absent: number;
}

export interface PupilResult {
  studentId: string;
  bySubject: Map<string, SubjectResult>;
  obtained: number;
  max: number;
  fullMax: number;
  /** Cells with no mark yet. */
  missing: number;
  /** Cells marked absent (they count as 0). */
  absent: number;
  /** obtained / max × 100, over entered cells; null when nothing is entered. */
  percent: number | null;
  /** Competition rank by percent (ties share a rank: 1, 2, 2, 4); null without a percent. */
  rank: number | null;
  mention: MentionBand | null;
  passed: boolean | null;
}

export interface ClassResults {
  rows: PupilResult[];
  /** Pupils with a percent. */
  ranked: number;
  passed: number;
  average: number | null;
  /** Cells still to enter, over all pupils. */
  missing: number;
}

/**
 * Totals, percentage, rank and mention for each pupil of a class over the periods given.
 * Rules: an absent cell counts as 0 out of its maximum; a missing cell (not entered) is left
 * out of both the points and the maximum, and is counted in `missing` so the sheet can show
 * that a result is incomplete. Percentages are compared to 2 decimals for ranking.
 */
export function classResults(input: {
  studentIds: readonly string[];
  subjects: readonly Subject[];
  periods: readonly PeriodDef[];
  marks: ReadonlyMap<string, Pick<Mark, "score" | "absent">>;
  scheme: Pick<GradingScheme, "examFactor" | "passPercent" | "mentions">;
}): ClassResults {
  const { studentIds, subjects, periods, marks, scheme } = input;
  const rows: PupilResult[] = studentIds.map((studentId) => {
    const bySubject = new Map<string, SubjectResult>();
    let obtained = 0, max = 0, fullMax = 0, missing = 0, absent = 0;
    for (const s of subjects) {
      const r: SubjectResult = { obtained: 0, max: 0, fullMax: 0, missing: 0, absent: 0 };
      for (const p of periods) {
        const m = maxFor(s, p, scheme);
        const cell = marks.get(cellKey(studentId, s.code, p.key));
        // An optional subject (Religion) a pupil does not take has no marks: it is not part of their maximum.
        if (s.optional && !cell) continue;
        r.fullMax += m;
        if (!cell) r.missing++;
        else if (cell.absent) { r.absent++; r.max += m; }
        else if (cell.score != null) { r.obtained += cell.score; r.max += m; }
        else r.missing++;
      }
      bySubject.set(s.code, r);
      obtained += r.obtained; max += r.max; fullMax += r.fullMax; missing += r.missing; absent += r.absent;
    }
    const percent = max > 0 ? (obtained / max) * 100 : null;
    return {
      studentId, bySubject, obtained, max, fullMax, missing, absent, percent, rank: null,
      mention: mentionFor(percent, scheme.mentions), passed: percent == null ? null : percent >= scheme.passPercent,
    };
  });
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const withPct = rows.filter((r) => r.percent != null).sort((a, b) => b.percent! - a.percent!);
  withPct.forEach((r, i) => {
    const prev = withPct[i - 1];
    r.rank = prev && r2(prev.percent!) === r2(r.percent!) ? prev.rank : i + 1;
  });
  const passed = withPct.filter((r) => r.passed).length;
  const average = withPct.length ? withPct.reduce((n, r) => n + r.percent!, 0) / withPct.length : null;
  return { rows, ranked: withPct.length, passed, average, missing: rows.reduce((n, r) => n + r.missing, 0) };
}

// ---- Setup: subjects ----

/** A stable code for a new subject name, unique among `taken`. */
export function subjectCode(name: string, taken: ReadonlySet<string>): string {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20) || "subject";
  let code = base;
  for (let i = 2; taken.has(code); i++) code = `${base.slice(0, 20)}_${i}`;
  return code;
}

export type SubjectOp =
  | { op: "create"; fields: Subject }
  | { op: "update"; id: string; fields: Partial<Pick<Subject, "name" | "maxPoints" | "position" | "domain" | "branch" | "optional">> }
  | { op: "void"; id: string };

/**
 * Turns the wanted subject list for one level into changes to that scope's own records,
 * matched by code so marks keep their subject.
 */
export function planSubjects(existing: readonly Rec<Subject>[], scopeId: string, lvl: number, wanted: readonly Subject[]): SubjectOp[] {
  const mine = existing.filter((r) => !r.voidedAt && r.scopeId === scopeId && r.level === lvl);
  const byCode = new Map(mine.map((r) => [r.code, r]));
  const ops: SubjectOp[] = [];
  const keep = new Set<string>();
  for (const w of wanted) {
    if (keep.has(w.code)) continue; // a code appears once per level
    keep.add(w.code);
    const prev = byCode.get(w.code);
    if (!prev) {
      ops.push({ op: "create", fields: { ...w, level: lvl } });
      continue;
    }
    const fields: Partial<Pick<Subject, "name" | "maxPoints" | "position" | "domain" | "branch" | "optional">> = {};
    if (prev.name !== w.name) fields.name = w.name;
    if ((prev.domain ?? "") !== (w.domain ?? "")) fields.domain = w.domain ?? "";
    if ((prev.branch ?? "") !== (w.branch ?? "")) fields.branch = w.branch ?? "";
    if (!!prev.optional !== !!w.optional) fields.optional = !!w.optional;
    if (prev.maxPoints !== w.maxPoints) fields.maxPoints = w.maxPoints;
    if (prev.position !== w.position) fields.position = w.position;
    if (Object.keys(fields).length) ops.push({ op: "update", id: prev.id, fields });
  }
  for (const r of mine) if (!keep.has(r.code)) ops.push({ op: "void", id: r.id });
  return ops;
}

/** Fields of a scheme that differ from `prev` (for an in-place update). */
export function schemeChanges(prev: GradingScheme, next: GradingScheme): Partial<GradingScheme> {
  const out: Partial<GradingScheme> = {};
  for (const k of ["name", "levels", "terms", "examFactor", "passPercent", "mentions", "domains", "letters"] as const) {
    if (JSON.stringify(prev[k] ?? []) !== JSON.stringify(next[k] ?? [])) (out as Record<string, unknown>)[k] = next[k];
  }
  return out;
}

// ---- Report card (bulletin) layout ----

export type BulletinLine =
  | { type: "domain"; key: string; label: string }
  | { type: "branch"; label: string }
  | { type: "subject"; subject: Subject }
  | { type: "subtotal"; codes: string[] };

/**
 * The rows of a report card, as on the ministry bulletins: each domain's heading, branch headings
 * ("Français"), the subjects, and sub-totals either after each named branch (Domaine des langues,
 * and mathematics, science and technology from 5e) or once for the whole domain. Subjects without a known domain come last.
 */
export function bulletinLayout(subjects: readonly Subject[], domains: readonly ReportDomain[], locale: "en" | "fr" = "fr"): BulletinLine[] {
  const out: BulletinLine[] = [];
  const known = new Set(domains.map((d) => d.key));
  const groups: { domain: ReportDomain | null; subjects: Subject[] }[] = [
    ...domains.map((d) => ({ domain: d as ReportDomain | null, subjects: subjects.filter((s) => s.domain === d.key) })),
    { domain: null, subjects: subjects.filter((s) => !known.has(s.domain ?? "")) },
  ];
  for (const g of groups) {
    if (g.subjects.length === 0) continue;
    if (g.domain) out.push({ type: "domain", key: g.domain.key, label: g.domain[locale] });
    // Consecutive subjects with the same branch form one block.
    const blocks: Subject[][] = [];
    for (const s of g.subjects) {
      const last = blocks[blocks.length - 1];
      if (last && (last[0]!.branch ?? "") === (s.branch ?? "") && (s.branch ?? "") !== "") last.push(s);
      else blocks.push([s]);
    }
    for (const b of blocks) {
      const branch = b[0]!.branch ?? "";
      if (branch) out.push({ type: "branch", label: branch });
      for (const s of b) out.push({ type: "subject", subject: s });
      if (g.domain?.subtotal === "branch" && branch) out.push({ type: "subtotal", codes: b.map((s) => s.code) });
    }
    if (g.domain?.subtotal === "domain" && g.subjects.length >= 2) out.push({ type: "subtotal", codes: g.subjects.map((s) => s.code) });
  }
  return out;
}
