import { activeOn, clockAnomalies, enrolmentBreakdown, placesAsAt, splitAsAt } from "@eu/schools";
import { ButtonLink, Notice, Stat, Stats, Table } from "@/components/ui";
import { can, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { param, type SP } from "../../flash";
import { studentName } from "../labels";

export default async function Reports({ params, searchParams }: { params: Promise<{ locale: string; siteId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const d = await schoolFor(me, p.siteId);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "date")) ? param(sp, "date") : today();
  const evidence = param(sp, "mode") === "evidence";
  const mode = evidence ? "evidence" : "operational";

  // Evidence mode: only records the server held by the cut-off count.
  const rooms = splitAsAt(d.classrooms, date, mode);
  const enrol = splitAsAt(d.enrolments, date, mode);
  const places = d.school ? placesAsAt(d.school, rooms.counted, date) : null;
  const active = activeOn(enrol.counted, date);
  const b = enrolmentBreakdown(active, new Map(d.students.map((x) => [x.id, x])), new Map(d.classes.map((c) => [c.id, c])));
  const late = [...rooms.lateSynced.map((r) => ({ id: r.id, what: `${tr("capacity.room")}: ${r.name}`, when: r.deviceTime, got: r.serverTime })),
    ...enrol.lateSynced.map((e) => { const st = d.students.find((x) => x.id === e.studentId); return { id: e.id, what: `${tr("student.enrolledOn")}: ${st ? studentName(st) : e.studentId}`, when: e.deviceTime, got: e.serverTime }; })];
  const suspect = clockAnomalies([...d.enrolments, ...d.payments, ...d.absences]).length;
  const exportBase = `/api/schools/${p.siteId}/export?date=${date}&mode=${mode}`;

  return (
    <>
      <form method="get" className="filterbar">
        <label className="tb-field">{evidence ? tr("reports.cutoff") : tr("capacity.asAt")}<input className="ctl" type="date" name="date" defaultValue={date} /></label>
        <label className="check-row"><input type="checkbox" name="mode" value="evidence" defaultChecked={evidence} /><span>{tr("reports.evidence")}</span></label>
        <button className="btn secondary" type="submit">{tr("ux.show")}</button>
      </form>
      {evidence && <Notice>{tr("reports.evidenceHint")}</Notice>}
      <Stats>
        <Stat label={tr("reports.placesAsAt") + " " + date} value={places?.totalPlaces ?? 0} hint={places ? tr("overview.placesHint", { baseline: places.baselinePlaces, new: places.newPlaces, shifts: places.shiftsCounted.length }) : undefined} />
        <Stat label={tr("reports.enrolmentAsAt") + " " + date} value={b.total} hint={`${tr("student.female")}: ${b.bySex.F} · ${tr("student.male")}: ${b.bySex.M}`} />
        <Stat label={tr("shift.morning")} value={b.byShift.morning} />
        <Stat label={tr("shift.afternoon")} value={b.byShift.afternoon} />
      </Stats>
      <h2>{tr("reports.byLevel")}</h2>
      <Table rows={[1, 2, 3, 4, 5, 6]} rowKey={(n) => String(n)} empty="" columns={[
        { key: "l", header: tr("common.level"), render: (n) => tr("levelName", { n }) },
        { key: "c", header: tr("overview.enrolled"), numeric: true, render: (n) => b.byLevel[n] ?? 0 },
      ]} />
      {places && (
        <>
          <h2>{tr("capacity.title")}</h2>
          <Table rows={places.classrooms} rowKey={(r) => r.id} empty={tr("common.none")} columns={[
            { key: "n", header: tr("capacity.room"), render: (r) => r.name },
            { key: "b", header: tr("capacity.basis"), render: (r) => tr(`capacity.${r.basis}`) },
            { key: "s", header: tr("capacity.seatsPerShift"), numeric: true, render: (r) => r.seatsPerShift },
            { key: "p", header: tr("capacity.places"), numeric: true, render: (r) => r.places },
          ]} />
        </>
      )}
      {evidence && late.length > 0 && (
        <>
          <Notice tone="warning">{tr("reports.lateSynced")}</Notice>
          <Table rows={late} rowKey={(r) => r.id} empty="" columns={[
            { key: "w", header: "", render: (r) => r.what },
            { key: "d", header: "device", render: (r) => r.when },
            { key: "s", header: "server", render: (r) => r.got ?? "—" },
          ]} />
        </>
      )}
      {suspect > 0 && <Notice tone="warning">{tr("reports.clock")}: {suspect}</Notice>}
      {can(me, "export.identifiable", p.siteId) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ButtonLink variant="secondary" href={`${exportBase}&what=enrolment`}>{tr("common.downloadCsv")}: {tr("nav.students")}</ButtonLink>
          <ButtonLink variant="secondary" href={`${exportBase}&what=payments`}>{tr("common.downloadCsv")}: {tr("nav.fees")}</ButtonLink>
          <ButtonLink variant="secondary" href={`${exportBase}&what=attendance`}>{tr("common.downloadCsv")}: {tr("nav.attendance")}</ButtonLink>
        </div>
      )}
    </>
  );
}
