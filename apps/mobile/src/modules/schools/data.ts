import { registerNamespace } from "@eu/core/i18n";
import type {
  AcademicYear, Absence, DeviceTag, Enrolment, Exemption, FeeItem, Payment, ReceiptBook, RegisterTaken, School, SchoolClass, Student, Synced,
} from "@eu/schools/mobile";
import { schoolsEn, schoolsFr } from "@eu/schools/mobile";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "../../session";

registerNamespace("schools", { en: schoolsEn, fr: schoolsFr });

/** A record as the phone sees it: server copy with this phone's unsent changes on top. */
export type Local<T> = Synced<T> & { pending?: boolean };

export interface SchoolData {
  school: Local<School>;
  years: Local<AcademicYear>[];
  classes: Local<SchoolClass>[];
  students: Local<Student>[];
  enrolments: Local<Enrolment>[];
  absences: Local<Absence>[];
  registers: Local<RegisterTaken>[];
  feeItems: Local<FeeItem>[];
  exemptions: Local<Exemption>[];
  receiptBooks: Local<ReceiptBook>[];
  payments: Local<Payment>[];
  deviceTags: Local<DeviceTag>[];
}

/** Today in the DRC's eastern time (UTC+2), as YYYY-MM-DD. */
export function today(now = new Date()): string {
  return new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Unsent inserts have no times yet; give them the shape the rules expect. */
function norm<T>(r: Record<string, unknown>): Local<T> {
  return { deviceTime: new Date().toISOString(), serverTime: null, voidedAt: null, ...r } as unknown as Local<T>;
}

async function all<T>(session: Session, entity: string, siteId?: string): Promise<Local<T>[]> {
  const rows = await session.client.list(entity);
  return rows.filter((r) => !siteId || r.scopeId === siteId).map((r) => norm<T>(r));
}

export async function listSchools(session: Session): Promise<Local<School>[]> {
  return (await all<School>(session, "school.school")).filter((s) => !s.voidedAt);
}

export async function loadSchool(session: Session, school: Local<School>): Promise<SchoolData> {
  const id = school.siteId;
  const [years, classes, students, enrolments, absences, registers, feeItems, exemptions, receiptBooks, payments, deviceTags] = await Promise.all([
    all<AcademicYear>(session, "school.academic_year", id),
    all<SchoolClass>(session, "school.class", id),
    all<Student>(session, "school.student", id),
    all<Enrolment>(session, "school.enrolment", id),
    all<Absence>(session, "school.absence", id),
    all<RegisterTaken>(session, "school.register", id),
    all<FeeItem>(session, "school.fee_item", id),
    all<Exemption>(session, "school.exemption", id),
    all<ReceiptBook>(session, "school.receipt_book", id),
    all<Payment>(session, "school.payment", id),
    all<DeviceTag>(session, "school.device_tag", id),
  ]);
  return { school, years, classes, students, enrolments, absences, registers, feeItems, exemptions, receiptBooks, payments, deviceTags };
}

/** Loads one school and reloads it whenever the session changes (a sync finished, a record was saved). */
export function useSchool(session: Session, school: Local<School>): { data: SchoolData | null; reload: () => Promise<void> } {
  const [data, setData] = useState<SchoolData | null>(null);
  const reload = useCallback(async () => setData(await loadSchool(session, school)), [session, school]);
  useEffect(() => {
    void reload();
    return session.subscribe(() => void reload());
  }, [session, reload]);
  return { data, reload };
}

export const live = <T extends { voidedAt: string | null }>(rows: readonly T[]) => rows.filter((r) => !r.voidedAt);

export function currentYear(d: SchoolData, date: string) {
  return live(d.years).filter((y) => y.startsOn <= date && y.endsOn >= date).sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1))[0];
}

export function studentName(s: Pick<Student, "firstName" | "lastName" | "postName">): string {
  return [s.lastName, s.postName, s.firstName].filter(Boolean).join(" ");
}
