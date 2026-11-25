/**
 * Survival and stocking estimates by sampling, so nobody counts a whole plot.
 *
 * The app places random circular sample plots inside the authoritative boundary from a seed
 * stored on the visit, so the draw is reproducible for the assessor. Officers count living and
 * dead plants in each circle. We estimate plants/ha (mean of per-circle densities) and survival %
 * (ratio estimator), each with a 95% confidence interval.
 */
import bbox from "@turf/bbox";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { MultiPolygon } from "geojson";
import type { SamplePlot } from "./db/schema";
import { areaHa } from "./geo/area";

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SamplingSettings {
  samplesPerHa: number;
  minSamplesPerPlot: number;
  maxSamplesPerPlot: number;
  sampleRadiusM: number;
}

export function sampleCount(areaHectares: number, s: SamplingSettings): number {
  return Math.min(s.maxSamplesPerPlot, Math.max(s.minSamplesPerPlot, Math.ceil(areaHectares * s.samplesPerHa)));
}

/**
 * Uniform random sample-plot centres inside the boundary (rejection sampling in the bbox).
 * Circles may overlap the edge or each other; for estimation we only require the centre inside.
 */
export function placeSamplePoints(
  boundary: MultiPolygon,
  seed: number,
  s: SamplingSettings,
): { pointIndex: number; lat: number; lng: number }[] {
  const n = sampleCount(areaHa(boundary), s);
  const rand = mulberry32(seed);
  const [minX, minY, maxX, maxY] = bbox(boundary) as [number, number, number, number];
  const out: { pointIndex: number; lat: number; lng: number }[] = [];
  let tries = 0;
  while (out.length < n && tries < n * 500) {
    tries++;
    const lng = minX + rand() * (maxX - minX);
    const lat = minY + rand() * (maxY - minY);
    if (booleanPointInPolygon([lng, lat], boundary)) out.push({ pointIndex: out.length, lat, lng });
  }
  return out;
}

// Two-sided 95% t critical values for df 1..30; beyond that use 1.96.
const T95 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145,
  2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
const t95 = (df: number) => (df < 1 ? NaN : df <= 30 ? T95[df - 1]! : 1.96);

export interface Estimate {
  value: number;
  low: number;
  high: number;
  n: number;
}

export interface StockingEstimate {
  /** Living plants per ha (planted stock, plus natural regenerants when includeNatural). */
  livingPerHa: Estimate;
  /** Living / (living + dead) of planted stock, in %. Natural regenerants are excluded. */
  survivalPct: Estimate | null;
  bySpeciesPerHa: Record<string, number>;
  samplesUsed: number;
  samplesSkipped: number;
}

export function estimateStocking(
  samples: SamplePlot[],
  opts: { includeNatural?: boolean; species?: (s: string) => boolean } = {},
): StockingEstimate {
  const keep = opts.species ?? (() => true);
  const used = samples.filter((s) => !s.skipped);
  const densities: number[] = [];
  const alive: number[] = [];
  const total: number[] = [];
  const bySpecies: Record<string, number> = {};
  let sumAreaHa = 0;

  for (const s of used) {
    const circleHa = (Math.PI * s.radiusM * s.radiusM) / 10_000;
    sumAreaHa += circleHa;
    let a = 0;
    let d = 0;
    let living = 0;
    for (const c of s.counts) {
      if (!keep(c.species)) continue;
      a += c.alive;
      d += c.dead;
      const nat = opts.includeNatural ? (c.naturalAlive ?? 0) : 0;
      living += c.alive + nat;
      bySpecies[c.species] = (bySpecies[c.species] ?? 0) + c.alive + nat;
    }
    densities.push(living / circleHa);
    alive.push(a);
    total.push(a + d);
  }

  const n = used.length;
  const mean = n ? densities.reduce((x, y) => x + y, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(densities.reduce((x, y) => x + (y - mean) ** 2, 0) / (n - 1)) : NaN;
  const half = n > 1 ? t95(n - 1) * (sd / Math.sqrt(n)) : NaN;

  // Ratio estimator for survival: R = sum(alive) / sum(total), variance per Cochran (1977) 6.13.
  let survival: Estimate | null = null;
  const sa = alive.reduce((x, y) => x + y, 0);
  const st = total.reduce((x, y) => x + y, 0);
  if (st > 0) {
    const r = sa / st;
    const tbar = st / n;
    const varR = n > 1
      ? alive.reduce((acc, ai, i) => acc + (ai - r * total[i]!) ** 2, 0) / (n - 1) / (n * tbar * tbar)
      : NaN;
    const h = n > 1 ? t95(n - 1) * Math.sqrt(varR) : NaN;
    survival = { value: r * 100, low: Math.max(0, (r - h) * 100), high: Math.min(100, (r + h) * 100), n };
  }

  for (const k of Object.keys(bySpecies)) bySpecies[k] = sumAreaHa ? bySpecies[k]! / sumAreaHa : 0;

  return {
    livingPerHa: { value: mean, low: Math.max(0, mean - half), high: mean + half, n },
    survivalPct: survival,
    bySpeciesPerHa: bySpecies,
    samplesUsed: n,
    samplesSkipped: samples.length - n,
  };
}
