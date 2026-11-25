"use server";
import { currentYear, findLikelyDuplicates, insertMutation, loadSchool, nextStudentNumber, updateMutation, student as studentSchema } from "@eu/schools";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/http";
import { back, firstRejection, int, newId, orNull, push, schoolFor, signedIn, str, today } from "@/lib/schools";

/** Web enrolments use device tag W; phones are given A to V. */
const WEB_TAG = "W";

export interface EnrolState {
  error?: string;
  matches?: string;
}

export async function enrolStudent(_prev: EnrolState, fd: FormData): Promise<EnrolState> {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const path = `/${locale}/schools/${siteId}/students`;
  const d = await schoolFor(me, siteId);
  const classId = str(fd, "classId");
  const enrolledOn = str(fd, "enrolledOn") || today();
  const year = currentYear(d, enrolledOn);
  const cls = d.classes.find((c) => c.id === classId && !c.voidedAt);
  if (!cls || !year || !d.school) return { error: "invalid" };

  const fields = {
    studentNumber: nextStudentNumber(d.school!.code, Number(year!.startsOn.slice(0, 4)), WEB_TAG, d.students.map((s) => s.studentNumber)),
    firstName: str(fd, "firstName"),
    lastName: str(fd, "lastName"),
    postName: str(fd, "postName"),
    sex: str(fd, "sex"),
    dateOfBirth: orNull(str(fd, "dateOfBirth")),
    birthYearEstimate: int(fd, "birthYearEstimate"),
    guardianName: str(fd, "guardianName"),
    guardianPhone: str(fd, "guardianPhone"),
    village: str(fd, "village"),
  };
  if (!studentSchema.safeParse(fields).success || (!fields.dateOfBirth && fields.birthYearEstimate === null)) return { error: "invalid" };

  if (str(fd, "confirmDifferent") !== "on") {
    const matches = findLikelyDuplicates({ ...fields, id: "new" } as never, d.students.filter((s) => !s.voidedAt));
    if (matches.length) {
      const names = matches
        .map((m) => d.students.find((s) => s.id === m.id))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => `${s.lastName.toUpperCase()} ${s.firstName} (${s.studentNumber})`);
      return { error: "duplicate", matches: names.join(", ") };
    }
  }

  const studentId = newId();
  const res = await push(me, [
    insertMutation("school.student", siteId, fields, { mutationId: newId(), recordId: studentId }),
    insertMutation(
      "school.enrolment",
      siteId,
      { studentId, classId, academicYearId: year!.id, enrolledOn, leftOn: null, status: "active" },
      { mutationId: newId(), recordId: newId() },
    ),
  ]);
  revalidatePath(path);
  const bad = firstRejection(res);
  if (bad) return { error: bad };
  back(path, { ok: "1" });
}

export async function recordLeaving(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const path = `/${locale}/schools/${siteId}/students`;
  const d = await loadSchool(db(), siteId);
  const e = d?.enrolments.find((x) => x.id === str(fd, "enrolmentId"));
  const status = str(fd, "status");
  const leftOn = str(fd, "leftOn") || today();
  if (!e || !["transferred", "dropped_out", "completed"].includes(status)) back(path, { error: "invalid" });
  const fv = ((e as unknown as { fieldVersions?: Record<string, number> }).fieldVersions ?? {}) as Record<string, number>;
  const res = await push(me, [
    updateMutation("school.enrolment", siteId, e!.id, { status, leftOn }, newId(), { status: fv.status ?? 0, leftOn: fv.leftOn ?? 0 }),
  ]);
  revalidatePath(path);
  const bad = firstRejection(res);
  back(path, bad ? { error: bad } : { ok: "1" });
}
