"use server";
import { insertMutation, updateMutation, voidMutation, schoolsEntities } from "@eu/schools";
import { revalidatePath } from "next/cache";
import { back, can, firstRejection, int, newId, orNull, parseLevels, push, schoolFor, signedIn, str } from "@/lib/schools";

const CONFIG = new Set(["school.academic_year", "school.term", "school.classroom", "school.class", "school.fee_item", "school.receipt_book", "school.exemption"]);

async function ctx(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const path = `/${locale}/schools/${siteId}/setup`;
  if (!can(me, "school.configure", siteId)) back(path, { error: "forbidden" });
  return { me, locale, siteId, path };
}

async function insert(fd: FormData, entity: string, fields: Record<string, unknown>) {
  const { me, locale, siteId, path } = await ctx(fd);
  const def = schoolsEntities.find((e) => e.name === entity)!;
  if (!def.schema.safeParse(fields).success) back(path, { error: "invalid" });
  const res = await push(me, [insertMutation(entity, siteId, fields, { mutationId: newId(), recordId: newId() })]);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const bad = firstRejection(res);
  back(path, bad ? { error: bad } : { ok: "1" });
}

export async function saveSchool(fd: FormData) {
  const { me, locale, siteId, path } = await ctx(fd);
  const d = await schoolFor(me, siteId);
  const shiftsRunning = fd.getAll("shiftsRunning").map(String).filter((s) => s === "morning" || s === "afternoon");
  if (!d.school || shiftsRunning.length === 0) back(path, { error: "invalid" });
  const res = await push(me, [updateMutation("school.school", siteId, d.school!.id, { shiftsRunning }, newId())]);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const bad = firstRejection(res);
  back(path, bad ? { error: bad } : { ok: "1" });
}

export const addYear = async (fd: FormData) =>
  insert(fd, "school.academic_year", { label: str(fd, "label"), startsOn: str(fd, "startsOn"), endsOn: str(fd, "endsOn") });

export const addTerm = async (fd: FormData) =>
  insert(fd, "school.term", { academicYearId: str(fd, "academicYearId"), number: int(fd, "number"), startsOn: str(fd, "startsOn"), endsOn: str(fd, "endsOn") });

export const addClassroom = async (fd: FormData) =>
  insert(fd, "school.classroom", {
    name: str(fd, "name"),
    seatsPerShift: int(fd, "seatsPerShift"),
    basis: str(fd, "basis"),
    commissionedOn: str(fd, "commissionedOn"),
    decommissionedOn: orNull(str(fd, "decommissionedOn")),
    evidenceUrl: orNull(str(fd, "evidenceUrl")),
  });

export const addClass = async (fd: FormData) =>
  insert(fd, "school.class", {
    academicYearId: str(fd, "academicYearId"),
    level: int(fd, "level"),
    section: str(fd, "section").toUpperCase() || "A",
    shift: str(fd, "shift"),
    classroomId: orNull(str(fd, "classroomId")),
  });

export const addFeeItem = async (fd: FormData) =>
  insert(fd, "school.fee_item", {
    academicYearId: str(fd, "academicYearId"),
    termId: orNull(str(fd, "termId")),
    name: str(fd, "name"),
    levels: parseLevels(str(fd, "levels")),
    amount: int(fd, "amount"),
    dueOn: str(fd, "dueOn"),
  });

export const addReceiptBook = async (fd: FormData) =>
  insert(fd, "school.receipt_book", { firstNumber: int(fd, "firstNumber"), lastNumber: int(fd, "lastNumber"), assignedTo: str(fd, "assignedTo") });

export const addExemption = async (fd: FormData) =>
  insert(fd, "school.exemption", {
    studentId: str(fd, "studentId"),
    feeItemId: orNull(str(fd, "feeItemId")),
    kind: str(fd, "kind"),
    value: int(fd, "value") ?? 0,
    reason: str(fd, "reason"),
  });

export async function voidConfig(fd: FormData) {
  const { me, locale, siteId, path } = await ctx(fd);
  const entity = str(fd, "entity");
  if (!CONFIG.has(entity)) back(path, { error: "invalid" });
  const res = await push(me, [voidMutation(entity, siteId, str(fd, "id"), str(fd, "reason") || "Removed in setup", newId())]);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const bad = firstRejection(res);
  back(path, bad ? { error: bad } : { ok: "1" });
}
