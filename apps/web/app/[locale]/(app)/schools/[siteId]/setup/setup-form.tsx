"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Adder, Field, FormFooter, Notice } from "@/components/ui";
import type { Span } from "@/components/ui/layout";
import { BusyButton } from "../../busy-button";
import type { SetupState } from "./actions";

type Action = (prev: SetupState, fd: FormData) => Promise<SetupState>;

/**
 * A Setup form that keeps what was typed when the server refuses it, says why, and outlines the
 * fields concerned. Sent with startTransition rather than the form's action prop, because React
 * empties a form after its action runs. With `adder`, the form sits in an "Add …" control that
 * closes after a successful save.
 */
export function SetupForm({ action, hidden, submit, busy, icon = "plus", adder, children }: {
  action: Action; hidden: Record<string, string>; submit: string; busy: string; icon?: string;
  adder?: { label: string; cancel: string; defaultOpen?: boolean }; children: React.ReactNode;
}) {
  const [state, run, pending] = useActionState<SetupState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    const bad = new Set(state.fields ?? []);
    f.querySelectorAll<HTMLInputElement>("input,select,textarea").forEach((el) => el.setCustomValidity(bad.has(el.name) ? state.message ?? "!" : ""));
    if (bad.size) {
      f.classList.add("was-validated");
      f.querySelector<HTMLElement>([...bad].map((n) => `[name="${n}"]`).join(","))?.focus();
    }
  }, [state]);

  const form = (
    <form ref={ref} noValidate={false}
      onInput={(e) => (e.target as HTMLInputElement).setCustomValidity?.("")}
      onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => run(fd)); }}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {state.message && <div className="notice-tight"><Notice tone="error">{state.message}</Notice></div>}
      {!adder && state.ok && <div className="notice-tight"><Notice tone="success">{state.okText}</Notice></div>}
      {children}
      <FormFooter><BusyButton pending={pending} label={submit} busy={busy} icon={icon} /></FormFooter>
    </form>
  );
  if (!adder) return form;
  return (
    <>
      {state.ok && <div className="setup-ok"><Notice tone="success">{state.okText}</Notice></div>}
      <Adder label={adder.label} cancel={adder.cancel} defaultOpen={adder.defaultOpen} resetKey={state.ok ? `ok-${state.n}` : undefined}>{form}</Adder>
    </>
  );
}

/**
 * Year and trimester for a fee item. The trimester list follows the year chosen (it used to list
 * every year's terms, and only "Whole year" when none were set up). When the year has no
 * trimesters yet, it says so and points to the Terms section. With `fixedYear` (editing), the
 * year cannot change.
 */
export function YearAndTerm({ span, yearLabel, termLabel, optional, years, choices, text, fixedYear, defaultTerm }: {
  span: Span; yearLabel: string; termLabel: string; optional: string;
  years: { id: string; label: string }[];
  choices: { yearId: string; terms: { id: string; label: string }[] }[];
  text: { whole: string; none: string; addTerms: string; termsHref: string };
  fixedYear?: string; defaultTerm?: string;
}) {
  const [year, setYear] = useState(fixedYear ?? years[0]?.id ?? "");
  const terms = choices.find((c) => c.yearId === year)?.terms ?? [];
  return (
    <>
      <Field span={span} label={yearLabel}>
        {fixedYear
          ? <input readOnly value={years.find((y) => y.id === fixedYear)?.label ?? ""} />
          : <select name="academicYearId" required value={year} onChange={(e) => setYear(e.target.value)}>{years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select>}
      </Field>
      <Field span={span} label={termLabel} optional={optional} hint={terms.length === 0 ? <>{text.none} <a href={text.termsHref}>{text.addTerms}</a></> : undefined}>
        <select name="termId" key={year} defaultValue={terms.some((t) => t.id === defaultTerm) ? defaultTerm : ""}>
          <option value="">{text.whole}</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </Field>
    </>
  );
}
