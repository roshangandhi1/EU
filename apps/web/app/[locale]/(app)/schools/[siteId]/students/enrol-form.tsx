"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Chip, ChoiceGroup, Field, Fields, FormFooter, Notice, SubmitButton } from "@/components/ui";
import { bulkEnrol, enrolStudent, type BulkState, type EnrolState } from "./actions";

export interface EnrolLabels {
  [k: string]: string;
}

type Mode = "closed" | "one" | "class";

/**
 * "Enrol a pupil" and "Enrol a whole class": buttons in the list toolbar that open a form in place.
 * After a save the one-pupil form stays open for the next pupil, with the class and the date kept,
 * the cursor back in the surname field and the last pupil saved shown above it.
 */
export function EnrolForms({ locale, siteId, classes, today, l, defaultOpen }: { locale: string; siteId: string; classes: { id: string; label: string }[]; today: string; l: EnrolLabels; defaultOpen?: boolean }) {
  const [mode, setMode] = useState<Mode>(defaultOpen ? "one" : "closed");
  if (mode === "closed") {
    return (
      <span className="enrol-buttons">
        <button type="button" className="btn" onClick={() => setMode("one")}><Icon name="plus" size={17} />{l.add}</button>
        <button type="button" className="btn secondary" onClick={() => setMode("class")}><Icon name="users" size={17} />{l.bulkOpen}</button>
      </span>
    );
  }
  const close = () => setMode("closed");
  return mode === "one"
    ? <EnrolOne locale={locale} siteId={siteId} classes={classes} today={today} l={l} close={close} />
    : <EnrolClass locale={locale} siteId={siteId} classes={classes} today={today} l={l} close={close} />;
}

function Shell({ title, icon, close, cancel, children }: { title: string; icon: string; close: () => void; cancel: string; children: React.ReactNode }) {
  return (
    <section className="fsec enrol" aria-label={title}>
      <header className="fsec-head">
        <span className="fsec-icon" aria-hidden><Icon name={icon} size={19} /></span>
        <div className="fsec-titles"><h2>{title}</h2></div>
        <div className="fsec-actions"><button type="button" className="icon-btn" aria-label={cancel} title={cancel} onClick={close}><Icon name="x" size={18} /></button></div>
      </header>
      <div className="fsec-body">{children}</div>
    </section>
  );
}

function Place({ classes, today, l, v }: { classes: { id: string; label: string }[]; today: string; l: EnrolLabels; v: Record<string, string> }) {
  return (
    <Fields>
      <Field span={6} label={l.class!}>
        <select name="classId" required defaultValue={v.classId ?? ""}>
          <option value="" disabled>—</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Field>
      <Field span={6} label={l.enrolledOn!}><input name="enrolledOn" type="date" defaultValue={v.enrolledOn || today} max={today} required /></Field>
    </Fields>
  );
}

function EnrolOne({ locale, siteId, classes, today, l, close }: { locale: string; siteId: string; classes: { id: string; label: string }[]; today: string; l: EnrolLabels; close: () => void }) {
  const [state, action] = useActionState<EnrolState, FormData>(enrolStudent, {});
  const form = useRef<HTMLFormElement>(null);
  const v = state.values ?? {};
  // After every result, put the cursor back in the first field (the surname) for the next pupil.
  useEffect(() => { form.current?.querySelector<HTMLInputElement>("input[name=lastName]")?.focus(); }, [state.n]);
  return (
    <Shell title={l.add!} icon="user" close={close} cancel={l.cancel!}>
      <form action={action} key={state.n ?? 0} ref={form}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="siteId" value={siteId} />
        {state.saved && (
          <div className="notice-tight">
            <Notice tone="success"><Icon name="check" size={15} /> {l.savedOne!.replace("{name}", state.saved.name).replace("{num}", state.saved.number)}</Notice>
          </div>
        )}
        {state.error && (
          <div className="notice-tight">
            <Notice tone={state.error === "duplicate" ? "warning" : "error"}>
              {state.error === "duplicate" ? l.duplicate!.replace("{matches}", state.matches ?? "") : state.message}
            </Notice>
          </div>
        )}
        <h3 className="fgroup">{l.placeGroup}</h3>
        <Place classes={classes} today={today} l={l} v={v} />
        <h3 className="fgroup">{l.pupilGroup}</h3>
        <Fields>
          <Field span={4} label={l.lastName!} hint={l.nameHint}><input name="lastName" required maxLength={80} autoComplete="off" defaultValue={v.lastName} style={{ textTransform: "uppercase" }} /></Field>
          <Field span={4} label={l.postName!} optional={l.optional}><input name="postName" maxLength={80} autoComplete="off" defaultValue={v.postName} /></Field>
          <Field span={4} label={l.firstName!}><input name="firstName" required maxLength={80} autoComplete="off" defaultValue={v.firstName} /></Field>
          <ChoiceGroup span={4} legend={l.sex!}>
            <Chip type="radio" name="sex" value="F" label={l.female} required defaultChecked={v.sex === "F"} />
            <Chip type="radio" name="sex" value="M" label={l.male} defaultChecked={v.sex === "M"} />
          </ChoiceGroup>
          <Field span={4} label={l.dateOfBirth!} hint={l.birthHint}><input name="dateOfBirth" type="date" max={today} defaultValue={v.dateOfBirth} /></Field>
          <Field span={4} label={l.birthYearEstimate!} optional={l.optional}><input name="birthYearEstimate" type="number" min={2000} max={Number(today.slice(0, 4))} inputMode="numeric" placeholder="2019" defaultValue={v.birthYearEstimate} /></Field>
        </Fields>
        <h3 className="fgroup">{l.familyGroup}</h3>
        <Fields>
          <Field span={4} label={l.guardianName!} optional={l.optional}><input name="guardianName" maxLength={80} autoComplete="off" defaultValue={v.guardianName} /></Field>
          <Field span={4} label={l.guardianPhone!} optional={l.optional}><input name="guardianPhone" type="tel" maxLength={20} inputMode="tel" autoComplete="off" placeholder="+243 …" defaultValue={v.guardianPhone} /></Field>
          <Field span={4} label={l.village!} optional={l.optional}><input name="village" maxLength={80} autoComplete="off" defaultValue={v.village} /></Field>
        </Fields>
        {state.error === "duplicate" && (
          <label className="check-row confirm-dup"><input type="checkbox" name="confirmDifferent" /> <span>{l.confirmDifferent}</span></label>
        )}
        <FormFooter note={l.stickyNote}>
          <button type="button" className="btn secondary" onClick={close}>{state.saved ? l.done : l.cancel}</button>
          <SubmitButton icon="check" pending={l.saving}>{l.saveNext}</SubmitButton>
        </FormFooter>
      </form>
    </Shell>
  );
}

function EnrolClass({ locale, siteId, classes, today, l, close }: { locale: string; siteId: string; classes: { id: string; label: string }[]; today: string; l: EnrolLabels; close: () => void }) {
  const [state, action] = useActionState<BulkState, FormData>(bulkEnrol, {});
  const v = state.values ?? {};
  const saved = state.saved !== undefined;
  return (
    <Shell title={l.bulkTitle!} icon="users" close={close} cancel={l.cancel!}>
      <form action={action} key={state.n ?? 0}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="siteId" value={siteId} />
        {saved && <div className="notice-tight"><Notice tone="success"><Icon name="check" size={15} /> {l.bulkSaved!.replace("{n}", String(state.saved))}</Notice></div>}
        {state.message && <div className="notice-tight"><Notice tone="error">{state.message}</Notice></div>}
        {state.problems && state.problems.length > 0 && (
          <div className="notice-tight">
            <Notice tone="error">
              <strong>{l.bulkProblems}</strong>
              <ul className="bulk-issues">{state.problems.map((p) => <li key={p.line}>{l.bulkLine!.replace("{n}", String(p.line))}{l.colon}{p.message}</li>)}</ul>
            </Notice>
          </div>
        )}
        {!state.problems?.length && state.dupes && state.dupes.length > 0 && (
          <div className="notice-tight">
            <Notice tone="warning">
              <strong>{l.bulkDupes}</strong>
              <ul className="bulk-issues">{state.dupes.map((p) => <li key={p.line}>{l.bulkLine!.replace("{n}", String(p.line))}{l.colon}{p.matches}</li>)}</ul>
            </Notice>
          </div>
        )}
        <p className="muted small bulk-intro">{l.bulkIntro}</p>
        <Place classes={classes} today={today} l={l} v={v} />
        <Fields>
          <Field span={12} label={l.bulkLines!} hint={l.bulkHint}>
            <textarea name="lines" rows={10} required spellCheck={false} className="bulk-lines" defaultValue={saved ? "" : v.lines} placeholder={l.bulkExample} />
          </Field>
        </Fields>
        {!state.problems?.length && state.dupes && state.dupes.length > 0 && (
          <label className="check-row confirm-dup"><input type="checkbox" name="confirmDifferent" /> <span>{l.bulkConfirm}</span></label>
        )}
        <FormFooter>
          <button type="button" className="btn secondary" onClick={close}>{saved ? l.done : l.cancel}</button>
          <SubmitButton icon="check" pending={l.saving}>{l.bulkSave}</SubmitButton>
        </FormFooter>
      </form>
    </Shell>
  );
}
