"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { ChoiceGroup, Chip, Field, Fields, Notice } from "@/components/ui";
import { useLeaveGuard } from "@/components/ui/form";
import { plural } from "@/lib/format";
import type { MaintenanceTaskDef } from "./types";
import { fillLabels, serverIssue, validateTasks, type TemplateIssue } from "./validate";

type L = Record<"task" | "label_en" | "label_fr" | "frequency" | "proof" | "applies" | "fail_fault" | "add" | "remove" | "save" | "saved" | "builtin" | "all" | "pumps" | "unit" | "min" | "max" | "n" | "day" | "month" | "key" | "error"
  | "nDays" | "nMonths" | "taskN" | "tasks" | "tasks_one" | "unsaved" | "savedAll" | "saving" | "keyHint" | "optional"
  | "remove_confirm" | "advanced" | "label_hint" | "pumps_all" | "pumps_some" | "pumps_hint" | "cancel" | "leave" | "network", string> & {
  freq: Record<string, string>; proofs: Record<string, string>; months: string[]; errors: Record<TemplateIssue["code"], string>;
};

/** Pump sizes in use on the programme; any other size already in a template is offered too. */
const PUMPS_KW = [0.75, 1.1, 2.2];

const blank = (i: number): MaintenanceTaskDef => ({
  key: `task_${i}`, label: { en: "", fr: "" }, frequency: { kind: "every_n_months", n: 1, day: 1 }, appliesTo: { all: true }, proof: { kind: "tick" }, failOpensFault: true,
});

/**
 * One maintenance template: each task is its own card on the shared field grid; the save bar
 * stays at the bottom of the screen and says whether there is anything to save.
 */
export function TemplateEditor({ locale, template, versionLabel, labels, pumps = [] }: {
  locale: string;
  template: { templateKey: string; name: { en: string; fr: string }; tasks: MaintenanceTaskDef[] };
  versionLabel: string;
  labels: L;
  /** Pump ratings of the registered boreholes. */
  pumps?: number[];
}) {
  const router = useRouter();
  const [tasks, setTasksRaw] = useState<MaintenanceTaskDef[]>(template.tasks);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const setTasks = (t: MaintenanceTaskDef[]) => { setTasksRaw(t); setDirty(true); setMsg(null); };
  const set = (i: number, patch: Partial<MaintenanceTaskDef>) => setTasks(tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const num = (v: string, d: number) => (v === "" || Number.isNaN(Number(v)) ? d : Number(v));
  useLeaveGuard(dirty, labels.leave);
  const kwOptions = [...new Set([...PUMPS_KW, ...pumps, ...template.tasks.flatMap((t) => ("all" in t.appliesTo ? [] : t.appliesTo.pumpRatingsKw ?? []))])].filter((n) => n > 0).sort((a, b) => a - b);
  const kwLabel = (kw: number) => `${kw.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB")} kW`;
  const issueText = (x: TemplateIssue) => labels.errors[x.code].replace("{n}", String(x.n ?? ""));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const issues = validateTasks(tasks);
    if (issues.length) return setMsg({ ok: false, text: issues.map(issueText).join(" ") });
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/boreholes/templates", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateKey: template.templateKey, name: template.name, tasks: fillLabels(tasks) }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) { setMsg({ ok: true, text: labels.saved }); setDirty(false); router.refresh(); }
      else if (Array.isArray(body.issues)) setMsg({ ok: false, text: [...new Set((body.issues as string[]).map((x) => issueText(serverIssue(x))))].join(" ") });
      else setMsg({ ok: false, text: labels.error.replace("{reason}", String(body.reason ?? body.error ?? res.status)) });
    } catch {
      setMsg({ ok: false, text: labels.network });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="tpl">
      <div className="tpl-head">
        <h2>{template.name[locale as "en" | "fr"] ?? template.name.en}</h2>
        <span className="pill">{versionLabel}</span>
        <span className="muted small">{plural(locale, tasks.length, { one: labels.tasks_one, other: labels.tasks })}</span>
      </div>
      {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}
      <ol className="tpl-tasks">
        {tasks.map((t, i) => (
          <li key={i} className="fsec tpl-task">
            <header className="fsec-head">
              <span className="tpl-n" aria-hidden>{i + 1}</span>
              <div className="fsec-titles"><h3>{t.label[locale as "en" | "fr"] || t.label.en || labels.taskN.replace("{n}", String(i + 1))}</h3></div>
              <RemoveTask label={`${labels.remove}: ${t.label[locale as "en" | "fr"] || t.label.en || i + 1}`} labels={labels} onRemove={() => setTasks(tasks.filter((_, j) => j !== i))} />
            </header>
            <div className="fsec-body">
              <Fields>
                <Field span={6} label={labels.label_fr} hint={i === 0 ? labels.label_hint : undefined}><input value={t.label.fr} lang="fr" onChange={(e) => set(i, { label: { ...t.label, fr: e.target.value } })} /></Field>
                <Field span={6} label={labels.label_en}><input value={t.label.en} lang="en" onChange={(e) => set(i, { label: { ...t.label, en: e.target.value } })} /></Field>

                <Field span={4} label={labels.frequency}>
                  <select value={t.frequency.kind} onChange={(e) => {
                    const k = e.target.value;
                    set(i, { frequency: k === "each_visit" ? { kind: "each_visit" } : k === "every_n_days" ? { kind: "every_n_days", n: 30 } : k === "yearly" ? { kind: "yearly", month: 9, day: 1 } : { kind: "every_n_months", n: 1, day: 1 } });
                  }}>
                    {Object.entries(labels.freq).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                {t.frequency.kind === "every_n_days" && <><Field span={2} label={labels.nDays}><input type="number" min={1} value={t.frequency.n} onChange={(e) => set(i, { frequency: { kind: "every_n_days", n: num(e.target.value, 1) } })} /></Field><span className="fld s2" aria-hidden /></>}
                {t.frequency.kind === "every_n_months" && <>
                  <Field span={2} label={labels.nMonths}><input type="number" min={1} max={60} value={t.frequency.n} onChange={(e) => set(i, { frequency: { ...(t.frequency as { kind: "every_n_months"; n: number; day: number }), n: num(e.target.value, 1) } })} /></Field>
                  <Field span={2} label={labels.day}><input type="number" min={1} max={28} value={t.frequency.day} onChange={(e) => set(i, { frequency: { ...(t.frequency as { kind: "every_n_months"; n: number; day: number }), day: num(e.target.value, 1) } })} /></Field>
                </>}
                {t.frequency.kind === "yearly" && <>
                  <Field span={2} label={labels.month}>
                    <select value={t.frequency.month} onChange={(e) => set(i, { frequency: { ...(t.frequency as { kind: "yearly"; month: number; day: number }), month: Number(e.target.value) } })}>
                      {labels.months.map((m, k) => <option key={k} value={k + 1}>{m}</option>)}
                    </select>
                  </Field>
                  <Field span={2} label={labels.day}><input type="number" min={1} max={31} value={t.frequency.day} onChange={(e) => set(i, { frequency: { ...(t.frequency as { kind: "yearly"; month: number; day: number }), day: num(e.target.value, 1) } })} /></Field>
                </>}
                {t.frequency.kind === "each_visit" && <span className="fld s4" aria-hidden />}
                <ChoiceGroup span={4} legend={labels.applies} hint={labels.pumps_hint}>
                  <div className="chips">
                    {kwOptions.map((kw) => {
                      const on = !("all" in t.appliesTo) && (t.appliesTo.pumpRatingsKw ?? []).includes(kw);
                      return <Chip key={kw} label={kwLabel(kw)} checked={on} onChange={() => {
                        const cur = "all" in t.appliesTo ? [] : t.appliesTo.pumpRatingsKw ?? [];
                        const next = on ? cur.filter((x) => x !== kw) : [...cur, kw].sort((a, b) => a - b);
                        set(i, { appliesTo: next.length ? { pumpRatingsKw: next } : { all: true } });
                      }} />;
                    })}
                  </div>
                  <span className="muted small">{"all" in t.appliesTo ? labels.pumps_all : `${labels.pumps_some} ${(t.appliesTo.pumpRatingsKw ?? []).map(kwLabel).join(", ")}`}</span>
                </ChoiceGroup>

                <Field span={3} label={labels.proof}>
                  <select value={t.proof.kind} onChange={(e) => set(i, { proof: e.target.value === "reading" ? { kind: "reading", unit: "L/min" } : { kind: e.target.value as "tick" | "photo" } })}>
                    {Object.entries(labels.proofs).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                {t.proof.kind === "reading" && <>
                  <Field span={2} label={labels.unit}><input value={t.proof.unit} onChange={(e) => set(i, { proof: { ...(t.proof as { kind: "reading"; unit: string }), unit: e.target.value } })} /></Field>
                  <Field span={2} label={labels.min} optional={labels.optional}><input type="number" step="any" value={t.proof.min ?? ""} onChange={(e) => set(i, { proof: { ...(t.proof as { kind: "reading"; unit: string }), min: e.target.value === "" ? undefined : Number(e.target.value) } })} /></Field>
                  <Field span={2} label={labels.max} optional={labels.optional}><input type="number" step="any" value={t.proof.max ?? ""} onChange={(e) => set(i, { proof: { ...(t.proof as { kind: "reading"; unit: string }), max: e.target.value === "" ? undefined : Number(e.target.value) } })} /></Field>
                </>}
                {t.proof.kind !== "reading" && <span className="fld s6" aria-hidden />}

                <div className="fld s3 fld-bare">
                  <span />
                  <label className="check-row"><input type="checkbox" checked={t.failOpensFault} onChange={(e) => set(i, { failOpensFault: e.target.checked })} /><span>{labels.fail_fault}</span></label>
                  <span />
                </div>
              </Fields>
              <details className="tpl-adv">
                <summary>{labels.advanced}</summary>
                <Fields>
                  <Field span={4} label={labels.key} hint={labels.keyHint}><input value={t.key} pattern="[a-z0-9_]{2,40}" required onChange={(e) => set(i, { key: e.target.value })} spellCheck={false} /></Field>
                </Fields>
              </details>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="adder-open tpl-add" onClick={() => setTasks([...tasks, blank(tasks.length + 1)])}><span className="adder-plus"><Icon name="plus" size={16} /></span>{labels.add}</button>
      <div className="savebar" data-dirty={dirty}>
        <span className="savebar-status"><span className="savebar-dot" aria-hidden />{dirty ? labels.unsaved : labels.savedAll}</span>
        <span className="savebar-actions">
          <button className="btn lime" disabled={busy || !dirty} aria-busy={busy || undefined}>{busy ? <span className="spinner" aria-hidden /> : <Icon name="check" size={17} />}{busy ? labels.saving : labels.save}</button>
        </span>
      </div>
    </form>
  );
}

/** The bin button asks first; an unsaved template is only one click away from losing a task. */
function RemoveTask({ label, labels, onRemove }: { label: string; labels: L; onRemove: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="icon-btn danger-hover" aria-label={label} title={labels.remove} onClick={() => setAsking(true)}><Icon name="trash" size={17} /></button>;
  return (
    <span className="confirm-inline" role="alertdialog" aria-label={labels.remove_confirm}>
      <span className="confirm-q">{labels.remove_confirm}</span>
      <button type="button" className="btn sm ghost" onClick={() => setAsking(false)} autoFocus>{labels.cancel}</button>
      <button type="button" className="btn sm danger" onClick={() => { setAsking(false); onRemove(); }}>{labels.remove}</button>
    </span>
  );
}
