"use client";
import { Icon } from "@/components/icons";
import { toCsv } from "@/lib/format";

/** Downloads the given rows as a CSV built in the browser (";" and a BOM for French Excel). */
export function CsvButton({ rows, locale, filename, label }: { rows: (string | number | null)[][]; locale: string; filename: string; label: string }) {
  const go = () => {
    const url = URL.createObjectURL(new Blob([toCsv(rows, locale)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <button type="button" className="btn secondary" onClick={go}><Icon name="download" size={16} />{label}</button>;
}
