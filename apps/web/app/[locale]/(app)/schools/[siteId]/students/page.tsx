import { activeOn, live } from "@eu/schools";
import { t } from "@eu/core/i18n";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Field, Fields, FormFooter, Notice, RowMenu, SubmitButton, Table } from "@/components/ui";
import { can, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { Flash, param, type SP } from "../../flash";
import { PrintButton } from "../../print-button";
import { plural } from "../../text";
import { fmtDate } from "../format";
import { byLevel, classLabel, studentName } from "../labels";
import { NotSetUp } from "../not-set-up";
import { recordLeaving } from "./actions";
import { EnrolForms } from "./enrol-form";

const STATUSES = ["active", "left", "all"] as const;

export default async function Students({ params, searchParams }: { params: Promise<{ locale: string; siteId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const d = await schoolFor(me, p.siteId);
  const date = today();
  const classes = live(d.classes).sort(byLevel);
  const classById = new Map(d.classes.map((c) => [c.id, c]));
  const q = param(sp, "q");
  const cls = param(sp, "class");
  const status = (STATUSES as readonly string[]).includes(param(sp, "status")) ? (param(sp, "status") as (typeof STATUSES)[number]) : "active";
  const activeIds = new Set(activeOn(d.enrolments, date, d.years).map((e) => e.id));

  // One row per pupil, with their latest enrolment (the one that is active today, if any).
  const latest = new Map<string, (typeof d.enrolments)[number]>();
  for (const e of d.enrolments) {
    if (e.voidedAt) continue;
    const cur = latest.get(e.studentId);
    if (!cur || activeIds.has(e.id) || (!activeIds.has(cur.id) && e.enrolledOn > cur.enrolledOn)) latest.set(e.studentId, e);
  }
  const all = live(d.students)
    .map((s) => { const e = latest.get(s.id); return { s, e, c: e ? classById.get(e.classId) : undefined, active: !!e && activeIds.has(e.id) }; })
    .filter((r): r is typeof r & { e: NonNullable<typeof r.e> } => !!r.e);
  const nActive = all.filter((r) => r.active).length;
  const rows = all
    .filter((r) => (status === "all" ? true : status === "active" ? r.active : !r.active))
    .filter((r) => !q || studentName(r.s).toLowerCase().includes(q.toLowerCase()) || r.s.studentNumber.toLowerCase().includes(q.toLowerCase()))
    .filter((r) => !cls || r.c?.id === cls)
    .sort((a, b) => (a.c && b.c ? byLevel(a.c, b.c) : 0) || studentName(a.s).localeCompare(studentName(b.s)));
  const canWrite = can(me, "student.write", p.siteId) && can(me, "enrolment.write", p.siteId);
  const keys = ["lastName", "postName", "firstName", "sex", "female", "male", "dateOfBirth", "birthHint", "birthYearEstimate", "guardianName", "guardianPhone", "village", "enrolledOn", "confirmDifferent"];
  const l: Record<string, string> = Object.fromEntries(keys.map((k) => [k, tr(`student.${k}`)]));
  Object.assign(l, {
    duplicate: tr("student.duplicateWarning"), class: tr("student.enrolledIn"), add: tr("student.add"),
    cancel: t(locale, "ui.form.cancel"), saving: t(locale, "ui.form.saving"), optional: tr("common.optional"),
    pupilGroup: tr("ux.pupilGroup"), familyGroup: tr("ux.familyGroup"), placeGroup: tr("ux.placeGroup"), nameHint: tr("ux.nameHint"),
    savedOne: tr("bulk.savedOne"), saveNext: tr("bulk.saveNext"), stickyNote: tr("bulk.stickyNote"), done: tr("bulk.done"),
    bulkOpen: tr("bulk.open"), bulkTitle: tr("bulk.title"), bulkIntro: tr("bulk.intro"), bulkLines: tr("bulk.lines"), bulkHint: tr("bulk.hint"),
    bulkExample: tr("bulk.example"), bulkSave: tr("bulk.save"), bulkSaved: tr("bulk.saved"), bulkProblems: tr("bulk.problems"), bulkDupes: tr("bulk.dupes"),
    bulkLine: tr("bulk.line"), bulkConfirm: tr("bulk.confirm"), colon: tr("common.colon"),
  });
  const filtered = !!q || !!cls;
  const base = `/${locale}/schools/${p.siteId}/students`;
  const shownClass = cls ? classById.get(cls) : undefined;

  return (
    <>
      <Flash sp={sp} tr={tr} />
      {classes.length === 0 && <NotSetUp me={me} siteId={p.siteId} locale={locale} />}
      <div className="list-head">
        <form method="get" className="toolbar-main no-print" role="search">
          <label className="search">
            <Icon name="search" size={18} />
            <input className="ctl" name="q" defaultValue={q} placeholder={tr("student.search")} aria-label={tr("student.search")} type="search" />
          </label>
          <select className="ctl" name="class" defaultValue={cls} aria-label={tr("common.class")}>
            <option value="">{tr("feeGrid.allClasses")}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{classLabel(c, tr)}</option>)}
          </select>
          <select className="ctl" name="status" defaultValue={status} aria-label={tr("common.status")}>
            {STATUSES.map((s) => <option key={s} value={s}>{tr(`pupil.filter.${s}`)}</option>)}
          </select>
          <button className="btn secondary" type="submit">{tr("ux.show")}</button>
          {(filtered || status !== "active") && <a className="btn ghost" href="?">{tr("ux.clear")}</a>}
        </form>
        <span className="list-count">{plural(locale, tr, "pupil.count", rows.length)}</span>
        {rows.length > 0 && <PrintButton target="pupil-list" label={tr("print.list")} />}
        {canWrite && classes.length > 0 && (
          <EnrolForms locale={locale} siteId={p.siteId} classes={classes.map((c) => ({ id: c.id, label: classLabel(c, tr) }))} today={date} l={l} defaultOpen={nActive === 0} />
        )}
      </div>
      <div id="pupil-list">
        <div className="print-only print-head">
          <strong>{d.site.name}</strong> · {shownClass ? classLabel(shownClass, tr) : tr("feeGrid.allClasses")} · {tr(`pupil.filter.${status}`)} · {fmtDate(date, locale)}
        </div>
        <Table
          rows={rows}
          rowKey={(r) => r.s.id}
          empty={filtered ? tr("ux.noMatch", { q: q || (shownClass ? classLabel(shownClass, tr) : "") }) : status === "left" ? tr("pupil.noneLeft") : tr("ux.noPupils")}
          emptyHint={filtered || status === "left" ? undefined : canWrite ? tr("ux.noPupilsHint") : undefined}
          emptyIcon={filtered ? "search" : "users"}
          rowClass={(r) => (r.active ? undefined : "row-left")}
          columns={[
            { key: "name", header: tr("common.name"), render: (r) => <><Link className="row-link" href={`${base}/${r.s.id}`}><strong>{studentName(r.s)}</strong></Link><div className="muted small">{r.s.studentNumber}</div></> },
            { key: "sex", header: tr("student.sex"), render: (r) => (r.s.sex === "F" ? tr("student.female") : tr("student.male")) },
            { key: "class", header: tr("common.class"), render: (r) => (r.c ? classLabel(r.c, tr) : <span className="muted">—</span>) },
            ...(status !== "active" ? [{ key: "status", header: tr("common.status"), render: (r: (typeof rows)[number]) => (r.active
              ? <span className="pill good">{tr("student.statuses.active")}</span>
              : <span className="pill">{tr(`student.statuses.${r.e.status}`)}{r.e.leftOn ? ` · ${fmtDate(r.e.leftOn, locale)}` : ""}</span>) }] : []),
            { key: "guardian", header: tr("student.guardianName"), render: (r) => (r.s.guardianName || r.s.guardianPhone ? <>{r.s.guardianName}<div className="muted small">{r.s.guardianPhone}</div></> : <span className="muted">—</span>) },
            ...(canWrite
              ? [{
                  key: "leave",
                  header: "",
                  shrink: true,
                  render: (r: (typeof rows)[number]) => (r.active ? (
                    <span className="no-print">
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
                            <Field span={12} label={tr("student.leftOn")} hint={tr("ux.leaveHint")}><input type="date" name="leftOn" defaultValue={date} min={r.e.enrolledOn} max={date} required /></Field>
                          </Fields>
                          <FormFooter><SubmitButton small pending={t(locale, "ui.form.saving")}>{tr("ux.leaveTitle")}</SubmitButton></FormFooter>
                        </form>
                      </RowMenu>
                    </span>
                  ) : <Link className="btn ghost sm no-print" href={`${base}/${r.s.id}`}>{tr("pupil.open")}</Link>),
                }]
              : []),
          ]}
        />
      </div>
      {status === "active" && all.length > nActive && <Notice><Link href={`${base}?status=left`}>{plural(locale, tr, "pupil.leftCount", all.length - nActive)}</Link></Notice>}
    </>
  );
}
