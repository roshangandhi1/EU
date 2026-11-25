"use client";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/ui";

/** A labelled "restore default" button that asks once before submitting its form. */
export function RestoreButton({ label, confirm, yes, no }: { label: string; confirm: string; yes: string; no: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="btn ghost sm" onClick={() => setAsking(true)}><Icon name="clock" size={15} />{label}</button>;
  return (
    <span className="confirm-inline" role="group" aria-label={confirm}>
      <span className="confirm-q">{confirm}</span>
      <SubmitButton small variant="danger">{yes}</SubmitButton>
      <button type="button" className="btn sm ghost" onClick={() => setAsking(false)}>{no}</button>
    </span>
  );
}
