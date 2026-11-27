"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "@/components/icons";

/**
 * "Edit" for a row whose form is too big for a popover (flow tests, plantings): a pencil button
 * that opens the form in a modal dialog. Escape, the close button or a click outside closes it.
 */
export function ModalEdit({ label, close, children }: { label: string; close: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const away = (e: MouseEvent) => { if (e.target === d) d.close(); };
    d.addEventListener("click", away);
    return () => d.removeEventListener("click", away);
  }, []);
  return (
    <>
      <button type="button" className="icon-btn" aria-label={label} title={label} onClick={(e) => { e.stopPropagation(); ref.current?.showModal(); }}>
        <Icon name="pencil" size={17} />
      </button>
      <dialog ref={ref} className="del-dialog edit-dialog" aria-label={label}>
        <div className="del-panel">
          <div className="del-head" style={{ justifyContent: "space-between" }}>
            <h2>{label}</h2>
            <button type="button" className="icon-btn" aria-label={close} title={close} onClick={() => ref.current?.close()}><Icon name="x" size={18} /></button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
