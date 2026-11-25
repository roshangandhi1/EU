import { activeOn, classDay, dailyCollections, enrolmentBreakdown, formatCdf, live, placesAsAt, studentBalance } from "@eu/schools";
import { Stat, Stats } from "@/components/ui";
import { schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { NotSetUp } from "./not-set-up";

export default async function Overview({ params }: { params: Promise<{ locale: string; siteId: string }> }) {
  const p = await params;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const d = await schoolFor(me, p.siteId);
  const date = today();
  if (!d.school || live(d.classes).length === 0) return <NotSetUp me={me} siteId={p.siteId} locale={locale} />;

  const active = activeOn(d.enrolments, date);
  const students = new Map(d.students.map((s) => [s.id, s]));
  const classes = new Map(d.classes.map((c) => [c.id, c]));
  const breakdown = enrolmentBreakdown(active, students, classes);
  const places = placesAsAt(d.school, d.classrooms, date);
  const liveClasses = live(d.classes);
  const taken = liveClasses.filter((c) => classDay(c.id, date, d.enrolments, d.absences, d.registers).taken).length;
  const month = date.slice(0, 7);
  const collected = dailyCollections(d.payments, `${month}-01`, `${month}-31`).reduce((n, x) => n + x.total, 0);
  const overdue = active.reduce((n, e) => {
    const c = classes.get(e.classId);
    return c ? n + studentBalance(e.studentId, c.level, d.feeItems.filter((i) => i.academicYearId === e.academicYearId), d.exemptions, d.payments, date).overdue : n;
  }, 0);

  return (
    <Stats>
      <Stat label={tr("overview.enrolled")} value={breakdown.total} hint={`${tr("overview.girls")}: ${breakdown.bySex.F}`} />
      <Stat
        label={tr("overview.places")}
        value={places.totalPlaces}
        hint={tr("overview.placesHint", { baseline: places.baselinePlaces, new: places.newPlaces, shifts: places.shiftsCounted.length })}
      />
      <Stat label={tr("overview.registersToday")} value={`${taken} / ${liveClasses.length}`} />
      <Stat label={tr("overview.collectedMonth")} value={formatCdf(collected, locale)} />
      <Stat label={tr("overview.arrears")} value={formatCdf(overdue, locale)} />
    </Stats>
  );
}
