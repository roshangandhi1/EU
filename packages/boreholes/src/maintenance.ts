/**
 * Maintenance schedule engine: templates (configured on the web) -> due list per borehole.
 * Runs on the phone offline (from the synced template and visit history) and on the server.
 */
import type { MaintenanceTaskDef } from "./types";
import type { AppliesTo, Frequency, TaskResult } from "./types";
import { addDays, addMonths, daysBetween, toDate, ymd } from "./dates";

export interface BoreholeLite {
  siteId: string;
  village: string;
  pumpRatingKw: number | null;
  /** Schedule starts from handover, else commissioning. Null = not yet in service, nothing due. */
  handedOverOn: string | null;
  commissionedOn: string | null;
}

export interface VisitLite {
  visitedOn: string;
  results: TaskResult[];
  voidedAt?: Date | null;
}

export type DueStatus = "ok" | "due_soon" | "due" | "overdue" | "each_visit";

export interface DueItem {
  taskKey: string;
  label: { en: string; fr: string };
  lastDoneOn: string | null;
  dueOn: string | null;
  status: DueStatus;
  daysOverdue: number;
}

export function applies(a: AppliesTo, b: BoreholeLite): boolean {
  if ("all" in a && a.all) return true;
  const r = a as Exclude<AppliesTo, { all: true }>;
  if (r.siteIds?.length && !r.siteIds.includes(b.siteId)) return false;
  if (r.villages?.length && !r.villages.includes(b.village)) return false;
  if (r.pumpRatingsKw?.length && (b.pumpRatingKw === null || !r.pumpRatingsKw.includes(b.pumpRatingKw))) return false;
  return true;
}

/** Next due date after `last` (or the first one on/after `start` if never done). */
export function nextDue(f: Frequency, last: string | null, start: string): string | null {
  switch (f.kind) {
    case "each_visit":
      return null;
    case "every_n_days":
      return addDays(last ?? start, last ? f.n : 0);
    case "every_n_months": {
      if (!last) {
        const s = toDate(start);
        const [y, m] = [s.getUTCFullYear(), s.getUTCMonth() + 1];
        const cand = ymd(y, m, f.day);
        if (cand >= start) return cand;
        const [y2, m2] = addMonths(y, m, 1);
        return ymd(y2, m2, f.day);
      }
      const l = toDate(last);
      const [y, m] = addMonths(l.getUTCFullYear(), l.getUTCMonth() + 1, f.n);
      return ymd(y, m, f.day);
    }
    case "yearly": {
      const base = toDate(last ?? start);
      const y = base.getUTCFullYear();
      const cand = ymd(y, f.month, f.day);
      if (!last) return cand >= start ? cand : ymd(y + 1, f.month, f.day);
      // Done early (before this year's date) still counts for this year.
      return cand > last && daysBetween(last, cand) > 180 ? cand : ymd(y + 1, f.month, f.day);
    }
  }
}

export function dueList(
  b: BoreholeLite,
  tasks: MaintenanceTaskDef[],
  visits: VisitLite[],
  today: string,
  opts: { dueSoonDays: number; overdueGraceDays: number },
): DueItem[] {
  const start = b.handedOverOn ?? b.commissionedOn;
  if (!start) return [];
  const live = visits.filter((v) => !v.voidedAt);
  return tasks.filter((t) => applies(t.appliesTo, b)).map((t) => {
    const lastDoneOn = live
      .filter((v) => v.results.some((r) => r.taskKey === t.key && r.done))
      .map((v) => v.visitedOn)
      .sort()
      .at(-1) ?? null;
    if (t.frequency.kind === "each_visit") {
      return { taskKey: t.key, label: t.label, lastDoneOn, dueOn: null, status: "each_visit" as const, daysOverdue: 0 };
    }
    const dueOn = nextDue(t.frequency, lastDoneOn, start)!;
    const d = daysBetween(dueOn, today); // >0 means past due
    const status: DueStatus = d > opts.overdueGraceDays ? "overdue" : d >= 0 ? "due" : -d <= opts.dueSoonDays ? "due_soon" : "ok";
    return { taskKey: t.key, label: t.label, lastDoneOn, dueOn, status, daysOverdue: Math.max(0, d) };
  });
}

/** Was each task done on time? On-time rate = completions on or before due + grace / completions due. */
export function onTimeRate(
  b: BoreholeLite,
  tasks: MaintenanceTaskDef[],
  visits: VisitLite[],
  from: string,
  to: string,
  graceDays: number,
): { due: number; onTime: number; rate: number | null } {
  const start = b.handedOverOn ?? b.commissionedOn;
  if (!start) return { due: 0, onTime: 0, rate: null };
  let due = 0;
  let onTime = 0;
  const live = visits.filter((v) => !v.voidedAt);
  for (const t of tasks.filter((x) => applies(x.appliesTo, b) && x.frequency.kind !== "each_visit")) {
    const done = live.filter((v) => v.results.some((r) => r.taskKey === t.key && r.done)).map((v) => v.visitedOn).sort();
    let last: string | null = null;
    let prevDeadline = "0000-00-00";
    for (let guard = 0; guard < 1000; guard++) {
      const d: string = nextDue(t.frequency, last, start)!;
      if (d > to) break;
      const deadline = addDays(d, graceDays);
      // A completion counts once, for the first due date whose window (previous deadline, this deadline] holds it.
      const completion: string | null = done.find((x) => x > prevDeadline && x <= deadline) ?? null;
      if (d >= from) {
        due++;
        if (completion) onTime++;
      }
      prevDeadline = deadline;
      // Interval tasks restart from the completion; calendar tasks stay on their calendar.
      last = t.frequency.kind === "every_n_days" ? (completion ?? d) : d;
    }
  }
  return { due, onTime, rate: due ? onTime / due : null };
}

/** Task results that failed and should open a fault. */
export function failedResults(tasks: MaintenanceTaskDef[], results: TaskResult[]): TaskResult[] {
  return results.filter((r) => {
    const t = tasks.find((x) => x.key === r.taskKey);
    if (!t || !t.failOpensFault || !r.done) return false;
    if (r.pass === false) return true;
    if (t.proof.kind === "reading" && r.value !== undefined) {
      if (t.proof.min !== undefined && r.value < t.proof.min) return true;
      if (t.proof.max !== undefined && r.value > t.proof.max) return true;
    }
    return false;
  });
}
