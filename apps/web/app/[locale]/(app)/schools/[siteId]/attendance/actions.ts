"use server";
import { absenceReason, activeOn, insertMutation, planRegister, updateMutation, voidMutation } from "@eu/schools";
import type { Mutation } from "@eu/sync";
import { revalidatePath } from "next/cache";
import { back, firstRejection, newId, push, schoolFor, signedIn, str, today } from "@/lib/schools";

/** Saves a register: marks the register taken, adds new absences and voids absences that were unticked. */
export async function saveRegister(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const classId = str(fd, "classId");
  const date = str(fd, "date");
  const path = `/${locale}/schools/${siteId}/attendance?class=${classId}&date=${date}`;
  const d = await schoolFor(me, siteId);
  // No registers for days that have not happened yet, or for a class removed in Setup.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today() || !d.classes.some((c) => c.id === classId && !c.voidedAt)) back(path, { error: "invalid:date" });

  const roster = new Set(activeOn(d.enrolments, date).filter((e) => e.classId === classId).map((e) => e.studentId));
  const absent = new Map(
    fd.getAll("absent").map(String).filter((id) => roster.has(id))
      .map((id) => [id, (absenceReason.safeParse(str(fd, `reason-${id}`)).data ?? "unknown")] as const),
  );
  const muts: Mutation[] = planRegister(classId, date, d.absences, d.registers, absent).map((o) => {
    if (o.op === "create_register") return insertMutation("school.register", siteId, { classId, date }, { mutationId: newId(), recordId: newId() });
    if (o.op === "create_absence") return insertMutation("school.absence", siteId, { studentId: o.studentId, classId, date, reason: o.reason }, { mutationId: newId(), recordId: newId() });
    if (o.op === "update_reason") return updateMutation("school.absence", siteId, o.absenceId, { reason: o.reason }, newId());
    return voidMutation("school.absence", siteId, o.absenceId, "Marked present on correction", newId());
  });
  const res = muts.length ? await push(me, muts) : [];
  revalidatePath(`/${locale}/schools/${siteId}`);
  const bad = firstRejection(res);
  back(path, bad ? { error: bad } : { ok: "1" });
}
