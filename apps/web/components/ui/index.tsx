import Link from "next/link";
import type { ReactNode } from "react";
import s from "./ui.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={s.header}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
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

/** A grid of fields that submits to a server action. */
export function Form({ action, children }: { action: (fd: FormData) => void | Promise<void>; children: ReactNode }) {
  return (
    <form action={action} className={s.form}>
      {children}
    </form>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className={s.field}>
      {label}
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Check({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={s.check}>
      <input type="checkbox" {...props} />
      {label}
    </label>
  );
}

export interface Column<R> {
  key: string;
  header: string;
  numeric?: boolean;
  render: (row: R) => ReactNode;
}

export function Table<R>({ columns, rows, rowKey, empty }: { columns: Column<R>[]; rows: readonly R[]; rowKey: (r: R) => string; empty: string }) {
  if (rows.length === 0) return <p className={s.empty}>{empty}</p>;
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.numeric ? s.num : undefined} scope="col">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.key} className={c.numeric ? s.num : undefined}>
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
