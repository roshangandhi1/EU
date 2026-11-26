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

type PlanText = {
  year: string; frequency: string; frequencies: Record<"one_time" | "monthly" | "per_term" | "per_year", string>;
  dueDay: string; dueDayHint: string; dueOn: string; startMonth: string; endMonth: string; startTerm: string; endTerm: string;
  /** Labels of trimesters 1-3, and "{n} months" with {n} to fill in. */
  terms: Record<number, string>; noTerms: string; addTerms: string; termsHref: string; preview: string;
};

/**
 * The period part of a recurring fee: how often, when it is due, and from/to which month or
 * trimester. Only the fields the chosen frequency needs are shown (and sent).
 */
export function PlanPeriodFields({ years, termsByYear, text, value, fixedYear }: {
  years: { id: string; label: string; startsOn: string; endsOn: string }[];
  termsByYear: Record<string, number[]>;
  text: PlanText;
  value?: { frequency: string; dueDay: number | null; dueOn: string | null; startsOn: string; endsOn: string; terms?: { start: number; end: number } };
  fixedYear?: string;
}) {
  const [year, setYear] = useState(fixedYear ?? years[0]?.id ?? "");
  const [freq, setFreq] = useState(value?.frequency ?? "monthly");
  const y = years.find((x) => x.id === year);
  const terms = termsByYear[year] ?? [];
  const [startM, setStartM] = useState(value?.startsOn.slice(0, 7) ?? y?.startsOn.slice(0, 7) ?? "");
  const [endM, setEndM] = useState(value?.endsOn.slice(0, 7) ?? y?.endsOn.slice(0, 7) ?? "");
  const months = (() => {
    if (!/^\d{4}-\d{2}$/.test(startM) || !/^\d{4}-\d{2}$/.test(endM) || endM < startM) return 0;
    const [a, b] = [startM, endM].map((s) => { const [yy, mm] = s.split("-").map(Number) as [number, number]; return yy * 12 + mm; }) as [number, number];
    return b - a + 1;
  })();
  return (
    <>
      <Field span={4} label={text.year}>
        {fixedYear
          ? <input readOnly value={y?.label ?? ""} />
          : <select name="academicYearId" required value={year} onChange={(e) => { setYear(e.target.value); const ny = years.find((x) => x.id === e.target.value); if (ny) { setStartM(ny.startsOn.slice(0, 7)); setEndM(ny.endsOn.slice(0, 7)); } }}>{years.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>}
      </Field>
      <Field span={4} label={text.frequency}>
        <select name="frequency" value={freq} onChange={(e) => setFreq(e.target.value)}>
          {(["monthly", "per_term", "per_year", "one_time"] as const).map((k) => <option key={k} value={k}>{text.frequencies[k]}</option>)}
        </select>
      </Field>
      {(freq === "monthly" || freq === "per_term") && (
        <Field span={4} label={text.dueDay} hint={text.dueDayHint}><input name="dueDay" type="number" min={1} max={28} step={1} required defaultValue={value?.dueDay ?? 5} className="num-input" /></Field>
      )}
      {(freq === "one_time" || freq === "per_year") && (
        <Field span={4} label={text.dueOn}><input name="dueOn" type="date" required defaultValue={value?.dueOn ?? ""} min={y?.startsOn} max={y?.endsOn} /></Field>
      )}
      {freq === "monthly" && (
        <>
          <Field span={4} label={text.startMonth}><input name="startMonth" type="month" required value={startM} onChange={(e) => setStartM(e.target.value)} min={y?.startsOn.slice(0, 7)} max={y?.endsOn.slice(0, 7)} /></Field>
          <Field span={4} label={text.endMonth} hint={months ? text.preview.replace("{n}", String(months)) : undefined}><input name="endMonth" type="month" required value={endM} onChange={(e) => setEndM(e.target.value)} min={y?.startsOn.slice(0, 7)} max={y?.endsOn.slice(0, 7)} /></Field>
        </>
      )}
      {freq === "per_term" && (terms.length === 0
        ? <Field span={8} label={text.startTerm} hint={<>{text.noTerms} <a href={text.termsHref}>{text.addTerms}</a></>}><select name="startTerm" disabled><option>—</option></select></Field>
        : <>
            <Field span={4} label={text.startTerm}><select name="startTerm" key={`s${year}`} defaultValue={value?.terms?.start ?? terms[0]}>{terms.map((n) => <option key={n} value={n}>{text.terms[n]}</option>)}</select></Field>
            <Field span={4} label={text.endTerm}><select name="endTerm" key={`e${year}`} defaultValue={value?.terms?.end ?? terms[terms.length - 1]}>{terms.map((n) => <option key={n} value={n}>{text.terms[n]}</option>)}</select></Field>
          </>)}
    </>
  );
}
