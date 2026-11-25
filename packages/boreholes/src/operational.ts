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
}

export interface CheckVisit {
  id: string;
  visitedOn: string;
  operational: OperationalCheck | null;
  deviceTime: Date;
  serverTime: Date;
  voidedAt?: Date | null;
  lateAccepted?: boolean;
}

export type Criterion =
  | "commissioned" | "pump_delivers" | "flow_min" | "flow_threshold_not_set" | "tank_taps"
  | "water_quality" | "caretaker" | "sop" | "no_recent_check";

export interface OperationalSettings {
  minFlowLpmByPumpKw: Record<string, number | null>;
  maxCheckAgeDays: number;
}

export function evaluateCheck(b: BoreholeForCheck, c: OperationalCheck | null, s: OperationalSettings): Criterion[] {
  const fails: Criterion[] = [];
  if (!b.commissionedOn) fails.push("commissioned");
  if (!b.waterQuality?.some((w) => w.turbidityNtu !== undefined && w.ecoliPer100ml !== undefined)) fails.push("water_quality");
  if (!b.caretakersTrained?.length) fails.push("caretaker");
  if (!b.sopHandedOver) fails.push("sop");
  if (!c) {
    fails.push("no_recent_check");
    return fails;
  }
  if (!c.pumpDelivers) fails.push("pump_delivers");
  if (!c.tankFillsTapsOk) fails.push("tank_taps");
  const min = b.pumpRatingKw === null ? null : s.minFlowLpmByPumpKw[String(b.pumpRatingKw)] ?? null;
  if (min === null) {
    // Until thresholds are agreed: any measured flow passes, but the result is flagged.
    if (!c.flowLpm || c.flowLpm <= 0) fails.push("flow_min");
    else fails.push("flow_threshold_not_set");
  } else if (c.flowLpm === null || c.flowLpm < min) fails.push("flow_min");
  return fails;
}

/** Flags that do not block counting. */
const NON_BLOCKING: Criterion[] = ["flow_threshold_not_set"];

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
      return daysBetween(v.visitedOn, asAt) <= s.maxCheckAgeDays;
    });
    const latest = eligible.sort((x, y) => (x.visitedOn < y.visitedOn ? 1 : -1))[0] ?? null;
    const commissionedByDate = b.commissionedOn && b.commissionedOn <= asAt ? b : { ...b, commissionedOn: null };
    const fails = evaluateCheck(commissionedByDate, latest?.operational ?? null, s);
    const counted = fails.every((f) => NON_BLOCKING.includes(f));
    return { siteId: b.siteId, code: b.code, counted, fails, checkedOn: latest?.visitedOn ?? null, lateSynced: late };
  });
  return { asAt, counted: rows.filter((r) => r.counted).length, rows };
}

export const UNIT_EUR_111 = 13_200;
