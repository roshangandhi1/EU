import { activeOn, live } from "@eu/schools";
import { Button, Notice, Table } from "@/components/ui";
import { can, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { Flash, param, type SP } from "../../flash";
import { byLevel, classLabel, studentName } from "../labels";
import { recordLeaving } from "./actions";
import { EnrolForm } from "./enrol-form";

export default async function Students({ params, searchParams }: { params: Promise<{ locale: string; siteId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const d = await schoolFor(me, p.siteId);
  const date = today();
  const classes = live(d.classes).sort(byLevel);
  const classById = new Map(classes.map((c) => [c.id, c]));
  const students = new Map(d.students.map((s) => [s.id, s]));
  const q = param(sp, "q").toLowerCase();
  const rows = activeOn(d.enrolments, date)
    .map((e) => ({ e, s: students.get(e.studentId), c: classById.get(e.classId) }))
    .filter((r): r is { e: typeof r.e; s: NonNullable<typeof r.s>; c: NonNullable<typeof r.c> } => !!r.s && !!r.c)
    .filter((r) => !q || studentName(r.s).toLowerCase().includes(q) || r.s.studentNumber.toLowerCase().includes(q))
    .sort((a, b) => byLevel(a.c, b.c) || studentName(a.s).localeCompare(studentName(b.s)));
  const canWrite = can(me, "student.write", p.siteId) && can(me, "enrolment.write", p.siteId);
  const keys = ["lastName", "postName", "firstName", "sex", "female", "male", "dateOfBirth", "birthHint", "birthYearEstimate", "guardianName", "guardianPhone", "village", "enrolledOn", "confirmDifferent"];
  const l: Record<string, string> = Object.fromEntries(keys.map((k) => [k, tr(`student.${k}`)]));
  Object.assign(l, { duplicate: tr("student.duplicateWarning"), invalid: tr("common.invalid"), rejected: tr("common.rejected"), class: tr("student.enrolledIn"), save: tr("common.save") });

  return (
    <>
      <Flash sp={sp} tr={tr} />
      {canWrite && classes.length > 0 && (
        <details open={rows.length === 0}>
          <summary><strong>{tr("student.add")}</strong></summary>
          <EnrolForm locale={locale} siteId={p.siteId} classes={classes.map((c) => ({ id: c.id, label: classLabel(c, tr) }))} today={date} l={l} />
        </details>
      )}
      {classes.length === 0 && <Notice tone="warning">{tr("overview.notSetUp")}</Notice>}
      <form method="get" style={{ margin: "16px 0" }}>
        <input name="q" defaultValue={param(sp, "q")} placeholder={tr("student.search")} aria-label={tr("student.search")} style={{ minHeight: 48, padding: "0 12px", fontSize: 16, width: "100%", maxWidth: 420 }} />
      </form>
      <Table
        rows={rows}
        rowKey={(r) => r.e.id}
        empty={tr("common.none")}
        columns={[
          { key: "num", header: tr("student.studentNumber"), render: (r) => r.s.studentNumber },
          { key: "name", header: tr("common.name"), render: (r) => studentName(r.s) },
          { key: "sex", header: tr("student.sex"), render: (r) => (r.s.sex === "F" ? tr("student.female") : tr("student.male")) },
          { key: "class", header: tr("common.class"), render: (r) => classLabel(r.c, tr) },
          { key: "guardian", header: tr("student.guardianName"), render: (r) => [r.s.guardianName, r.s.guardianPhone].filter(Boolean).join(" · ") },
          ...(canWrite
            ? [{
                key: "leave",
                header: tr("student.leave"),
                render: (r: (typeof rows)[number]) => (
                  <form action={recordLeaving} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="siteId" value={p.siteId} />
                    <input type="hidden" name="enrolmentId" value={r.e.id} />
                    <select name="status" aria-label={tr("common.status")} defaultValue="dropped_out">
                      {(["transferred", "dropped_out", "completed"] as const).map((st) => (
                        <option key={st} value={st}>{tr(`student.statuses.${st}`)}</option>
                      ))}
                    </select>
                    <input type="date" name="leftOn" defaultValue={date} aria-label={tr("student.leftOn")} />
                    <Button small variant="secondary" type="submit">{tr("common.save")}</Button>
                  </form>
                ),
              }]
            : []),
        ]}
      />
    </>
  );
}
