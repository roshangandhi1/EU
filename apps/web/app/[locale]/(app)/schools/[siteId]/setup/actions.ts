"use server";
import { sites } from "@eu/db";
import { insertMutation, schoolsEntities, schoolsTables, updateMutation, voidMutation, type SchoolData } from "@eu/schools";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/http";
import { can, firstRejection, int, newId, orNull, parseLevels, push, schoolFor, signedIn, str, today, tr as trFor } from "@/lib/schools";
import { errorText } from "../../text";
import { checkBook, checkClass, checkExemption, checkFeeItem, checkRoom, checkTerm, checkYear, parseLatLng, type Problem } from "./checks";
import { dependants } from "./dependants";

const CONFIG = new Set(["school.academic_year", "school.term", "school.classroom", "school.class", "school.fee_item", "school.receipt_book", "school.exemption", "school.device_tag"]);

/** Result of a Setup form: a sentence to show, the fields to outline, or success. */
export interface SetupState { n?: number; ok?: boolean; okText?: string; message?: string; fields?: string[] }

type Ctx = { me: Awaited<ReturnType<typeof signedIn>>["me"]; locale: "en" | "fr"; siteId: string; d: SchoolData; tr: ReturnType<typeof trFor> };

async function ctxOf(fd: FormData): Promise<Ctx | null> {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  if (!can(me, "school.configure", siteId)) return null;
  return { me, locale, siteId, d: await schoolFor(me, siteId), tr: trFor(locale) };
}

const problemText = (c: Ctx, pr: Problem) => c.tr(`err.setup.${pr.code}`, pr.vars);

/** Wraps a Setup form action: permission, numbering of results, and turning codes into sentences. */
function form(run: (c: Ctx, fd: FormData) => Promise<Problem | string | null>, okKey = "ux.added") {
  return async (prev: SetupState, fd: FormData): Promise<SetupState> => {
    const n = (prev.n ?? 0) + 1;
    const c = await ctxOf(fd);
    if (!c) return { n, message: errorText("forbidden", trFor(str(fd, "locale") === "en" ? "en" : "fr")) };
    const r = await run(c, fd);
    if (r === null) {
      revalidatePath(`/${c.locale}/schools/${c.siteId}`, "layout");
      return { n, ok: true, okText: c.tr(okKey) };
    }
    if (typeof r === "string") {
      const field = /^invalid:([^:.]+)/.exec(r)?.[1];
      return { n, message: errorText(r, c.tr), fields: field ? [field] : [] };
    }
    return { n, message: problemText(c, r), fields: r.fields };
  };
}

/** Validates against the entity schema (first bad field is reported), then sends one insert. */
async function insert(c: Ctx, entity: string, fields: Record<string, unknown>): Promise<string | null> {
  const def = schoolsEntities.find((e) => e.name === entity)!;
  const parsed = def.schema.safeParse(fields);
  if (!parsed.success) return `invalid:${String(parsed.error.issues[0]?.path[0] ?? "")}`;
  const res = await push(c.me, [insertMutation(entity, c.siteId, fields, { mutationId: newId(), recordId: newId() })]);
  return firstRejection(res);
}

/** Runs the schema first (so a missing date is reported as such), then the cross-field check. */
async function checked<T extends Record<string, unknown>>(c: Ctx, entity: string, fields: T, check: (f: T) => Problem | null) {
  const def = schoolsEntities.find((e) => e.name === entity)!;
  const parsed = def.schema.safeParse(fields);
  if (!parsed.success) return `invalid:${String(parsed.error.issues[0]?.path[0] ?? "")}`;
  return check(fields) ?? (await insert(c, entity, fields));
}

/** School details: name and location (the platform site), student-number code and shifts (the school record). */
export const saveSchool = form(async (c, fd) => {
  if (!c.d.school) return "invalid";
  const name = str(fd, "name");
  const code = str(fd, "code").toUpperCase();
  const shiftsRunning = fd.getAll("shiftsRunning").map(String).filter((s) => s === "morning" || s === "afternoon");
  if (name.length < 3 || name.length > 120) return { code: "schoolName", fields: ["name"] };
  if (!/^[A-Z]{2,12}$/.test(code)) return { code: "code", fields: ["code"] };
  if (shiftsRunning.length === 0) return { code: "shifts", fields: ["shiftsRunning"] };
  const loc = parseLatLng(str(fd, "lat"), str(fd, "lng"));
  if ("code" in loc) return loc;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = db() as any;
  const t = schoolsTables.schoolSchools;
  const [taken] = await q.select({ siteId: t.siteId }).from(t).where(and(eq(t.code, code), ne(t.siteId, c.siteId)));
  if (taken) return "code_taken";
  const changes: Record<string, unknown> = {};
  if (code !== c.d.school.code) changes.code = code;
  if (shiftsRunning.join() !== c.d.school.shiftsRunning.join()) changes.shiftsRunning = shiftsRunning;
  if (Object.keys(changes).length) {
    const bad = firstRejection(await push(c.me, [updateMutation("school.school", c.siteId, c.d.school.id, changes, newId())]));
    if (bad) return bad;
  }
  // The site row is platform data (not synced): name and map position.
  await q.update(sites).set({ name, lat: loc.lat, lng: loc.lng }).where(eq(sites.id, c.siteId));
  return null;
}, "ux.saved");

export const addYear = form((c, fd) =>
  checked(c, "school.academic_year", { label: str(fd, "label"), startsOn: str(fd, "startsOn"), endsOn: str(fd, "endsOn") }, (f) => checkYear(f, c.d.years)));

export const addTerm = form((c, fd) =>
  checked(c, "school.term", { academicYearId: str(fd, "academicYearId"), number: int(fd, "number"), startsOn: str(fd, "startsOn"), endsOn: str(fd, "endsOn") },
    (f) => checkTerm(f as never, c.d.years, c.d.terms)));

export const addClassroom = form((c, fd) =>
  checked(c, "school.classroom", {
    name: str(fd, "name"),
    seatsPerShift: int(fd, "seatsPerShift"),
    basis: str(fd, "basis"),
    commissionedOn: str(fd, "commissionedOn"),
    decommissionedOn: orNull(str(fd, "decommissionedOn")),
    evidenceUrl: orNull(str(fd, "evidenceUrl")),
  }, (f) => checkRoom(f as never)));

export const addClass = form((c, fd) =>
  checked(c, "school.class", {
    academicYearId: str(fd, "academicYearId"),
    level: int(fd, "level"),
    section: str(fd, "section").toUpperCase() || "A",
    shift: str(fd, "shift"),
    classroomId: orNull(str(fd, "classroomId")),
  }, (f) => checkClass(f as never, c.d.classes)));

export const addFeeItem = form((c, fd) => {
  const fields = {
    academicYearId: str(fd, "academicYearId"),
    termId: orNull(str(fd, "termId")),
    name: str(fd, "name"),
    levels: parseLevels(str(fd, "levels")),
    amount: int(fd, "amount"),
    dueOn: str(fd, "dueOn"),
  };
  // A term must belong to the year chosen.
  if (fields.termId && !c.d.terms.some((t) => t.id === fields.termId && t.academicYearId === fields.academicYearId)) return Promise.resolve({ code: "termYear", fields: ["termId"] });
  return checked(c, "school.fee_item", fields, (f) => checkFeeItem(f as never));
});

export const addReceiptBook = form((c, fd) =>
  checked(c, "school.receipt_book", { firstNumber: int(fd, "firstNumber"), lastNumber: int(fd, "lastNumber"), assignedTo: str(fd, "assignedTo") },
    (f) => checkBook(f as never, c.d.receiptBooks)));

export const addExemption = form((c, fd) => {
  const kind = str(fd, "kind");
  return checked(c, "school.exemption", {
    studentId: str(fd, "studentId"),
    feeItemId: orNull(str(fd, "feeItemId")),
    kind,
    value: kind === "full" ? 0 : int(fd, "value") ?? 0,
    reason: str(fd, "reason"),
  }, (f) => checkExemption(f as never));
});

/** One letter per phone per school, never W (the web's), never reused while assigned. */
export const addDeviceTag = form((c, fd) => {
  const deviceId = str(fd, "deviceId");
  const tag = str(fd, "tag").toUpperCase();
  if (c.d.deviceTags.some((x) => !x.voidedAt && (x.tag === tag || x.phoneId === deviceId))) return Promise.resolve("letter_taken");
  return insert(c, "school.device_tag", { phoneId: deviceId, tag });
});

/**
 * Removes a setup record. Refused while something still depends on it (pupils in a class, fees in a
 * year, payments on a fee or a receipt book…), with a message naming how many.
 */
export async function voidConfig(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const section = str(fd, "section").replace(/[^a-z-]/g, "");
  const path = `/${locale}/schools/${siteId}/setup`;
  // Results come back to the section that sent them (?s=) and the page scrolls to it (#).
  const go = (q: Record<string, string>): never =>
    redirect(`${path}?${new URLSearchParams({ ...q, ...(section ? { s: section } : {}), n: Date.now().toString(36) })}${section ? `#${section}` : ""}`);
  if (!can(me, "school.configure", siteId)) go({ error: "forbidden" });
  const entity = str(fd, "entity");
  const id = str(fd, "id");
  if (!CONFIG.has(entity)) go({ error: "invalid" });
  const d = await schoolFor(me, siteId);
  const dep = dependants(d, entity, id, today());
  if (dep) go({ error: `dep_${dep.kind}`, count: String(dep.count) });
  const res = await push(me, [voidMutation(entity, siteId, id, str(fd, "reason") || "Removed in setup", newId())]);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const bad = firstRejection(res);
  go(bad ? { error: bad } : { ok: "removed" });
}
