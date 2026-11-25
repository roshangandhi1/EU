/** Programme dashboard loader: asks each module for its indicator values as at a date. */
import { loadBoreholes } from "@eu/boreholes/server";
import { computeIndicator, miomboRegeneratingHa, type CountingMode } from "@eu/forestry";
import { loadSettings, loadStream, photoUploads, rulesFrom } from "@eu/forestry/server";
import { db } from "./http";
import { assemble, type IndicatorRow } from "./indicator-defs";

export * from "./indicator-defs";

export async function loadDashboard(asAt: string, mode: CountingMode, today: string): Promise<IndicatorRow[]> {
  const d = db();
  const forestry = async (s: "bamboo" | "miombo") => {
    const [{ inputs }, settings] = await Promise.all([loadStream(d, s), loadSettings(d, s)]);
    return computeIndicator(inputs, asAt, mode, { ...rulesFrom(s, settings), photoUploadedAt: await photoUploads(d, inputs) });
  };
  const [bh, miombo, bamboo] = await Promise.all([loadBoreholes(d, asAt, mode, today), forestry("miombo"), forestry("bamboo")]);
  const lateOf = (r: { plots: { lateSynced: string[] }[] }) => r.plots.reduce((n, p) => n + p.lateSynced.length, 0);
  return assemble({
    "1.1.1": { value: bh.counted },
    "2.1.1": { value: miombo.hectaresCounted, late: lateOf(miombo), secondary: { key: "regenerating_ha", value: miomboRegeneratingHa(miombo) } },
    "2.2.1": { value: bamboo.hectaresCounted, late: lateOf(bamboo) },
  });
}
