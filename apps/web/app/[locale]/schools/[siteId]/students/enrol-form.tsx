"use client";
import { useActionState } from "react";
import { Button, Check, Field, Notice } from "@/components/ui";
import s from "@/components/ui/ui.module.css";
import { enrolStudent, type EnrolState } from "./actions";

export interface EnrolLabels {
  [k: string]: string;
}

export function EnrolForm({ locale, siteId, classes, today, l }: { locale: string; siteId: string; classes: { id: string; label: string }[]; today: string; l: EnrolLabels }) {
  const [state, action, pending] = useActionState<EnrolState, FormData>(enrolStudent, {});
  return (
    <form action={action} className={s.form}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="siteId" value={siteId} />
      {state.error && (
        <div style={{ gridColumn: "1 / -1" }}>
          <Notice tone={state.error === "duplicate" ? "warning" : "error"}>
            {state.error === "duplicate" ? l.duplicate!.replace("{matches}", state.matches ?? "") : state.error === "invalid" ? l.invalid : l.rejected!.replace("{reason}", state.error)}
          </Notice>
        </div>
      )}
      <Field label={l.lastName!}><input name="lastName" required autoComplete="off" /></Field>
      <Field label={l.postName!}><input name="postName" autoComplete="off" /></Field>
      <Field label={l.firstName!}><input name="firstName" required autoComplete="off" /></Field>
      <Field label={l.sex!}>
        <select name="sex" required defaultValue="">
          <option value="" disabled />
          <option value="F">{l.female}</option>
          <option value="M">{l.male}</option>
        </select>
      </Field>
      <Field label={l.dateOfBirth!} hint={l.birthHint}><input name="dateOfBirth" type="date" /></Field>
      <Field label={l.birthYearEstimate!}><input name="birthYearEstimate" type="number" min={2000} max={2030} inputMode="numeric" /></Field>
      <Field label={l.guardianName!}><input name="guardianName" autoComplete="off" /></Field>
      <Field label={l.guardianPhone!}><input name="guardianPhone" type="tel" inputMode="tel" autoComplete="off" /></Field>
      <Field label={l.village!}><input name="village" autoComplete="off" /></Field>
      <Field label={l.class!}>
        <select name="classId" required defaultValue="">
          <option value="" disabled />
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </Field>
      <Field label={l.enrolledOn!}><input name="enrolledOn" type="date" defaultValue={today} required /></Field>
      {state.error === "duplicate" && <Check name="confirmDifferent" label={l.confirmDifferent!} />}
      <Button type="submit" disabled={pending}>{l.save}</Button>
    </form>
  );
}
