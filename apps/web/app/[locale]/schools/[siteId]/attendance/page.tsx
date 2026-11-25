import { activeOn, absenceReason, attendanceRate, chronicAbsentees, classDay, live } from "@eu/schools";
import { Button, Notice, Table } from "@/components/ui";
import s from "@/components/ui/ui.module.css";
import { can, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { Flash, param, type SP } from "../../flash";
import { byLevel, classLabel, studentName } from "../labels";
import { saveRegister } from "./actions";

export default async function Attendance({ params, searchParams }: { params: Promise<{ locale: string; siteId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const d = await schoolFor(me, p.siteId);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "date")) ? param(sp, "date") : today();
  const classes = live(d.classes).sort(byLevel);
  const selected = classes.find((c) => c.id === param(sp, "class"));
  const students = new Map(d.students.map((x) => [x.id, x]));
  const days = classes.map((c) => ({ c, day: classDay(c.id, date, d.enrolments, d.absences, d.registers) }));
  const month = date.slice(0, 7);
  const chronic = chronicAbsentees(d.absences, `${month}-01`, `${month}-31`);
  const canWrite = can(me, "attendance.write", p.siteId);
  const base = `/${locale}/schools/${p.siteId}/attendance`;

  return (
    <>
      <Flash sp={sp} tr={tr} />
      <form method="get" className={s.form}>
        <label className={s.field}>
          {tr("common.class")}
          <select name="class" defaultValue={selected?.id ?? ""}>
            <option value="">—</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c, tr)}</option>)}
          </select>
        </label>
        <label className={s.field}>
          {tr("common.date")}
          <input type="date" name="date" defaultValue={date} max={today()} />
        </label>
        <Button type="submit" variant="secondary">{tr("attendance.takeRegister")}</Button>
      </form>

      {selected && canWrite && (() => {
        const roster = activeOn(d.enrolments, date)
          .filter((e) => e.classId === selected.id)
          .map((e) => students.get(e.studentId))
          .filter((x): x is NonNullable<typeof x> => !!x)
          .sort((a, b) => studentName(a).localeCompare(studentName(b)));
        const day = classDay(selected.id, date, d.enrolments, d.absences, d.registers);
        const absent = new Set(day.absentStudentIds);
        return (
          <form action={saveRegister}>
            <h2>{classLabel(selected, tr)} · {date}</h2>
            <Notice>{tr("attendance.markAbsent")} {day.taken ? `(${tr("attendance.taken")})` : ""}</Notice>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="siteId" value={p.siteId} />
            <input type="hidden" name="classId" value={selected.id} />
            <input type="hidden" name="date" value={date} />
            <Table
              rows={roster}
              rowKey={(x) => x.id}
              empty={tr("common.none")}
              columns={[
                { key: "abs", header: tr("attendance.absent"), render: (x) => <input type="checkbox" name="absent" value={x.id} defaultChecked={absent.has(x.id)} aria-label={`${tr("attendance.absent")}: ${studentName(x)}`} style={{ width: 28, height: 28 }} /> },
                { key: "name", header: tr("common.name"), render: (x) => studentName(x) },
                { key: "num", header: tr("student.studentNumber"), render: (x) => x.studentNumber },
                {
                  key: "reason",
                  header: tr("attendance.reason"),
                  render: (x) => (
                    <select name={`reason-${x.id}`} defaultValue="unknown" aria-label={tr("attendance.reason")}>
                      {absenceReason.options.map((r) => <option key={r} value={r}>{tr(`attendance.reasons.${r}`)}</option>)}
                    </select>
                  ),
                },
              ]}
            />
            <Button type="submit">{tr("attendance.saveRegister")}</Button>
          </form>
        );
      })()}

      <h2>{date}</h2>
      <Table
        rows={days}
        rowKey={(r) => r.c.id}
        empty={tr("common.none")}
        columns={[
          { key: "class", header: tr("common.class"), render: (r) => <a href={`${base}?class=${r.c.id}&date=${date}`}>{classLabel(r.c, tr)}</a> },
          { key: "status", header: tr("common.status"), render: (r) => (r.day.taken ? tr("attendance.taken") : tr("attendance.notTaken")) },
          { key: "present", header: tr("attendance.present"), numeric: true, render: (r) => (r.day.taken ? r.day.present : "—") },
          { key: "absent", header: tr("attendance.absent"), numeric: true, render: (r) => (r.day.taken ? r.day.absent : "—") },
          { key: "rate", header: tr("attendance.rate"), numeric: true, render: (r) => { const x = attendanceRate([r.day]); return x === null ? "—" : `${Math.round(x * 100)}%`; } },
        ]}
      />

      <h2>{tr("attendance.chronic")}</h2>
      <Table
        rows={chronic}
        rowKey={(r) => r.studentId}
        empty={tr("common.none")}
        columns={[
          { key: "name", header: tr("common.name"), render: (r) => { const x = students.get(r.studentId); return x ? studentName(x) : r.studentId; } },
          { key: "days", header: tr("attendance.absent"), numeric: true, render: (r) => r.days },
        ]}
      />
    </>
  );
}
