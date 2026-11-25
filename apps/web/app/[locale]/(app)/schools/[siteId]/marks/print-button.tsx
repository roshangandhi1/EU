"use client";
import { Icon } from "@/components/icons";

/** Opens the browser's print dialog (the print stylesheet keeps only the sheet). */
export function PrintButton({ label }: { label: string }) {
  return <button type="button" className="btn secondary sm no-print" onClick={() => window.print()}><Icon name="receipt" size={15} />{label}</button>;
}
