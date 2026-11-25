import type { Db } from "@eu/db";
import { placesAsAt } from "./capacity";
import { splitAsAt, type AsAtMode } from "./evidence";
import { listSchoolSites, loadSchool } from "./queries";

export interface IndicatorValue {
  code: string;
  /** null = not measured by this system (yet). */
  value: number | null;
  unit: string;
  target2027?: number;
  target2030?: number;
  note?: string;
}

/**
 * Programme logframe indicators that the schools module measures, as at a date.
 * In "evidence" mode only records the server held by the cut-off count (the TPA rule);
 * records captured before it but synced after are reported in the note, not counted.
 */
export async function schoolsIndicators(
  db: Db,
  asAt: string,
  mode: AsAtMode = "evidence",
  /** Late-synced classroom ids an admin admitted for this cut-off (apps/web/lib/evidence.ts admittedIds(db, cutoffId, "school.classroom")). */
  admittedClassroomIds: ReadonlySet<string> = new Set(),
): Promise<IndicatorValue[]> {
  let newPlaces = 0;
  let baselinePlaces = 0;
  let upgraded = 0;
  let late = 0;
  let noEvidence = 0;
  for (const site of await listSchoolSites(db)) {
    const d = await loadSchool(db, site.id);
    if (!d?.school || d.school.voidedAt) continue;
    const rooms = splitAsAt(d.classrooms, asAt, mode, admittedClassroomIds);
    late += rooms.lateSynced.length;
    const p = placesAsAt(d.school, rooms.counted, asAt);
    newPlaces += p.newPlaces;
    baselinePlaces += p.baselinePlaces;
    const newRooms = p.classrooms.filter((r) => r.basis === "new");
    if (newRooms.length > 0) upgraded += 1;
    noEvidence += newRooms.filter((n) => !rooms.counted.find((r) => r.id === n.id)?.evidenceUrl).length;
  }
  const lateNote = late > 0 ? ` ${late} classroom record(s) captured before the cut-off but synced after it are not counted unless an admin admits them for this cut-off.` : "";
  return [
    {
      code: "3.2.2",
      value: newPlaces,
      unit: "student places",
      target2027: 400,
      target2030: 1600,
      note: `New places = seats per shift × shifts the school runs, for classrooms marked "new" and in use on ${asAt}. Baseline places (not counted): ${baselinePlaces}.${noEvidence ? ` ${noEvidence} new classroom(s) have no evidence link yet.` : ""}${lateNote}`,
    },
    {
      code: "3.2.1",
      value: upgraded,
      unit: "schools",
      target2027: 2,
      target2030: 5,
      note: `Schools with at least one new classroom in use on ${asAt}. A proxy: the logframe count also needs the DoA technical, quality and location standards to be signed off.${lateNote}`,
    },
    ...([
      ["3.1.1", "TVET centres", { target2027: 2 }],
      ["3.1.2", "TVET centres", {}], // target 2 in 2028
      ["3.1.3", "TVET centres", { target2030: 2 }],
      ["3.1.4", "TVET places", { target2030: 500 }],
    ] as const).map(([code, unit, targets]) => ({
      code,
      value: null,
      unit,
      ...targets,
      note: `TVET module not built yet (parked until the centre plan is ready).${code === "3.1.2" ? " Target: 2 by 2028." : ""}`,
    })),
  ];
}
