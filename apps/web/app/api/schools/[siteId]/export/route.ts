import { activeOn, loadSchool, splitAsAt } from "@eu/schools";
import { auditLog } from "@eu/db";
import { authenticate, db, json } from "@/lib/http";
import { permissions } from "@/lib/registry";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Quote, and neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
const csv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");

/** CSV exports of identifiable school data. Every export is written to the audit log. */
export async function GET(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;
  const { siteId } = await params;
  const user = auth.principal.user;
  if (!permissions.can(user, "export.identifiable", { stream: "schools", siteId })) return json({ error: "forbidden" }, 403);
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const mode = url.searchParams.get("mode") === "evidence" ? "evidence" : "operational";
  const what = url.searchParams.get("what") ?? "enrolment";
  const d = await loadSchool(db(), siteId);
  if (!d) return json({ error: "not_found" }, 404);
  const students = new Map(d.students.map((s) => [s.id, s]));
  const classes = new Map(d.classes.map((c) => [c.id, c]));
  let rows: unknown[][];
  if (what === "payments") {
    const { counted } = splitAsAt(d.payments, date, mode);
    rows = [["paid_on", "receipt_number", "student_number", "student", "amount_cdf", "voided", "void_reason", "device_time", "server_time"],
      ...counted.filter((p) => p.paidOn <= date).map((p) => { const s = students.get(p.studentId); return [p.paidOn, p.receiptNumber, s?.studentNumber, s ? `${s.lastName} ${s.postName} ${s.firstName}` : "", p.amount, p.voidedAt ? "yes" : "", p.voidReason ?? "", p.deviceTime, p.serverTime]; })];
  } else if (what === "attendance") {
    const { counted } = splitAsAt(d.absences, date, mode);
    rows = [["date", "class_level", "section", "shift", "student_number", "student", "reason", "server_time"],
      ...counted.filter((a) => a.date <= date && !a.voidedAt).map((a) => { const s = students.get(a.studentId); const c = classes.get(a.classId); return [a.date, c?.level, c?.section, c?.shift, s?.studentNumber, s ? `${s.lastName} ${s.postName} ${s.firstName}` : "", a.reason, a.serverTime]; })];
  } else {
    const { counted } = splitAsAt(d.enrolments, date, mode);
    rows = [["student_number", "last_name", "post_name", "first_name", "sex", "date_of_birth", "birth_year_estimate", "level", "section", "shift", "enrolled_on", "status", "server_time"],
      ...activeOn(counted, date).map((e) => { const s = students.get(e.studentId); const c = classes.get(e.classId); return [s?.studentNumber, s?.lastName, s?.postName, s?.firstName, s?.sex, s?.dateOfBirth, s?.birthYearEstimate, c?.level, c?.section, c?.shift, e.enrolledOn, e.status, e.serverTime]; })];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db() as any).insert(auditLog).values({ entity: "school.export", recordId: `${what}:${date}:${mode}`, scopeId: siteId, op: "export", userId: user.id, note: `${rows.length - 1} rows` });
  return new Response(csv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${siteId}-${what}-${date}${mode === "evidence" ? "-evidence" : ""}.csv"`,
      "cache-control": "no-store",
    },
  });
}
