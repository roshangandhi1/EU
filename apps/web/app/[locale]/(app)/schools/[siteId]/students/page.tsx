import { activeOn, live } from "@eu/schools";
import { t } from "@eu/core/i18n";
import { Icon } from "@/components/icons";
import { Field, Fields, FormFooter, Notice, RowMenu, SubmitButton, Table } from "@/components/ui";
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
  const q = param(sp, "q");
  const cls = param(sp, "class");
  const all = activeOn(d.enrolments, date)
    .map((e) => ({ e, s: students.get(e.studentId), c: classById.get(e.classId) }))
    .filter((r): r is { e: typeof r.e; s: NonNullable<typeof r.s>; c: NonNullable<typeof r.c> } => !!r.s && !!r.c);
  const rows = all
    .filter((r) => !q || studentName(r.s).toLowerCase().includes(q.toLowerCase()) || r.s.studentNumber.toLowerCase().includes(q.toLowerCase()))
    .filter((r) => !cls || r.c.id === cls)
    .sort((a, b) => byLevel(a.c, b.c) || studentName(a.s).localeCompare(studentName(b.s)));
  const canWrite = can(me, "student.write", p.siteId) && can(me, "enrolment.write", p.siteId);
  const keys = ["lastName", "postName", "firstName", "sex", "female", "male", "dateOfBirth", "birthHint", "birthYearEstimate", "guardianName", "guardianPhone", "village", "enrolledOn", "confirmDifferent"];
  const l: Record<string, string> = Object.fromEntries(keys.map((k) => [k, tr(`student.${k}`)]));
  Object.assign(l, {
    duplicate: tr("student.duplicateWarning"), invalid: tr("common.invalid"), rejected: tr("common.rejected"), class: tr("student.enrolledIn"), add: tr("student.add"),
    cancel: t(locale, "ui.form.cancel"), saving: t(locale, "ui.form.saving"), optional: tr("common.optional"),
    pupilGroup: tr("ux.pupilGroup"), familyGroup: tr("ux.familyGroup"), placeGroup: tr("ux.placeGroup"), nameHint: tr("ux.nameHint"),
  });
  const filtered = !!q || !!cls;

  return (
    <>
      <Flash sp={sp} tr={tr} />
      {classes.length === 0 && <Notice tone="warning">{tr("overview.notSetUp")}</Notice>}
      <div className="list-head">
        <form method="get" className="toolbar-main" role="search">
          <label className="search">
            <Icon name="search" size={18} />
            <input className="ctl" name="q" defaultValue={q} placeholder={tr("student.search")} aria-label={tr("student.search")} type="search" />
          </label>
          <select className="ctl" name="class" defaultValue={cls} aria-label={tr("common.class")}>
            <option value="">{tr("feeGrid.allClasses")}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c, tr)}</option>)}
          </select>
          <button className="btn secondary" type="submit">{tr("ux.show")}</button>
          {filtered && <a className="btn ghost" href="?">{tr("ux.clear")}</a>}
        </form>
        <span className="list-count">{tr("ux.showing", { n: rows.length })}</span>
        {canWrite && classes.length > 0 && (
          <EnrolForm locale={locale} siteId={p.siteId} classes={classes.map((c) => ({ id: c.id, label: classLabel(c, tr) }))} today={date} l={l} defaultOpen={all.length === 0} />
        )}
      </div>
      <Table
        rows={rows}
        rowKey={(r) => r.e.id}
        empty={filtered ? tr("ux.noMatch", { q: q || classLabel(classById.get(cls)!, tr) }) : tr("ux.noPupils")}
        emptyHint={filtered ? undefined : tr("ux.noPupilsHint")}
        emptyIcon={filtered ? "search" : "users"}
        columns={[
          { key: "name", header: tr("common.name"), render: (r) => <><strong>{studentName(r.s)}</strong><div className="muted small">{r.s.studentNumber}</div></> },
          { key: "sex", header: tr("student.sex"), render: (r) => (r.s.sex === "F" ? tr("student.female") : tr("student.male")) },
          { key: "class", header: tr("common.class"), render: (r) => classLabel(r.c, tr) },
          { key: "guardian", header: tr("student.guardianName"), render: (r) => (r.s.guardianName || r.s.guardianPhone ? <>{r.s.guardianName}<div className="muted small">{r.s.guardianPhone}</div></> : <span className="muted">—</span>) },
          ...(canWrite
            ? [{
                key: "leave",
                header: "",
                shrink: true,
                render: (r: (typeof rows)[number]) => (
                  <RowMenu label={tr("ux.leaveTitle")} icon="logout">
                    <form action={recordLeaving}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="siteId" value={p.siteId} />
                      <input type="hidden" name="enrolmentId" value={r.e.id} />
                      <p style={{ margin: "0 0 10px", color: "var(--text)", fontWeight: 650 }}>{tr("ux.leaveFor", { name: studentName(r.s) })}</p>
                      <Fields>
                        <Field span={12} label={tr("common.status")}>
                          <select name="status" defaultValue="transferred">
                            {(["transferred", "dropped_out", "completed"] as const).map((st) => <option key={st} value={st}>{tr(`student.statuses.${st}`)}</option>)}
                          </select>
                        </Field>
                        <Field span={12} label={tr("student.leftOn")} hint={tr("ux.leaveHint")}><input type="date" name="leftOn" defaultValue={date} max={date} required /></Field>
                      </Fields>
                      <FormFooter><SubmitButton small pending={t(locale, "ui.form.saving")}>{tr("ux.leaveTitle")}</SubmitButton></FormFooter>
                    </form>
                  </RowMenu>
                ),
              }]
            : []),
        ]}
      />
    </>
  );
}
