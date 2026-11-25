import Link from "next/link";
import type { ReactNode } from "react";
import s from "./ui.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function PageHeader({ title, subtitle, actions, icon, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode; eyebrow?: string }) {
  return (
    <div className={s.header}>
      <div className={s.headTitle}>
        {icon && <span className={s.headIcon} aria-hidden>{icon}</span>}
        <div>
          {eyebrow && <div className={s.eyebrow}>{eyebrow}</div>}
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </div>
  );
}

type Variant = "primary" | "secondary" | "danger";
const variantClass = (v: Variant) => (v === "secondary" ? s.secondary : v === "danger" ? s.danger : undefined);

export function Button({ variant = "primary", small, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }) {
  return <button {...props} className={cx(s.btn, variantClass(variant), small && s.small, props.className)} />;
}

export function ButtonLink({ href, children, variant = "primary", small }: { href: string; children: ReactNode; variant?: Variant; small?: boolean }) {
  return (
    <Link href={href} className={cx(s.btn, variantClass(variant), small && s.small)}>
      {children}
    </Link>
  );
}

export { Section, Fields, Field, ChoiceGroup, Chip, FormFooter, EmptyRow, Toolbar, type Span } from "./layout";
export { SubmitButton, Adder, RowMenu, ConfirmButton } from "./form";
import { EmptyRow } from "./layout";

export function Check({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="check-row">
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}

export interface Column<R> {
  key: string;
  header: string;
  numeric?: boolean;
  /** Fit the column to its content (action buttons). */
  shrink?: boolean;
  render: (row: R) => ReactNode;
}

export function Table<R>({ columns, rows, rowKey, empty, emptyHint, emptyIcon, flush, rowClass }: {
  columns: Column<R>[]; rows: readonly R[]; rowKey: (r: R) => string; empty: string; emptyHint?: ReactNode; emptyIcon?: string; flush?: boolean; rowClass?: (r: R) => string | undefined;
}) {
  if (rows.length === 0) return flush ? <EmptyRow icon={emptyIcon} title={empty}>{emptyHint}</EmptyRow> : <div className={s.empty}><EmptyRow icon={emptyIcon} title={empty}>{emptyHint}</EmptyRow></div>;
  return (
    <div className={cx(s.tableWrap, flush && s.flush)}>
      <table className={cx(s.table, s.stackable)}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cx(c.numeric && s.num, c.shrink && s.shrink)} scope="col">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className={rowClass?.(r)}>
              {columns.map((c) => (
                <td key={c.key} className={cx(c.numeric && s.num, c.shrink && s.shrink)} data-label={c.header || undefined}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "success" | "warning" | "error"; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx(s.notice, s[tone])}>
      {children}
    </div>
  );
}

export function Stats({ children }: { children: ReactNode }) {
  return <div className={s.stats}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className={s.stat}>
      <div className={s.label}>{label}</div>
      <div className={s.value}>{value}</div>
      {hint && <div className={s.hint}>{hint}</div>}
    </div>
  );
}

export { Tabs } from "./tabs";
