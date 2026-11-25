"use client";
import { useActionState, useState } from "react";
import { Icon } from "@/components/icons";
import { Chip, ChoiceGroup, Field, Fields, FormFooter, Notice, SubmitButton } from "@/components/ui";
import { enrolStudent, type EnrolState } from "./actions";

export interface EnrolLabels {
  [k: string]: string;
}

/**
 * "Enrol a pupil": a button in the list toolbar that opens a sectioned form in place.
 * A refused form comes back with what was typed, and the duplicate check asks for a tick.
 */
export function EnrolForm({ locale, siteId, classes, today, l, defaultOpen }: { locale: string; siteId: string; classes: { id: string; label: string }[]; today: string; l: EnrolLabels; defaultOpen?: boolean }) {
  const [state, action] = useActionState<EnrolState, FormData>(enrolStudent, {});
  const [open, setOpen] = useState(!!defaultOpen);
  const v = state.values ?? {};
  if (!open) {
    return <button type="button" className="btn" onClick={() => setOpen(true)}><Icon name="plus" size={17} />{l.add}</button>;
  }
  return (
    <section className="fsec enrol" aria-labelledby="enrol-t">
      <header className="fsec-head">
        <span className="fsec-icon" aria-hidden><Icon name="user" size={19} /></span>
        <div className="fsec-titles"><h2 id="enrol-t">{l.add}</h2></div>
        <div className="fsec-actions"><button type="button" className="icon-btn" aria-label={l.cancel} title={l.cancel} onClick={() => setOpen(false)}><Icon name="x" size={18} /></button></div>
      </header>
      <div className="fsec-body">
        <form action={action} key={state.n ?? 0}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="siteId" value={siteId} />
          {state.error && (
            <div className="notice-tight">
              <Notice tone={state.error === "duplicate" ? "warning" : "error"}>
                {state.error === "duplicate" ? l.duplicate!.replace("{matches}", state.matches ?? "") : state.error === "invalid" ? l.invalid : l.rejected!.replace("{reason}", state.error)}
              </Notice>
            </div>
          )}
          <h3 className="fgroup">{l.pupilGroup}</h3>
          <Fields>
            <Field span={4} label={l.lastName!} hint={l.nameHint}><input name="lastName" required autoComplete="off" defaultValue={v.lastName} style={{ textTransform: "uppercase" }} /></Field>
            <Field span={4} label={l.postName!} optional={l.optional}><input name="postName" autoComplete="off" defaultValue={v.postName} /></Field>
            <Field span={4} label={l.firstName!}><input name="firstName" required autoComplete="off" defaultValue={v.firstName} /></Field>
            <ChoiceGroup span={4} legend={l.sex!}>
              <Chip type="radio" name="sex" value="F" label={l.female} required defaultChecked={v.sex === "F"} />
              <Chip type="radio" name="sex" value="M" label={l.male} defaultChecked={v.sex === "M"} />
            </ChoiceGroup>
            <Field span={4} label={l.dateOfBirth!} hint={l.birthHint}><input name="dateOfBirth" type="date" max={today} defaultValue={v.dateOfBirth} /></Field>
            <Field span={4} label={l.birthYearEstimate!} optional={l.optional}><input name="birthYearEstimate" type="number" min={2000} max={2030} inputMode="numeric" placeholder="2019" defaultValue={v.birthYearEstimate} /></Field>
          </Fields>
          <h3 className="fgroup">{l.familyGroup}</h3>
          <Fields>
            <Field span={4} label={l.guardianName!} optional={l.optional}><input name="guardianName" autoComplete="off" defaultValue={v.guardianName} /></Field>
            <Field span={4} label={l.guardianPhone!} optional={l.optional}><input name="guardianPhone" type="tel" inputMode="tel" autoComplete="off" placeholder="+243 …" defaultValue={v.guardianPhone} /></Field>
            <Field span={4} label={l.village!} optional={l.optional}><input name="village" autoComplete="off" defaultValue={v.village} /></Field>
          </Fields>
          <h3 className="fgroup">{l.placeGroup}</h3>
          <Fields>
            <Field span={6} label={l.class!}>
              <select name="classId" required defaultValue={v.classId ?? ""}>
                <option value="" disabled>—</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>
            <Field span={6} label={l.enrolledOn!}><input name="enrolledOn" type="date" defaultValue={v.enrolledOn ?? today} max={today} required /></Field>
          </Fields>
          {state.error === "duplicate" && (
            <label className="check-row confirm-dup"><input type="checkbox" name="confirmDifferent" /> <span>{l.confirmDifferent}</span></label>
          )}
          <FormFooter>
            <button type="button" className="btn secondary" onClick={() => setOpen(false)}>{l.cancel}</button>
            <SubmitButton icon="check" pending={l.saving}>{l.add}</SubmitButton>
          </FormFooter>
        </form>
      </div>
    </section>
  );
}
