"use client";
/**
 * The form kit used by every web form (mirrors the Android kit: sectioned cards, aligned fields,
 * a fixed save bar, pending states). Layout rules live in app/globals.css under "Form system".
 *
 * Alignment: fields sit on a 12-column grid and each field is a 3-row subgrid (label, control,
 * message), so a hint or a two-line French label never pushes one control lower than its neighbour.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "@/components/icons";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** A submit button that disables itself and shows a spinner while its form is being sent. */
export function SubmitButton({ children, pending: pendingLabel, variant, small, icon, name, value, disabled, className }: {
  children: ReactNode; pending?: string; variant?: "primary" | "secondary" | "danger" | "lime"; small?: boolean; icon?: string; name?: string; value?: string; disabled?: boolean; className?: string;
}) {
  const { pending, data } = useFormStatus();
  // With several submit buttons in one form, only the pressed one shows the spinner.
  const mine = pending && (!name || data?.get(name) === value);
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} aria-busy={mine || undefined}
      className={cx("btn", variant && variant !== "primary" && variant, small && "sm", className)}>
      {mine ? <span className="spinner" aria-hidden /> : icon ? <Icon name={icon} size={small ? 15 : 17} /> : null}
      {mine && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/**
 * "Add …" control at the foot of a section: a quiet full-width button that opens the form in place.
 * Closes itself after a successful save (the page reloads with ?ok=), and opens itself when the
 * list above it is empty so the first record is one step away.
 */
export function Adder({ label, cancel, defaultOpen, children, resetKey }: { label: string; cancel: string; defaultOpen?: boolean; children: ReactNode; resetKey?: string }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (resetKey) setOpen(!!defaultOpen); }, [resetKey, defaultOpen]);
  useEffect(() => { if (open) ref.current?.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea")?.focus({ preventScroll: true }); }, [open]);
  if (!open) {
    return (
      <button type="button" className="adder-open" onClick={() => setOpen(true)}>
        <span className="adder-plus"><Icon name="plus" size={16} /></span>{label}
      </button>
    );
  }
  return (
    <div className="adder" ref={ref}>
      <div className="adder-head">
        <strong>{label}</strong>
        <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label={cancel} title={cancel}><Icon name="x" size={18} /></button>
      </div>
      {children}
    </div>
  );
}

/** Row action menu: a "…" (or labelled) button that opens a small panel; closes on outside click or Escape. */
export function RowMenu({ label, icon = "more", children, wide, tone }: { label: string; icon?: string; children: ReactNode; wide?: boolean; tone?: "danger" }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const away = (e: MouseEvent) => { if (el.open && !el.contains(e.target as Node)) el.open = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && el.open) { el.open = false; el.querySelector("summary")?.focus(); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, []);
  return (
    <details className={cx("rmenu", wide && "wide", tone && `rmenu-${tone}`)} ref={ref}>
      <summary className="rmenu-btn" aria-label={icon === "more" ? label : undefined} title={label}>
        <Icon name={icon} size={17} />{icon !== "more" && <span>{label}</span>}
      </summary>
      <div className="rmenu-body">{children}</div>
    </details>
  );
}

/** Small confirm-before-submit for destructive one-click buttons (remove a row, revoke). */
export function ConfirmButton({ label, confirm, yes, no, icon = "trash" }: { label: string; confirm: string; yes: string; no: string; icon?: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" className="icon-btn danger-hover" aria-label={label} title={label} onClick={() => setAsking(true)}><Icon name={icon} size={17} /></button>;
  }
  return (
    <span className="confirm-inline" role="group" aria-label={confirm}>
      <span className="confirm-q">{confirm}</span>
      <SubmitButton small variant="danger">{yes}</SubmitButton>
      <button type="button" className="btn sm ghost" onClick={() => setAsking(false)}>{no}</button>
    </span>
  );
}

/** Tracks whether a form has unsaved edits, for the save bar status. */
export function useDirty(ref: React.RefObject<HTMLFormElement | null>) {
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    const on = () => setDirty(true);
    f.addEventListener("input", on);
    f.addEventListener("change", on);
    return () => { f.removeEventListener("input", on); f.removeEventListener("change", on); };
  }, [ref]);
  return [dirty, setDirty] as const;
}

/** Warns before leaving the page with unsaved edits. */
export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
}
