import { PermissionRegistry, platformActions, type UserContext } from "@eu/core";
import type { Db } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { EntityRegistry } from "@eu/sync";
import { handlePush } from "@eu/sync/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DRC_SCHEME, FINAL, bulletinLayout, classResults, createSchoolSite, defaultSubjects, domainsOf, formatScore, loadSchool, mark, markIndex, maxFor, mentionFor, parseSpan, periodsIn, periodsOf,
  planMarks, planSubjects, readLetter, readScore, resolveScheme, resolveSubjects, schemeChanges, schemeLevelClash, schoolsActions, schoolsEntities, subjectCode,
  type GradingScheme, type Mark, type Subject, type Synced,
} from "../src";

const meta = (id: string, scopeId = "s1", deviceTime = "2026-10-01T08:00:00Z") => ({ id, scopeId, deviceTime, serverTime: deviceTime, voidedAt: null as string | null });

describe("grading scheme", () => {
  it("DRC default: 3 trimesters of P, P, Ex with exams worth twice a period", () => {
    const ps = periodsOf(DRC_SCHEME);
    expect(ps.map((p) => p.key)).toEqual(["P1", "P2", "Ex1", "P3", "P4", "Ex2", "P5", "P6", "Ex3"]);
    expect(ps.filter((p) => p.term === 2).map((p) => p.key)).toEqual(["P3", "P4", "Ex2"]);
    expect(maxFor({ maxPoints: 20 }, { kind: "exam" }, DRC_SCHEME)).toBe(40);
    expect(maxFor({ maxPoints: 20 }, { kind: "period" }, DRC_SCHEME)).toBe(20);
    expect(periodsIn(DRC_SCHEME, parseSpan("T3")!).map((p) => p.key)).toEqual(["P5", "P6", "Ex3"]);
    expect(periodsIn(DRC_SCHEME, parseSpan("Y")!)).toHaveLength(9);
    expect(parseSpan("Q1")).toBeNull();
  });

  it("custom terms number periods across the year and skip exams where there are none", () => {
    expect(periodsOf({ terms: [{ periods: 3, exam: false }, { periods: 1, exam: true }] }).map((p) => p.key)).toEqual(["P1", "P2", "P3", "P4", "Ex2"]);
  });

  it("resolves school, then programme, then DRC", () => {
    const prog = { ...DRC_SCHEME, name: "Programme", ...meta("p", "schools") } as Synced<GradingScheme>;
    const own = { ...DRC_SCHEME, name: "School", ...meta("o", "s1") } as Synced<GradingScheme>;
    expect(resolveScheme([], "s1")).toMatchObject({ source: "default", scheme: { name: DRC_SCHEME.name } });
    expect(resolveScheme([prog], "s1")).toMatchObject({ source: "programme", scheme: { name: "Programme" } });
    expect(resolveScheme([prog, own], "s1")).toMatchObject({ source: "school", scheme: { name: "School" } });
    expect(resolveScheme([prog, { ...own, voidedAt: "2026-10-02T00:00:00Z" }], "s1").source).toBe("programme");
    expect(resolveScheme([prog, own], "s2").source).toBe("programme");
  });

  it("several schemes per school: each level uses the scheme that lists it, else the fallback (item 4)", () => {
    const primary = { ...DRC_SCHEME, name: "Primary", levels: [1, 2, 3, 4, 5, 6], ...meta("a", "s1") } as Synced<GradingScheme>;
    const cteb = { ...DRC_SCHEME, name: "CTEB", levels: [7, 8], passPercent: 60, ...meta("b", "s1") } as Synced<GradingScheme>;
    const rest = { ...DRC_SCHEME, name: "Rest", levels: [], ...meta("c", "s1") } as Synced<GradingScheme>;
    const prog = { ...DRC_SCHEME, name: "Programme 7-8", levels: [7, 8], ...meta("p", "schools") } as Synced<GradingScheme>;
    expect(resolveScheme([primary, cteb], "s1", 3).scheme.name).toBe("Primary");
    expect(resolveScheme([primary, cteb], "s1", 8)).toMatchObject({ source: "school", scheme: { name: "CTEB", passPercent: 60 } });
    // A level no school scheme lists: the school's fallback, then the programme, then DRC.
    expect(resolveScheme([cteb, rest], "s1", 2).scheme.name).toBe("Rest");
    expect(resolveScheme([primary, prog], "s1", 7)).toMatchObject({ source: "programme", scheme: { name: "Programme 7-8" } });
    expect(resolveScheme([primary], "s1", 7).source).toBe("default");
    // Old records without levels still act as the school-wide scheme.
    const legacy = { ...DRC_SCHEME, name: "Old", ...meta("o", "s1") } as Synced<GradingScheme>;
    delete (legacy as Partial<GradingScheme>).levels;
    expect(resolveScheme([legacy], "s1", 5).scheme.name).toBe("Old");
  });

  it("a level cannot be in two schemes, and only one scheme can be the fallback", () => {
    const primary = { ...DRC_SCHEME, name: "Primary", levels: [1, 2, 3, 4, 5, 6], ...meta("a", "s1") } as Synced<GradingScheme>;
    const rest = { ...DRC_SCHEME, name: "Rest", levels: [], ...meta("c", "s1") } as Synced<GradingScheme>;
    expect(schemeLevelClash([primary], "s1", [6, 7])).toEqual({ taken: [6], fallbackTaken: false });
    expect(schemeLevelClash([primary], "s1", [1, 2], "a")).toEqual({ taken: [], fallbackTaken: false });
    expect(schemeLevelClash([primary], "s2", [1])).toEqual({ taken: [], fallbackTaken: false });
    expect(schemeLevelClash([primary, rest], "s1", []).fallbackTaken).toBe(true);
    expect(schemeLevelClash([primary, rest], "s1", [], "c").fallbackTaken).toBe(false);
    expect(schemeLevelClash([{ ...primary, voidedAt: "2026-10-02T00:00:00Z" }], "s1", [1]).taken).toEqual([]);
    expect(schemeChanges(primary, { ...primary, levels: [1, 2, 3] })).toEqual({ levels: [1, 2, 3] });
  });

  it("resolves subjects per level with the default list as the last resort", () => {
    const s = (code: string, lvl: number, scopeId: string, position = 0) => ({ level: lvl, code, name: code, maxPoints: 10, position, ...meta(code + scopeId, scopeId) }) as Synced<Subject>;
    expect(resolveSubjects([], "s1", 1, "fr").subjects.map((x) => x.name)).toContain("Problèmes");
    expect(resolveSubjects([], "s1", 1, "en").subjects[0]).toMatchObject({ name: "Speaking", branch: "Congolese languages", domain: "langues", maxPoints: 20 });
    expect(defaultSubjects(5)[0]!.maxPoints).toBe(10);
    const rows = [s("b", 1, "s1", 1), s("a", 1, "s1", 0), s("x", 2, "schools")];
    expect(resolveSubjects(rows, "s1", 1)).toMatchObject({ source: "school", subjects: [{ code: "a" }, { code: "b" }] });
    expect(resolveSubjects(rows, "s1", 2)).toMatchObject({ source: "programme", subjects: [{ code: "x" }] });
    expect(resolveSubjects(rows, "s1", 3).source).toBe("default");
  });

  it("finds the mention for a percentage", () => {
    expect(mentionFor(85, DRC_SCHEME.mentions)?.fr).toBe("Distinction");
    expect(mentionFor(80, DRC_SCHEME.mentions)?.fr).toBe("Distinction");
    expect(mentionFor(79.99, DRC_SCHEME.mentions)?.fr).toBe("Satisfaction");
    expect(mentionFor(50, DRC_SCHEME.mentions)?.en).toBe("Pass");
    expect(mentionFor(12, DRC_SCHEME.mentions)?.fr).toBe("Échec");
    expect(mentionFor(null, DRC_SCHEME.mentions)).toBeNull();
    expect(mentionFor(40, [{ minPercent: 50, en: "Pass", fr: "Réussite" }])).toBeNull();
  });

  it("lists only the changed fields of a scheme", () => {
    expect(schemeChanges(DRC_SCHEME, { ...DRC_SCHEME, passPercent: 60 })).toEqual({ passPercent: 60 });
    expect(schemeChanges(DRC_SCHEME, DRC_SCHEME)).toEqual({});
  });
});

describe("reading typed marks", () => {
  it("accepts whole and half points in either decimal style, A for absent, blank for not known", () => {
    expect(readScore("12", 20)).toEqual({ kind: "score", value: 12 });
    expect(readScore(" 12,5 ", 20)).toEqual({ kind: "score", value: 12.5 });
    expect(readScore("12.5", 20)).toEqual({ kind: "score", value: 12.5 });
    expect(readScore("0", 20)).toEqual({ kind: "score", value: 0 });
    expect(readScore("20", 20)).toEqual({ kind: "score", value: 20 });
    expect(readScore("A", 20)).toEqual({ kind: "absent" });
    expect(readScore("abs", 20)).toEqual({ kind: "absent" });
    expect(readScore("", 20)).toEqual({ kind: "empty" });
  });
  it("rejects bad values with a reason", () => {
    expect(readScore("21", 20)).toEqual({ kind: "error", error: "range" });
    expect(readScore("12.3", 20)).toEqual({ kind: "error", error: "step" });
    expect(readScore("-1", 20)).toEqual({ kind: "error", error: "format" });
    expect(readScore("douze", 20)).toEqual({ kind: "error", error: "format" });
  });
  it("formats points the way they are typed", () => {
    expect(formatScore(12.5, "fr")).toBe("12,5");
    expect(formatScore(12.5, "en")).toBe("12.5");
    expect(formatScore(12, "fr")).toBe("12");
  });
});

const C = "class-1";
const mk = (id: string, studentId: string, subject: string, period: string, score: number | null, absent = false, deviceTime?: string): Synced<Mark> =>
  ({ studentId, classId: C, subject, period, score, absent, ...meta(id, "s1", deviceTime) }) as Synced<Mark>;

describe("planning mark changes from the grid", () => {
  it("creates, updates, voids cleared cells and ignores unchanged ones", () => {
    const idx = markIndex([mk("m1", "a", "fr", "P1", 10), mk("m2", "b", "fr", "P1", 12), mk("m3", "c", "fr", "P1", 8)], C);
    const ops = planMarks(idx, C, [
      { studentId: "a", subject: "fr", period: "P1", input: { kind: "score", value: 10 } },
      { studentId: "b", subject: "fr", period: "P1", input: { kind: "absent" } },
      { studentId: "c", subject: "fr", period: "P1", input: { kind: "empty" } },
      { studentId: "d", subject: "fr", period: "P1", input: { kind: "score", value: 15.5 } },
      { studentId: "e", subject: "fr", period: "P1", input: { kind: "empty" } },
    ]);
    expect(ops).toEqual([
      { op: "update", id: "m2", fields: { score: null, absent: true } },
      { op: "void", id: "m3" },
      { op: "create", fields: { studentId: "d", classId: C, subject: "fr", period: "P1", score: 15.5, absent: false, letter: null } },
    ]);
  });
  it("indexes the latest live mark per cell, in this class only", () => {
    const idx = markIndex([mk("old", "a", "fr", "P1", 5, false, "2026-10-01T08:00:00Z"), mk("new", "a", "fr", "P1", 7, false, "2026-10-02T08:00:00Z"), { ...mk("x", "a", "fr", "P2", 3), voidedAt: "2026-10-03T00:00:00Z" }, { ...mk("y", "a", "fr", "P3", 3), classId: "other" }], C);
    expect(idx.get("a|fr|P1")?.id).toBe("new");
    expect(idx.size).toBe(1);
  });
});

describe("class results", () => {
  const subjects: Subject[] = [
    { level: 3, code: "fr", name: "Français", maxPoints: 20, position: 0 },
    { level: 3, code: "math", name: "Maths", maxPoints: 10, position: 1 },
  ];
  const T1 = periodsIn(DRC_SCHEME, { kind: "term", term: 1 });

  it("totals a period, ranks with shared places and applies mentions", () => {
    const idx = markIndex([
      mk("1", "a", "fr", "P1", 18), mk("2", "a", "math", "P1", 9), // 27/30 = 90 %
      mk("3", "b", "fr", "P1", 15), mk("4", "b", "math", "P1", 6), // 21/30 = 70 %
      mk("5", "c", "fr", "P1", 14), mk("6", "c", "math", "P1", 7), // 21/30 = 70 %
      mk("7", "d", "fr", "P1", 5), mk("8", "d", "math", "P1", 4.5), // 9.5/30
    ], C);
    const r = classResults({ studentIds: ["a", "b", "c", "d", "e"], subjects, periods: periodsIn(DRC_SCHEME, { kind: "period", key: "P1" }), marks: idx, scheme: DRC_SCHEME });
    const by = new Map(r.rows.map((x) => [x.studentId, x]));
    expect(by.get("a")).toMatchObject({ obtained: 27, max: 30, percent: 90, rank: 1, passed: true, mention: { fr: "Distinction" } });
    expect(by.get("b")).toMatchObject({ obtained: 21, rank: 2, mention: { fr: "Satisfaction" } });
    expect(by.get("c")).toMatchObject({ rank: 2 });
    expect(by.get("d")).toMatchObject({ obtained: 9.5, rank: 4, passed: false, mention: { fr: "Échec" } });
    expect(by.get("e")).toMatchObject({ percent: null, rank: null, mention: null, passed: null, missing: 2, fullMax: 30 });
    expect(r).toMatchObject({ ranked: 4, passed: 3, missing: 2 });
    expect(r.average).toBeCloseTo((90 + 70 + 70 + (9.5 / 30) * 100) / 4);
  });

  it("over a trimester, exams count double; absent counts as 0, missing is left out and counted", () => {
    const idx = markIndex([
      mk("1", "a", "fr", "P1", 10), mk("2", "a", "fr", "P2", 10), mk("3", "a", "fr", "Ex1", 30),
      mk("4", "a", "math", "P1", 5), mk("5", "a", "math", "P2", 5), mk("6", "a", "math", "Ex1", null, true),
      mk("7", "b", "fr", "P1", 20), // everything else missing
    ], C);
    const r = classResults({ studentIds: ["a", "b"], subjects, periods: T1, marks: idx, scheme: DRC_SCHEME });
    const a = r.rows[0]!, b = r.rows[1]!;
    // fr: 50 / (20+20+40) ; math: 10 / (10+10+20) with the exam absent = 0 / 20
    expect(a.bySubject.get("fr")).toEqual({ obtained: 50, max: 80, fullMax: 80, missing: 0, absent: 0 });
    expect(a.bySubject.get("math")).toEqual({ obtained: 10, max: 40, fullMax: 40, missing: 0, absent: 1 });
    expect(a).toMatchObject({ obtained: 60, max: 120, percent: 50, passed: true, absent: 1, missing: 0 });
    expect(b).toMatchObject({ obtained: 20, max: 20, fullMax: 120, percent: 100, missing: 5, rank: 1 });
    expect(a.rank).toBe(2);
  });

  it("ties are compared to two decimals", () => {
    const idx = markIndex([mk("1", "a", "fr", "P1", 10), mk("2", "b", "fr", "P1", 10)], C);
    const r = classResults({ studentIds: ["a", "b"], subjects: subjects.slice(0, 1), periods: periodsIn(DRC_SCHEME, { kind: "period", key: "P1" }), marks: idx, scheme: DRC_SCHEME });
    expect(r.rows.map((x) => x.rank)).toEqual([1, 1]);
  });
});

describe("subject setup", () => {
  const row = (id: string, code: string, extra: Partial<Subject> = {}) => ({ level: 1, code, name: code.toUpperCase(), maxPoints: 10, position: 0, ...extra, ...meta(id) }) as Synced<Subject>;
  it("edits by code, adds new ones and voids removed ones in this scope only", () => {
    const existing = [row("1", "fr"), row("2", "math"), { ...row("3", "fr"), scopeId: "schools" }, row("4", "art", { level: 2 })];
    const ops = planSubjects(existing, "s1", 1, [
      { level: 1, code: "fr", name: "FR", maxPoints: 20, position: 0 },
      { level: 1, code: "eps", name: "EPS", maxPoints: 10, position: 1 },
    ]);
    expect(ops).toEqual([
      { op: "update", id: "1", fields: { maxPoints: 20 } },
      { op: "create", fields: { level: 1, code: "eps", name: "EPS", maxPoints: 10, position: 1 } },
      { op: "void", id: "2" },
    ]);
  });
  it("makes unique codes from names", () => {
    expect(subjectCode("Éducation physique", new Set())).toBe("education_physique");
    expect(subjectCode("Français", new Set(["francais"]))).toBe("francais_2");
    expect(subjectCode("!!!", new Set())).toBe("subject");
  });
});

describe("marks on the sync engine", () => {
  const SITE = "school-luniemu";
  const permissions = new PermissionRegistry().register(platformActions).register(schoolsActions);
  const entities = new EntityRegistry().register(...schoolsEntities);
  const admin: UserContext = { id: "22222222-2222-4222-8222-222222222222", assignments: [{ role: "school_admin", scope: { type: "site", siteId: SITE } }] };
  const otherHead: UserContext = { id: "33333333-3333-4333-8333-333333333333", assignments: [{ role: "headteacher", scope: { type: "site", siteId: "school-other" } }] };
  const manager: UserContext = { id: "44444444-4444-4444-8444-444444444444", assignments: [{ role: "programme_manager", scope: { type: "global" } }] };
  let db: Db;
  let close: () => Promise<void>;
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    await createSchoolSite(db, { id: SITE, name: "École Luniemu" });
    await createSchoolSite(db, { id: "school-other", name: "Autre" });
  });
  afterEach(async () => close());
  const push = (user: UserContext, mutations: Parameters<typeof handlePush>[1]["mutations"]) =>
    handlePush({ db, user, deviceId: "web:test", permissions, entities }, { deviceNow: new Date().toISOString(), mutations });
  const ins = (entity: string, scopeId: string, fields: Record<string, unknown>, recordId = uuid()) =>
    ({ mutationId: uuid(), entity, recordId, op: "insert" as const, scopeId, fields, deviceTime: new Date().toISOString() });
  const markFields = (score: number | null, absent = false) => ({ studentId: uuid(), classId: uuid(), subject: "fr", period: "P1", score, absent });

  it("school staff enter marks at their school only; half points pass, other steps are refused", async () => {
    const r = await push(admin, [ins("school.mark", SITE, markFields(12.5)), ins("school.mark", SITE, markFields(null, true)), ins("school.mark", SITE, markFields(12.3)), ins("school.mark", "school-other", markFields(10))]);
    expect(r.results.map((x) => x.status)).toEqual(["applied", "applied", "rejected", "rejected"]);
    expect(r.results[2]!.reason).toMatch(/invalid:score/);
    expect(r.results[3]!.reason).toBe("forbidden");
    expect((await push(otherHead, [ins("school.mark", SITE, markFields(10))])).results[0]!.reason).toBe("forbidden");
    const d = await loadSchool(db, SITE);
    expect(d!.marks.map((m) => m.score).sort()).toEqual([12.5, null]);
  });

  it("only configurers set schemes and subjects; the programme default is stream-wide and every school reads it", async () => {
    expect((await push(admin, [ins("school.grading_scheme", SITE, { ...DRC_SCHEME })])).results[0]!.reason).toBe("forbidden");
    expect((await push(admin, [ins("school.subject", SITE, { level: 1, code: "fr", name: "Français", maxPoints: 20, position: 0 })])).results[0]!.reason).toBe("forbidden");
    const r = await push(manager, [ins("school.grading_scheme", "schools", { ...DRC_SCHEME, name: "Programme", passPercent: 60 }), ins("school.subject", SITE, { level: 1, code: "fr", name: "Français", maxPoints: 20, position: 0 })]);
    expect(r.results.map((x) => x.status)).toEqual(["applied", "applied"]);
    const d = await loadSchool(db, SITE);
    expect(resolveScheme(d!.gradingSchemes, SITE)).toMatchObject({ source: "programme", scheme: { passPercent: 60 } });
    expect(resolveSubjects(d!.subjects, SITE, 1).source).toBe("school");
  });

  it("an update changes only the fields it sends (zod defaults must not reset the others)", async () => {
    const yearId = uuid(), classId = uuid(), itemId = uuid(), planId = uuid(), schemeId = uuid();
    const upd = (entity: string, recordId: string, fields: Record<string, unknown>) =>
      ({ mutationId: uuid(), entity, recordId, op: "update" as const, scopeId: SITE, fields, deviceTime: new Date().toISOString() });
    const r = await push(manager, [
      ins("school.academic_year", SITE, { label: "2026-2027", startsOn: "2026-09-01", endsOn: "2027-07-02" }, yearId),
      ins("school.class", SITE, { academicYearId: yearId, level: 7, section: "B", shift: "morning", classroomId: null }, classId),
      ins("school.fee_item", SITE, { academicYearId: yearId, termId: null, name: "Minerval · Oct 2026", levels: [1], amount: 1000, dueOn: "2026-10-05", planId, periodEndsOn: "2026-10-31" }, itemId),
      ins("school.grading_scheme", SITE, { ...DRC_SCHEME, name: "CTEB", levels: [7, 8] }, schemeId),
    ]);
    expect(r.results.map((x) => x.status)).toEqual(["applied", "applied", "applied", "applied"]);
    const r2 = await push(manager, [upd("school.class", classId, { shift: "afternoon" }), upd("school.fee_item", itemId, { amount: 1200 }), upd("school.grading_scheme", schemeId, { passPercent: 60 })]);
    expect(r2.results.map((x) => x.status)).toEqual(["applied", "applied", "applied"]);
    const d = await loadSchool(db, SITE);
    expect(d!.classes[0]).toMatchObject({ section: "B", shift: "afternoon", level: 7 });
    expect(d!.feeItems[0]).toMatchObject({ amount: 1200, planId, periodEndsOn: "2026-10-31" });
    expect(d!.gradingSchemes[0]).toMatchObject({ passPercent: 60, levels: [7, 8] });
  });
});

describe("levels 7 and 8", () => {
  it("classes, fee items and subjects accept levels 1 to 8 and nothing beyond", async () => {
    const { level, LEVELS, schoolClass } = await import("../src");
    expect(LEVELS).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(level.safeParse(8).success).toBe(true);
    expect(level.safeParse(9).success).toBe(false);
    expect(schoolClass.safeParse({ academicYearId: "00000000-0000-4000-8000-000000000001", level: 7, section: "A", shift: "morning", classroomId: null }).success).toBe(true);
    expect(defaultSubjects(8).length).toBeGreaterThan(0);
  });
});

describe("ministry bulletin subjects and layout", () => {
  const sum = (lvl: number, domain: string, branch?: string) =>
    defaultSubjects(lvl).filter((s) => s.domain === domain && (branch === undefined || s.branch === branch)).reduce((n, s) => n + s.maxPoints, 0);
  it("defaults match the sub-totals printed on the élémentaire and moyen bulletins", () => {
    expect([sum(1, "langues", "Langues congolaises"), sum(1, "langues", "Français"), sum(1, "mst"), sum(1, "social"), sum(1, "arts")]).toEqual([40, 30, 110, 20, 20]);
    expect([sum(3, "langues", "Langues congolaises"), sum(3, "langues", "Français"), sum(3, "mst"), sum(3, "social"), sum(3, "arts")]).toEqual([25, 35, 90, 40, 20]);
    // Trimester maximum is 4 × the period maximum with the DRC scheme (2 periods + exam × 2): Problèmes 20 → 80.
    const prob = defaultSubjects(1).find((s) => s.name === "Problèmes")!;
    expect(periodsIn(DRC_SCHEME, { kind: "term", term: 1 }).reduce((n, p) => n + maxFor(prob, p, DRC_SCHEME), 0)).toBe(80);
    const codes = defaultSubjects(3).map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(defaultSubjects(3, "en").map((s) => s.code)).toEqual(codes);
    expect(defaultSubjects(1).find((s) => s.name === "Religion")?.optional).toBe(true);
  });
  it("puts sub-totals per branch in the language domain and per domain elsewhere", () => {
    const lines = bulletinLayout(defaultSubjects(1), domainsOf(DRC_SCHEME, 1));
    const subtotals = lines.filter((l) => l.type === "subtotal").map((l) => (l as { codes: string[] }).codes.length);
    expect(subtotals).toEqual([2, 2, 7, 2, 2, 3]);
    expect(lines.filter((l) => l.type === "domain")).toHaveLength(5);
    expect(lines.filter((l) => l.type === "branch").map((l) => (l as { label: string }).label)).toEqual(["Langues congolaises", "Français", "Mathématiques", "Sciences", "Technologie"]);
  });
  it("lays out the 5e and 6e forms: sub-totals for each language and MST branch, Technologie included", () => {
    const subs = defaultSubjects(6);
    const lines = bulletinLayout(subs, domainsOf(DRC_SCHEME, 6));
    const max = (codes: string[]) => codes.reduce((n, c) => n + subs.find((s) => s.code === c)!.maxPoints, 0);
    const totals = lines.filter((l) => l.type === "subtotal").map((l) => max((l as { codes: string[] }).codes));
    // LC 30, Français 50, Maths 60, Sciences 30, Technologie 10, Univers social 40, Arts 20, Dév. personnel 30.
    expect(totals).toEqual([30, 50, 60, 30, 10, 40, 20, 30]);
    expect(defaultSubjects(5).map((s) => [s.code, s.maxPoints])).toEqual(subs.map((s) => [s.code, s.maxPoints]));
    expect(new Set(subs.map((s) => s.code)).size).toBe(subs.length);
    expect(subs.reduce((n, s) => n + s.maxPoints, 0)).toBe(310);
    // A scheme saved with a copy of the old DRC domains still gets the 5e-6e layout.
    expect(domainsOf({ domains: domainsOf({}, 1) }, 6).find((d) => d.key === "mst")?.subtotal).toBe("branch");
    expect(domainsOf({}, 3).find((d) => d.key === "mst")?.subtotal).toBe("domain");
    // The 6e Résultat final is kept as marks in the pseudo-period FIN.
    expect(mark.safeParse({ studentId: "00000000-0000-4000-8000-000000000001", classId: "00000000-0000-4000-8000-000000000002", subject: FINAL.exam, period: FINAL.period, score: 33.5, absent: false }).success).toBe(true);
    expect(mark.safeParse({ studentId: "00000000-0000-4000-8000-000000000001", classId: "00000000-0000-4000-8000-000000000002", subject: FINAL.exam, period: "FINAL", score: 33.5, absent: false }).success).toBe(false);
  });
  it("leaves an optional subject a pupil does not take out of their maximum", () => {
    const subjects = [{ level: 1, code: "a", name: "A", maxPoints: 10, position: 0 }, { level: 1, code: "rel", name: "Religion", maxPoints: 10, position: 1, optional: true }];
    const marks = new Map([["s1|a|P1", { score: 8, absent: false }], ["s2|a|P1", { score: 8, absent: false }], ["s2|rel|P1", { score: 10, absent: false }]]);
    const r = classResults({ studentIds: ["s1", "s2"], subjects, periods: [{ key: "P1", kind: "period", term: 1, n: 1 }], marks, scheme: DRC_SCHEME });
    expect(r.rows.map((x) => [x.fullMax, x.missing, x.percent])).toEqual([[10, 0, 80], [20, 0, 90]]);
  });
  it("reads letter grades and updates only what changed", () => {
    expect(readLetter("tb", DRC_SCHEME.letters)).toEqual({ kind: "letter", value: "TB" });
    expect(readLetter("X", DRC_SCHEME.letters)).toEqual({ kind: "error", error: "letter" });
    const prev = new Map([["s|_conduct|P1", { id: "m1", studentId: "s", classId: "c", subject: "_conduct", period: "P1", score: null, absent: false, letter: "B" } as never]]);
    expect(planMarks(prev, "c", [{ studentId: "s", subject: "_conduct", period: "P1", input: { kind: "letter", value: "TB" } }])).toEqual([{ op: "update", id: "m1", fields: { letter: "TB" } }]);
  });
});
