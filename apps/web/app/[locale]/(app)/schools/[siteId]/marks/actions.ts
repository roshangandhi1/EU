"use server";
import { FINAL, insertMutation, isBehaviour, isFinal, lettersOf, maxFor, planMarks, readLetter, readScore, updateMutation, voidMutation, type ScoreInput } from "@eu/schools";
import type { Mutation } from "@eu/sync";
import { revalidatePath } from "next/cache";
import { back, can, firstRejection, newId, push, schoolFor, signedIn, str, today } from "@/lib/schools";
import { marksContext } from "./shared";

/** Saves every cell of the entry grid in one go: new marks, changed marks, and cleared cells (voided). */
export async function saveMarks(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const classId = str(fd, "classId");
  const period = str(fd, "period");
  const subjectFilter = str(fd, "subject");
  const q = new URLSearchParams({ class: classId, period, ...(subjectFilter ? { subject: subjectFilter } : {}) });
  const path = `/${locale}/schools/${siteId}/marks?${q}`;
  if (!can(me, "marks.write", siteId)) back(path, { error: "forbidden" });
  const d = await schoolFor(me, siteId);
  const ctx = marksContext(d, siteId, today(), classId, locale);
  const final = period === FINAL.period && ctx.cls?.level === FINAL.level;
  const p = ctx.periods.find((x) => x.key === period);
  if (!ctx.cls || (!p && !final)) back(path, { error: "invalid" });
  const subjects = new Map(ctx.subjectsOf(ctx.cls!.level).subjects.map((s) => [s.code, s]));
  const pupils = new Set(ctx.pupilsOf(classId).map((s) => s.id));

  const cells: { studentId: string; subject: string; period: string; input: Exclude<ScoreInput, { kind: "error" }> }[] = [];
  let bad = 0;
  for (const [name, raw] of fd.entries()) {
    if (!name.startsWith("m:") || typeof raw !== "string") continue;
    const [studentId, code, per] = name.slice(2).split("|");
    if (!studentId || per !== period || !pupils.has(studentId)) continue;
    if (final) {
      // Résultat final: school average and ENAFEP, each out of 50.
      if (!isFinal(code ?? "")) continue;
      const input = readScore(raw, FINAL.max);
      if (input.kind === "error") { bad++; continue; }
      cells.push({ studentId, subject: code!, period, input });
      continue;
    }
    if (isBehaviour(code ?? "")) {
      // Application / Conduite: a letter per period, never on an exam.
      if (p!.kind !== "period") continue;
      const input = readLetter(raw, lettersOf(ctx.scheme));
      if (input.kind === "error") { bad++; continue; }
      cells.push({ studentId, subject: code!, period, input });
      continue;
    }
    const sub = subjects.get(code ?? "");
    if (!sub) continue;
    const input = readScore(raw, maxFor(sub, p!, ctx.scheme));
    if (input.kind === "error") { bad++; continue; }
    cells.push({ studentId, subject: sub.code, period, input });
  }
  if (bad > 0) back(path, { error: "marks_bad", n: String(bad) });

  const ops = planMarks(ctx.index(classId), classId, cells);
  if (ops.length === 0) back(path, { marks_nothing: "1" });
  const muts: Mutation[] = ops.map((o) =>
    o.op === "create"
      ? insertMutation("school.mark", siteId, { ...o.fields }, { mutationId: newId(), recordId: newId() })
      : o.op === "update"
        ? updateMutation("school.mark", siteId, o.id, o.fields, newId())
        : voidMutation("school.mark", siteId, o.id, "Cleared in the marks grid", newId()),
  );
  const res = await push(me, muts);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const rejected = firstRejection(res);
  if (rejected) back(path, { error: rejected });
  back(path, { marks_saved: String(ops.length), t: String(Date.now()) });
}
