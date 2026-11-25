import type { Classroom, School, Shift, Synced } from "./model";

export interface PlacesReport {
  asAt: string;
  shiftsCounted: Shift[];
  baselinePlaces: number;
  newPlaces: number;
  totalPlaces: number;
  classrooms: Array<{
    id: string;
    name: string;
    basis: Classroom["basis"];
    seatsPerShift: number;
    places: number;
  }>;
}

/** Whether a classroom is in service on a given date (YYYY-MM-DD). */
export function inService(room: Pick<Classroom, "commissionedOn" | "decommissionedOn">, date: string): boolean {
  if (room.commissionedOn > date) return false;
  if (room.decommissionedOn !== null && room.decommissionedOn <= date) return false;
  return true;
}

/**
 * Student places as at a date (indicator 3.2.2 basis). Places = seats per shift x
 * shifts the school actually runs. The shift basis is reported explicitly so the
 * figure can be read alongside enrolment per shift.
 */
export function placesAsAt(
  schoolInfo: Pick<School, "shiftsRunning">,
  rooms: readonly Synced<Classroom>[],
  date: string,
): PlacesReport {
  const shifts = [...new Set(schoolInfo.shiftsRunning)];
  const rows = rooms
    .filter((r) => !r.voidedAt && inService(r, date))
    .map((r) => ({
      id: r.id,
      name: r.name,
      basis: r.basis,
      seatsPerShift: r.seatsPerShift,
      places: r.seatsPerShift * shifts.length,
    }));
  const sum = (basis: Classroom["basis"]) =>
    rows.filter((r) => r.basis === basis).reduce((n, r) => n + r.places, 0);
  const baselinePlaces = sum("baseline");
  const newPlaces = sum("new");
  return {
    asAt: date,
    shiftsCounted: shifts,
    baselinePlaces,
    newPlaces,
    totalPlaces: baselinePlaces + newPlaces,
    classrooms: rows,
  };
}
