import { activeOn, formatCdf, LEVELS, live, placesAsAt } from "@eu/schools";
import { t } from "@eu/core/i18n";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { ChoiceGroup, Chip, ConfirmButton, EmptyRow, Field, Fields, Notice, Section, SubmitButton, Table } from "@/components/ui";
import { can, schoolDevices, schoolFor, schoolStaff, signedIn, today, tr as trFor, userNames } from "@/lib/schools";
import { sites } from "@eu/db";
import { eq } from "drizzle-orm";
import { db } from "@/lib/http";

/** The platform site row: SchoolData has the name but not the map position. */
async function siteRow(id: string): Promise<{ lat: number | null; lng: number | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [r] = await (db() as any).select({ lat: sites.lat, lng: sites.lng }).from(sites).where(eq(sites.id, id));
  return r ?? { lat: null, lng: null };
}
import { Flash, param, type SP } from "../../flash";
import { byLevel, classLabel, levelLabel, studentName } from "../labels";
import { fmtDate } from "../format";
import * as A from "./actions";
import { SetupForm, YearAndTerm } from "./setup-form";

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
  const site = await siteRow(p.siteId);
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

  const hidden = (section: string) => (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="siteId" value={p.siteId} />
      <input type="hidden" name="returnTo" value={section} />
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
  // Editing: ?edit=<id> opens that row's values in a form in place of "Add …" (same fields and checks).
  const editing = param(sp, "edit");
  const rowActions = (section: string, entity: string, id: string) => (
    <span className="row-actions">
      <Link className="btn ghost sm" href={`/${locale}/schools/${p.siteId}/setup?edit=${id}#${section}`} title={f("edit")} aria-label={f("edit")}><Icon name="pencil" size={15} /></Link>
      {remove(section, entity, id)}
    </span>
  );
  const editRow = (r: { id: string }) => (r.id === editing ? "row-editing" : undefined);
  const editForm = (section: string, id: string, action: (prev: A.SetupState, fd: FormData) => Promise<A.SetupState>, fields: React.ReactNode) => (
    <div className="edit-panel">
      <div className="edit-panel-head">
        <span><Icon name="pencil" size={15} /> {tr("ux.editing")}</span>
        <Link className="btn ghost sm" href={`/${locale}/schools/${p.siteId}/setup#${section}`}>{f("cancel")}</Link>
      </div>
      <SetupForm action={action} hidden={{ locale, siteId: p.siteId, returnTo: section, editId: id }} submit={tr("common.save")} busy={saving} icon="check">
        <Fields>{fields}</Fields>
      </SetupForm>
    </div>
  );
  /** The row being edited in this list, if any. */
  const under = <R extends { id: string }>(rows: readonly R[]) => rows.find((r) => r.id === editing);

  const add = (section: string, label: string, empty: boolean, action: (prev: A.SetupState, fd: FormData) => Promise<A.SetupState>, fields: React.ReactNode) => (
    <SetupForm action={action} hidden={{ locale, siteId: p.siteId, returnTo: section }} submit={label} busy={saving} adder={{ label, cancel: f("cancel"), defaultOpen: empty }}>
      <Fields>{fields}</Fields>
    </SetupForm>
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
  const enrolled = activeOn(d.enrolments, date, d.years).map((e) => students.get(e.studentId)).filter((s): s is NonNullable<typeof s> => !!s);
  const yearLabel = (id: string) => years.find((y) => y.id === id)?.label ?? "";
  const termLabel = (id: string) => { const tm = terms.find((x) => x.id === id); return tm ? tr("feeGrid.term", { n: tm.number }) : ""; };
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

        <Section id="school" icon="school" title={tr("setup.school")} description={tr("info.desc")}>
          <SetupForm action={A.saveSchool} hidden={{ locale, siteId: p.siteId, returnTo: "school" }} submit={tr("common.save")} busy={saving} icon="check">
            <Fields>
              <Field span={6} label={tr("common.name")}><input name="name" required minLength={3} maxLength={120} defaultValue={d.site.name} /></Field>
              <Field span={6} label={tr("list.code")} hint={tr("info.codeHint")} error={tr("ux.codeError")}>
                <input name="code" required pattern="[A-Za-z]{2,12}" defaultValue={d.school?.code} style={{ textTransform: "uppercase" }} />
              </Field>
              <Field span={3} label={tr("info.lat")} optional={optional} hint={tr("info.latHint")}><input name="lat" inputMode="decimal" autoComplete="off" placeholder="-8,712" defaultValue={site.lat != null ? String(site.lat) : ""} /></Field>
              <Field span={3} label={tr("info.lng")} optional={optional} hint={tr("info.lngHint")}><input name="lng" inputMode="decimal" autoComplete="off" placeholder="24,790" defaultValue={site.lng != null ? String(site.lng) : ""} /></Field>
              <ChoiceGroup span={6} legend={tr("setup.shiftsRunning")} hint={tr("ux.schoolDesc")}>
                <Chip name="shiftsRunning" value="morning" label={tr("shift.morning")} defaultChecked={d.school?.shiftsRunning.includes("morning")} />
                <Chip name="shiftsRunning" value="afternoon" label={tr("shift.afternoon")} defaultChecked={d.school?.shiftsRunning.includes("afternoon")} />
              </ChoiceGroup>
            </Fields>
          </SetupForm>
        </Section>

        <Section id="years" flush icon="calendar" title={tr("setup.year")} description={tr("ux.yearsDesc")} count={years.length}>
          <Flash sp={sp} tr={tr} section="years" />
          <Table flush rows={years} rowKey={(r) => r.id} empty={tr("ux.noneYet")} emptyIcon="calendar" columns={[
            { key: "l", header: tr("setup.yearLabel"), render: (r) => <strong>{r.label}</strong> },
            { key: "s", header: tr("setup.startsOn"), render: (r) => dt(r.startsOn) },
            { key: "e", header: tr("setup.endsOn"), render: (r) => dt(r.endsOn) },
            { key: "x", header: "", shrink: true, render: (r) => rowActions("years", "school.academic_year", r.id) },
          ]} rowClass={editRow} />
          {(() => {
            const fields = (r?: (typeof years)[number]) => <>
              <Field span={4} label={tr("setup.yearLabel")} hint={tr("ux.yearExample")}><input name="label" required placeholder="2026-2027" defaultValue={r?.label} /></Field>
              <Field span={4} label={tr("setup.startsOn")}><input name="startsOn" type="date" required defaultValue={r?.startsOn} /></Field>
              <Field span={4} label={tr("setup.endsOn")}><input name="endsOn" type="date" required defaultValue={r?.endsOn} /></Field>
            </>;
            const r = under(years);
            return r ? editForm("years", r.id, A.editYear, fields(r)) : add("years", tr("ux.addYear"), years.length === 0, A.addYear, fields());
          })()}
        </Section>

        <Section id="terms" flush icon="calendar" title={tr("setup.term")} description={tr("ux.termsDesc")} count={terms.length}>
          <Flash sp={sp} tr={tr} section="terms" />
          <Table flush rows={terms} rowKey={(r) => r.id} empty={tr("ux.noneYet")} emptyIcon="calendar" columns={[
            { key: "n", header: tr("setup.termNumber"), render: (r) => <strong>{tr("feeGrid.term", { n: r.number })}</strong> },
            { key: "y", header: tr("feeGrid.year"), render: (r) => years.find((y) => y.id === r.academicYearId)?.label ?? "" },
            { key: "s", header: tr("setup.startsOn"), render: (r) => dt(r.startsOn) },
            { key: "e", header: tr("setup.endsOn"), render: (r) => dt(r.endsOn) },
            { key: "x", header: "", shrink: true, render: (r) => rowActions("terms", "school.term", r.id) },
          ]} rowClass={editRow} />
          {years.length === 0 ? needYear : (() => {
            const fields = (r?: (typeof terms)[number]) => <>
              <Field span={3} label={tr("feeGrid.year")}>{r ? <input readOnly value={yearLabel(r.academicYearId)} /> : <select name="academicYearId" required>{yearOpts}</select>}</Field>
              <Field span={3} label={tr("setup.termNumber")}><select name="number" defaultValue={r?.number}>{[1, 2, 3].map((n) => <option key={n} value={n}>{tr("feeGrid.term", { n })}</option>)}</select></Field>
              <Field span={3} label={tr("setup.startsOn")}><input name="startsOn" type="date" required defaultValue={r?.startsOn} /></Field>
              <Field span={3} label={tr("setup.endsOn")}><input name="endsOn" type="date" required defaultValue={r?.endsOn} /></Field>
            </>;
            const r = under(terms);
            if (r) return editForm("terms", r.id, A.editTerm, fields(r));
            // A year with no trimesters yet: offer the usual three in one click (dates can be edited after).
            const bare = years.filter((y) => !terms.some((t) => t.academicYearId === y.id));
            return <>
              {bare.map((y) => (
                <form key={y.id} action={A.addThreeTerms} className="quick-terms">
                  {hidden("terms")}
                  <input type="hidden" name="academicYearId" value={y.id} />
                  <span className="muted small">{tr("ux.noTermsYet", { year: y.label })}</span>
                  <SubmitButton variant="secondary" small icon="plus" pending={saving}>{tr("ux.addThreeTerms")}</SubmitButton>
                </form>
              ))}
              {add("terms", tr("ux.addTerm"), false, A.addTerm, fields())}
            </>;
          })()}
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
            { key: "x", header: "", shrink: true, render: (r) => rowActions("rooms", "school.classroom", r.id) },
          ]} rowClass={editRow} />
          {(() => {
            const fields = (r?: (typeof rooms)[number]) => <>
              <Field span={4} label={tr("capacity.room")}><input name="name" required placeholder={tr("ph.room")} defaultValue={r?.name} /></Field>
              <Field span={4} label={tr("capacity.seatsPerShift")} error={tr("ux.seatsError")}><input name="seatsPerShift" type="number" min={1} step={1} required inputMode="numeric" defaultValue={r?.seatsPerShift} /></Field>
              <Field span={4} label={tr("capacity.basis")}><select name="basis" defaultValue={r?.basis}><option value="new">{tr("capacity.new")}</option><option value="baseline">{tr("capacity.baseline")}</option></select></Field>
              <Field span={4} label={tr("capacity.commissionedOn")}><input name="commissionedOn" type="date" required defaultValue={r?.commissionedOn} /></Field>
              <Field span={4} label={tr("capacity.decommissionedOn")} optional={optional}><input name="decommissionedOn" type="date" defaultValue={r?.decommissionedOn ?? ""} /></Field>
              <Field span={4} label={tr("capacity.evidenceUrl")} optional={optional}><input name="evidenceUrl" type="url" placeholder="https://" defaultValue={r?.evidenceUrl ?? ""} /></Field>
            </>;
            const r = under(rooms);
            return r ? editForm("rooms", r.id, A.editClassroom, fields(r)) : add("rooms", tr("ux.addRoom"), rooms.length === 0, A.addClassroom, fields());
          })()}
        </Section>

        <Section id="classes" flush icon="users" title={tr("setup.classes")} description={tr("ux.classesDesc")} count={classes.length}>
          <Flash sp={sp} tr={tr} section="classes" />
          <Table flush rows={classes} rowKey={(r) => r.id} empty={tr("ux.noneYet")} emptyIcon="users" columns={[
            { key: "c", header: tr("common.class"), render: (r) => <strong>{classLabel(r, tr)}</strong> },
            { key: "y", header: tr("feeGrid.year"), render: (r) => years.find((y) => y.id === r.academicYearId)?.label ?? "" },
            { key: "r", header: tr("setup.classroom"), render: (r) => rooms.find((x) => x.id === r.classroomId)?.name ?? <span className="muted">—</span> },
            { key: "x", header: "", shrink: true, render: (r) => rowActions("classes", "school.class", r.id) },
          ]} rowClass={editRow} />
          {years.length === 0 ? needYear : (() => {
            const fields = (r?: (typeof classes)[number]) => <>
              <Field span={4} label={tr("feeGrid.year")}>{r ? <input readOnly value={yearLabel(r.academicYearId)} /> : <select name="academicYearId" required>{yearOpts}</select>}</Field>
              <Field span={4} label={tr("common.level")}><select name="level" defaultValue={r?.level}>{LEVELS.map((n) => <option key={n} value={n}>{levelLabel(n, tr)}</option>)}</select></Field>
              <Field span={4} label={tr("setup.section")} hint={tr("ux.sectionHint")} error={tr("err.setup.section")}><input name="section" defaultValue={r?.section ?? "A"} maxLength={2} pattern="[A-Za-z]{1,2}" required style={{ textTransform: "uppercase" }} /></Field>
              <Field span={4} label={tr("common.shift")}><select name="shift" defaultValue={r?.shift}><option value="morning">{tr("shift.morning")}</option><option value="afternoon">{tr("shift.afternoon")}</option></select></Field>
              <Field span={4} label={tr("setup.classroom")} optional={optional}><select name="classroomId" defaultValue={r?.classroomId ?? ""}><option value="">—</option>{rooms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            </>;
            const r = under(classes);
            return r ? editForm("classes", r.id, A.editClass, fields(r)) : add("classes", tr("ux.addClass"), classes.length === 0, A.addClass, fields());
          })()}
        </Section>

        <Section id="grading" icon="layers" title={tr("marks.setupLink")} description={tr("marks.schemeIntro")}
          actions={<Link className="btn secondary sm" href={`/${locale}/schools/${p.siteId}/setup/grading`}><Icon name="layers" size={15} />{tr("marks.setupLink")}</Link>}>
          {null}
        </Section>

        <Section id="fees" flush icon="coins" title={tr("setup.feeItems")} description={tr("ux.feesDesc")} count={items.length}
          actions={<Link className="btn secondary sm" href={`/${locale}/schools/${p.siteId}/setup/fees`}><Icon name="coins" size={15} />{tr("feeGrid.open")}</Link>}>
          <Flash sp={sp} tr={tr} section="fees" />
          <Table flush rows={items} rowKey={(r) => r.id} empty={tr("ux.noneYet")} emptyIcon="coins" columns={[
            { key: "n", header: tr("setup.feeName"), render: (r) => <strong>{r.name}</strong> },
            { key: "t", header: tr("setup.termNumber"), render: (r) => { const tm = terms.find((x) => x.id === r.termId); return tm ? tr("feeGrid.term", { n: tm.number }) : tr("ux.allYear"); } },
            { key: "l", header: tr("setup.levels"), render: (r) => r.levels.join(", ") },
            { key: "y", header: tr("feeGrid.year"), render: (r) => years.find((y) => y.id === r.academicYearId)?.label ?? "" },
            { key: "a", header: tr("fees.amount"), numeric: true, render: (r) => formatCdf(r.amount, locale) },
            { key: "d", header: tr("setup.dueOn"), render: (r) => dt(r.dueOn) },
            { key: "x", header: "", shrink: true, render: (r) => rowActions("fees", "school.fee_item", r.id) },
          ]} rowClass={editRow} />
          {years.length === 0 ? needYear : (() => {
            const termChoices = years.map((y) => ({ yearId: y.id, terms: terms.filter((tm) => tm.academicYearId === y.id).map((tm) => ({ id: tm.id, label: tr("feeGrid.term", { n: tm.number }) })) }));
            const periodText = { whole: tr("ux.allYear"), none: tr("ux.noTermsForYear"), addTerms: tr("ux.addTermsLink"), termsHref: "#terms" };
            const fields = (r?: (typeof items)[number]) => <>
              <Field span={6} label={tr("setup.feeName")}><input name="name" required placeholder={tr("ph.fee")} defaultValue={r?.name} /></Field>
              <YearAndTerm span={3} yearLabel={tr("feeGrid.year")} termLabel={tr("setup.termNumber")} optional={optional} years={years.map((y) => ({ id: y.id, label: y.label }))}
                choices={termChoices} text={periodText} fixedYear={r?.academicYearId} defaultTerm={r?.termId ?? ""} />
              <Field span={4} label={tr("fees.amount")} hint={tr("ux.amountHint")} error={tr("ux.amountError")}><input name="amount" inputMode="numeric" pattern="[0-9 ]+" required className="num-input" defaultValue={r?.amount} /></Field>
              <Field span={4} label={tr("setup.levels")} hint={tr("setup.levelsHint")}><input name="levels" defaultValue={r ? r.levels.join(",") : "1-6"} required /></Field>
              <Field span={4} label={tr("setup.dueOn")}><input name="dueOn" type="date" required defaultValue={r?.dueOn} /></Field>
            </>;
            const r = under(items);
            return r ? editForm("fees", r.id, A.editFeeItem, fields(r)) : add("fees", tr("ux.addFee"), false, A.addFeeItem, fields());
          })()}
        </Section>

        <Section id="books" flush icon="receipt" title={tr("setup.receiptBooks")} description={tr("ux.booksDesc")} count={books.length}>
          <Flash sp={sp} tr={tr} section="books" />
          <Table flush rows={books} rowKey={(r) => r.id} empty={tr("ux.noneYet")} emptyIcon="receipt" columns={[
            { key: "f", header: tr("setup.firstNumber"), numeric: true, render: (r) => r.firstNumber },
            { key: "l", header: tr("setup.lastNumber"), numeric: true, render: (r) => r.lastNumber },
            { key: "a", header: tr("setup.assignedTo"), render: (r) => staffName(r.assignedTo) },
            { key: "x", header: "", shrink: true, render: (r) => rowActions("books", "school.receipt_book", r.id) },
          ]} rowClass={editRow} />
          {staff.length === 0 ? <EmptyRow icon="user" title={tr("ux.noStaff")} /> : (() => {
            const fields = (r?: (typeof books)[number]) => <>
              <Field span={3} label={tr("setup.firstNumber")} error={tr("ux.numberError")}><input name="firstNumber" type="number" min={1} step={1} required className="num-input" defaultValue={r?.firstNumber} /></Field>
              <Field span={3} label={tr("setup.lastNumber")} error={tr("ux.numberError")}><input name="lastNumber" type="number" min={1} step={1} required className="num-input" defaultValue={r?.lastNumber} /></Field>
              <Field span={6} label={tr("setup.assignedTo")}><select name="assignedTo" required defaultValue={r?.assignedTo ?? ""}><option value="" disabled>—</option>{staff.map((u) => <option key={u.id + u.role} value={u.id}>{u.name} · {t(locale, `ui.roles.${u.role}`)}</option>)}{r && !staff.some((u) => u.id === r.assignedTo) && <option value={r.assignedTo}>{staffName(r.assignedTo)}</option>}</select></Field>
            </>;
            const r = under(books);
            return r ? editForm("books", r.id, A.editReceiptBook, fields(r)) : add("books", tr("ux.addBook"), books.length === 0, A.addReceiptBook, fields());
          })()}
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
            { key: "x", header: "", shrink: true, render: (r) => rowActions("exemptions", "school.exemption", r.id) },
          ]} rowClass={editRow} />
          {(() => {
            const r = under(exemptions);
            const fields = (x?: (typeof exemptions)[number]) => <>
              <Field span={6} label={tr("fees.student")}>{x ? <input readOnly value={(() => { const s = students.get(x.studentId); return s ? `${studentName(s)} · ${s.studentNumber}` : ""; })()} /> : <select name="studentId" required defaultValue=""><option value="" disabled>—</option>{[...enrolled].sort((a, b) => studentName(a).localeCompare(studentName(b))).map((s) => <option key={s.id} value={s.id}>{studentName(s)} · {s.studentNumber}</option>)}</select>}</Field>
              <Field span={6} label={tr("setup.feeName")}><select name="feeItemId" defaultValue={x?.feeItemId ?? ""}><option value="">{tr("feeGrid.allFees")}</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}{i.termId ? ` · ${termLabel(i.termId)}` : ""} · {yearLabel(i.academicYearId)}</option>)}</select></Field>
              <Field span={4} label={tr("setup.kind")}><select name="kind" defaultValue={x?.kind}>{(["full", "percent", "fixed"] as const).map((k) => <option key={k} value={k}>{tr(`setup.kinds.${k}`)}</option>)}</select></Field>
              <Field span={4} label={tr("setup.value")} hint={tr("ux.valueHint")}><input name="value" type="number" min={0} step={1} defaultValue={x?.value ?? 0} className="num-input" /></Field>
              <Field span={4} label={tr("setup.reason")}><input name="reason" required placeholder={tr("ph.reason")} defaultValue={x?.reason} /></Field>
            </>;
            if (r) return editForm("exemptions", r.id, A.editExemption, fields(r));
            return enrolled.length === 0 ? <EmptyRow icon="users" title={tr("ux.needPupils")} /> : add("exemptions", tr("ux.addExemption"), false, A.addExemption, fields());
          })()}
        </Section>
      </div>
    </div>
  );
}
