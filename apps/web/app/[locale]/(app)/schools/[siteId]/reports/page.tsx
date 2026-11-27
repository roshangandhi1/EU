import { activeOn, attendanceRate, classDay, clockAnomalies, enrolmentBreakdown, live, placesAsAt, splitAsAt, type ClassDay, levelsOf } from "@eu/schools";
import Link from "next/link";
import { ButtonLink, Notice, Section, Stat, Stats, Table } from "@/components/ui";
import { can, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { param, type SP } from "../../flash";
import { PrintButton } from "../../print-button";
import { fmtDate, fmtDateTime, fmtMonth } from "../format";
import { byLevel, classLabel, levelLabel, studentName } from "../labels";

export default async function Reports({ params, searchParams }: { params: Promise<{ locale: string; siteId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const C = tr("common.colon");
  const d = await schoolFor(me, p.siteId);
  const LV = levelsOf(d.school);
  const now = today();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "date")) ? param(sp, "date") : now;
  // Evidence mode is for assessors and programme staff; school staff see what is recorded.
  const canEvidence = can(me, "report.evidence", p.siteId);
  const evidence = canEvidence && param(sp, "mode") === "evidence";
  const mode = evidence ? "evidence" : "operational";
  const base = `/${locale}/schools/${p.siteId}`;

  // Evidence mode: only records the server held by the cut-off count.
  const rooms = splitAsAt(d.classrooms, date, mode);
  const enrol = splitAsAt(d.enrolments, date, mode);
  const places = d.school ? placesAsAt(d.school, rooms.counted, date) : null;
  const active = activeOn(enrol.counted, date);
  const b = enrolmentBreakdown(active, new Map(d.students.map((x) => [x.id, x])), new Map(d.classes.map((c) => [c.id, c])));
  const late = [...rooms.lateSynced.map((r) => ({ id: r.id, what: `${tr("capacity.room")}${C}${r.name}`, when: r.deviceTime, got: r.serverTime })),
    ...enrol.lateSynced.map((e) => { const st = d.students.find((x) => x.id === e.studentId); return { id: e.id, what: `${tr("rep.enrolmentOf")} ${st ? studentName(st) : tr("pupil.removed")}`, when: e.deviceTime, got: e.serverTime }; })];
  const suspect = clockAnomalies([...d.enrolments, ...d.payments, ...d.absences]).length;
  const exportBase = `/api/schools/${p.siteId}/export?date=${date}&mode=${mode}`;
  const when = fmtDate(date, locale);

  // Monthly attendance per class: every register taken that month.
  const month = /^\d{4}-\d{2}$/.test(param(sp, "month")) && param(sp, "month") <= now.slice(0, 7) ? param(sp, "month") : now.slice(0, 7);
  const regs = live(d.registers).filter((r) => r.date.startsWith(month));
  const monthly = live(d.classes).sort(byLevel).map((c) => {
    const days: ClassDay[] = [...new Set(regs.filter((r) => r.classId === c.id).map((r) => r.date))].map((day) => classDay(c.id, day, d.enrolments, d.absences, d.registers));
    return { c, days: days.length, absent: days.reduce((n, x) => n + x.absent, 0), rate: attendanceRate(days) };
  }).filter((r) => r.days > 0 || activeOn(d.enrolments, now).some((e) => e.classId === r.c.id));

  return (
    <>
      <form method="get" className="filterbar no-print">
        <label className="tb-field">{evidence ? tr("reports.cutoff") : tr("capacity.asAt")}<input className="ctl" type="date" name="date" defaultValue={date} /></label>
        <label className="tb-field">{tr("rep.month")}<input className="ctl" type="month" name="month" defaultValue={month} max={now.slice(0, 7)} /></label>
        {canEvidence && <label className="check-row"><input type="checkbox" name="mode" value="evidence" defaultChecked={evidence} /><span>{tr("reports.evidence")}</span></label>}
        <button className="btn secondary" type="submit">{tr("ux.show")}</button>
        <span className="filterbar-end"><PrintButton target="report" label={tr("print.report")} /></span>
      </form>
      {evidence && <Notice>{tr("reports.evidenceHint")}</Notice>}
      <div id="report" className="stack">
        <div className="print-only print-head"><strong>{d.site.name}</strong> · {tr("nav.reports")} · {when}</div>
        <Stats>
          <Stat label={tr("rep.placesOn", { date: when })} value={places?.totalPlaces ?? 0} hint={places ? tr("overview.placesHint", { baseline: places.baselinePlaces, new: places.newPlaces, shifts: places.shiftsCounted.length }) : undefined} />
          <Stat label={tr("rep.enrolledOn", { date: when })} value={b.total} hint={`${tr("overview.girls")}${C}${b.bySex.F} · ${tr("rep.boys")}${C}${b.bySex.M}`} />
          <Stat label={tr("shift.morning")} value={b.byShift.morning} />
          <Stat label={tr("shift.afternoon")} value={b.byShift.afternoon} />
        </Stats>
        <Section flush icon="users" title={tr("reports.byLevel")}>
          <Table flush rows={LV.map((l) => l.level).filter((n) => n <= 6 || live(d.classes).some((c) => c.level === n))} rowKey={(n) => String(n)} empty="" columns={[
            { key: "l", header: tr("common.level"), render: (n) => levelLabel(n, tr, LV) },
            { key: "c", header: tr("overview.enrolled"), numeric: true, render: (n) => b.byLevel[n] ?? 0 },
          ]} />
        </Section>
        <Section flush icon="check" title={tr("rep.monthly", { month: fmtMonth(month, locale) })} description={tr("rep.monthlyHint")}>
          <Table flush rows={monthly} rowKey={(r) => r.c.id} empty={tr("rep.noRegisters")} emptyIcon="check" columns={[
            { key: "c", header: tr("common.class"), render: (r) => <strong>{classLabel(r.c, tr, LV)}</strong> },
            { key: "d", header: tr("rep.registerDays"), numeric: true, render: (r) => r.days },
            { key: "a", header: tr("rep.absences"), numeric: true, render: (r) => r.absent },
            { key: "r", header: tr("attendance.rate"), numeric: true, render: (r) => (r.rate === null ? "—" : `${Math.round(r.rate * 100)} %`) },
            { key: "l", header: "", shrink: true, render: (r) => <Link className="btn ghost sm no-print" href={`${base}/students?class=${r.c.id}`}>{tr("rep.classList")}</Link> },
          ]} />
        </Section>
        {places && (
          <Section flush icon="door" title={tr("capacity.title")}>
            <Table flush rows={places.classrooms} rowKey={(r) => r.id} empty={tr("common.none")} columns={[
              { key: "n", header: tr("capacity.room"), render: (r) => r.name },
              { key: "b", header: tr("capacity.basis"), render: (r) => tr(`capacity.${r.basis}`) },
              { key: "s", header: tr("capacity.seatsPerShift"), numeric: true, render: (r) => r.seatsPerShift },
              { key: "p", header: tr("capacity.places"), numeric: true, render: (r) => r.places },
            ]} />
          </Section>
        )}
        {evidence && late.length > 0 && (
          <>
            <Notice tone="warning">{tr("reports.lateSynced")}</Notice>
            <Table rows={late} rowKey={(r) => r.id} empty="" columns={[
              { key: "w", header: tr("rep.record"), render: (r) => r.what },
              { key: "d", header: tr("rep.capturedAt"), render: (r) => fmtDateTime(r.when, locale) },
              { key: "s", header: tr("rep.receivedAt"), render: (r) => (r.got ? fmtDateTime(r.got, locale) : "—") },
            ]} />
          </>
        )}
        {suspect > 0 && <Notice tone="warning">{tr("reports.clock")}{C}{suspect}</Notice>}
      </div>
      {can(me, "export.identifiable", p.siteId) && (
        <div className="report-downloads no-print">
          <ButtonLink variant="secondary" href={`${exportBase}&what=enrolment`}>{tr("common.downloadCsv")}{C}{tr("nav.students")}</ButtonLink>
          <ButtonLink variant="secondary" href={`${exportBase}&what=payments`}>{tr("common.downloadCsv")}{C}{tr("nav.fees")}</ButtonLink>
          <ButtonLink variant="secondary" href={`${exportBase}&what=attendance`}>{tr("common.downloadCsv")}{C}{tr("nav.attendance")}</ButtonLink>
        </div>
      )}
    </>
  );
}
