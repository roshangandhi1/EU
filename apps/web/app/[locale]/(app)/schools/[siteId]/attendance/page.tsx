import { activeOn, absenceReason, attendanceRate, chronicAbsentees, classDay, live } from "@eu/schools";
import { t } from "@eu/core/i18n";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { EmptyRow, Notice, Section, Table } from "@/components/ui";
import { can, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { Flash, param, type SP } from "../../flash";
import { byLevel, classLabel, studentName } from "../labels";
import { fmtDate } from "../format";
import { NotSetUp } from "../not-set-up";
import { saveRegister } from "./actions";
import { Register, RegisterView } from "./register";

const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
/** The previous or next school day: the arrows skip Saturdays and Sundays. */
const schoolDay = (iso: string, dir: 1 | -1) => { let d = shift(iso, dir); while (weekday(d) === 0 || weekday(d) === 6) d = shift(d, dir); return d; };

export default async function Attendance({ params, searchParams }: { params: Promise<{ locale: string; siteId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const d = await schoolFor(me, p.siteId);
  const now = today();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "date")) ? param(sp, "date") : now;
  const classes = live(d.classes).sort(byLevel);
  const selected = classes.find((c) => c.id === param(sp, "class"));
  const students = new Map(d.students.map((x) => [x.id, x]));
  const days = classes.map((c) => ({ c, day: classDay(c.id, date, d.enrolments, d.absences, d.registers) }));
  const month = date.slice(0, 7);
  const chronic = chronicAbsentees(d.absences, `${month}-01`, `${month}-31`);
  const canWrite = can(me, "attendance.write", p.siteId);
  const base = `/${locale}/schools/${p.siteId}/attendance`;
  const href = (q: { class?: string; date?: string }) => `${base}?${new URLSearchParams(Object.entries({ class: selected?.id ?? "", date, ...q }).filter(([, v]) => v) as [string, string][])}`;
  const taken = days.filter((x) => x.day.taken).length;

  // Warn (do not block) on a weekend or a day outside the school's terms: usually a wrong date.
  const terms = live(d.terms);
  const years = live(d.years);
  const wd = weekday(date);
  const dayWarning = wd === 0 || wd === 6
    ? tr("att.weekend", { day: new Date(`${date}T00:00:00Z`).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { weekday: "long", timeZone: "UTC" }) })
    : !years.some((y) => y.startsOn <= date && y.endsOn >= date) ? tr("att.outsideYear")
    : terms.length > 0 && !terms.some((x) => x.startsOn <= date && x.endsOn >= date) ? tr("att.outsideTerm") : null;
  const next = schoolDay(date, 1);

  const register = selected && (() => {
    const roster = activeOn(d.enrolments, date)
      .filter((e) => e.classId === selected.id)
      .map((e) => students.get(e.studentId))
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => studentName(a).localeCompare(studentName(b)));
    const day = classDay(selected.id, date, d.enrolments, d.absences, d.registers);
    const absent = new Set(day.absentStudentIds);
    const reasonOf = new Map(d.absences.filter((a) => !a.voidedAt && a.classId === selected.id && a.date === date).map((a) => [a.studentId, a.reason]));
    return (
      <Section id="register" flush icon="check" title={`${classLabel(selected, tr)}`} description={fmtDate(date, locale)} count={roster.length}
        actions={<>
          {day.taken ? <span className="pill good"><Icon name="check" size={13} />{tr("attendance.taken")}</span> : <span className="pill warn">{tr("attendance.notTaken")}</span>}
          <Link className="icon-btn" href={href({ class: "" })} aria-label={t(locale, "ui.form.close")} title={t(locale, "ui.form.close")}><Icon name="x" size={18} /></Link>
        </>}>
        <Flash sp={sp} tr={tr} />
        {roster.length === 0 ? <EmptyRow icon="users" title={tr("ux.noRoster")} /> : !canWrite ? (
          <RegisterView
            pupils={roster.map((x) => ({ id: x.id, name: studentName(x), number: x.studentNumber, absent: absent.has(x.id), reason: reasonOf.get(x.id) ?? "unknown", reasonLabel: tr(`attendance.reasons.${reasonOf.get(x.id) ?? "unknown"}`) }))}
            l={{ present: tr("attendance.present"), absent: tr("attendance.absent"), notTaken: day.taken ? undefined : "—" }}
          />
        ) : (
          <form action={saveRegister} className="register-form">
            <Register
              key={[...absent].map((id) => `${id}:${reasonOf.get(id)}`).join(",") + String(day.taken)}
              pupils={roster.map((x) => ({ id: x.id, name: studentName(x), number: x.studentNumber, absent: absent.has(x.id), reason: reasonOf.get(x.id) ?? "unknown" }))}
              reasons={absenceReason.options.map((r) => ({ key: r, label: tr(`attendance.reasons.${r}`) }))}
              hidden={{ locale, siteId: p.siteId, classId: selected.id, date }}
              l={{
                present: tr("attendance.present"), absent: tr("attendance.absent"), reason: tr("attendance.reason"), save: tr("attendance.saveRegister"),
                saving: t(locale, "ui.form.saving"), count: tr("ux.absentCount"), allPresent: tr("ux.allPresent"), markAll: tr("ux.markAllPresent"),
                hint: tr("ux.tapToMark"), unsaved: t(locale, "ui.form.unsaved"), leave: tr("att.leave"),
              }}
            />
          </form>
        )}
      </Section>
    );
  })();

  return (
    <>
      {!selected && <Flash sp={sp} tr={tr} />}
      <div className="list-head">
        <div className="day-nav" role="group" aria-label={tr("common.date")}>
          <Link className="icon-btn" href={href({ date: schoolDay(date, -1) })} aria-label={tr("mobile.prevDay")} title={tr("mobile.prevDay")}><Icon name="arrow" size={18} className="flip" /></Link>
          <form method="get" className="day-pick">
            {selected && <input type="hidden" name="class" value={selected.id} />}
            <input className="ctl" type="date" name="date" defaultValue={date} max={now} aria-label={tr("common.date")} />
            <button className="btn secondary" type="submit">{tr("ux.show")}</button>
          </form>
          {next <= now
            ? <Link className="icon-btn" href={href({ date: next })} aria-label={tr("mobile.nextDay")} title={tr("mobile.nextDay")}><Icon name="arrow" size={18} /></Link>
            : <span className="icon-btn" aria-hidden style={{ opacity: 0.3 }}><Icon name="arrow" size={18} /></span>}
        </div>
      </div>

      {dayWarning && <Notice tone="warning">{dayWarning}</Notice>}
      {register}

      <Section flush icon="list" title={tr("ux.classesOn", { date: fmtDate(date, locale) })} count={`${taken} / ${classes.length}`}>
        <Table
          flush
          rows={days}
          rowKey={(r) => r.c.id}
          empty={tr("ux.noClasses")}
          emptyHint={can(me, "school.configure", p.siteId) ? tr("ux.noClassesHint") : tr("setupHint.classesAsk")}
          rowClass={(r) => (r.c.id === selected?.id ? "row-sel" : undefined)}
          columns={[
            { key: "class", header: tr("common.class"), render: (r) => <strong>{classLabel(r.c, tr)}</strong> },
            { key: "status", header: tr("common.status"), render: (r) => (r.day.taken ? <span className="pill good">{tr("attendance.taken")}</span> : <span className="pill warn">{tr("attendance.notTaken")}</span>) },
            { key: "present", header: tr("attendance.present"), numeric: true, render: (r) => (r.day.taken ? r.day.present : "—") },
            { key: "absent", header: tr("attendance.absent"), numeric: true, render: (r) => (r.day.taken ? r.day.absent : "—") },
            { key: "rate", header: tr("attendance.rate"), numeric: true, render: (r) => { const x = attendanceRate([r.day]); return x === null ? "—" : `${Math.round(x * 100)}%`; } },
            { key: "go", header: "", shrink: true, render: (r: (typeof days)[number]) => (canWrite
              ? <Link className={r.day.taken ? "btn secondary sm" : "btn sm"} href={`${href({ class: r.c.id })}#register`}>{r.day.taken ? tr("ux.editRegister") : tr("ux.openRegister")}</Link>
              : r.day.taken ? <Link className="btn secondary sm" href={`${href({ class: r.c.id })}#register`}>{tr("att.view")}</Link> : null) },
          ]}
        />
      </Section>

      <Section flush icon="alert" title={tr("attendance.chronic")} count={chronic.length}>
        <Table
          flush
          rows={chronic}
          rowKey={(r) => r.studentId}
          empty={tr("ux.noneYet")}
          emptyIcon="check"
          columns={[
            { key: "name", header: tr("common.name"), render: (r) => { const x = students.get(r.studentId); return x ? <Link className="row-link" href={`/${locale}/schools/${p.siteId}/students/${x.id}#attendance`}><strong>{studentName(x)}</strong></Link> : <span className="muted">{tr("pupil.removed")}</span>; } },
            { key: "phone", header: tr("student.guardianPhone"), render: (r) => students.get(r.studentId)?.guardianPhone || <span className="muted">—</span> },
            { key: "days", header: tr("attendance.absent"), numeric: true, render: (r) => r.days },
          ]}
        />
      </Section>
      {classes.length === 0 && <NotSetUp me={me} siteId={p.siteId} locale={locale} />}
    </>
  );
}
