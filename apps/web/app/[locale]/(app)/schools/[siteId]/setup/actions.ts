"use server";
import { insertMutation, updateMutation, voidMutation, schoolsEntities } from "@eu/schools";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, firstRejection, int, newId, orNull, parseLevels, push, schoolFor, signedIn, str } from "@/lib/schools";

const CONFIG = new Set(["school.academic_year", "school.term", "school.classroom", "school.class", "school.fee_item", "school.receipt_book", "school.exemption", "school.device_tag"]);

async function ctx(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const section = str(fd, "section").replace(/[^a-z-]/g, "");
  const path = `/${locale}/schools/${siteId}/setup`;
  // Results come back to the section that sent them (?s=) and the page scrolls to it (#).
  const go = (q: Record<string, string>): never =>
    redirect(`${path}?${new URLSearchParams({ ...q, ...(section ? { s: section } : {}), ...(q.ok ? { n: Date.now().toString(36) } : {}) })}${section ? `#${section}` : ""}`);
  if (!can(me, "school.configure", siteId)) go({ error: "forbidden" });
  return { me, locale, siteId, path, go };
}

async function insert(fd: FormData, entity: string, fields: Record<string, unknown>) {
  const { me, locale, siteId, go } = await ctx(fd);
  const def = schoolsEntities.find((e) => e.name === entity)!;
  if (!def.schema.safeParse(fields).success) go({ error: "invalid" });
  const res = await push(me, [insertMutation(entity, siteId, fields, { mutationId: newId(), recordId: newId() })]);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const bad = firstRejection(res);
  go(bad ? { error: bad } : { ok: "added" });
}

export async function saveSchool(fd: FormData) {
  const { me, locale, siteId, go } = await ctx(fd);
  const d = await schoolFor(me, siteId);
  const shiftsRunning = fd.getAll("shiftsRunning").map(String).filter((s) => s === "morning" || s === "afternoon");
  if (!d.school || shiftsRunning.length === 0) go({ error: "invalid" });
  const res = await push(me, [updateMutation("school.school", siteId, d.school!.id, { shiftsRunning }, newId())]);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const bad = firstRejection(res);
  go(bad ? { error: bad } : { ok: "saved" });
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
  const { me, locale, siteId, go } = await ctx(fd);
  const entity = str(fd, "entity");
  if (!CONFIG.has(entity)) go({ error: "invalid" });
  const res = await push(me, [voidMutation(entity, siteId, str(fd, "id"), str(fd, "reason") || "Removed in setup", newId())]);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const bad = firstRejection(res);
  go(bad ? { error: bad } : { ok: "removed" });
}

/** One letter per phone per school, never W (the web's), never reused while assigned. */
export async function addDeviceTag(fd: FormData) {
  const { me, siteId, go } = await ctx(fd);
  const d = await schoolFor(me, siteId);
  const deviceId = str(fd, "deviceId");
  const tag = str(fd, "tag").toUpperCase();
  if (d.deviceTags.some((x) => !x.voidedAt && (x.tag === tag || x.phoneId === deviceId))) go({ error: "letter_taken" });
  return insert(fd, "school.device_tag", { phoneId: deviceId, tag });
}
