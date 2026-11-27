import { activeOn, formatCdf, live, enrolmentBalance, newestFirst, receiptLabel, levelsOf } from "@eu/schools";
import { t } from "@eu/core/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Field, Fields, FormFooter, Section, Stat, Stats, SubmitButton, Table } from "@/components/ui";
import { can, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { Flash, type SP } from "../../../flash";
import { PrintButton } from "../../../print-button";
import { plural } from "../../../text";
import { fmtDate } from "../../format";
import { byLevel, classLabel, studentName } from "../../labels";
import { changeClass, recordLeaving, undoLeaving } from "../actions";
import { EditPupil } from "./edit-form";

/** One pupil: details (editable), class and departure, fee statement and attendance summary. */
export default async function Pupil({ params, searchParams }: { params: Promise<{ locale: string; siteId: string; studentId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const C = tr("common.colon");
  const d = await schoolFor(me, p.siteId);
  const LV = levelsOf(d.school);
  const s = d.students.find((x) => x.id === p.studentId && !x.voidedAt);
  if (!s) notFound();
  const date = today();
  const fc = (n: number) => formatCdf(n, locale);
  const saving = t(locale, "ui.form.saving");
  const base = `/${locale}/schools/${p.siteId}`;
  const canWrite = can(me, "student.write", p.siteId) && can(me, "enrolment.write", p.siteId);

  const mine = live(d.enrolments).filter((e) => e.studentId === s.id).sort((a, b) => (a.enrolledOn < b.enrolledOn ? 1 : -1));
  const current = activeOn(mine, date)[0];
  const e = current ?? mine[0];
  const cls = e ? d.classes.find((c) => c.id === e.classId) : undefined;
  const year = e ? d.years.find((y) => y.id === e.academicYearId) : undefined;
  const sameYear = e ? live(d.classes).filter((c) => c.academicYearId === e.academicYearId).sort(byLevel) : [];
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="siteId" value={p.siteId} />
      <input type="hidden" name="studentId" value={s.id} />
      {e && <input type="hidden" name="enrolmentId" value={e.id} />}
    </>
  );

  // Fee statement for the enrolment's year: what is charged, what was paid with which receipt, exemptions.
  const items = e ? d.feeItems.filter((i) => i.academicYearId === e.academicYearId) : [];
  const bal = cls && e ? enrolmentBalance(d, e, date) : null;
  const payments = d.payments.filter((x) => x.studentId === s.id).sort(newestFirst);
  const exemptions = live(d.exemptions).filter((x) => x.studentId === s.id);

  // Attendance this enrolment: registers taken for the class since enrolment, and this pupil's absences.
  const until = e?.leftOn && e.leftOn <= date ? e.leftOn : date;
  const inRange = (day: string) => !!e && day >= e.enrolledOn && day <= until && (!e.leftOn || day < e.leftOn);
  const regDays = new Set(live(d.registers).filter((r) => r.classId === e?.classId && inRange(r.date)).map((r) => r.date));
  const absences = live(d.absences).filter((a) => a.studentId === s.id && inRange(a.date)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const absentDays = new Set(absences.map((a) => a.date));
  for (const day of absentDays) regDays.add(day);
  const presentDays = regDays.size - absentDays.size;
  const rate = regDays.size ? Math.round((presentDays / regDays.size) * 100) : null;
  const month = date.slice(0, 7);
  const absentMonth = absences.filter((a) => a.date.startsWith(month)).length;
  const byReason = new Map<string, number>();
  for (const a of absences) byReason.set(a.reason, (byReason.get(a.reason) ?? 0) + 1);

  const fvs = JSON.stringify((s as unknown as { fieldVersions?: Record<string, number> }).fieldVersions ?? {});
  const statusPill = current
    ? <span className="pill good">{tr("student.statuses.active")}</span>
    : e ? <span className="pill">{tr(`student.statuses.${e.status}`)}{e.leftOn ? ` · ${fmtDate(e.leftOn, locale)}` : ""}</span> : null;

  const el = (k: string) => tr(`student.${k}`);
  const editLabels = {
    lastName: el("lastName"), postName: el("postName"), firstName: el("firstName"), sex: el("sex"), female: el("female"), male: el("male"),
    dateOfBirth: el("dateOfBirth"), birthHint: el("birthHint"), birthYearEstimate: el("birthYearEstimate"), guardianName: el("guardianName"),
    guardianPhone: el("guardianPhone"), village: el("village"), birthPlace: el("birthPlace"), idNumber: el("idNumber"), permNumber: el("permNumber"), bulletinHint: el("bulletinHint"), optional: tr("common.optional"), save: tr("pupil.saveDetails"), saving,
    saved: tr("pupil.edited"), conflict: tr("err.conflict"), pupilGroup: tr("ux.pupilGroup"), familyGroup: tr("ux.familyGroup"), unsaved: tr("pupil.unsavedLeave"),
  };

  return (
    <div className="stack pupil-page">
      <div className="pupil-head">
        <Link className="btn ghost sm no-print" href={`${base}/students`}><Icon name="arrow" size={15} className="flip" />{tr("nav.students")}</Link>
        <div className="pupil-title">
          <h2>{studentName(s)}</h2>
          <p className="muted">{s.studentNumber}{cls ? ` · ${classLabel(cls, tr, LV)}` : ""}{year ? ` · ${year.label}` : ""} {statusPill}</p>
        </div>
      </div>
      <Flash sp={sp} tr={tr} />

      <Section id="place" icon="users" title={tr("pupil.place")} description={e ? tr("pupil.enrolledSince", { date: fmtDate(e.enrolledOn, locale) }) : undefined}>
        {!e ? <p className="muted">{tr("pupil.noEnrolment")}</p> : !canWrite ? (
          <p>{cls ? classLabel(cls, tr, LV) : "—"}</p>
        ) : current ? (
          <div className="pupil-actions">
            <form action={changeClass} className="pupil-inline">
              {hidden}
              <Fields>
                <Field span={8} label={tr("pupil.changeClass")} hint={tr("pupil.changeClassHint")}>
                  <select name="classId" defaultValue={e.classId}>{sameYear.map((c) => <option key={c.id} value={c.id}>{classLabel(c, tr, LV)}</option>)}</select>
                </Field>
              </Fields>
              <FormFooter><SubmitButton small variant="secondary" pending={saving}>{tr("pupil.moveSave")}</SubmitButton></FormFooter>
            </form>
            <form action={recordLeaving} className="pupil-inline">
              {hidden}
              <input type="hidden" name="back" value="pupil" />
              <Fields>
                <Field span={6} label={tr("ux.leaveTitle")}>
                  <select name="status" defaultValue="transferred">
                    {(["transferred", "dropped_out", "completed"] as const).map((st) => <option key={st} value={st}>{tr(`student.statuses.${st}`)}</option>)}
                  </select>
                </Field>
                <Field span={6} label={tr("student.leftOn")} hint={tr("ux.leaveHint")}><input type="date" name="leftOn" defaultValue={date} min={e.enrolledOn} max={date} required /></Field>
              </Fields>
              <FormFooter><SubmitButton small variant="secondary" pending={saving}>{tr("ux.leaveTitle")}</SubmitButton></FormFooter>
            </form>
          </div>
        ) : (
          <form action={undoLeaving}>
            {hidden}
            <p style={{ marginTop: 0 }}>{tr("pupil.leftOnText", { status: tr(`student.statuses.${e.status}`), date: fmtDate(e.leftOn, locale) })}</p>
            <FormFooter note={tr("pupil.undoHint")}><SubmitButton small variant="secondary" icon="arrow" pending={saving}>{tr("pupil.undo")}</SubmitButton></FormFooter>
          </form>
        )}
      </Section>

      <Section id="details" icon="user" title={tr("pupil.details")}>
        {canWrite ? (
          <EditPupil locale={locale} siteId={p.siteId} studentId={s.id} fv={fvs} today={date} l={editLabels}
            v={{ lastName: s.lastName, postName: s.postName, firstName: s.firstName, sex: s.sex, dateOfBirth: s.dateOfBirth ?? "", birthYearEstimate: s.birthYearEstimate != null ? String(s.birthYearEstimate) : "", guardianName: s.guardianName, guardianPhone: s.guardianPhone, village: s.village, birthPlace: s.birthPlace ?? "", idNumber: s.idNumber ?? "", permNumber: s.permNumber ?? "" }} />
        ) : (
          <dl className="pupil-dl">
            <dt>{el("sex")}</dt><dd>{s.sex === "F" ? el("female") : el("male")}</dd>
            <dt>{el("dateOfBirth")}</dt><dd>{s.dateOfBirth ? fmtDate(s.dateOfBirth, locale) : s.birthYearEstimate ?? "—"}</dd>
            <dt>{el("guardianName")}</dt><dd>{s.guardianName || "—"}</dd>
            <dt>{el("guardianPhone")}</dt><dd>{s.guardianPhone || "—"}</dd>
            <dt>{el("village")}</dt><dd>{s.village || "—"}</dd>
            <dt>{el("birthPlace")}</dt><dd>{s.birthPlace || "—"}</dd>
            <dt>{el("idNumber")}</dt><dd>{s.idNumber || "—"}</dd>
            <dt>{el("permNumber")}</dt><dd>{s.permNumber || "—"}</dd>
          </dl>
        )}
      </Section>

      <div id="statement">
        <Section id="fees" flush icon="coins" title={tr("pupil.statement")} description={year ? `${year.label} · ${tr("pupil.asAt", { date: fmtDate(date, locale) })}` : undefined}
          actions={<PrintButton target="statement" label={tr("print.statement")} />}>
          <div className="print-only print-head"><strong>{d.site.name}</strong> · {studentName(s)} · {s.studentNumber}{cls ? ` · ${classLabel(cls, tr, LV)}` : ""}</div>
          {bal && (
            <div className="pupil-stats">
              <Stats>
                <Stat label={tr("fees.charged")} value={fc(bal.charged)} />
                <Stat label={tr("fees.paid")} value={fc(bal.paid)} />
                <Stat label={bal.balance < 0 ? tr("pupil.credit") : tr("fees.balance")} value={fc(Math.abs(bal.balance))} hint={bal.overdue > 0 ? `${tr("fees.overdue")}${C}${fc(bal.overdue)}` : undefined} />
              </Stats>
            </div>
          )}
          <Table flush rows={bal?.lines ?? []} rowKey={(r) => r.feeItemId} empty={tr("pupil.noFees")} emptyIcon="coins" columns={[
            { key: "n", header: tr("setup.feeName"), render: (r) => <strong>{r.name}</strong> },
            { key: "d", header: tr("setup.dueOn"), render: (r) => fmtDate(r.dueOn, locale) },
            { key: "c", header: tr("fees.charged"), numeric: true, render: (r) => fc(r.charged) },
            { key: "p", header: tr("fees.paid"), numeric: true, render: (r) => fc(r.paid) },
            { key: "o", header: tr("pupil.outstanding"), numeric: true, render: (r) => (r.outstanding > 0 ? <strong className={r.dueOn < date ? "text-bad" : undefined}>{fc(r.outstanding)}</strong> : <span className="muted">0</span>) },
          ]} />
          {exemptions.length > 0 && (
            <p className="pupil-note"><Icon name="tag" size={14} /> {tr("setup.exemptions")}{C}{exemptions.map((x) => `${items.find((i) => i.id === x.feeItemId)?.name ?? tr("feeGrid.allFees")} (${tr(`setup.kinds.${x.kind}`)}${x.kind === "percent" ? ` ${x.value} %` : x.kind === "fixed" ? ` ${fc(x.value)}` : ""}) – ${x.reason}`).join(" · ")}</p>
          )}
          <h3 className="fgroup pupil-sub">{tr("pupil.payments")}</h3>
          <Table flush rows={payments} rowKey={(r) => r.id} empty={tr("ux.noPayments")} emptyIcon="receipt" rowClass={(r) => (r.voidedAt ? "voided" : undefined)} columns={[
            { key: "d", header: tr("common.date"), render: (r) => fmtDate(r.paidOn, locale) },
            { key: "r", header: tr("fees.receiptCode"), render: (r) => <span className="mono">{receiptLabel(r)}</span> },
            { key: "a", header: tr("fees.amount"), numeric: true, render: (r) => (r.voidedAt ? <s>{fc(r.amount)}</s> : <strong>{fc(r.amount)}</strong>) },
            { key: "v", header: "", render: (r) => (r.voidedAt ? <span className="pill bad">{tr("fees.voided")}{r.voidReason ? `${C}${r.voidReason}` : ""}</span> : null) },
          ]} />
        </Section>
      </div>

      <Section id="attendance" icon="check" title={tr("pupil.attendance")} description={e ? tr("pupil.since", { date: fmtDate(e.enrolledOn, locale) }) : undefined}>
        <Stats>
          <Stat label={tr("attendance.rate")} value={rate === null ? "—" : `${rate} %`} hint={plural(locale, tr, "pupil.registers", regDays.size)} />
          <Stat label={tr("pupil.absentDays")} value={absentDays.size} hint={[...byReason].map(([r, n]) => `${tr(`attendance.reasons.${r}`)}${C}${n}`).join(" · ") || undefined} />
          <Stat label={tr("pupil.absentMonth")} value={absentMonth} />
        </Stats>
        {absences.length > 0 && (
          <p className="pupil-note">{tr("pupil.lastAbsences")}{C}{absences.slice(0, 8).map((a) => `${fmtDate(a.date, locale)} (${tr(`attendance.reasons.${a.reason}`)})`).join(" · ")}</p>
        )}
      </Section>
    </div>
  );
}
