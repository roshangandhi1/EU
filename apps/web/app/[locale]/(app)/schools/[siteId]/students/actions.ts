"use server";
import { currentYear, findLikelyDuplicates, insertMutation, loadSchool, nextStudentNumber, updateMutation, student as studentSchema, type SchoolData } from "@eu/schools";
import type { Mutation } from "@eu/sync";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/http";
import { back, can, firstRejection, int, newId, orNull, push, schoolFor, signedIn, str, today, tr as trFor } from "@/lib/schools";
import { errorText } from "../../text";
import { parsePupilLines, type PupilLine } from "./parse";

/** Error codes become sentences on the server, in the form's language. */
const say = (fd: FormData, code: string) => errorText(code, trFor(str(fd, "locale") === "en" ? "en" : "fr"));

/** Web enrolments use device tag W; phones are given A to V. */
const WEB_TAG = "W";

export interface EnrolState {
  error?: string;
  message?: string;
  matches?: string;
  /** What was typed, so a refused form comes back filled in (React resets forms after an action). */
  values?: Record<string, string>;
  /** Changes on every result so the form remounts with the values above. */
  n?: number;
  /** The pupil just saved: the form stays open for the next one, with class and date kept. */
  saved?: { name: string; number: string };
}

const keep = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string") as [string, string][]);

export async function enrolStudent(prev: EnrolState, fd: FormData): Promise<EnrolState> {
  const r = await enrol(fd);
  const n = (prev.n ?? 0) + 1;
  if ("saved" in r) return { saved: r.saved, values: { classId: str(fd, "classId"), enrolledOn: str(fd, "enrolledOn") }, n };
  return { ...r, message: r.error && r.error !== "duplicate" ? say(fd, r.error) : undefined, values: keep(fd), n };
}

/** The class must be live and belong to the academic year that covers the enrolment date. */
function placeFor(d: SchoolData, classId: string, enrolledOn: string) {
  const year = currentYear(d, enrolledOn);
  const cls = d.classes.find((c) => c.id === classId && !c.voidedAt);
  if (!cls || !year || cls.academicYearId !== year.id) return null;
  return { cls, year };
}

async function enrol(fd: FormData): Promise<EnrolState | { saved: { name: string; number: string } }> {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const path = `/${locale}/schools/${siteId}/students`;
  const d = await schoolFor(me, siteId);
  if (!can(me, "student.write", siteId) || !can(me, "enrolment.write", siteId)) return { error: "forbidden" };
  const enrolledOn = str(fd, "enrolledOn") || today();
  const place = placeFor(d, str(fd, "classId"), enrolledOn);
  if (!place || !d.school || enrolledOn > today()) return { error: "invalid:enrolledOn" };

  const fields = {
    studentNumber: nextStudentNumber(d.school.code, Number(place.year.startsOn.slice(0, 4)), WEB_TAG, d.students.map((s) => s.studentNumber)),
    firstName: str(fd, "firstName"),
    lastName: str(fd, "lastName"),
    postName: str(fd, "postName"),
    sex: str(fd, "sex") as "F" | "M",
    dateOfBirth: orNull(str(fd, "dateOfBirth")),
    birthYearEstimate: int(fd, "birthYearEstimate"),
    guardianName: str(fd, "guardianName"),
    guardianPhone: str(fd, "guardianPhone"),
    village: str(fd, "village"),
  };
  const bad = pupilProblem(fields);
  if (bad) return { error: bad };

  if (str(fd, "confirmDifferent") !== "on") {
    const names = duplicateNames(fields, d);
    if (names.length) return { error: "duplicate", matches: names.join(", ") };
  }

  const studentId = newId();
  const res = await push(me, [
    insertMutation("school.student", siteId, fields, { mutationId: newId(), recordId: studentId }),
    insertMutation(
      "school.enrolment",
      siteId,
      { studentId, classId: place.cls.id, academicYearId: place.year.id, enrolledOn, leftOn: null, status: "active" },
      { mutationId: newId(), recordId: newId() },
    ),
  ]);
  revalidatePath(path);
  const rejected = firstRejection(res);
  if (rejected) return { error: rejected };
  return { saved: { name: [fields.lastName.toUpperCase(), fields.postName, fields.firstName].filter(Boolean).join(" "), number: fields.studentNumber } };
}

type PupilFields = Omit<PupilLine, "line"> & { studentNumber: string };

/** The first problem with a pupil's details, as an error code ("invalid:<field>"), or null. */
function pupilProblem(f: Omit<PupilFields, "studentNumber"> & { studentNumber?: string }): string | null {
  const parsed = studentSchema.safeParse({ studentNumber: "x", ...f });
  if (!parsed.success) return `invalid:${String(parsed.error.issues[0]?.path[0] ?? "")}`;
  if (!f.dateOfBirth && f.birthYearEstimate === null) return "invalid:dateOfBirth";
  const now = today();
  if (f.dateOfBirth && f.dateOfBirth > now) return "invalid:dateOfBirth";
  if (f.birthYearEstimate !== null && f.birthYearEstimate > Number(now.slice(0, 4))) return "invalid:birthYearEstimate";
  for (const k of ["firstName", "lastName", "postName", "guardianName", "village"] as const) if (f[k].length > 80) return `invalid:${k}`;
  if (f.guardianPhone.length > 20) return "invalid:guardianPhone";
  return null;
}

function duplicateNames(fields: Omit<PupilFields, "studentNumber">, d: SchoolData, extra: PupilFields[] = []): string[] {
  const pool = [...d.students.filter((s) => !s.voidedAt), ...extra.map((e, i) => ({ ...e, id: `new-${i}` }))];
  return findLikelyDuplicates({ ...fields, id: "new" } as never, pool as never)
    .map((m) => pool.find((s) => s.id === m.id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => `${s.lastName.toUpperCase()} ${s.firstName}${"studentNumber" in s && s.studentNumber ? ` (${s.studentNumber})` : ""}`);
}

export interface BulkState {
  /** Per-line problems: nothing is saved while any line has one. */
  problems?: { line: number; message: string }[];
  /** Lines that look like pupils already enrolled; saved only after the "different children" tick. */
  dupes?: { line: number; matches: string }[];
  error?: string;
  message?: string;
  saved?: number;
  values?: Record<string, string>;
  n?: number;
}

/**
 * Enrols a whole class from pasted lines (one pupil per line, typed or copied from a spreadsheet).
 * All or nothing: if any line is wrong, nothing is saved and every problem is listed by line.
 */
export async function bulkEnrol(prev: BulkState, fd: FormData): Promise<BulkState> {
  const r = await bulk(prev, fd);
  return r.error ? { ...r, message: say(fd, r.error) } : r;
}

async function bulk(prev: BulkState, fd: FormData): Promise<BulkState> {
  const n = (prev.n ?? 0) + 1;
  const values = keep(fd);
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const d = await schoolFor(me, siteId);
  if (!can(me, "student.write", siteId) || !can(me, "enrolment.write", siteId)) return { error: "forbidden", values, n };
  const enrolledOn = str(fd, "enrolledOn") || today();
  const place = placeFor(d, str(fd, "classId"), enrolledOn);
  if (!place || !d.school || enrolledOn > today()) return { error: "invalid:enrolledOn", values, n };
  const lines = parsePupilLines(String(fd.get("lines") ?? ""));
  if (lines.length === 0) return { error: "bulk_empty", values, n };
  if (lines.length > 150) return { error: "bulk_too_many", values, n };

  const problems: { line: number; error: string }[] = [];
  const dupes: { line: number; matches: string }[] = [];
  const numbers = d.students.map((s) => s.studentNumber);
  const ready: PupilFields[] = [];
  for (const l of lines) {
    if ("error" in l) { problems.push({ line: l.line, error: l.error }); continue; }
    const { line, ...f } = l;
    const bad = pupilProblem(f);
    if (bad) { problems.push({ line, error: bad }); continue; }
    const names = duplicateNames(f, d, ready);
    if (names.length) dupes.push({ line, matches: names.join(", ") });
    const studentNumber = nextStudentNumber(d.school.code, Number(place.year.startsOn.slice(0, 4)), WEB_TAG, numbers);
    numbers.push(studentNumber);
    ready.push({ ...f, studentNumber });
  }
  if (problems.length) return { problems: problems.map((p) => ({ line: p.line, message: say(fd, p.error) })), dupes, values, n };
  if (dupes.length && str(fd, "confirmDifferent") !== "on") return { dupes, values, n };

  const muts: Mutation[] = ready.flatMap((f) => {
    const studentId = newId();
    return [
      insertMutation("school.student", siteId, f, { mutationId: newId(), recordId: studentId }),
      insertMutation("school.enrolment", siteId, { studentId, classId: place.cls.id, academicYearId: place.year.id, enrolledOn, leftOn: null, status: "active" }, { mutationId: newId(), recordId: newId() }),
    ];
  });
  const res = await push(me, muts);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const rejected = firstRejection(res);
  if (rejected) return { error: rejected, values, n };
  return { saved: ready.length, values: { classId: place.cls.id, enrolledOn }, n };
}

const fieldVersions = (r: unknown) => ((r as { fieldVersions?: Record<string, number> }).fieldVersions ?? {}) as Record<string, number>;
const pick = (fv: Record<string, number>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, fv[k] ?? 0]));

export async function recordLeaving(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const path = str(fd, "back") === "pupil" ? `/${locale}/schools/${siteId}/students/${str(fd, "studentId")}` : `/${locale}/schools/${siteId}/students`;
  const d = await loadSchool(db(), siteId);
  const e = d?.enrolments.find((x) => x.id === str(fd, "enrolmentId") && !x.voidedAt);
  const status = str(fd, "status");
  const leftOn = str(fd, "leftOn") || today();
  if (!e || !["transferred", "dropped_out", "completed"].includes(status) || leftOn < e.enrolledOn || leftOn > today()) back(path, { error: "invalid:leftOn" });
  const res = await push(me, [updateMutation("school.enrolment", siteId, e!.id, { status, leftOn }, newId(), pick(fieldVersions(e), ["status", "leftOn"]))]);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const bad = firstRejection(res);
  back(path, bad ? { error: bad } : { ok: "left" });
}

/** Undo a departure recorded by mistake: the enrolment becomes active again. */
export async function undoLeaving(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const path = `/${locale}/schools/${siteId}/students/${str(fd, "studentId")}`;
  const d = await schoolFor(me, siteId);
  const e = d.enrolments.find((x) => x.id === str(fd, "enrolmentId") && !x.voidedAt && x.leftOn);
  if (!e) back(path, { error: "invalid" });
  const res = await push(me, [updateMutation("school.enrolment", siteId, e!.id, { status: "active", leftOn: null }, newId(), pick(fieldVersions(e), ["status", "leftOn"]))]);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const bad = firstRejection(res);
  back(path, bad ? { error: bad } : { ok: "returned" });
}

/**
 * Puts a pupil in another class of the same year. This corrects the enrolment in place (the usual
 * case: the wrong class was picked); absences already recorded stay with the class they were taken in.
 */
export async function changeClass(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const path = `/${locale}/schools/${siteId}/students/${str(fd, "studentId")}`;
  const d = await schoolFor(me, siteId);
  const e = d.enrolments.find((x) => x.id === str(fd, "enrolmentId") && !x.voidedAt);
  const cls = d.classes.find((c) => c.id === str(fd, "classId") && !c.voidedAt);
  if (!e || !cls || cls.academicYearId !== e.academicYearId) back(path, { error: "invalid:classId" });
  if (cls!.id === e!.classId) back(path, { error: "no_fields" });
  const res = await push(me, [updateMutation("school.enrolment", siteId, e!.id, { classId: cls!.id }, newId(), pick(fieldVersions(e), ["classId"]))]);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const bad = firstRejection(res);
  back(path, bad ? { error: bad } : res[0]?.status === "partial" ? { ok: "conflict" } : { ok: "moved" });
}

export interface EditState { error?: string; message?: string; ok?: boolean; conflict?: boolean; n?: number }

const EDITABLE = ["firstName", "lastName", "postName", "sex", "dateOfBirth", "birthYearEstimate", "guardianName", "guardianPhone", "village", "idNumber", "permNumber", "birthPlace"] as const;

/** Corrects a pupil's details. Only changed fields are sent, against the versions the form was opened with. */
export async function editStudent(prev: EditState, fd: FormData): Promise<EditState> {
  const r = await edit(prev, fd);
  return r.error ? { ...r, message: say(fd, r.error) } : r;
}

async function edit(prev: EditState, fd: FormData): Promise<EditState> {
  const n = (prev.n ?? 0) + 1;
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const d = await schoolFor(me, siteId);
  if (!can(me, "student.write", siteId)) return { error: "forbidden", n };
  const s = d.students.find((x) => x.id === str(fd, "studentId") && !x.voidedAt);
  if (!s) return { error: "not_found", n };
  const next = {
    firstName: str(fd, "firstName"), lastName: str(fd, "lastName"), postName: str(fd, "postName"), sex: str(fd, "sex") as "F" | "M",
    dateOfBirth: orNull(str(fd, "dateOfBirth")), birthYearEstimate: int(fd, "birthYearEstimate"),
    guardianName: str(fd, "guardianName"), guardianPhone: str(fd, "guardianPhone"), village: str(fd, "village"),
    idNumber: str(fd, "idNumber").slice(0, 30), permNumber: str(fd, "permNumber").slice(0, 30), birthPlace: str(fd, "birthPlace").slice(0, 80),
  };
  const bad = pupilProblem(next);
  if (bad) return { error: bad, n };
  const changed = Object.fromEntries(EDITABLE.filter((k) => (next[k] ?? null) !== (s[k] ?? null)).map((k) => [k, next[k]]));
  if (Object.keys(changed).length === 0) return { error: "no_fields", n };
  let base: Record<string, number> = {};
  try { base = JSON.parse(str(fd, "fv") || "{}"); } catch { /* treat as unknown versions */ }
  const res = await push(me, [updateMutation("school.student", siteId, s.id, changed, newId(), pick(base, Object.keys(changed)))]);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const rejected = firstRejection(res);
  if (rejected) return { error: rejected, n };
  return { ok: true, conflict: res[0]?.status === "partial", n };
}
