import { activeOn, formatCdf, live, placesAsAt } from "@eu/schools";
import { Button, Check, Field, Form, Notice, Table } from "@/components/ui";
import { can, schoolDevices, schoolFor, schoolStaff, signedIn, today, tr as trFor } from "@/lib/schools";
import { Flash, type SP } from "../../flash";
import { byLevel, classLabel, studentName } from "../labels";
import * as A from "./actions";

export default async function Setup({ params, searchParams }: { params: Promise<{ locale: string; siteId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  if (!can(me, "school.configure", p.siteId)) return <Notice tone="warning">{tr("setup.configureOnly")}</Notice>;
  const d = await schoolFor(me, p.siteId);
  const staff = await schoolStaff(p.siteId);
  const phones = await schoolDevices(p.siteId);
  const tags = live(d.deviceTags);
  const freeLetters = "ABCDEFGHIJKLMNOPQRSTUVXYZ".split("").filter((l) => !tags.some((x) => x.tag === l));
  const freePhones = phones.filter((ph) => !tags.some((x) => x.phoneId === ph.id));
  const staffName = (id: string) => staff.find((u) => u.id === id)?.name ?? id;
  const date = today();
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="siteId" value={p.siteId} />
    </>
  );
  const remove = (entity: string, id: string) => (
    <form action={A.voidConfig}>
      {hidden}
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <Button small variant="secondary" type="submit">✕</Button>
    </form>
  );
  const years = live(d.years).sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1));
  const yearOpts = years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>);
  const terms = live(d.terms).sort((a, b) => a.number - b.number);
  const rooms = live(d.classrooms);
  const classes = live(d.classes).sort(byLevel);
  const items = live(d.feeItems);
  const places = d.school ? placesAsAt(d.school, d.classrooms, date) : null;
  const students = new Map(d.students.map((s) => [s.id, s]));
  const enrolled = activeOn(d.enrolments, date).map((e) => students.get(e.studentId)).filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <>
      <Flash sp={sp} tr={tr} />

      <h2>{tr("setup.school")}</h2>
      <Form action={A.saveSchool}>
        {hidden}
        <Field label={tr("setup.shiftsRunning")}>
          <Check name="shiftsRunning" value="morning" label={tr("shift.morning")} defaultChecked={d.school?.shiftsRunning.includes("morning")} />
          <Check name="shiftsRunning" value="afternoon" label={tr("shift.afternoon")} defaultChecked={d.school?.shiftsRunning.includes("afternoon")} />
        </Field>
        <Button type="submit">{tr("common.save")}</Button>
      </Form>

      <h2>{tr("setup.year")}</h2>
      <Table rows={years} rowKey={(r) => r.id} empty={tr("common.none")} columns={[
        { key: "l", header: tr("setup.yearLabel"), render: (r) => r.label },
        { key: "s", header: tr("setup.startsOn"), render: (r) => r.startsOn },
        { key: "e", header: tr("setup.endsOn"), render: (r) => r.endsOn },
        { key: "x", header: "", render: (r) => remove("school.academic_year", r.id) },
      ]} />
      <Form action={A.addYear}>
        {hidden}
        <Field label={tr("setup.yearLabel")}><input name="label" required placeholder="2026-2027" /></Field>
        <Field label={tr("setup.startsOn")}><input name="startsOn" type="date" required /></Field>
        <Field label={tr("setup.endsOn")}><input name="endsOn" type="date" required /></Field>
        <Button type="submit">{tr("common.add")}</Button>
      </Form>

      <h2>{tr("setup.term")}</h2>
      <Table rows={terms} rowKey={(r) => r.id} empty={tr("common.none")} columns={[
        { key: "n", header: tr("setup.termNumber"), render: (r) => r.number },
        { key: "y", header: tr("setup.yearLabel"), render: (r) => years.find((y) => y.id === r.academicYearId)?.label ?? "" },
        { key: "s", header: tr("setup.startsOn"), render: (r) => r.startsOn },
        { key: "e", header: tr("setup.endsOn"), render: (r) => r.endsOn },
        { key: "x", header: "", render: (r) => remove("school.term", r.id) },
      ]} />
      {years.length > 0 && (
        <Form action={A.addTerm}>
          {hidden}
          <Field label={tr("setup.yearLabel")}><select name="academicYearId" required>{yearOpts}</select></Field>
          <Field label={tr("setup.termNumber")}><select name="number">{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
          <Field label={tr("setup.startsOn")}><input name="startsOn" type="date" required /></Field>
          <Field label={tr("setup.endsOn")}><input name="endsOn" type="date" required /></Field>
          <Button type="submit">{tr("common.add")}</Button>
        </Form>
      )}

      <h2>{tr("capacity.title")}</h2>
      {places && <Notice>{tr("capacity.places")}: <strong>{places.totalPlaces}</strong> ({tr("overview.placesHint", { baseline: places.baselinePlaces, new: places.newPlaces, shifts: places.shiftsCounted.length })})</Notice>}
      <Table rows={rooms} rowKey={(r) => r.id} empty={tr("common.none")} columns={[
        { key: "n", header: tr("capacity.room"), render: (r) => r.name },
        { key: "s", header: tr("capacity.seatsPerShift"), numeric: true, render: (r) => r.seatsPerShift },
        { key: "b", header: tr("capacity.basis"), render: (r) => tr(`capacity.${r.basis}`) },
        { key: "c", header: tr("capacity.commissionedOn"), render: (r) => r.commissionedOn },
        { key: "d", header: tr("capacity.decommissionedOn"), render: (r) => r.decommissionedOn ?? "" },
        { key: "e", header: tr("capacity.evidenceUrl"), render: (r) => (r.evidenceUrl ? <a href={r.evidenceUrl}>↗</a> : "") },
        { key: "x", header: "", render: (r) => remove("school.classroom", r.id) },
      ]} />
      <Form action={A.addClassroom}>
        {hidden}
        <Field label={tr("capacity.room")}><input name="name" required /></Field>
        <Field label={tr("capacity.seatsPerShift")}><input name="seatsPerShift" type="number" min={1} required /></Field>
        <Field label={tr("capacity.basis")}><select name="basis"><option value="new">{tr("capacity.new")}</option><option value="baseline">{tr("capacity.baseline")}</option></select></Field>
        <Field label={tr("capacity.commissionedOn")}><input name="commissionedOn" type="date" required /></Field>
        <Field label={tr("capacity.decommissionedOn")} hint={tr("common.optional")}><input name="decommissionedOn" type="date" /></Field>
        <Field label={tr("capacity.evidenceUrl")} hint={tr("common.optional")}><input name="evidenceUrl" type="url" /></Field>
        <Button type="submit">{tr("common.add")}</Button>
      </Form>

      <h2>{tr("setup.classes")}</h2>
      <Table rows={classes} rowKey={(r) => r.id} empty={tr("common.none")} columns={[
        { key: "c", header: tr("common.class"), render: (r) => classLabel(r, tr) },
        { key: "r", header: tr("setup.classroom"), render: (r) => rooms.find((x) => x.id === r.classroomId)?.name ?? "" },
        { key: "x", header: "", render: (r) => remove("school.class", r.id) },
      ]} />
      {years.length > 0 && (
        <Form action={A.addClass}>
          {hidden}
          <Field label={tr("setup.yearLabel")}><select name="academicYearId" required>{yearOpts}</select></Field>
          <Field label={tr("common.level")}><select name="level">{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{tr("levelName", { n })}</option>)}</select></Field>
          <Field label={tr("setup.section")}><input name="section" defaultValue="A" maxLength={4} /></Field>
          <Field label={tr("common.shift")}><select name="shift"><option value="morning">{tr("shift.morning")}</option><option value="afternoon">{tr("shift.afternoon")}</option></select></Field>
          <Field label={tr("setup.classroom")} hint={tr("common.optional")}><select name="classroomId"><option value="" />{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
          <Button type="submit">{tr("common.add")}</Button>
        </Form>
      )}

      <h2>{tr("setup.feeItems")}</h2>
      <Table rows={items} rowKey={(r) => r.id} empty={tr("common.none")} columns={[
        { key: "n", header: tr("setup.feeName"), render: (r) => r.name },
        { key: "a", header: tr("fees.amount"), numeric: true, render: (r) => formatCdf(r.amount, locale) },
        { key: "l", header: tr("setup.levels"), render: (r) => r.levels.join(", ") },
        { key: "d", header: tr("setup.dueOn"), render: (r) => r.dueOn },
        { key: "x", header: "", render: (r) => remove("school.fee_item", r.id) },
      ]} />
      {years.length > 0 && (
        <Form action={A.addFeeItem}>
          {hidden}
          <Field label={tr("setup.yearLabel")}><select name="academicYearId" required>{yearOpts}</select></Field>
          <Field label={tr("setup.termNumber")} hint={tr("common.optional")}><select name="termId"><option value="" />{terms.map((t) => <option key={t.id} value={t.id}>{t.number}</option>)}</select></Field>
          <Field label={tr("setup.feeName")}><input name="name" required /></Field>
          <Field label={tr("fees.amount")}><input name="amount" inputMode="numeric" required /></Field>
          <Field label={tr("setup.levels")} hint={tr("setup.levelsHint")}><input name="levels" defaultValue="1-6" required /></Field>
          <Field label={tr("setup.dueOn")}><input name="dueOn" type="date" required /></Field>
          <Button type="submit">{tr("common.add")}</Button>
        </Form>
      )}

      <h2>{tr("setup.receiptBooks")}</h2>
      <Table rows={live(d.receiptBooks)} rowKey={(r) => r.id} empty={tr("common.none")} columns={[
        { key: "f", header: tr("setup.firstNumber"), numeric: true, render: (r) => r.firstNumber },
        { key: "l", header: tr("setup.lastNumber"), numeric: true, render: (r) => r.lastNumber },
        { key: "a", header: tr("setup.assignedTo"), render: (r) => staffName(r.assignedTo) },
        { key: "x", header: "", render: (r) => remove("school.receipt_book", r.id) },
      ]} />
      <Form action={A.addReceiptBook}>
        {hidden}
        <Field label={tr("setup.firstNumber")}><input name="firstNumber" type="number" min={1} required /></Field>
        <Field label={tr("setup.lastNumber")}><input name="lastNumber" type="number" min={1} required /></Field>
        <Field label={tr("setup.assignedTo")}><select name="assignedTo" required>{staff.map((u) => <option key={u.id + u.role} value={u.id}>{u.name} ({u.role})</option>)}</select></Field>
        <Button type="submit">{tr("common.add")}</Button>
      </Form>

      <h2>{tr("setup.devices")}</h2>
      <Notice>{tr("setup.devicesHint")}</Notice>
      <Table rows={tags} rowKey={(r) => r.id} empty={tr("common.none")} columns={[
        { key: "l", header: tr("setup.letter"), render: (r) => r.tag },
        { key: "d", header: tr("setup.device"), render: (r) => { const ph = phones.find((x) => x.id === r.phoneId); return ph ? `${ph.userName} · ${ph.name}` : r.phoneId; } },
        { key: "x", header: "", render: (r) => remove("school.device_tag", r.id) },
      ]} />
      {freePhones.length === 0 ? <p>{tr("setup.noDevices")}</p> : (
        <Form action={A.addDeviceTag}>
          {hidden}
          <Field label={tr("setup.device")}><select name="deviceId" required>{freePhones.map((ph) => <option key={ph.id} value={ph.id}>{ph.userName} · {ph.name}</option>)}</select></Field>
          <Field label={tr("setup.letter")}><select name="tag" required>{freeLetters.map((l) => <option key={l} value={l}>{l}</option>)}</select></Field>
          <Button type="submit">{tr("common.add")}</Button>
        </Form>
      )}

      <h2>{tr("setup.exemptions")}</h2>
      <Table rows={live(d.exemptions)} rowKey={(r) => r.id} empty={tr("common.none")} columns={[
        { key: "s", header: tr("fees.student"), render: (r) => { const s = students.get(r.studentId); return s ? studentName(s) : ""; } },
        { key: "f", header: tr("setup.feeName"), render: (r) => items.find((i) => i.id === r.feeItemId)?.name ?? "*" },
        { key: "k", header: tr("setup.kind"), render: (r) => tr(`setup.kinds.${r.kind}`) },
        { key: "v", header: tr("setup.value"), numeric: true, render: (r) => (r.kind === "full" ? "" : r.value) },
        { key: "r", header: tr("setup.reason"), render: (r) => r.reason },
        { key: "x", header: "", render: (r) => remove("school.exemption", r.id) },
      ]} />
      {enrolled.length > 0 && (
        <Form action={A.addExemption}>
          {hidden}
          <Field label={tr("fees.student")}><select name="studentId" required>{enrolled.map((s) => <option key={s.id} value={s.id}>{studentName(s)}</option>)}</select></Field>
          <Field label={tr("setup.feeName")} hint={tr("common.optional")}><select name="feeItemId"><option value="">*</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
          <Field label={tr("setup.kind")}><select name="kind">{(["full", "percent", "fixed"] as const).map((k) => <option key={k} value={k}>{tr(`setup.kinds.${k}`)}</option>)}</select></Field>
          <Field label={tr("setup.value")}><input name="value" type="number" min={0} defaultValue={0} /></Field>
          <Field label={tr("setup.reason")}><input name="reason" required /></Field>
          <Button type="submit">{tr("common.add")}</Button>
        </Form>
      )}
    </>
  );
}
