"use client";
import { useEffect, useState } from "react";
import { useLeaveGuard } from "@/components/ui/form";

/**
 * While `dirty`, asks before leaving: the browser's own prompt on reload or close (useLeaveGuard),
 * and a confirm() on in-app links and other forms (Next.js client navigation never fires beforeunload).
 * `own` is the form being edited: submitting it is not "leaving".
 */
export function useNavGuard(dirty: boolean, message: string, own?: () => HTMLFormElement | null) {
  useLeaveGuard(dirty);
  useEffect(() => {
    if (!dirty) return;
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const to = new URL(a.href, location.href);
      if (to.pathname === location.pathname && to.search === location.search && to.hash) return; // same-page anchor
      if (!window.confirm(message)) { e.preventDefault(); e.stopPropagation(); }
    };
    const submit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      if (own?.() === f) return;
      if (!window.confirm(message)) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    return () => { document.removeEventListener("click", click, true); document.removeEventListener("submit", submit, true); };
  }, [dirty, message, own]);
}

/** Guards a server-rendered form (e.g. the fee grid) by id: dirty after the first edit, clean again after it is submitted. */
export function FormGuard({ formId, message }: { formId: string; message: string }) {
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const f = document.getElementById(formId) as HTMLFormElement | null;
    if (!f) return;
    const on = () => setDirty(true);
    const off = () => setDirty(false);
    f.addEventListener("input", on);
    f.addEventListener("change", on);
    f.addEventListener("submit", off);
    return () => { f.removeEventListener("input", on); f.removeEventListener("change", on); f.removeEventListener("submit", off); };
  }, [formId]);
  useNavGuard(dirty, message, () => document.getElementById(formId) as HTMLFormElement | null);
  return null;
}

/** "Tick all shown": ticks or unticks every checkbox named `name` in the same form. */
export function SelectAll({ name, label }: { name: string; label: string }) {
  return (
    <label className="check-row select-all">
      <input type="checkbox" onChange={(e) => {
        e.currentTarget.form?.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"]`).forEach((c) => { c.checked = e.currentTarget.checked; });
      }} />
      <span>{label}</span>
    </label>
  );
}
