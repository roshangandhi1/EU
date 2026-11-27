"use server";
import {
  CTEB_SCHEME, DRC_SCHEME, levelNumbers, levelsOf, usesSemesters, defaultSubjects, gradingScheme, insertMutation, live, planSubjects, schemeChanges, schemeLevelClash, subject, subjectCode, updateMutation, voidMutation,
  type GradingScheme, type MentionBand, type Subject,
} from "@eu/schools";
import type { Mutation } from "@eu/sync";
import { revalidatePath } from "next/cache";
import { back, can, firstRejection, newId, push, schoolFor, signedIn, str } from "@/lib/schools";

async function ctx(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const programme = str(fd, "scope") === "programme";
  const level = Number(str(fd, "level")) || 1;
  const schemeId = str(fd, "schemeId");
  const path = `/${locale}/schools/${siteId}/setup/grading?${new URLSearchParams({ ...(programme ? { scope: "programme" } : {}), level: String(level), ...(schemeId ? { scheme: schemeId } : {}) })}`;
  // The programme-wide default is held by the stream; changing it needs the right across all schools.
  if (!can(me, "school.configure", siteId) || (programme && !can(me, "school.configure", null))) back(path, { error: "forbidden" });
  const d = await schoolFor(me, siteId);
  return { me, locale, siteId, scopeId: programme ? "schools" : siteId, level, schemeId, d, path };
}

async function apply(me: Parameters<typeof push>[0], muts: Mutation[], locale: string, siteId: string, path: string) {
  if (muts.length === 0) back(path, { grading_nothing: "1" });
  const res = await push(me, muts);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const bad = firstRejection(res);
  if (bad) back(path, { error: bad });
  back(path, { grading_saved: "1" });
}

/**
 * Saves the scheme being edited (schemeId) in place, or adds a new one. A level can be in one
 * scheme only, and only one scheme per school can be the fallback (no levels ticked).
 */
async function writeScheme(c: Awaited<ReturnType<typeof ctx>>, next: GradingScheme) {
  const own = c.schemeId ? live(c.d.gradingSchemes).find((s) => s.id === c.schemeId && s.scopeId === c.scopeId) : undefined;
  if (c.schemeId && !own) back(c.path, { error: "not_found" });
  const clash = schemeLevelClash(c.d.gradingSchemes, c.scopeId, next.levels, own?.id);
  if (clash.taken.length) back(c.path, { error: "scheme_levels", levels: clash.taken.join(", ") });
  if (clash.fallbackTaken) back(c.path, { error: "scheme_fallback" });
  const muts: Mutation[] = [];
  let id = own?.id;
  if (!own) {
    id = newId();
    muts.push(insertMutation("school.grading_scheme", c.scopeId, { ...next }, { mutationId: newId(), recordId: id }));
  } else {
    const changes = schemeChanges(own, next);
    if (Object.keys(changes).length) muts.push(updateMutation("school.grading_scheme", c.scopeId, own.id, changes, newId()));
  }
  // After adding, stay on the new scheme.
  await apply(c.me, muts, c.locale, c.siteId, c.schemeId ? c.path : `${c.path}&scheme=${id}`);
}

/** The levels ticked on the scheme form (1-8). */
const levelsFrom = (fd: FormData) => [...new Set(fd.getAll("levels").map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 20))].sort((a, b) => a - b);

/** Removes a scheme. Its levels fall back to the school's fallback scheme (or the programme's, or DRC). Marks are kept. */
export async function deleteScheme(fd: FormData) {
  const c = await ctx(fd);
  const own = live(c.d.gradingSchemes).find((s) => s.id === c.schemeId && s.scopeId === c.scopeId);
  if (!own) back(c.path, { error: "not_found" });
  const base = c.path.replace(/&scheme=[^&]*/, "");
  await apply(c.me, [voidMutation("school.grading_scheme", c.scopeId, own!.id, "Removed in grading setup", newId())], c.locale, c.siteId, base);
}

const decimal = (s: string) => Number(s.replace(",", "."));

export async function saveScheme(fd: FormData) {
  const c = await ctx(fd);
  const terms: GradingScheme["terms"] = [];
  for (let i = 0; i < 4; i++) {
    const n = Number(str(fd, `periods:${i}`));
    if (n > 0) terms.push({ periods: n, exam: fd.get(`exam:${i}`) === "on" });
  }
  if (terms.length === 0) back(c.path, { error: "scheme_terms" });
  const mentions: MentionBand[] = [];
  for (let i = 0; i < 8; i++) {
    const min = str(fd, `min:${i}`), fr = str(fd, `fr:${i}`), en = str(fd, `en:${i}`);
    if (!min && !fr && !en) continue;
    if (!min || (!fr && !en) || !/^\d{1,3}$/.test(min)) back(c.path, { error: "scheme_mentions" });
    mentions.push({ minPercent: Number(min), fr: fr || en, en: en || fr });
  }
  mentions.sort((a, b) => b.minPercent - a.minPercent);
  if (new Set(mentions.map((m) => m.minPercent)).size !== mentions.length) back(c.path, { error: "scheme_mentions" });
  const letters = str(fd, "letters").split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  if (letters.length < 2 || new Set(letters).size !== letters.length) back(c.path, { error: "scheme_letters" });
  // Domains have no editor yet: a scheme keeps its own, a new one starts from the DRC domains.
  const own = live(c.d.gradingSchemes).find((s) => s.id === c.schemeId);
  const next = { name: str(fd, "name"), levels: levelsFrom(fd), terms, examFactor: decimal(str(fd, "examFactor")), passPercent: Number(str(fd, "passPercent")), mentions, letters, domains: own?.domains ?? [] };
  const parsed = gradingScheme.safeParse(next);
  if (!parsed.success) back(c.path, { error: parsed.error.issues[0]?.path[0] === "mentions" ? "scheme_mentions" : "scheme_invalid" });
  await writeScheme(c, parsed.data!);
}

/** Puts the DRC standard periods (CTEB semesters for a 7e-8e scheme), pass mark and mentions back into this scheme, keeping its name and levels. */
export async function restoreScheme(fd: FormData) {
  const c = await ctx(fd);
  const own = live(c.d.gradingSchemes).find((s) => s.id === c.schemeId);
  // A scheme only for semester levels goes back to the semesters; any other to the primary trimesters.
  const def = own?.levels?.length && own.levels.every((l) => usesSemesters(levelsOf(c.d.school), l)) ? CTEB_SCHEME : DRC_SCHEME;
  await writeScheme(c, { ...def, name: own?.name ?? def.name, levels: own?.levels ?? [] });
}

function subjectMutations(c: Awaited<ReturnType<typeof ctx>>, levels: readonly number[], wanted: (lvl: number) => Subject[]): Mutation[] {
  const muts: Mutation[] = [];
  for (const lvl of levels) {
    for (const o of planSubjects(c.d.subjects, c.scopeId, lvl, wanted(lvl))) {
      muts.push(
        o.op === "create"
          ? insertMutation("school.subject", c.scopeId, { ...o.fields }, { mutationId: newId(), recordId: newId() })
          : o.op === "update"
            ? updateMutation("school.subject", c.scopeId, o.id, o.fields, newId())
            : voidMutation("school.subject", c.scopeId, o.id, "Removed in grading setup", newId()),
      );
    }
  }
  return muts;
}

/** Saves the subject list of one level (or of every level), matched by code so marks keep their subject. */
export async function saveSubjects(fd: FormData) {
  const c = await ctx(fd);
  const rows: { code: string; name: string; maxPoints: number; domain: string; branch: string; optional: boolean }[] = [];
  for (let i = 0; i < 40; i++) {
    if (!fd.has(`name:${i}`)) break;
    const name = str(fd, `name:${i}`), max = str(fd, `max:${i}`), code = str(fd, `code:${i}`);
    if (fd.get(`del:${i}`) === "on" || (!name && !max)) continue;
    if (!name || !/^\d{1,3}$/.test(max) || Number(max) < 1) back(c.path, { error: "subjects_invalid" });
    rows.push({ code, name, maxPoints: Number(max), domain: str(fd, `domain:${i}`), branch: str(fd, `branch:${i}`), optional: fd.get(`opt:${i}`) === "on" });
  }
  if (rows.length === 0) back(c.path, { error: "subjects_empty" });
  const taken = new Set(rows.map((r) => r.code).filter(Boolean));
  const list = rows.map((r) => {
    const code = r.code || subjectCode(r.name, taken);
    taken.add(code);
    return { ...r, code };
  });
  const wanted = (lvl: number): Subject[] => list.map((r, i) => ({ level: lvl, code: r.code, name: r.name, maxPoints: r.maxPoints, position: i, domain: r.domain, branch: r.branch, optional: r.optional }));
  if (wanted(c.level).some((s) => !subject.safeParse(s).success)) back(c.path, { error: "subjects_invalid" });
  const levels = fd.get("allLevels") === "on" ? levelNumbers(c.d.school) : [c.level];
  await apply(c.me, subjectMutations(c, levels, wanted), c.locale, c.siteId, c.path);
}

/** Puts back the DRC default subjects and maxima for the level shown. */
export async function restoreSubjects(fd: FormData) {
  const c = await ctx(fd);
  await apply(c.me, subjectMutations(c, [c.level], (lvl) => defaultSubjects(lvl, "fr")), c.locale, c.siteId, c.path);
}
