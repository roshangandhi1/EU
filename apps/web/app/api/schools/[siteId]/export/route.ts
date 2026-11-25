import { activeOn, dedupeAbsences, loadSchool, splitAsAt } from "@eu/schools";
import { auditLog } from "@eu/db";
import { csvLocale, toCsv, yes, type CsvLocale } from "@/lib/csv";
import { isIsoDate, todayDrc } from "@/lib/dates";
import { authenticate, db, json } from "@/lib/http";
import { permissions } from "@/lib/registry";

const WHAT = ["enrolment", "payments", "attendance"] as const;
type What = (typeof WHAT)[number];

const HEADERS: Record<What, Record<CsvLocale, string[]>> = {
  payments: {
    en: ["paid_on", "receipt_number", "student_number", "student", "amount_cdf", "voided", "void_reason", "device_time", "server_time"],
    fr: ["date_paiement", "num_recu", "matricule", "eleve", "montant_fc", "annule", "motif_annulation", "heure_telephone", "heure_serveur"],
  },
  attendance: {
    en: ["date", "class_level", "section", "shift", "student_number", "student", "reason", "server_time"],
    fr: ["date", "niveau", "section", "vacation", "matricule", "eleve", "motif", "heure_serveur"],
  },
  enrolment: {
    en: ["student_number", "last_name", "post_name", "first_name", "sex", "date_of_birth", "birth_year_estimate", "level", "section", "shift", "enrolled_on", "status", "server_time"],
    fr: ["matricule", "nom", "post_nom", "prenom", "sexe", "date_naissance", "annee_naissance_estimee", "niveau", "section", "vacation", "inscrit_le", "statut", "heure_serveur"],
  },
};

const FR_VALUES: Record<string, string> = {
  morning: "matin",
  afternoon: "après-midi",
  active: "actif",
  transferred: "transféré",
  dropped_out: "abandon",
  completed: "terminé",
  sick: "maladie",
  fees: "frais",
  work: "travail",
  family: "famille",
  unknown: "inconnu",
};

/** CSV exports of identifiable school data. Every export is written to the audit log. */
export async function GET(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;
  const { siteId } = await params;
  const user = auth.principal.user;
  if (!permissions.can(user, "export.identifiable", { stream: "schools", siteId })) return json({ error: "forbidden" }, 403);
  const url = new URL(req.url);
  const rawDate = url.searchParams.get("date");
  if (rawDate && !isIsoDate(rawDate)) return json({ error: "invalid_date" }, 400);
  const date = rawDate ?? todayDrc();
  const mode = url.searchParams.get("mode") === "evidence" ? "evidence" : "operational";
  const what = (WHAT as readonly string[]).includes(url.searchParams.get("what") ?? "") ? (url.searchParams.get("what") as What) : "enrolment";
  const locale = csvLocale(url.searchParams.get("locale") ?? auth.principal.locale);
  const v = (x: unknown) => (locale === "fr" && typeof x === "string" ? (FR_VALUES[x] ?? x) : x);
  const d = await loadSchool(db(), siteId);
  if (!d) return json({ error: "not_found" }, 404);
  const students = new Map(d.students.map((s) => [s.id, s]));
  const classes = new Map(d.classes.map((c) => [c.id, c]));
  const name = (s: { lastName: string; postName: string; firstName: string } | undefined) => (s ? `${s.lastName} ${s.postName} ${s.firstName}`.replace(/\s+/g, " ").trim() : "");
  let rows: unknown[][];
  if (what === "payments") {
    const { counted } = splitAsAt(d.payments, date, mode);
    rows = counted.filter((p) => p.paidOn <= date).map((p) => {
      const s = students.get(p.studentId);
      return [p.paidOn, p.receiptNumber, s?.studentNumber, name(s), p.amount, yes(p.voidedAt, locale), p.voidReason ?? "", p.deviceTime, p.serverTime];
    });
  } else if (what === "attendance") {
    const { counted } = splitAsAt(d.absences, date, mode);
    // One row per pupil and day, however many phones recorded the absence (DATA-10).
    rows = dedupeAbsences(counted.filter((a) => a.date <= date))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((a) => {
        const s = students.get(a.studentId);
        const c = classes.get(a.classId);
        return [a.date, c?.level, c?.section, v(c?.shift), s?.studentNumber, name(s), v(a.reason), a.serverTime];
      });
  } else {
    const { counted } = splitAsAt(d.enrolments, date, mode);
    rows = activeOn(counted, date, d.years).map((e) => {
      const s = students.get(e.studentId);
      const c = classes.get(e.classId);
      return [s?.studentNumber, s?.lastName, s?.postName, s?.firstName, s?.sex, s?.dateOfBirth, s?.birthYearEstimate, c?.level, c?.section, v(c?.shift), e.enrolledOn, v(e.status), e.serverTime];
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db() as any).insert(auditLog).values({ entity: "school.export", recordId: `${what}:${date}:${mode}`, scopeId: siteId, op: "export", userId: user.id, note: `${rows.length} rows` });
  return new Response(toCsv([HEADERS[what][locale], ...rows], locale), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${siteId.replace(/[^A-Za-z0-9_-]/g, "_")}-${what}-${date}${mode === "evidence" ? "-evidence" : ""}.csv"`,
      "cache-control": "no-store",
    },
  });
}
