import type { AcademicYear, Classroom, Exemption, FeeItem, FeePlan, Payment, ReceiptBook, SchoolClass, Synced, Term } from "@eu/schools";

/**
 * Cross-field checks for Setup forms, run before a record is sent. Each problem names the fields
 * to outline and a message key under schools.err.setup.
 */
export interface Problem { code: string; fields: string[]; vars?: Record<string, string | number> }

/** Live rows, leaving out the record being edited (`self`) so it never clashes with itself. */
const liveRows = <T extends { voidedAt: string | null; id?: string }>(rows: readonly T[], self?: string) => rows.filter((r) => !r.voidedAt && (!self || r.id !== self));
const p = (code: string, fields: string[], vars?: Problem["vars"]): Problem => ({ code, fields, ...(vars ? { vars } : {}) });

export function checkYear(f: AcademicYear, years: readonly Synced<AcademicYear>[], self?: string, terms: readonly Synced<Term>[] = []): Problem | null {
  if (!f.label.trim()) return p("label", ["label"]);
  if (f.endsOn <= f.startsOn) return p("endBeforeStart", ["endsOn"]);
  const clash = liveRows(years, self).find((y) => y.startsOn <= f.endsOn && f.startsOn <= y.endsOn);
  if (clash) return p("yearOverlap", ["startsOn", "endsOn"], { label: clash.label });
  // Editing a year: its terms must still fit inside it.
  const out = self ? liveRows(terms).filter((t) => t.academicYearId === self).find((t) => t.startsOn < f.startsOn || t.endsOn > f.endsOn) : undefined;
  return out ? p("yearCutsTerm", ["startsOn", "endsOn"], { n: out.number }) : null;
}

export function checkTerm(f: Term, years: readonly Synced<AcademicYear>[], terms: readonly Synced<Term>[], self?: string): Problem | null {
  if (f.endsOn <= f.startsOn) return p("endBeforeStart", ["endsOn"]);
  const y = years.find((x) => x.id === f.academicYearId);
  if (y && (f.startsOn < y.startsOn || f.endsOn > y.endsOn)) return p("termOutsideYear", ["startsOn", "endsOn"], { label: y.label });
  const same = liveRows(terms, self).filter((t) => t.academicYearId === f.academicYearId);
  if (same.some((t) => t.number === f.number)) return p("termTaken", ["number"], { n: f.number });
  const overlap = same.find((t) => t.startsOn <= f.endsOn && f.startsOn <= t.endsOn);
  return overlap ? p("termOverlap", ["startsOn", "endsOn"], { n: overlap.number }) : null;
}

export function checkRoom(f: Classroom): Problem | null {
  if (f.decommissionedOn && f.decommissionedOn <= f.commissionedOn) return p("decomBeforeCom", ["decommissionedOn"]);
  if (f.evidenceUrl && !/^https?:\/\//i.test(f.evidenceUrl)) return p("url", ["evidenceUrl"]);
  return null;
}

export function checkClass(f: SchoolClass, classes: readonly Synced<SchoolClass>[], self?: string): Problem | null {
  if (!/^[A-Z]{1,2}$/.test(f.section)) return p("section", ["section"]);
  const same = liveRows(classes, self).some((c) => c.academicYearId === f.academicYearId && c.level === f.level && c.section === f.section && c.shift === f.shift);
  return same ? p("classTaken", ["level", "section", "shift"]) : null;
}

export function checkFeeItem(f: Pick<FeeItem, "levels" | "name">): Problem | null {
  if (f.levels.length === 0) return p("levels", ["levels"]);
  if (!f.name.trim()) return p("feeName", ["name"]);
  return null;
}

/** A book's range must be in order, of a realistic size, and not overlap another live book. */
export function checkBook(f: Pick<ReceiptBook, "firstNumber" | "lastNumber">, books: readonly Synced<ReceiptBook>[], self?: string, payments: readonly Synced<Payment>[] = []): Problem | null {
  if (f.firstNumber > f.lastNumber) return p("bookOrder", ["lastNumber"]);
  if (f.lastNumber - f.firstNumber + 1 > 10_000) return p("bookSize", ["lastNumber"]);
  const clash = liveRows(books, self).find((b) => b.firstNumber <= f.lastNumber && f.firstNumber <= b.lastNumber);
  if (clash) return p("bookOverlap", ["firstNumber", "lastNumber"], { first: clash.firstNumber, last: clash.lastNumber });
  // Editing a book: receipts already used from it must stay inside the new range.
  const old = self ? books.find((b) => b.id === self) : undefined;
  const lost = old ? liveRows(payments).filter((x) => x.receiptNumber !== null && x.receiptNumber >= old.firstNumber && x.receiptNumber <= old.lastNumber && (x.receiptNumber < f.firstNumber || x.receiptNumber > f.lastNumber)) : [];
  return lost.length ? p("bookCutsReceipts", ["firstNumber", "lastNumber"], { n: lost.length }) : null;
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

/**
 * Three trimesters splitting a year into equal, back-to-back parts (whole days). A starting point
 * for a school that has not entered its calendar yet; each term can be edited afterwards.
 */
export function threeTerms(y: Pick<AcademicYear, "startsOn" | "endsOn">): { number: number; startsOn: string; endsOn: string }[] {
  const day = 86_400_000;
  const a = Date.parse(`${y.startsOn}T00:00:00Z`);
  const b = Date.parse(`${y.endsOn}T00:00:00Z`);
  const days = Math.round((b - a) / day) + 1;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return [0, 1, 2].map((i) => {
    const from = a + Math.floor((days * i) / 3) * day;
    const to = a + (Math.floor((days * (i + 1)) / 3) - 1) * day;
    return { number: i + 1, startsOn: iso(from), endsOn: iso(to) };
  });
}

/** Cross-field checks for a recurring fee: the due day or date its frequency needs, a span in order and inside the year. */
export function checkFeePlan(f: Pick<FeePlan, "frequency" | "dueDay" | "dueOn" | "startsOn" | "endsOn" | "name">, year: Pick<AcademicYear, "startsOn" | "endsOn"> | undefined): Problem | null {
  if (!f.name.trim()) return p("feeName", ["name"]);
  if ((f.frequency === "monthly" || f.frequency === "per_term") && f.dueDay === null) return p("planDueDay", ["dueDay"]);
  if ((f.frequency === "one_time" || f.frequency === "per_year") && !f.dueOn) return p("planDueOn", ["dueOn"]);
  if (f.endsOn < f.startsOn) return p("planOrder", f.frequency === "monthly" ? ["endMonth"] : ["endTerm"]);
  if (year && (f.startsOn < year.startsOn.slice(0, 7) + "-01" || f.endsOn > year.endsOn)) return p("planOutsideYear", f.frequency === "monthly" ? ["startMonth", "endMonth"] : ["startTerm", "endTerm"]);
  return null;
}
