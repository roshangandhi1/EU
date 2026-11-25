/**
 * Server-safe form layout pieces (no client JS): sections, the 12-column field grid, fields,
 * footers, the save bar shell, choice chips and empty states. Styles: app/globals.css "Form system".
 */
import { useId, type ReactNode } from "react";
import { Icon } from "@/components/icons";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** A titled card that groups one job: a list and its "add" form, or one form. */
export function Section({ id, title, description, icon, count, actions, children, flush, className }: {
  id?: string; title: ReactNode; description?: ReactNode; icon?: string; count?: number | string; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string;
}) {
  return (
    <section id={id} className={cx("fsec", flush && "flush", className)} aria-labelledby={id ? `${id}-t` : undefined}>
      <header className="fsec-head">
        {icon && <span className="fsec-icon" aria-hidden><Icon name={icon} size={19} /></span>}
        <div className="fsec-titles">
          <h2 id={id ? `${id}-t` : undefined}>{title}{count !== undefined && <span className="fsec-count">{count}</span>}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="fsec-actions">{actions}</div>}
      </header>
      <div className="fsec-body">{children}</div>
    </section>
  );
}

/** The 12-column field grid. Fields drop to full width on narrow containers. */
export function Fields({ children, className }: { children: ReactNode; className?: string }) {
  return <div className="fields-c"><div className={cx("fields", className)}>{children}</div></div>;
}

export type Span = 2 | 3 | 4 | 5 | 6 | 8 | 12;

/**
 * One labelled control. `optional` is the localised word to show beside the label.
 * `error` shows only once the browser marks the control invalid after the person has used it.
 */
export function Field({ label, hint, error, optional, span = 6, children, className }: {
  label: ReactNode; hint?: ReactNode; error?: ReactNode; optional?: string; span?: Span; children: ReactNode; className?: string;
}) {
  return (
    <label className={cx("fld", `s${span}`, className)}>
      <span className="fld-label">{label}{optional && <span className="fld-opt">{optional}</span>}</span>
      <span className="fld-ctl">{children}</span>
      <span className="fld-msg">
        {hint && <span className="fld-hint">{hint}</span>}
        {error && <span className="fld-err"><Icon name="alert" size={14} />{error}</span>}
      </span>
    </label>
  );
}

/** A group of checkboxes or radios shown as a row of chips (instead of a multi-select). */
export function ChoiceGroup({ legend, hint, optional, span = 12, children }: { legend: ReactNode; hint?: ReactNode; optional?: string; span?: Span; children: ReactNode }) {
  const id = useId();
  // A div group rather than a fieldset: legends don't take part in the subgrid, which broke alignment.
  return (
    <div role="group" aria-labelledby={id} className={cx("fld", "fld-group", `s${span}`)}>
      <span className="fld-label" id={id}>{legend}{optional && <span className="fld-opt">{optional}</span>}</span>
      <span className="chips">{children}</span>
      <span className="fld-msg">{hint && <span className="fld-hint">{hint}</span>}</span>
    </div>
  );
}

export function Chip({ type = "checkbox", label, sub, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; sub?: ReactNode }) {
  return (
    <label className="chip">
      <input type={type} {...props} />
      <span className="chip-face"><Icon name="check" size={14} className="chip-tick" />{label}{sub && <small>{sub}</small>}</span>
    </label>
  );
}

/** The action row at the end of a form. `note` sits on the left (e.g. what saving does). */
export function FormFooter({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="ffoot">
      {note && <p className="ffoot-note">{note}</p>}
      <div className="ffoot-actions">{children}</div>
    </div>
  );
}

/** Inline empty state for a list inside a section. */
export function EmptyRow({ icon = "list", title, children }: { icon?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty-row">
      <span className="empty-row-icon" aria-hidden><Icon name={icon} size={20} /></span>
      <div><strong>{title}</strong>{children && <p>{children}</p>}</div>
    </div>
  );
}

/** A toolbar above a list: filters on the left, a count or actions on the right. */
export function Toolbar({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <div className="toolbar">
      <div className="toolbar-main">{children}</div>
      {end && <div className="toolbar-end">{end}</div>}
    </div>
  );
}
