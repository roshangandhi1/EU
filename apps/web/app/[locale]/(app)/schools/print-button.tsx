"use client";
import { Icon } from "@/components/icons";

/**
 * "Print" button for one part of a page (an arrears list, a day's collections, a statement).
 * Only the element with id `target` is printed; see the @media print rules in schools.css.
 */
export function PrintButton({ target, label }: { target: string; label: string }) {
  const print = () => {
    const el = document.getElementById(target);
    if (!el) return window.print();
    const root = document.documentElement;
    el.classList.add("print-target");
    root.classList.add("print-one");
    const done = () => { el.classList.remove("print-target"); root.classList.remove("print-one"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
  };
  return (
    <button type="button" className="btn ghost sm no-print" onClick={print}>
      <Icon name="list" size={15} />{label}
    </button>
  );
}
