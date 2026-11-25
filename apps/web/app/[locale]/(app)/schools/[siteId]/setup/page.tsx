import { activeOn, formatCdf, live, placesAsAt } from "@eu/schools";
import { t } from "@eu/core/i18n";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Adder, ChoiceGroup, Chip, ConfirmButton, EmptyRow, Field, Fields, FormFooter, Notice, Section, SubmitButton, Table } from "@/components/ui";
import { can, schoolDevices, schoolFor, schoolStaff, signedIn, today, tr as trFor, userNames } from "@/lib/schools";
import { Flash, type SP } from "../../flash";
import { byLevel, classLabel, studentName } from "../labels";
import { fmtDate } from "../format";
import * as A from "./actions";

/**
 * School setup: one section per kind of record, each with its list and an "Add …" form in place.
 * A side index shows which steps already have records.
 */
export default async function Setup({ params, searchParams }: { params: Promise<{ locale: string; siteId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const f = (k: string) => t(locale, `ui.form.${k}`);
  if (!can(me, "school.configure", p.siteId)) return <Notice tone="warning">{tr("setup.configureOnly")}</Notice>;
  const d = await schoolFor(me, p.siteId);
  const staff = await schoolStaff(p.siteId);
  const phones = await schoolDevices(p.siteId);
  const tags = live(d.deviceTags);
  const freeLetters = "ABCDEFGHIJKLMNOPQRSTUVXYZ".split("").filter((l) => !tags.some((x) => x.tag === l));
  const freePhones = phones.filter((ph) => !tags.some((x) => x.phoneId === ph.id));
  const books = live(d.receiptBooks);
  const holders = await userNames(books.map((b) => b.assignedTo).filter((id) => !staff.some((u) => u.id === id)));
  const staffName = (id: string) => staff.find((u) => u.id === id)?.name ?? holders.get(id) ?? tr("ux.unknownUser");
  const date = today();
  const optional = tr("common.optional");
  const saving = f("saving");
  const dt = (iso: string | null | undefined) => fmtDate(iso, locale);
  const done = typeof sp.ok === "string" ? `${sp.s}-${sp.ok}-${sp.n}` : undefined;

  const hidden = (section: string) => (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="siteId" value={p.siteId} />
      <input type="hidden" name="section" value={section} />
    </>
  );
  const remove = (section: string, entity: string, id: string) => (
    <form action={A.voidConfig}>
      {hidden(section)}
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <ConfirmButton label={f("remove")} confirm={f("removeConfirm")} yes={f("yesRemove")} no={f("keep")} />
    </form>
  );
  const add = (section: string, label: string, empty: boolean, action: (fd: FormData) => Promise<void>, fields: React.ReactNode) => (
    <Adder label={label} cancel={f("cancel")} defaultOpen={empty} resetKey={done}>
      <form action={action}>
        {hidden(section)}
        <Fields>{fields}</Fields>
        <FormFooter><SubmitButton icon="plus" pending={saving}>{label}</SubmitButton></FormFooter>
      </form>
    </Adder>
  );

  const years = live(d.years).sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1));
  const yearOpts = years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>);
  const terms = live(d.terms).sort((a, b) => a.number - b.number);
  const rooms = live(d.classrooms);
  const classes = live(d.classes).sort(byLevel);
  const items = live(d.feeItems);
  const exemptions = live(d.exemptions);
  const places = d.school ? placesAsAt(d.school, d.classrooms, date) : null;
  const students = new Map(d.students.map((s) => [s.id, s]));
  const enrolled = activeOn(d.enrolments, date).map((e) => students.get(e.studentId)).filter((s): s is NonNullable<typeof s> => !!s);
  const needYear = <EmptyRow icon="calendar" title={tr("ux.needYear")} />;

  const index = [
    { id: "school", label: tr("setup.school"), n: d.school?.shiftsRunning.length ?? 0 },
    { id: "years", label: tr("setup.year"), n: years.length },
    { id: "terms", label: tr("setup.term"), n: terms.length },
    { id: "rooms", label: tr("capacity.title"), n: rooms.length },
    { id: "classes", label: tr("setup.classes"), n: classes.length },
    { id: "fees", label: tr("setup.feeItems"), n: items.length },
    { id: "books", label: tr("setup.receiptBooks"), n: books.length },
    { id: "phones", label: tr("setup.devices"), n: tags.length },
    { id: "exemptions", label: tr("setup.exemptions"), n: exemptions.length },
  ];

  return (
    <div className="with-index">
      <nav className="sec-index" aria-label={tr("ux.setupSteps")}>
        <div className="si-title">{tr("ux.setupSteps")}</div>
        {index.map((x) => (
          <a key={x.id} href={`#${x.id}`}>
            {x.label}
            <span className={x.n > 0 ? "si-state done" : "si-state"} aria-hidden>{x.n > 0 ? <Icon name="check" size={12} /> : ""}</span>
          </a>
        ))}
      </nav>

      <div>
        <Flash sp={sp} tr={tr} />

        <Section id="school" icon="school" title={tr("setup.school")} description={tr("ux.schoolDesc")}>
          <Flash sp={sp} tr={tr} section="school" />
          <form action={A.saveSchool}>
            {hidden("school")}
            <Fields>
              <ChoiceGroup legend={tr("setup.shiftsRunning")} hint={tr("ux.shiftsHint")}>
                <Chip name="shiftsRunning" value="morning" label={tr("shift.morning")} defaultChecked={d.school?.shiftsRunning.includes("morning")} />
                <Chip name="shiftsRunning" value="afternoon" label={tr("shift.afternoon")} defaultChecked={d.school?.shiftsRunning.includes("afternoon")} />
              </ChoiceGroup>
            </Fields>
            <FormFooter><SubmitButton pending={saving}>{tr("common.save")}</SubmitButton></FormFooter>
          </form>
        </Section>

        <Section id="years" flush icon="calendar" title={tr("setup.year")} description={tr("ux.yearsDesc")} count={years.length}>
          <Flash sp={sp} tr={tr} section="years" />
          <Table flush rows={years} rowKey={(r) => r.id} empty={tr("ux.noneYet")} emptyIcon="calendar" columns={[
            { key: "l", header: tr("setup.yearLabel"), render: (r) => <strong>{r.label}</strong> },
            { key: "s", header: tr("setup.startsOn"), render: (r) => dt(r.startsOn) },
            { key: "e", header: tr("setup.endsOn"), render: (r) => dt(r.endsOn) },
            { key: "x", header: "", shrink: true, render: (r) => remove("years", "school.academic_year", r.id) },
          ]} />
          {add("years", tr("ux.addYear"), years.length === 0, A.addYear, <>
            <Field span={4} label={tr("setup.yearLabel")} hint={tr("ux.yearExample")}><input name="label" required placeholder="2026-2027" /></Field>
            <Field span={4} label={tr("setup.startsOn")}><input name="startsOn" type="date" required /></Field>
            <Field span={4} label={tr("setup.endsOn")}><input name="endsOn" type="date" required /></Field>
          </>)}
        </Section>

        <Section id="terms" flush icon="calendar" title={tr("setup.term")} description={tr("ux.termsDesc")} count={terms.length}>
          <Flash sp={sp} tr={tr} section="terms" />
          <Table flush rows={terms} rowKey={(r) => r.id} empty={tr("ux.noneYet")} emptyIcon="calendar" columns={[
            { key: "n", header: tr("setup.termNumber"), render: (r) => <strong>{tr("feeGrid.term", { n: r.number })}</strong> },
            { key: "y", header: tr("setup.yearLabel"), render: (r) => years.find((y) => y.id === r.academicYearId)?.label ?? "" },
            { key: "s", header: tr("setup.startsOn"), render: (r) => dt(r.startsOn) },
            { key: "e", header: tr("setup.endsOn"), render: (r) => dt(r.endsOn) },
            { key: "x", header: "", shrink: true, render: (r) => remove("terms", "school.term", r.id) },
          ]} />
          {years.length === 0 ? needYear : add("terms", tr("ux.addTerm"), terms.length === 0, A.addTerm, <>
            <Field span={3} label={tr("setup.yearLabel")}><select name="academicYearId" required>{yearOpts}</select></Field>
            <Field span={3} label={tr("setup.termNumber")}><select name="number">{[1, 2, 3].map((n) => <option key={n} value={n}>{tr("feeGrid.term", { n })}</option>)}</select></Field>
            <Field span={3} label={tr("setup.startsOn")}><input name="startsOn" type="date" required /></Field>
            <Field span={3} label={tr("setup.endsOn")}><input name="endsOn" type="date" required /></Field>
          </>)}
        </Section>

        <Section id="rooms" flush icon="door" title={tr("capacity.title")} description={tr("ux.roomsDesc")} count={rooms.length}
          actions={places ? <span className="inline-stat"><b>{places.totalPlaces}</b><span className="muted small">{tr("capacity.places").toLowerCase()}</span></span> : undefined}>
          <Flash sp={sp} tr={tr} section="rooms" />
          {places && rooms.length > 0 && <p className="muted small" style={{ margin: "0 20px 12px" }}>{tr("overview.placesHint", { baseline: places.baselinePlaces, new: places.newPlaces, shifts: places.shiftsCounted.length })}</p>}
          <Table flush rows={rooms} rowKey={(r) => r.id} empty={tr("ux.noneYet")} emptyIcon="door" columns={[
            { key: "n", header: tr("capacity.room"), render: (r) => <strong>{r.name}</strong> },
            { key: "s", header: tr("capacity.seatsPerShift"), numeric: true, render: (r) => r.seatsPerShift },
            { key: "b", header: tr("capacity.basis"), render: (r) => <span className={r.basis === "new" ? "pill good" : "pill"}>{tr(`capacity.${r.basis}`)}</span> },
            { key: "c", header: tr("capacity.commissionedOn"), render: (r) => dt(r.commissionedOn) },
            { key: "d", header: tr("capacity.decommissionedOn"), render: (r) => (r.decommissionedOn ? dt(r.decommissionedOn) : <span className="muted">—</span>) },
            { key: "e", header: tr("capacity.evidenceUrl"), render: (r) => (r.evidenceUrl ? <a href={r.evidenceUrl} target="_blank" rel="noreferrer">{new URL(r.evidenceUrl).hostname}</a> : <span className="muted">—</span>) },
            { key: "x", header: "", shrink: true, render: (r) => remove("rooms", "school.classroom", r.id) },
          ]} />
          {add("rooms", tr("ux.addRoom"), rooms.length === 0, A.addClassroom, <>
            <Field span={4} label={tr("capacity.room")}><input name="name" required placeholder="Salle 1" /></Field>
            <Field span={4} label={tr("capacity.seatsPerShift")} error={tr("ux.seatsError")}><input name="seatsPerShift" type="number" min={1} step={1} required inputMode="numeric" /></Field>
            <Field span={4} label={tr("capacity.basis")}><select name="basis"><option value="new">{tr("capacity.new")}</option><option value="baseline">{tr("capacity.baseline")}</option></select></Field>
            <Field span={4} label={tr("capacity.commissionedOn")}><input name="commissionedOn" type="date" required /></Field>
            <Field span={4} label={tr("capacity.decommissionedOn")} optional={optional}><input name="decommissionedOn" type="date" /></Field>
            <Field span={4} label={tr("capacity.evidenceUrl")} optional={optional}><input name="evidenceUrl" type="url" placeholder="https://" /></Field>
          </>)}
        </Section>

        <Section id="classes" flush icon="users" title={tr("setup.classes")} description={tr("ux.classesDesc")} count={classes.length}>
          <Flash sp={sp} tr={tr} section="classes" />
          <Table flush rows={classes} rowKey={(r) => r.id} empty={tr("ux.noneYet")} emptyIcon="users" columns={[
            { key: "c", header: tr("common.class"), render: (r) => <strong>{classLabel(r, tr)}</strong> },
            { key: "y", header: tr("setup.yearLabel"), render: (r) => years.find((y) => y.id === r.academicYearId)?.label ?? "" },
            { key: "r", header: tr("setup.classroom"), render: (r) => rooms.find((x) => x.id === r.classroomId)?.name ?? <span className="muted">—</span> },
            { key: "x", header: "", shrink: true, render: (r) => remove("classes", "school.class", r.id) },
          ]} />
          {years.length === 0 ? needYear : add("classes", tr("ux.addClass"), classes.length === 0, A.addClass, <>
            <Field span={4} label={tr("setup.yearLabel")}><select name="academicYearId" required>{yearOpts}</select></Field>
            <Field span={4} label={tr("common.level")}><select name="level">{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{tr("levelName", { n })}</option>)}</select></Field>
            <Field span={4} label={tr("setup.section")} hint={tr("ux.sectionHint")}><input name="section" defaultValue="A" maxLength={4} style={{ textTransform: "uppercase" }} /></Field>
            <Field span={4} label={tr("common.shift")}><select name="shift"><option value="morning">{tr("shift.morning")}</option><option value="afternoon">{tr("shift.afternoon")}</option></select></Field>
            <Field span={4} label={tr("setup.classroom")} optional={optional}><select name="classroomId"><option value="">—</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
          </>)}
        </Section>

        <Section id="fees" flush icon="coins" title={tr("setup.feeItems")} description={tr("ux.feesDesc")} count={items.length}
          actions={<Link className="btn secondary sm" href={`/${locale}/schools/${p.siteId}/setup/fees`}><Icon name="coins" size={15} />{tr("feeGrid.open")}</Link>}>
          <Flash sp={sp} tr={tr} section="fees" />
          <Table flush rows={items} rowKey={(r) => r.id} empty={tr("ux.noneYet")} emptyIcon="coins" columns={[
            { key: "n", header: tr("setup.feeName"), render: (r) => <strong>{r.name}</strong> },
            { key: "t", header: tr("setup.termNumber"), render: (r) => { const tm = terms.find((x) => x.id === r.termId); return tm ? tr("feeGrid.term", { n: tm.number }) : tr("ux.allYear"); } },
            { key: "l", header: tr("setup.levels"), render: (r) => r.levels.join(", ") },
            { key: "a", header: tr("fees.amount"), numeric: true, render: (r) => formatCdf(r.amount, locale) },
            { key: "d", header: tr("setup.dueOn"), render: (r) => dt(r.dueOn) },
            { key: "x", header: "", shrink: true, render: (r) => remove("fees", "school.fee_item", r.id) },
          ]} />
          {years.length === 0 ? needYear : add("fees", tr("ux.addFee"), false, A.addFeeItem, <>
            <Field span={6} label={tr("setup.feeName")}><input name="name" required placeholder="Minerval" /></Field>
            <Field span={3} label={tr("setup.yearLabel")}><select name="academicYearId" required>{yearOpts}</select></Field>
            <Field span={3} label={tr("setup.termNumber")} optional={optional}><select name="termId"><option value="">{tr("ux.allYear")}</option>{terms.map((tm) => <option key={tm.id} value={tm.id}>{tr("feeGrid.term", { n: tm.number })} · {years.find((y) => y.id === tm.academicYearId)?.label}</option>)}</select></Field>
            <Field span={4} label={tr("fees.amount")} hint={tr("ux.amountHint")} error={tr("ux.amountError")}><input name="amount" inputMode="numeric" pattern="[0-9 ]+" required className="num-input" /></Field>
            <Field span={4} label={tr("setup.levels")} hint={tr("setup.levelsHint")}><input name="levels" defaultValue="1-6" required /></Field>
            <Field span={4} label={tr("setup.dueOn")}><input name="dueOn" type="date" required /></Field>
          </>)}
        </Section>

        <Section id="books" flush icon="receipt" title={tr("setup.receiptBooks")} description={tr("ux.booksDesc")} count={books.length}>
          <Flash sp={sp} tr={tr} section="books" />
          <Table flush rows={books} rowKey={(r) => r.id} empty={tr("ux.noneYet")} emptyIcon="receipt" columns={[
            { key: "f", header: tr("setup.firstNumber"), numeric: true, render: (r) => r.firstNumber },
            { key: "l", header: tr("setup.lastNumber"), numeric: true, render: (r) => r.lastNumber },
            { key: "a", header: tr("setup.assignedTo"), render: (r) => staffName(r.assignedTo) },
            { key: "x", header: "", shrink: true, render: (r) => remove("books", "school.receipt_book", r.id) },
          ]} />
          {staff.length === 0 ? <EmptyRow icon="user" title={tr("ux.noStaff")} /> : add("books", tr("ux.addBook"), books.length === 0, A.addReceiptBook, <>
            <Field span={3} label={tr("setup.firstNumber")} error={tr("ux.numberError")}><input name="firstNumber" type="number" min={1} step={1} required className="num-input" /></Field>
            <Field span={3} label={tr("setup.lastNumber")} error={tr("ux.numberError")}><input name="lastNumber" type="number" min={1} step={1} required className="num-input" /></Field>
            <Field span={6} label={tr("setup.assignedTo")}><select name="assignedTo" required defaultValue=""><option value="" disabled>—</option>{staff.map((u) => <option key={u.id + u.role} value={u.id}>{u.name} · {t(locale, `ui.roles.${u.role}`)}</option>)}</select></Field>
          </>)}
        </Section>

        <Section id="phones" flush icon="phone" title={tr("setup.devices")} description={tr("setup.devicesHint")} count={tags.length}>
          <Flash sp={sp} tr={tr} section="phones" />
          {(tags.length > 0 || freePhones.length > 0) && <Table flush rows={tags} rowKey={(r) => r.id} empty={tr("ux.noneYet")} emptyIcon="phone" columns={[
            { key: "l", header: tr("setup.letter"), render: (r) => <span className="letter-tag">{r.tag}</span> },
            { key: "d", header: tr("setup.device"), render: (r) => { const ph = phones.find((x) => x.id === r.phoneId); return ph ? <>{ph.userName} <span className="muted">· {ph.name}</span></> : r.phoneId; } },
            { key: "x", header: "", shrink: true, render: (r) => remove("phones", "school.device_tag", r.id) },
          ]} />}
          {freePhones.length === 0 ? <EmptyRow icon="phone" title={tr("setup.noDevices")} /> : add("phones", tr("ux.addTag"), tags.length === 0, A.addDeviceTag, <>
            <Field span={8} label={tr("setup.device")}><select name="deviceId" required>{freePhones.map((ph) => <option key={ph.id} value={ph.id}>{ph.userName} · {ph.name}</option>)}</select></Field>
            <Field span={4} label={tr("setup.letter")}><select name="tag" required>{freeLetters.map((l) => <option key={l} value={l}>{l}</option>)}</select></Field>
          </>)}
        </Section>

        <Section id="exemptions" flush icon="tag" title={tr("setup.exemptions")} description={tr("ux.exemptDesc")} count={exemptions.length}
          actions={<Link className="btn secondary sm" href={`/${locale}/schools/${p.siteId}/setup/fees#exempt`}>{tr("feeGrid.exemptTitle")}</Link>}>
          <Flash sp={sp} tr={tr} section="exemptions" />
          <Table flush rows={exemptions} rowKey={(r) => r.id} empty={tr("ux.noneYet")} emptyIcon="tag" columns={[
            { key: "s", header: tr("fees.student"), render: (r) => { const s = students.get(r.studentId); return s ? <strong>{studentName(s)}</strong> : ""; } },
            { key: "f", header: tr("setup.feeName"), render: (r) => items.find((i) => i.id === r.feeItemId)?.name ?? tr("feeGrid.allFees") },
            { key: "k", header: tr("setup.kind"), render: (r) => tr(`setup.kinds.${r.kind}`) },
            { key: "v", header: tr("setup.value"), numeric: true, render: (r) => (r.kind === "full" ? "—" : r.kind === "percent" ? `${r.value} %` : formatCdf(r.value, locale)) },
            { key: "r", header: tr("setup.reason"), render: (r) => r.reason },
            { key: "x", header: "", shrink: true, render: (r) => remove("exemptions", "school.exemption", r.id) },
          ]} />
          {enrolled.length === 0 ? <EmptyRow icon="users" title={tr("ux.needPupils")} /> : add("exemptions", tr("ux.addExemption"), false, A.addExemption, <>
            <Field span={6} label={tr("fees.student")}><select name="studentId" required defaultValue=""><option value="" disabled>—</option>{[...enrolled].sort((a, b) => studentName(a).localeCompare(studentName(b))).map((s) => <option key={s.id} value={s.id}>{studentName(s)} · {s.studentNumber}</option>)}</select></Field>
            <Field span={6} label={tr("setup.feeName")}><select name="feeItemId"><option value="">{tr("feeGrid.allFees")}</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
            <Field span={4} label={tr("setup.kind")}><select name="kind">{(["full", "percent", "fixed"] as const).map((k) => <option key={k} value={k}>{tr(`setup.kinds.${k}`)}</option>)}</select></Field>
            <Field span={4} label={tr("setup.value")} hint={tr("ux.valueHint")}><input name="value" type="number" min={0} step={1} defaultValue={0} className="num-input" /></Field>
            <Field span={4} label={tr("setup.reason")}><input name="reason" required placeholder="Orphelin" /></Field>
          </>)}
        </Section>
      </div>
    </div>
  );
}
