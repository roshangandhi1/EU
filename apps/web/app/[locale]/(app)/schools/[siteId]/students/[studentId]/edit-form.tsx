"use client";
import { startTransition, useActionState, useRef, useState } from "react";
import { Chip, ChoiceGroup, Field, Fields, FormFooter, Notice } from "@/components/ui";
import { BusyButton } from "../../../busy-button";
import { useNavGuard } from "../../../guard";
import { editStudent, type EditState } from "../actions";

/**
 * Corrects a pupil's details. Submitted without React's form reset, so a refused edit keeps what was
 * typed; leaving with unsaved changes asks first.
 */
export function EditPupil({ locale, siteId, studentId, fv, today, l, v }: {
  locale: string; siteId: string; studentId: string; fv: string; today: string; l: Record<string, string>; v: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<EditState, FormData>(editStudent, {});
  const [dirty, setDirty] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useNavGuard(dirty && !pending, l.unsaved!, () => ref.current);
  return (
    <form ref={ref} onInput={() => setDirty(true)} onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      startTransition(() => { action(fd); setDirty(false); });
    }}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="fv" value={fv} />
      {state.ok && !dirty && <div className="notice-tight"><Notice tone={state.conflict ? "warning" : "success"}>{state.conflict ? l.conflict : l.saved}</Notice></div>}
      {state.message && <div className="notice-tight"><Notice tone="error">{state.message}</Notice></div>}
      <Fields>
        <Field span={4} label={l.lastName!}><input name="lastName" required maxLength={80} autoComplete="off" defaultValue={v.lastName} style={{ textTransform: "uppercase" }} /></Field>
        <Field span={4} label={l.postName!} optional={l.optional}><input name="postName" maxLength={80} autoComplete="off" defaultValue={v.postName} /></Field>
        <Field span={4} label={l.firstName!}><input name="firstName" required maxLength={80} autoComplete="off" defaultValue={v.firstName} /></Field>
        <ChoiceGroup span={4} legend={l.sex!}>
          <Chip type="radio" name="sex" value="F" label={l.female} required defaultChecked={v.sex === "F"} />
          <Chip type="radio" name="sex" value="M" label={l.male} defaultChecked={v.sex === "M"} />
        </ChoiceGroup>
        <Field span={4} label={l.dateOfBirth!} hint={l.birthHint}><input name="dateOfBirth" type="date" max={today} defaultValue={v.dateOfBirth} /></Field>
        <Field span={4} label={l.birthYearEstimate!} optional={l.optional}><input name="birthYearEstimate" type="number" min={2000} max={Number(today.slice(0, 4))} inputMode="numeric" defaultValue={v.birthYearEstimate} /></Field>
        <Field span={4} label={l.guardianName!} optional={l.optional}><input name="guardianName" maxLength={80} autoComplete="off" defaultValue={v.guardianName} /></Field>
        <Field span={4} label={l.guardianPhone!} optional={l.optional}><input name="guardianPhone" type="tel" maxLength={20} inputMode="tel" autoComplete="off" defaultValue={v.guardianPhone} /></Field>
        <Field span={4} label={l.village!} optional={l.optional}><input name="village" maxLength={80} autoComplete="off" defaultValue={v.village} /></Field>
      </Fields>
      <FormFooter><BusyButton pending={pending} label={l.save!} busy={l.saving!} /></FormFooter>
    </form>
  );
}
