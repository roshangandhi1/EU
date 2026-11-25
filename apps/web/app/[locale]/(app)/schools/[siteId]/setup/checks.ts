import type { AcademicYear, Classroom, Exemption, FeeItem, ReceiptBook, SchoolClass, Synced, Term } from "@eu/schools";

/**
 * Cross-field checks for Setup forms, run before a record is sent. Each problem names the fields
 * to outline and a message key under schools.err.setup.
 */
export interface Problem { code: string; fields: string[]; vars?: Record<string, string | number> }

const liveRows = <T extends { voidedAt: string | null }>(rows: readonly T[]) => rows.filter((r) => !r.voidedAt);
const p = (code: string, fields: string[], vars?: Problem["vars"]): Problem => ({ code, fields, ...(vars ? { vars } : {}) });

export function checkYear(f: AcademicYear, years: readonly Synced<AcademicYear>[]): Problem | null {
  if (!f.label.trim()) return p("label", ["label"]);
  if (f.endsOn <= f.startsOn) return p("endBeforeStart", ["endsOn"]);
  const clash = liveRows(years).find((y) => y.startsOn <= f.endsOn && f.startsOn <= y.endsOn);
  return clash ? p("yearOverlap", ["startsOn", "endsOn"], { label: clash.label }) : null;
}

export function checkTerm(f: Term, years: readonly Synced<AcademicYear>[], terms: readonly Synced<Term>[]): Problem | null {
  if (f.endsOn <= f.startsOn) return p("endBeforeStart", ["endsOn"]);
  const y = years.find((x) => x.id === f.academicYearId);
  if (y && (f.startsOn < y.startsOn || f.endsOn > y.endsOn)) return p("termOutsideYear", ["startsOn", "endsOn"], { label: y.label });
  if (liveRows(terms).some((t) => t.academicYearId === f.academicYearId && t.number === f.number)) return p("termTaken", ["number"], { n: f.number });
  return null;
}

export function checkRoom(f: Classroom): Problem | null {
  if (f.decommissionedOn && f.decommissionedOn <= f.commissionedOn) return p("decomBeforeCom", ["decommissionedOn"]);
  if (f.evidenceUrl && !/^https?:\/\//i.test(f.evidenceUrl)) return p("url", ["evidenceUrl"]);
  return null;
}

export function checkClass(f: SchoolClass, classes: readonly Synced<SchoolClass>[]): Problem | null {
  if (!/^[A-Z]{1,2}$/.test(f.section)) return p("section", ["section"]);
  const same = liveRows(classes).some((c) => c.academicYearId === f.academicYearId && c.level === f.level && c.section === f.section && c.shift === f.shift);
  return same ? p("classTaken", ["level", "section", "shift"]) : null;
}

export function checkFeeItem(f: Pick<FeeItem, "levels" | "name">): Problem | null {
  if (f.levels.length === 0) return p("levels", ["levels"]);
  if (!f.name.trim()) return p("feeName", ["name"]);
  return null;
}

/** A book's range must be in order, of a realistic size, and not overlap another live book. */
export function checkBook(f: Pick<ReceiptBook, "firstNumber" | "lastNumber">, books: readonly Synced<ReceiptBook>[]): Problem | null {
  if (f.firstNumber > f.lastNumber) return p("bookOrder", ["lastNumber"]);
  if (f.lastNumber - f.firstNumber + 1 > 10_000) return p("bookSize", ["lastNumber"]);
  const clash = liveRows(books).find((b) => b.firstNumber <= f.lastNumber && f.firstNumber <= b.lastNumber);
  return clash ? p("bookOverlap", ["firstNumber", "lastNumber"], { first: clash.firstNumber, last: clash.lastNumber }) : null;
}

export function checkExemption(f: Pick<Exemption, "kind" | "value">): Problem | null {
  if (f.kind === "percent" && (f.value < 1 || f.value > 100)) return p("percent", ["value"]);
  if (f.kind === "fixed" && f.value < 1) return p("fixed", ["value"]);
  return null;
}

/** Latitude and longitude typed with a dot or a comma; both empty is allowed (no location yet). */
export function parseLatLng(latRaw: string, lngRaw: string): { lat: number | null; lng: number | null } | Problem {
  const num = (s: string) => (s.trim() === "" ? null : Number(s.trim().replace(",", ".")));
  const lat = num(latRaw);
  const lng = num(lngRaw);
  if ((lat === null) !== (lng === null)) return p("latLngBoth", [lat === null ? "lat" : "lng"]);
  if (lat !== null && (!Number.isFinite(lat) || lat < -14 || lat > 6)) return p("lat", ["lat"]);
  if (lng !== null && (!Number.isFinite(lng) || lng < 11 || lng > 32)) return p("lng", ["lng"]);
  return { lat, lng };
}
