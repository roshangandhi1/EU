/**
 * Indicator logic for 2.2.1 (bamboo, ha established) and 2.1.1 (miombo, ha restored).
 *
 * Pure functions over plain records so they run identically on the server, in tests and on the phone.
 *
 * Counting modes (see scope doc, "Audit trail and evidence integrity"):
 * - "captured": a record counts if it was captured (device_time) on or before the as-at date.
 *   Used for day-to-day dashboards.
 * - "evidence": a record counts only if the SERVER received it by the cut-off. Records captured
 *   before but received after are returned in `lateSynced` and join only after admin review.
 */
import type { MultiPolygon } from "geojson";
import type { PlantingLine, SamplePlot } from "./types";
import { estimateStocking, type Estimate } from "./sampling";

export type CountingMode = "captured" | "evidence";

export interface Stamped {
  id: string;
  deviceTime: Date;
  serverTime: Date;
  voidedAt?: Date | null;
  /** Admin accepted a late-synced record into an evidence count, with a logged reason. */
  lateAccepted?: boolean;
}

export interface PlotInput {
  siteId: string;
  code: string;
  stream: "bamboo" | "miombo";
  targetDensityPerHa?: number | null;
  boundaries: (Stamped & { areaHa: number; geom?: MultiPolygon })[];
  approvals: (Stamped & { boundaryId: string; effectiveFrom: string })[];
  plantings: (Stamped & { plantedOn: string; lines: PlantingLine[]; isGapFilling: boolean; photos: string[] })[];
  visits: (Stamped & { visitedOn: string; samples: SamplePlot[]; photos: { fileId: string }[] })[];
}

export interface IndicatorRules {
  densityRulePerHa: number;
  /** Miombo: only these species count as native. Bamboo: ignored. */
  isNative?: (species: string) => boolean;
  /** Replacement planting adds to "planted per ha" only if true. Default false (conservative). */
  countGapFilling?: boolean;
  /** Evidence needed for a hectare to count: at least one dated photo. Default true. */
  requirePhoto?: boolean;
  /**
   * When the server supplies it: when each referenced photo reached the server. A photo the phone
   * has not uploaded yet is not evidence; in evidence mode it must also have arrived by the as-at date.
   * Without it, any referenced photo counts (unit tests, previews).
   */
  photoUploadedAt?: Map<string, Date>;
}

export type PlotOutcome =
  | "counted"
  | "below_density"
  | "no_authoritative_boundary"
  | "not_planted"
  | "missing_evidence";

export interface PlotResult {
  siteId: string;
  code: string;
  areaHa: number;
  plantedPerHa: number;
  outcome: PlotOutcome;
  /** Records that would change the result if accepted (evidence mode only). */
  lateSynced: string[];
  /** Miombo reading B only. */
  regeneration?: { livingNativePerHa: Estimate; meets: boolean; visitedOn: string } | null;
}

export interface IndicatorResult {
  asAt: string;
  mode: CountingMode;
  hectaresCounted: number;
  hectaresPipeline: number; // planted but not yet meeting the rule or evidence
  plots: PlotResult[];
}

/** As-at dates are inclusive to the end of the day in Lubumbashi time (Haut-Lomami, UTC+2, no DST). */
const endOfDay = (d: string) => new Date(`${d}T23:59:59.999+02:00`);

function inScope<T extends Stamped>(r: T, asAt: Date, mode: CountingMode): "in" | "late" | "out" {
  if (r.voidedAt && r.voidedAt <= asAt) return "out";
  if (r.deviceTime > asAt) return "out";
  if (mode === "captured") return "in";
  if (r.serverTime <= asAt || r.lateAccepted) return "in";
  return "late";
}

/**
 * The boundary in force on the as-at date: the one named by the latest approval whose effective
 * date is on or before it (approvals that are voided, or not yet in scope for the mode, are ignored).
 */
export function boundaryAsAt(p: PlotInput, asAt: string, mode: CountingMode) {
  const at = endOfDay(asAt);
  const approval = p.approvals
    .filter((a) => a.effectiveFrom <= asAt && inScope(a, at, mode) === "in")
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : b.deviceTime.getTime() - a.deviceTime.getTime()))[0];
  if (!approval) return undefined;
  const b = p.boundaries.find((x) => x.id === approval.boundaryId);
  return b && inScope(b, at, mode) === "in" ? b : undefined;
}

export function evaluatePlot(p: PlotInput, asAt: string, mode: CountingMode, rules: IndicatorRules): PlotResult {
  const at = endOfDay(asAt);
  const late: string[] = [];
  const b = boundaryAsAt(p, asAt, mode);
  const keep = <T extends Stamped>(r: T) => {
    const s = inScope(r, at, mode);
    if (s === "late") late.push(r.id);
    return s === "in";
  };
  const plantings = p.plantings.filter((e) => e.plantedOn <= asAt && keep(e));
  const visits = p.visits.filter((v) => v.visitedOn <= asAt && keep(v));
  const native = rules.isNative ?? (() => true);

  const planted = plantings
    .filter((e) => rules.countGapFilling || !e.isGapFilling)
    .flatMap((e) => e.lines)
    .filter((l) => p.stream === "bamboo" || native(l.species))
    .reduce((s, l) => s + l.count, 0);

  const area = b?.areaHa ?? 0;
  const perHa = area > 0 ? planted / area : 0;
  // The indicator uses the contract rule only; a plot's own target density is operational, not a payment test.
  const threshold = rules.densityRulePerHa;
  const up = rules.photoUploadedAt;
  const isEvidence = (id: string) => {
    if (!up) return true;
    const t = up.get(id);
    return !!t && (mode === "captured" || t <= at);
  };
  const hasPhoto = plantings.some((e) => e.photos.some(isEvidence)) || visits.some((v) => v.photos.some((p) => isEvidence(p.fileId)));

  let outcome: PlotOutcome;
  if (!b) outcome = "no_authoritative_boundary";
  else if (planted === 0) outcome = "not_planted";
  else if (perHa < threshold) outcome = "below_density";
  else if ((rules.requirePhoto ?? true) && !hasPhoto) outcome = "missing_evidence";
  else outcome = "counted";

  let regeneration: PlotResult["regeneration"] = null;
  if (p.stream === "miombo") {
    const last = [...visits].filter((v) => v.samples.length > 0).sort((a, b2) => (a.visitedOn < b2.visitedOn ? 1 : -1))[0];
    if (last) {
      const est = estimateStocking(last.samples, { includeNatural: true, species: native });
      regeneration = { livingNativePerHa: est.livingPerHa, meets: est.livingPerHa.value >= rules.densityRulePerHa, visitedOn: last.visitedOn };
    }
  }

  return { siteId: p.siteId, code: p.code, areaHa: area, plantedPerHa: perHa, outcome, lateSynced: late, regeneration };
}

export function computeIndicator(plots: PlotInput[], asAt: string, mode: CountingMode, rules: IndicatorRules): IndicatorResult {
  const results = plots.map((p) => evaluatePlot(p, asAt, mode, rules));
  const sum = (f: (r: PlotResult) => boolean) =>
    round4(results.filter(f).reduce((s, r) => s + r.areaHa, 0));
  return {
    asAt,
    mode,
    hectaresCounted: sum((r) => r.outcome === "counted"),
    hectaresPipeline: sum((r) => r.outcome === "below_density" || r.outcome === "missing_evidence"),
    plots: results,
  };
}

/** Miombo reading B (proposal wording): hectares whose latest sample shows >= rule living native saplings/ha. */
export function miomboRegeneratingHa(result: IndicatorResult): number {
  return round4(result.plots.filter((p) => p.regeneration?.meets).reduce((s, p) => s + p.areaHa, 0));
}

export const UNIT_EUR = { "2.2.1": 3000, "2.1.1": 484 } as const;

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
