"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Field, Fields, FormFooter, Notice } from "@/components/ui";

type L = Record<"code" | "village" | "lat" | "lng" | "pump" | "stage" | "create" | "created" | "error" | "optional" | "saving" | "latLngHint" | "coordsError", string> & { lifecycle: Record<string, string> };

/** Adds a borehole site. Coordinates are optional (they can come from the phone later) but must fall inside the DRC. */
export function NewBoreholeForm({ labels }: { locale: string; labels: L }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (f.get(k) ? Number(f.get(k)) : null);
    const res = await fetch("/api/boreholes", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: f.get("code"), village: f.get("village"), lat: num("lat"), lng: num("lng"), pumpRatingKw: num("pump"), lifecycle: f.get("lifecycle") }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && body.ok) { setMsg({ ok: true, text: labels.created }); form.current?.reset(); router.refresh(); }
    else setMsg({ ok: false, text: labels.error.replace("{reason}", body.reason ?? body.error ?? String(res.status)) });
  }
  return (
    <form ref={form} onSubmit={submit}>
      {msg && <div className="notice-tight"><Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice></div>}
      <Fields>
        <Field span={4} label={labels.code}><input name="code" required maxLength={40} placeholder="BH-003" style={{ textTransform: "uppercase" }} /></Field>
        <Field span={4} label={labels.village}><input name="village" required /></Field>
        <Field span={4} label={labels.stage}><select name="lifecycle" defaultValue="planned">{Object.entries(labels.lifecycle).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field span={4} label={labels.lat} optional={labels.optional} hint={labels.latLngHint} error={labels.coordsError}><input name="lat" type="number" step="any" min={-14} max={6} inputMode="decimal" placeholder="-7.912" /></Field>
        <Field span={4} label={labels.lng} optional={labels.optional} error={labels.coordsError}><input name="lng" type="number" step="any" min={12} max={32} inputMode="decimal" placeholder="24.371" /></Field>
        <Field span={4} label={labels.pump} optional={labels.optional}><select name="pump" defaultValue=""><option value="">—</option><option value="2.2">2.2 kW</option><option value="1.1">1.1 kW</option><option value="0.75">0.75 kW</option></select></Field>
      </Fields>
      <FormFooter>
        <button className="btn" disabled={busy} aria-busy={busy || undefined}>{busy ? <span className="spinner" aria-hidden /> : <Icon name="plus" size={17} />}{busy ? labels.saving : labels.create}</button>
      </FormFooter>
    </form>
  );
}
