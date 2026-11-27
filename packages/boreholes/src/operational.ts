/**
 * The written "operational" test for indicator 1.1.1 (to be adopted as GoCongo's SOP).
 * No contract document defines it, so every threshold is a setting.
 */
import type { OperationalCheck } from "./types";
import { daysBetween } from "./dates";

export interface BoreholeForCheck {
  siteId: string;
  code: string;
  pumpRatingKw: number | null;
  commissionedOn: string | null;
  waterQuality: { testedOn: string; turbidityNtu?: number; ecoliPer100ml?: number }[] | null;
  caretakersTrained: { trainedOn: string }[] | null;
  sopHandedOver: boolean;
  /** False for boreholes with no taps (e.g. grazing clusters): the tank/taps check is skipped. Default true. */
  hasTaps?: boolean;
  gpsLat?: number | null;
  gpsLng?: number | null;
  handedOverOn?: string | null;
  /** Dates of live population estimates. */
  populationOn?: string[];
}

export interface CheckVisit {
  id: string;
  visitedOn: string;
  operational: OperationalCheck | null;
  deviceTime: Date;
  serverTime: Date;
  voidedAt?: Date | null;
  lateAccepted?: boolean;
  /** Photos attached to the visit (visit photos and checklist photos). */
  photoCount?: number;
}

export type Criterion =
  | "commissioned" | "pump_delivers" | "flow_min" | "tank_taps"
  | "water_quality" | "caretaker" | "sop" | "no_recent_check"
  | "gps" | "photo" | "population" | "handover";

/** The checks a system administrator can switch on or off for 1.1.1 (Borehole settings). */
export const CRITERIA_KEYS = [
  "commissioned", "water_quality", "caretaker", "sop", "recent_check", "pump_delivers", "tank_taps", "flow_min",
  "gps", "photo", "population", "handover",
] as const;
export type CriterionKey = (typeof CRITERIA_KEYS)[number];

export interface CriteriaConfig {
  on: Record<CriterionKey, boolean>;
  /** A water quality test counts only if it is at most this many days old; null = any age. */
  waterQualityMaxAgeDays: number | null;
}

/** As the programme counted until 27 Nov 2026: the first eight on, the four added checks off. */
export const DEFAULT_CRITERIA: CriteriaConfig = {
  on: {
    commissioned: true, water_quality: true, caretaker: true, sop: true, recent_check: true, pump_delivers: true, tank_taps: true, flow_min: true,
    gps: false, photo: false, population: false, handover: false,
  },
  waterQualityMaxAgeDays: null,
};

/** Fills in any check missing from a saved config with its default. */
export type SavedCriteria = { on?: Partial<Record<string, boolean>>; waterQualityMaxAgeDays?: number | null } | null | undefined;

export function criteriaFrom(saved: SavedCriteria): CriteriaConfig {
  return {
    on: Object.fromEntries(CRITERIA_KEYS.map((k) => [k, saved?.on?.[k] ?? DEFAULT_CRITERIA.on[k]])) as Record<CriterionKey, boolean>,
    waterQualityMaxAgeDays: saved?.waterQualityMaxAgeDays ?? null,
  };
}

export interface OperationalSettings {
  minFlowLpmByPumpKw: Record<string, number | null>;
  maxCheckAgeDays: number;
  criteria?: SavedCriteria;
}

/**
 * Which enabled checks a borehole fails. `c` is the operational check used (the latest one in the
 * window when "recent_check" is on, else the latest one at all); `asAt` dates the age-limited checks.
 */
export function evaluateCheck(b: BoreholeForCheck, c: OperationalCheck | null, s: OperationalSettings, asAt?: string, latest?: CheckVisit | null): Criterion[] {
  const cr = criteriaFrom(s.criteria);
  const on = cr.on;
  const fails: Criterion[] = [];
  const by = (d: string | null | undefined) => !!d && (!asAt || d <= asAt);
  if (on.commissioned && !b.commissionedOn) fails.push("commissioned");
  if (on.water_quality) {
    const ok = b.waterQuality?.some((w) => w.turbidityNtu !== undefined && w.ecoliPer100ml !== undefined && by(w.testedOn)
      && (cr.waterQualityMaxAgeDays == null || !asAt || daysBetween(w.testedOn, asAt) <= cr.waterQualityMaxAgeDays));
    if (!ok) fails.push("water_quality");
  }
  if (on.caretaker && !b.caretakersTrained?.length) fails.push("caretaker");
  if (on.sop && !b.sopHandedOver) fails.push("sop");
  if (on.gps && (b.gpsLat == null || b.gpsLng == null)) fails.push("gps");
  if (on.handover && !by(b.handedOverOn)) fails.push("handover");
  if (on.population && !(b.populationOn ?? []).some((d) => by(d))) fails.push("population");
  const needsCheck = on.recent_check || on.pump_delivers || on.tank_taps || on.flow_min || on.photo;
  if (!c) {
    if (needsCheck) fails.push("no_recent_check");
    return fails;
  }
  if (on.pump_delivers && !c.pumpDelivers) fails.push("pump_delivers");
  // A borehole without taps (grazing clusters) is never failed on the tank/taps check.
  if (on.tank_taps && b.hasTaps !== false && c.tankFillsTapsOk !== true) fails.push("tank_taps");
  const min = b.pumpRatingKw === null ? null : s.minFlowLpmByPumpKw[String(b.pumpRatingKw)] ?? null;
  // No minimum flow rates are set for the programme (Roshan, 2026-11-25): any measured flow passes.
  // A per-pump minimum can still be configured in settings if one is agreed later.
  if (on.flow_min && (!c.flowLpm || c.flowLpm <= 0 || (min !== null && c.flowLpm < min))) fails.push("flow_min");
  if (on.photo && !(latest?.photoCount ?? 0)) fails.push("photo");
  return fails;
}

/** Flags that do not block counting. */
const NON_BLOCKING: Criterion[] = [];

export interface BoreholeIndicatorRow {
  siteId: string;
  code: string;
  counted: boolean;
  fails: Criterion[];
  checkedOn: string | null;
  lateSynced: string[];
}

export function indicator111(
  items: { borehole: BoreholeForCheck; visits: CheckVisit[] }[],
  asAt: string,
  mode: "captured" | "evidence",
  s: OperationalSettings,
): { asAt: string; counted: number; rows: BoreholeIndicatorRow[] } {
  const at = new Date(`${asAt}T23:59:59.999+02:00`);
  const rows = items.map(({ borehole: b, visits }) => {
    const late: string[] = [];
    const eligible = visits.filter((v) => {
      if (!v.operational || v.visitedOn > asAt || v.deviceTime > at) return false;
      if (v.voidedAt && v.voidedAt <= at) return false;
      if (mode === "evidence" && v.serverTime > at && !v.lateAccepted) {
        late.push(v.id);
        return false;
      }
      return !criteriaFrom(s.criteria).on.recent_check || daysBetween(v.visitedOn, asAt) <= s.maxCheckAgeDays;
    });
    const latest = eligible.sort((x, y) => (x.visitedOn < y.visitedOn ? 1 : -1))[0] ?? null;
    const commissionedByDate = b.commissionedOn && b.commissionedOn <= asAt ? b : { ...b, commissionedOn: null };
    const fails = evaluateCheck(commissionedByDate, latest?.operational ?? null, s, asAt, latest);
    const counted = fails.every((f) => NON_BLOCKING.includes(f));
    return { siteId: b.siteId, code: b.code, counted, fails, checkedOn: latest?.visitedOn ?? null, lateSynced: late };
  });
  return { asAt, counted: rows.filter((r) => r.counted).length, rows };
}

export const UNIT_EUR_111 = 13_200;
