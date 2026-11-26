"use server";
import { sites } from "@eu/db";
import { insertMutation, planFeePlanItems, planPeriods, schoolsEntities, schoolsTables, updateMutation, voidMutation, type SchoolData } from "@eu/schools";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/http";
import { can, firstRejection, int, newId, orNull, parseLevels, push, schoolFor, signedIn, str, today, tr as trFor } from "@/lib/schools";
import { errorText } from "../../text";
import { checkBook, checkClass, checkExemption, checkFeeItem, checkFeePlan, checkRoom, checkTerm, checkYear, parseLatLng, threeTerms, type Problem } from "./checks";
import { dependants } from "./dependants";

const CONFIG = new Set(["school.academic_year", "school.term", "school.classroom", "school.class", "school.fee_item", "school.fee_plan", "school.receipt_book", "school.exemption", "school.device_tag"]);

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
      // An edit closes its form by going back to the list (without ?edit=), with "Saved" in that section.
      if (str(fd, "editId")) {
        const section = str(fd, "returnTo").replace(/[^a-z-]/g, "");
        redirect(`/${c.locale}/schools/${c.siteId}/setup?${new URLSearchParams({ ok: "saved", s: section, n: Date.now().toString(36) })}#${section}`);
      }
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

/**
 * Saves an edit in place: same schema and checks as when adding, then one update with only the
 * fields that changed. The record keeps its id, so pupils, payments, marks and exemptions that
 * point at it keep working.
 */
async function edited<T extends Record<string, unknown>>(c: Ctx, entity: string, rows: readonly { id: string; voidedAt: string | null }[], id: string, fields: T, check: (f: T) => Problem | null): Promise<Problem | string | null> {
  const prev = rows.find((r) => r.id === id && !r.voidedAt) as Record<string, unknown> | undefined;
  if (!prev) return "not_found";
  const def = schoolsEntities.find((e) => e.name === entity)!;
  const parsed = def.schema.safeParse(fields);
  if (!parsed.success) return `invalid:${String(parsed.error.issues[0]?.path[0] ?? "")}`;
  const bad = check(fields);
  if (bad) return bad;
  const changes = changedFields(prev, fields);
  if (Object.keys(changes).length === 0) return null;
  return firstRejection(await push(c.me, [updateMutation(entity, c.siteId, id, changes, newId())]));
}

/** The fields of `next` whose value differs from `prev` (compared as JSON, so arrays compare by content). */
function changedFields(prev: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(next)) if (JSON.stringify(prev[k] ?? null) !== JSON.stringify(v ?? null)) out[k] = v;
  return out;
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

const termEnd = (c: Ctx, termId: string | null) => (termId ? c.d.terms.find((t) => t.id === termId && !t.voidedAt)?.endsOn ?? null : null);

export const addFeeItem = form((c, fd) => {
  const termId = orNull(str(fd, "termId"));
  const fields = {
    academicYearId: str(fd, "academicYearId"),
    termId,
    name: str(fd, "name"),
    levels: parseLevels(str(fd, "levels")),
    amount: int(fd, "amount"),
    dueOn: str(fd, "dueOn"),
    planId: null,
    periodEndsOn: termEnd(c, termId),
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
  const section = str(fd, "returnTo").replace(/[^a-z-]/g, "");
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
  const reason = str(fd, "reason") || "Removed in setup";
  // A recurring fee takes its generated items with it (none is in use: checked above).
  const withItems = entity === "school.fee_plan" ? d.feeItems.filter((f) => !f.voidedAt && f.planId === id).map((f) => voidMutation("school.fee_item", siteId, f.id, reason, newId())) : [];
  const res = await push(me, [voidMutation(entity, siteId, id, reason, newId()), ...withItems]);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const bad = firstRejection(res);
  go(bad ? { error: bad } : { ok: "removed" });
}

// ---- Editing setup records in place (item 2). Same fields and checks as adding. ----

export const editYear = form((c, fd) => {
  const id = str(fd, "editId");
  return edited(c, "school.academic_year", c.d.years, id, { label: str(fd, "label"), startsOn: str(fd, "startsOn"), endsOn: str(fd, "endsOn") },
    (f) => checkYear(f, c.d.years, id, c.d.terms));
});

/** A term keeps its year: fee items charged in it belong to that year. */
export const editTerm = form((c, fd) => {
  const id = str(fd, "editId");
  const prev = c.d.terms.find((t) => t.id === id);
  const fields = { academicYearId: prev?.academicYearId ?? "", number: int(fd, "number"), startsOn: str(fd, "startsOn"), endsOn: str(fd, "endsOn") };
  return edited(c, "school.term", c.d.terms, id, fields, (f) => checkTerm(f as never, c.d.years, c.d.terms, id)).then(async (r) => {
    if (r !== null || !prev || prev.endsOn === fields.endsOn) return r;
    // Fees for this trimester charge up to its new last day.
    const items = c.d.feeItems.filter((f) => !f.voidedAt && f.termId === id && f.periodEndsOn !== fields.endsOn);
    return items.length ? firstRejection(await push(c.me, items.map((f) => updateMutation("school.fee_item", c.siteId, f.id, { periodEndsOn: fields.endsOn }, newId())))) : null;
  });
});

export const editClassroom = form((c, fd) => {
  const id = str(fd, "editId");
  return edited(c, "school.classroom", c.d.classrooms, id, {
    name: str(fd, "name"),
    seatsPerShift: int(fd, "seatsPerShift"),
    basis: str(fd, "basis"),
    commissionedOn: str(fd, "commissionedOn"),
    decommissionedOn: orNull(str(fd, "decommissionedOn")),
    evidenceUrl: orNull(str(fd, "evidenceUrl")),
  }, (f) => checkRoom(f as never));
});

/** A class keeps its year: its pupils' enrolments belong to that year. */
export const editClass = form((c, fd) => {
  const id = str(fd, "editId");
  const prev = c.d.classes.find((x) => x.id === id);
  return edited(c, "school.class", c.d.classes, id, {
    academicYearId: prev?.academicYearId ?? "",
    level: int(fd, "level"),
    section: str(fd, "section").toUpperCase() || "A",
    shift: str(fd, "shift"),
    classroomId: orNull(str(fd, "classroomId")),
  }, (f) => checkClass(f as never, c.d.classes, id));
});

/** A fee item keeps its year; its trimester may change within that year. Payments keep pointing at it. */
export const editFeeItem = form((c, fd) => {
  const id = str(fd, "editId");
  const prev = c.d.feeItems.find((x) => x.id === id);
  const termId = orNull(str(fd, "termId"));
  const fields = {
    academicYearId: prev?.academicYearId ?? "",
    termId,
    name: str(fd, "name"),
    levels: parseLevels(str(fd, "levels")),
    amount: int(fd, "amount"),
    dueOn: str(fd, "dueOn"),
    periodEndsOn: termEnd(c, termId),
  };
  if (fields.termId && !c.d.terms.some((t) => t.id === fields.termId && t.academicYearId === fields.academicYearId)) return Promise.resolve({ code: "termYear", fields: ["termId"] });
  return edited(c, "school.fee_item", c.d.feeItems, id, fields, (f) => checkFeeItem(f as never));
});

export const editReceiptBook = form((c, fd) => {
  const id = str(fd, "editId");
  return edited(c, "school.receipt_book", c.d.receiptBooks, id, { firstNumber: int(fd, "firstNumber"), lastNumber: int(fd, "lastNumber"), assignedTo: str(fd, "assignedTo") },
    (f) => checkBook(f as never, c.d.receiptBooks, id, c.d.payments));
});

/**
 * Exemptions are append-only (an audit trail of who was let off what), so an edit voids the old
 * one and adds the corrected one in the same push. Nothing links to an exemption's id.
 */
export const editExemption = form(async (c, fd) => {
  const id = str(fd, "editId");
  const prev = c.d.exemptions.find((x) => x.id === id && !x.voidedAt);
  if (!prev) return "not_found";
  const kind = str(fd, "kind");
  const fields = { studentId: prev.studentId, feeItemId: orNull(str(fd, "feeItemId")), kind, value: kind === "full" ? 0 : int(fd, "value") ?? 0, reason: str(fd, "reason") };
  const parsed = schoolsEntities.find((e) => e.name === "school.exemption")!.schema.safeParse(fields);
  if (!parsed.success) return `invalid:${String(parsed.error.issues[0]?.path[0] ?? "")}`;
  const bad = checkExemption(fields as never);
  if (bad) return bad;
  if (Object.keys(changedFields(prev as never, fields)).length === 0) return null;
  return firstRejection(await push(c.me, [
    voidMutation("school.exemption", c.siteId, id, "Edited in setup", newId()),
    insertMutation("school.exemption", c.siteId, fields, { mutationId: newId(), recordId: newId() }),
  ]));
});

/** "Add trimesters 1–3" for a year with none yet: splits the year in three (each can be edited). */
export async function addThreeTerms(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const path = `/${locale}/schools/${siteId}/setup`;
  const go = (q: Record<string, string>): never => redirect(`${path}?${new URLSearchParams({ ...q, s: "terms", n: Date.now().toString(36) })}#terms`);
  if (!can(me, "school.configure", siteId)) go({ error: "forbidden" });
  const d = await schoolFor(me, siteId);
  const y = d.years.find((x) => x.id === str(fd, "academicYearId") && !x.voidedAt);
  if (!y) go({ error: "not_found" });
  if (d.terms.some((t) => !t.voidedAt && t.academicYearId === y!.id)) go({ error: "invalid" });
  const muts = threeTerms(y!).map((t) => insertMutation("school.term", siteId, { academicYearId: y!.id, ...t }, { mutationId: newId(), recordId: newId() }));
  const bad = firstRejection(await push(me, muts));
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  go(bad ? { error: bad } : { ok: "added" });
}


// ---- Recurring fees (fee plans, item 3): one fee item per month, trimester or year. ----

const pad2 = (n: number) => String(n).padStart(2, "0");
const monthEnd = (ym: string) => { const [y, m] = ym.split("-").map(Number) as [number, number]; return `${ym}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; };

/** Reads the plan form: the span comes from months (monthly), trimesters (per trimester) or the whole year. */
function planFields(c: Ctx, fd: FormData, yearId: string): { fields: Record<string, unknown>; problem?: Problem } {
  const year = c.d.years.find((y) => y.id === yearId && !y.voidedAt);
  const frequency = str(fd, "frequency");
  const terms = c.d.terms.filter((t) => !t.voidedAt && t.academicYearId === yearId);
  let startsOn = year?.startsOn ?? "", endsOn = year?.endsOn ?? "";
  let problem: Problem | undefined;
  if (frequency === "monthly") {
    const a = str(fd, "startMonth"), b = str(fd, "endMonth");
    if (!/^\d{4}-\d{2}$/.test(a)) problem = { code: "planMonth", fields: ["startMonth"] };
    else if (!/^\d{4}-\d{2}$/.test(b)) problem = { code: "planMonth", fields: ["endMonth"] };
    else {
      startsOn = `${a}-01` < (year?.startsOn ?? "") ? year!.startsOn : `${a}-01`;
      endsOn = year && monthEnd(b) > year.endsOn ? year.endsOn : monthEnd(b);
    }
  } else if (frequency === "per_term") {
    const a = terms.find((t) => t.number === Number(str(fd, "startTerm"))), b = terms.find((t) => t.number === Number(str(fd, "endTerm")));
    if (!a || !b) problem = { code: "planNeedsTerms", fields: ["startTerm"] };
    else { startsOn = a.startsOn; endsOn = b.endsOn; }
  }
  const dueDay = str(fd, "dueDay") === "" ? null : int(fd, "dueDay");
  const fields = {
    academicYearId: yearId,
    name: str(fd, "name"),
    levels: parseLevels(str(fd, "levels")),
    amount: int(fd, "amount"),
    frequency,
    dueDay: frequency === "monthly" || frequency === "per_term" ? dueDay : null,
    dueOn: frequency === "one_time" || frequency === "per_year" ? orNull(str(fd, "dueOn")) : null,
    startsOn,
    endsOn,
  };
  return { fields, problem };
}

/** Saves a plan (new or edited) and brings its fee items in line, all in one push. */
async function savePlan(c: Ctx, fd: FormData, id: string | null): Promise<Problem | string | null> {
  const prev = id ? c.d.feePlans.find((p) => p.id === id && !p.voidedAt) : undefined;
  if (id && !prev) return "not_found";
  const yearId = prev?.academicYearId ?? str(fd, "academicYearId");
  const { fields, problem } = planFields(c, fd, yearId);
  if (problem) return problem;
  const def = schoolsEntities.find((e) => e.name === "school.fee_plan")!;
  const parsed = def.schema.safeParse(fields);
  if (!parsed.success) return `invalid:${String(parsed.error.issues[0]?.path[0] ?? "")}`;
  const plan = parsed.data as never as import("@eu/schools").FeePlan;
  const year = c.d.years.find((y) => y.id === yearId && !y.voidedAt);
  const bad = checkFeePlan(plan, year);
  if (bad) return bad;
  const planId = id ?? newId();
  const periods = planPeriods(plan, year!, c.d.terms.filter((t) => t.academicYearId === yearId), c.locale);
  if (periods.length === 0) return { code: "planEmpty", fields: [] };
  const inUse = (itemId: string) => c.d.payments.some((p) => !p.voidedAt && p.feeItemIds.includes(itemId)) || c.d.exemptions.some((x) => !x.voidedAt && x.feeItemId === itemId);
  const { ops } = planFeePlanItems(c.d.feeItems, planId, plan, periods, inUse);
  const muts = [];
  if (!prev) muts.push(insertMutation("school.fee_plan", c.siteId, fields, { mutationId: newId(), recordId: planId }));
  else {
    const changes = changedFields(prev as never, fields);
    if (Object.keys(changes).length) muts.push(updateMutation("school.fee_plan", c.siteId, planId, changes, newId()));
  }
  for (const o of ops) {
    muts.push(o.op === "create" ? insertMutation("school.fee_item", c.siteId, { ...o.fields }, { mutationId: newId(), recordId: newId() })
      : o.op === "update" ? updateMutation("school.fee_item", c.siteId, o.id, o.fields, newId())
      : voidMutation("school.fee_item", c.siteId, o.id, "Period removed from the recurring fee", newId()));
  }
  if (muts.length === 0) return null;
  return firstRejection(await push(c.me, muts));
}

export const addFeePlan = form((c, fd) => savePlan(c, fd, null));
export const editFeePlan = form((c, fd) => savePlan(c, fd, str(fd, "editId")));
