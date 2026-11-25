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

export const gradingScheme = z.object({
  name: z.string().min(1).max(80),
  /** One entry per trimester: number of periods (1-4) and whether it ends with an exam. */
  terms: z.array(z.object({ periods: z.number().int().min(1).max(4), exam: z.boolean() })).min(1).max(4),
  examFactor: z.number().min(0.5).max(10).multipleOf(0.5),
  passPercent: z.number().int().min(1).max(100),
  mentions: z.array(mentionBand).max(8),
});
export type GradingScheme = z.infer<typeof gradingScheme>;

export const subject = z.object({
  level,
  code: z.string().regex(/^[a-z0-9_]{1,24}$/),
  name: z.string().min(1).max(60),
  maxPoints: z.number().int().min(1).max(500),
  position: z.number().int().min(0).max(99),
});
export type Subject = z.infer<typeof subject>;

/** Points in steps of 0.5 (the maximum is checked against the subject when entered). */
export const markScore = z.number().min(0).max(1000).multipleOf(0.5);

export const mark = z.object({
  studentId: id,
  classId: id,
  subject: z.string().min(1).max(24),
  period: z.string().regex(/^(P[1-9]|Ex[1-4])$/),
  score: markScore.nullable(),
  absent: z.boolean(),
});
export type Mark = z.infer<typeof mark>;

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
  terms: [{ periods: 2, exam: true }, { periods: 2, exam: true }, { periods: 2, exam: true }],
  examFactor: 2,
  passPercent: 50,
  mentions: DRC_MENTIONS,
};

/**
 * Default subjects for levels 1-6, with the maximum for one period. A starting point to be
 * confirmed with the school; the headteacher can edit names and maxima per level.
 */
const DEFAULT_SUBJECTS: { code: string; en: string; fr: string; lower: number; upper: number }[] = [
  { code: "fr", en: "French", fr: "Français", lower: 20, upper: 30 },
  { code: "math", en: "Mathematics", fr: "Mathématiques", lower: 20, upper: 30 },
  { code: "lang", en: "Congolese language", fr: "Langue congolaise", lower: 10, upper: 10 },
  { code: "science", en: "Science", fr: "Éveil scientifique", lower: 10, upper: 20 },
  { code: "civic", en: "Civic and moral education", fr: "Éducation civique et morale", lower: 10, upper: 10 },
  { code: "art", en: "Art and drawing", fr: "Dessin / Éducation artistique", lower: 10, upper: 10 },
  { code: "pe", en: "Physical education", fr: "Éducation physique", lower: 10, upper: 10 },
  { code: "religion", en: "Religion", fr: "Religion", lower: 10, upper: 10 },
];

/** The DRC default subjects for a level, named in the given language. */
export function defaultSubjects(lvl: number, locale: "en" | "fr" = "fr"): Subject[] {
  return DEFAULT_SUBJECTS.map((s, i) => ({ level: lvl, code: s.code, name: s[locale], maxPoints: lvl <= 2 ? s.lower : s.upper, position: i }));
}

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

/** The scheme in force at a school. `rows` may mix school and programme ("schools") records. */
export function resolveScheme(rows: readonly Rec<GradingScheme>[], siteId: string): { scheme: GradingScheme; source: SchemeSource; record?: Rec<GradingScheme> } {
  const live = rows.filter((r) => !r.voidedAt);
  const own = latest(live.filter((r) => r.scopeId === siteId));
  if (own) return { scheme: own, source: "school", record: own };
  const prog = latest(live.filter((r) => r.scopeId === "schools"));
  if (prog) return { scheme: prog, source: "programme", record: prog };
  return { scheme: DRC_SCHEME, source: "default" };
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

export type ScoreInput = { kind: "empty" } | { kind: "absent" } | { kind: "score"; value: number } | { kind: "error"; error: "format" | "step" | "range" };

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
  | { op: "update"; id: string; fields: Partial<Pick<Mark, "score" | "absent">> }
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
    if (!prev) ops.push({ op: "create", fields: { studentId: c.studentId, classId, subject: c.subject, period: c.period, score, absent } });
    else if (prev.score !== score || prev.absent !== absent) ops.push({ op: "update", id: prev.id, fields: { score, absent } });
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
        r.fullMax += m;
        const cell = marks.get(cellKey(studentId, s.code, p.key));
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
  | { op: "update"; id: string; fields: Partial<Pick<Subject, "name" | "maxPoints" | "position">> }
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
    const fields: Partial<Pick<Subject, "name" | "maxPoints" | "position">> = {};
    if (prev.name !== w.name) fields.name = w.name;
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
  for (const k of ["name", "terms", "examFactor", "passPercent", "mentions"] as const) {
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) (out as Record<string, unknown>)[k] = next[k];
  }
  return out;
}
