import { defaultSettings, defaultTemplate, dueList, type BoreholeLite, type DueItem, type MaintenanceTaskDef, type TaskResult } from "@eu/boreholes/mobile";
import type { SyncClient } from "@eu/sync/client";

export interface BoreholeRow extends BoreholeLite {
  id: string;
  code: string;
  lifecycle: string;
  gpsLat: number | null;
  gpsLng: number | null;
  due: DueItem[];
  dueCount: number;
}

export interface Schedule {
  tasks: MaintenanceTaskDef[];
  templateKey: string;
  templateVersion: number | null;
  opts: { dueSoonDays: number; overdueGraceDays: number };
}

const live = (r: Record<string, unknown>) => !r.voidedAt;
const num = (v: unknown) => (typeof v === "number" ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : null);

/** The latest active version of the routine template on the phone, else the built-in one. */
export async function loadSchedule(client: SyncClient): Promise<Schedule> {
  const templates = (await client.list("boreholes.template")).filter(live).filter((t) => t.active !== false);
  const routine = templates
    .filter((t) => t.templateKey === defaultTemplate.templateKey)
    .sort((a, b) => Number(b.templateVersion) - Number(a.templateVersion))[0];
  const settings = (await client.list("boreholes.settings")).find(live);
  return {
    tasks: (routine?.tasks as MaintenanceTaskDef[] | undefined) ?? defaultTemplate.tasks,
    templateKey: defaultTemplate.templateKey,
    templateVersion: routine ? Number(routine.templateVersion) : null,
    opts: {
      dueSoonDays: num(settings?.dueSoonDays) ?? defaultSettings.dueSoonDays,
      overdueGraceDays: num(settings?.overdueGraceDays) ?? defaultSettings.overdueGraceDays,
    },
  };
}

const rank = { overdue: 0, due: 1, due_soon: 2, each_visit: 3, ok: 4 } as const;

export async function loadBoreholes(client: SyncClient, schedule: Schedule, today: string): Promise<BoreholeRow[]> {
  const [rows, visits] = await Promise.all([client.list("boreholes.borehole"), client.list("boreholes.visit")]);
  return rows
    .filter(live)
    .map((r) => {
      const b: BoreholeLite = {
        siteId: String(r.scopeId),
        village: String(r.village ?? ""),
        pumpRatingKw: num(r.pumpRatingKw),
        handedOverOn: str(r.handedOverOn),
        commissionedOn: str(r.commissionedOn),
      };
      const mine = visits
        .filter((v) => live(v) && v.scopeId === b.siteId)
        .map((v) => ({ visitedOn: String(v.visitedOn), results: (v.results as TaskResult[]) ?? [] }));
      const due = dueList(b, schedule.tasks, mine, today, schedule.opts).sort((x, y) => rank[x.status] - rank[y.status]);
      return {
        ...b,
        id: String(r.id),
        code: String(r.code ?? ""),
        lifecycle: String(r.lifecycle ?? ""),
        gpsLat: num(r.gpsLat),
        gpsLng: num(r.gpsLng),
        due,
        dueCount: due.filter((d) => d.status === "due" || d.status === "overdue").length,
      };
    })
    .sort((a, b) => b.dueCount - a.dueCount || a.code.localeCompare(b.code, undefined, { numeric: true }));
}
