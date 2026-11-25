import type { MaintenanceTaskDef } from "./types";

/** A problem in the template, as an i18n code (boreholes.template.err.*) and the 1-based task number. */
export interface TemplateIssue { code: "label" | "key" | "key_dup" | "min_max" | "reading" | "frequency" | "task" | "empty"; n?: number }

/** One label language is enough: the empty one takes the other's text. */
export function fillLabels(tasks: MaintenanceTaskDef[]): MaintenanceTaskDef[] {
  return tasks.map((t) => {
    const en = t.label.en.trim(), fr = t.label.fr.trim();
    return { ...t, label: { en: en || fr, fr: fr || en } };
  });
}

/** What the server would refuse, checked before sending so the message names the task. */
export function validateTasks(tasks: MaintenanceTaskDef[]): TemplateIssue[] {
  const out: TemplateIssue[] = [];
  if (tasks.length === 0) out.push({ code: "empty" });
  const seen = new Map<string, number>();
  tasks.forEach((t, i) => {
    const n = i + 1;
    if (!t.label.en.trim() && !t.label.fr.trim()) out.push({ code: "label", n });
    if (!/^[a-z0-9_]{2,40}$/.test(t.key)) out.push({ code: "key", n });
    else if (seen.has(t.key)) out.push({ code: "key_dup", n });
    seen.set(t.key, n);
    const f = t.frequency;
    if ((f.kind === "every_n_days" && !(f.n >= 1)) || (f.kind === "every_n_months" && !(f.n >= 1 && f.n <= 60 && f.day >= 1 && f.day <= 28))
      || (f.kind === "yearly" && !(f.month >= 1 && f.month <= 12 && f.day >= 1 && f.day <= 31))) out.push({ code: "frequency", n });
    if (t.proof.kind === "reading") {
      if (!t.proof.unit.trim()) out.push({ code: "reading", n });
      if (t.proof.min !== undefined && t.proof.max !== undefined && t.proof.min > t.proof.max) out.push({ code: "min_max", n });
    }
  });
  return out;
}

/** Turns a server issue such as "tasks.2.label.fr: Too small" into a task-numbered code. */
export function serverIssue(issue: string): TemplateIssue {
  const m = /^tasks\.(\d+)(?:\.(\w+))?/.exec(issue);
  if (!m) return { code: "task" };
  const n = Number(m[1]) + 1;
  const field = m[2];
  const code: TemplateIssue["code"] = field === "label" ? "label" : field === "key" ? "key" : field === "frequency" ? "frequency" : field === "proof" ? "reading" : "task";
  return { code, n };
}
