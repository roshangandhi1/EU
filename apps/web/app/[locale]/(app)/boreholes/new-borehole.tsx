"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewBoreholeForm({ labels }: { locale: string; labels: Record<"code" | "village" | "lat" | "lng" | "pump" | "stage" | "create" | "created" | "error", string> & { lifecycle: Record<string, string> } }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (f.get(k) ? Number(f.get(k)) : null);
    const res = await fetch("/api/boreholes", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: f.get("code"), village: f.get("village"), lat: num("lat"), lng: num("lng"), pumpRatingKw: num("pump"), lifecycle: f.get("lifecycle") }) });
    const body = await res.json();
    setBusy(false);
    if (res.ok && body.ok) { setMsg({ ok: true, text: labels.created }); router.refresh(); }
    else setMsg({ ok: false, text: labels.error.replace("{reason}", body.reason ?? body.error ?? res.status) });
  }
  return (
    <form className="form" onSubmit={submit}>
      <label>{labels.code}<input name="code" required maxLength={40} placeholder="BH-003" /></label>
      <label>{labels.village}<input name="village" required /></label>
      <label>{labels.lat}<input name="lat" type="number" step="any" min={-14} max={6} /></label>
      <label>{labels.lng}<input name="lng" type="number" step="any" min={12} max={32} /></label>
      <label>{labels.pump}<select name="pump" defaultValue=""><option value="">–</option><option>2.2</option><option>1.1</option><option>0.75</option></select></label>
      <label>{labels.stage}<select name="lifecycle" defaultValue="planned">{Object.entries(labels.lifecycle).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <div><button className="btn" disabled={busy}>{labels.create}</button></div>
      {msg && <p role="status" className={msg.ok ? undefined : "error"}>{msg.text}</p>}
    </form>
  );
}
