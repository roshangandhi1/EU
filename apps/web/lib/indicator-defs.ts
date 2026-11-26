/**
 * The 13 FNLC indicators (Annex III): targets, unit rates, caps, and the pure join of measured
 * values to them. No database imports, so tests and client code can use it.
 */
export type Source = "boreholes" | "miombo" | "bamboo" | "schools" | "agricoop" | "tvet" | "tpa";
export type Status = "live" | "awaiting_api" | "awaiting_module" | "parked" | "manual";

export interface IndicatorDef {
  code: string;
  unitKey: "borehole" | "cooperative" | "centre" | "smallholder" | "ha" | "foundation" | "superstructure" | "place" | "school" | "report";
  unitEur: number;
  /** Logframe end target and the year it is due (most are 2030; some TVET and coop ones earlier). */
  finalTarget: number;
  finalYear: number;
  capEur: number;
  source: Source;
}

/**
 * Annex III unit rates and caps, and the logframe end targets with their years. Per-period targets
 * and TPA-validated values live in the database (programme_periods), editable by admins.
 */
export const INDICATORS: IndicatorDef[] = [
  { code: "1.1.1", unitKey: "borehole", unitEur: 13_200, finalTarget: 140, finalYear: 2030, capEur: 1_848_000, source: "boreholes" },
  { code: "1.2.1", unitKey: "cooperative", unitEur: 190_000, finalTarget: 1, finalYear: 2027, capEur: 190_000, source: "agricoop" },
  { code: "1.2.2", unitKey: "centre", unitEur: 160_000, finalTarget: 1, finalYear: 2028, capEur: 160_000, source: "agricoop" },
  { code: "1.2.3", unitKey: "smallholder", unitEur: 750, finalTarget: 1_000, finalYear: 2030, capEur: 750_000, source: "agricoop" },
  { code: "2.1.1", unitKey: "ha", unitEur: 484, finalTarget: 3_000, finalYear: 2030, capEur: 1_452_000, source: "miombo" },
  { code: "2.2.1", unitKey: "ha", unitEur: 3_000, finalTarget: 500, finalYear: 2030, capEur: 1_500_000, source: "bamboo" },
  { code: "3.1.1", unitKey: "foundation", unitEur: 325_000, finalTarget: 2, finalYear: 2027, capEur: 650_000, source: "tvet" },
  { code: "3.1.2", unitKey: "superstructure", unitEur: 350_000, finalTarget: 2, finalYear: 2028, capEur: 700_000, source: "tvet" },
  { code: "3.1.3", unitKey: "centre", unitEur: 325_000, finalTarget: 2, finalYear: 2030, capEur: 650_000, source: "tvet" },
  { code: "3.1.4", unitKey: "place", unitEur: 1_000, finalTarget: 500, finalYear: 2030, capEur: 500_000, source: "tvet" },
  { code: "3.2.1", unitKey: "school", unitEur: 180_000, finalTarget: 5, finalYear: 2030, capEur: 900_000, source: "schools" },
  { code: "3.2.2", unitKey: "place", unitEur: 375, finalTarget: 1_600, finalYear: 2030, capEur: 600_000, source: "schools" },
  { code: "4.1.1", unitKey: "report", unitEur: 25_000, finalTarget: 4, finalYear: 2030, capEur: 100_000, source: "tpa" },
];

export interface IndicatorRow extends IndicatorDef {
  status: Status;
  value: number | null;
  /** Value at the unit rate, capped at the indicator's maximum. */
  valueEur: number | null;
  /** Extra reading shown under the value, e.g. miombo reading B. */
  secondary?: { key: string; value: number };
  /** Records captured by the date but received after it (evidence mode). */
  late?: number;
}

export type Measured = { value: number; secondary?: IndicatorRow["secondary"]; late?: number };

const STATUS: Record<Source, Status> = {
  boreholes: "live", miombo: "live", bamboo: "live",
  schools: "awaiting_module", agricoop: "awaiting_api", tvet: "parked", tpa: "manual",
};

/** Pure: joins measured values to the 13 definitions. Anything not measured shows why. */
export function assemble(measured: Partial<Record<string, Measured>>): IndicatorRow[] {
  return INDICATORS.map((def) => {
    const m = measured[def.code];
    if (!m) return { ...def, status: STATUS[def.source] === "live" ? "awaiting_module" : STATUS[def.source], value: null, valueEur: null };
    return { ...def, status: "live", value: m.value, secondary: m.secondary, late: m.late, valueEur: Math.min(def.capEur, Math.round(m.value * def.unitEur)) };
  });
}

export function totals(rows: IndicatorRow[]) {
  const earned = rows.reduce((s, r) => s + (r.valueEur ?? 0), 0);
  const ceiling = rows.reduce((s, r) => s + r.capEur, 0);
  const tracked = rows.filter((r) => r.status === "live").reduce((s, r) => s + r.capEur, 0);
  return { earned, ceiling, tracked };
}

