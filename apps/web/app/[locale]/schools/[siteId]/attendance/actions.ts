"use server";
import { activeOn, insertMutation, voidMutation } from "@eu/schools";
import type { Mutation } from "@eu/sync";
import { revalidatePath } from "next/cache";
import { back, firstRejection, newId, push, schoolFor, signedIn, str } from "@/lib/schools";

/** Saves a register: marks the register taken, adds new absences and voids absences that were unticked. */
export async function saveRegister(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const classId = str(fd, "classId");
  const date = str(fd, "date");
  const path = `/${locale}/schools/${siteId}/attendance?class=${classId}&date=${date}`;
  const d = await schoolFor(me, siteId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !d.classes.some((c) => c.id === classId)) back(path, { error: "invalid" });

  const roster = new Set(activeOn(d.enrolments, date).filter((e) => e.classId === classId).map((e) => e.studentId));
  const absentNow = new Set(fd.getAll("absent").map(String).filter((id) => roster.has(id)));
  const existing = d.absences.filter((a) => !a.voidedAt && a.classId === classId && a.date === date);
  const already = new Set(existing.map((a) => a.studentId));
  const muts: Mutation[] = [];
  if (!d.registers.some((r) => !r.voidedAt && r.classId === classId && r.date === date)) {
    muts.push(insertMutation("school.register", siteId, { classId, date }, { mutationId: newId(), recordId: newId() }));
  }
  for (const studentId of absentNow) {
    if (already.has(studentId)) continue;
    const reason = str(fd, `reason-${studentId}`) || "unknown";
    muts.push(insertMutation("school.absence", siteId, { studentId, classId, date, reason }, { mutationId: newId(), recordId: newId() }));
  }
  for (const a of existing) {
    if (!absentNow.has(a.studentId)) muts.push(voidMutation("school.absence", siteId, a.id, "Marked present on correction", newId()));
  }
  const res = muts.length ? await push(me, muts) : [];
  revalidatePath(`/${locale}/schools/${siteId}`);
  const bad = firstRejection(res);
  back(path, bad ? { error: bad } : { ok: "1" });
}
