"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MaintenanceTaskDef } from "./types";

type L = Record<"task" | "label_en" | "label_fr" | "frequency" | "proof" | "applies" | "fail_fault" | "add" | "remove" | "save" | "saved" | "builtin" | "all" | "pumps" | "unit" | "min" | "max" | "n" | "day" | "month" | "key" | "error", string> & {
  freq: Record<string, string>; proofs: Record<string, string>;
};

const blank = (i: number): MaintenanceTaskDef => ({
  key: `task_${i}`, label: { en: "", fr: "" }, frequency: { kind: "every_n_months", n: 1, day: 1 }, appliesTo: { all: true }, proof: { kind: "tick" }, failOpensFault: true,
});

export function TemplateEditor({ locale, template, versionLabel, labels }: {
  locale: string;
  template: { templateKey: string; name: { en: string; fr: string }; tasks: MaintenanceTaskDef[] };
  versionLabel: string;
  labels: L;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<MaintenanceTaskDef[]>(template.tasks);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<MaintenanceTaskDef>) => setTasks(tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const num = (v: string, d: number) => (v === "" || Number.isNaN(Number(v)) ? d : Number(v));

  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/boreholes/templates", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateKey: template.templateKey, name: template.name, tasks }) });
    const body = await res.json();
    setBusy(false);
    if (res.ok && body.ok) { setMsg({ ok: true, text: labels.saved }); router.refresh(); }
    else setMsg({ ok: false, text: labels.error.replace("{reason}", (body.issues ?? [body.reason ?? body.error]).join("; ")) });
  }

  return (
    <div className="panel">
      <h2>{template.name[locale as "en" | "fr"] ?? template.name.en} <span className="muted small">· {versionLabel}</span></h2>
      <ol className="tasks">
        {tasks.map((t, i) => (
          <li key={i} className="task">
            <div className="row">
              <label>{labels.label_en}<input value={t.label.en} onChange={(e) => set(i, { label: { ...t.label, en: e.target.value } })} required /></label>
              <label>{labels.label_fr}<input value={t.label.fr} onChange={(e) => set(i, { label: { ...t.label, fr: e.target.value } })} required /></label>
              <label className="narrow">{labels.key}<input value={t.key} pattern="[a-z0-9_]{2,40}" onChange={(e) => set(i, { key: e.target.value })} /></label>
            </div>
            <div className="row">
              <label>{labels.frequency}
                <select value={t.frequency.kind} onChange={(e) => {
                  const k = e.target.value;
                  set(i, { frequency: k === "each_visit" ? { kind: "each_visit" } : k === "every_n_days" ? { kind: "every_n_days", n: 30 } : k === "yearly" ? { kind: "yearly", month: 9, day: 1 } : { kind: "every_n_months", n: 1, day: 1 } });
                }}>
                  {Object.entries(labels.freq).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              {t.frequency.kind === "every_n_days" && <label className="narrow">{labels.n}<input type="number" min={1} value={t.frequency.n} onChange={(e) => set(i, { frequency: { kind: "every_n_days", n: num(e.target.value, 1) } })} /></label>}
              {t.frequency.kind === "every_n_months" && <>
                <label className="narrow">{labels.n}<input type="number" min={1} max={60} value={t.frequency.n} onChange={(e) => set(i, { frequency: { ...(t.frequency as { kind: "every_n_months"; n: number; day: number }), n: num(e.target.value, 1) } })} /></label>
                <label className="narrow">{labels.day}<input type="number" min={1} max={28} value={t.frequency.day} onChange={(e) => set(i, { frequency: { ...(t.frequency as { kind: "every_n_months"; n: number; day: number }), day: num(e.target.value, 1) } })} /></label>
              </>}
              {t.frequency.kind === "yearly" && <>
                <label className="narrow">{labels.month}<input type="number" min={1} max={12} value={t.frequency.month} onChange={(e) => set(i, { frequency: { ...(t.frequency as { kind: "yearly"; month: number; day: number }), month: num(e.target.value, 1) } })} /></label>
                <label className="narrow">{labels.day}<input type="number" min={1} max={31} value={t.frequency.day} onChange={(e) => set(i, { frequency: { ...(t.frequency as { kind: "yearly"; month: number; day: number }), day: num(e.target.value, 1) } })} /></label>
              </>}
              <label>{labels.proof}
                <select value={t.proof.kind} onChange={(e) => set(i, { proof: e.target.value === "reading" ? { kind: "reading", unit: "L/min" } : { kind: e.target.value as "tick" | "photo" } })}>
                  {Object.entries(labels.proofs).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              {t.proof.kind === "reading" && <>
                <label className="narrow">{labels.unit}<input value={t.proof.unit} onChange={(e) => set(i, { proof: { ...(t.proof as { kind: "reading"; unit: string }), unit: e.target.value } })} /></label>
                <label className="narrow">{labels.min}<input type="number" step="any" value={t.proof.min ?? ""} onChange={(e) => set(i, { proof: { ...(t.proof as { kind: "reading"; unit: string }), min: e.target.value === "" ? undefined : Number(e.target.value) } })} /></label>
                <label className="narrow">{labels.max}<input type="number" step="any" value={t.proof.max ?? ""} onChange={(e) => set(i, { proof: { ...(t.proof as { kind: "reading"; unit: string }), max: e.target.value === "" ? undefined : Number(e.target.value) } })} /></label>
              </>}
            </div>
            <div className="row">
              <label>{labels.pumps}
                <input placeholder={labels.all} value={"all" in t.appliesTo ? "" : (t.appliesTo.pumpRatingsKw ?? []).join(", ")}
                  onChange={(e) => {
                    const kw = e.target.value.split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
                    set(i, { appliesTo: kw.length ? { pumpRatingsKw: kw } : { all: true } });
                  }} />
              </label>
              <label className="check"><input type="checkbox" checked={t.failOpensFault} onChange={(e) => set(i, { failOpensFault: e.target.checked })} /> {labels.fail_fault}</label>
              <button type="button" className="btn secondary" onClick={() => setTasks(tasks.filter((_, j) => j !== i))}>{labels.remove}</button>
            </div>
          </li>
        ))}
      </ol>
      <div className="row">
        <button type="button" className="btn secondary" onClick={() => setTasks([...tasks, blank(tasks.length + 1)])}>{labels.add}</button>
        <button type="button" className="btn" disabled={busy} onClick={save}>{labels.save}</button>
      </div>
      {msg && <p role="status" className={msg.ok ? undefined : "error"}>{msg.text}</p>}
    </div>
  );
}
