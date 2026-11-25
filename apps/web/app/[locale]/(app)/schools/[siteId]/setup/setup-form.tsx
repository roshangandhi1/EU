"use client";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { Adder, FormFooter, Notice } from "@/components/ui";
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
