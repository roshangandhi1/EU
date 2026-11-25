/** Programme dashboard loader: asks each module for its indicator values as at a date. */
import { loadBoreholes } from "@eu/boreholes/server";
import { computeIndicator, miomboRegeneratingHa, withAdmitted, type CountingMode } from "@eu/forestry";
import { admittedRecordIds, cutoffOn } from "./evidence";
import { loadSettings, loadStream, photoUploads, rulesFrom } from "@eu/forestry/server";
import { schoolsIndicators } from "@eu/schools";
import { db } from "./http";
import { assemble, type IndicatorRow } from "./indicator-defs";

export * from "./indicator-defs";

/**
 * In evidence mode, late records an admin admitted for the cut-off count too (DATA-5). The cut-off
 * is `cutoffId` when given, else the latest cut-off falling on the as-at day (if there is one).
 */
export async function loadDashboard(asAt: string, mode: CountingMode, today: string, cutoffId?: string): Promise<IndicatorRow[]> {
  const d = db();
  let admitted = new Set<string>();
  if (mode === "evidence") {
    const id = cutoffId ?? (await cutoffOn(d, asAt))?.id;
    if (id) admitted = await admittedRecordIds(d, id);
  }
  const forestry = async (s: "bamboo" | "miombo") => {
    const [{ inputs }, settings] = await Promise.all([loadStream(d, s), loadSettings(d, s)]);
    return computeIndicator(withAdmitted(inputs, admitted), asAt, mode, { ...rulesFrom(s, settings), photoUploadedAt: await photoUploads(d, inputs) });
  };
  const [bh, miombo, bamboo, schools] = await Promise.all([
    loadBoreholes(d, asAt, mode, today, admitted), forestry("miombo"), forestry("bamboo"),
    // Schools calls "captured" mode "operational".
    schoolsIndicators(d, asAt, mode === "evidence" ? "evidence" : "operational", admitted),
  ]);
  const school = (code: string) => {
    const v = schools.find((x) => x.code === code)?.value;
    return v == null ? undefined : { value: v };
  };
  const lateOf = (r: { plots: { lateSynced: string[] }[] }) => r.plots.reduce((n, p) => n + p.lateSynced.length, 0);
  return assemble({
    "1.1.1": { value: bh.counted },
    "2.1.1": { value: miombo.hectaresCounted, late: lateOf(miombo), secondary: { key: "regenerating_ha", value: miomboRegeneratingHa(miombo) } },
    "2.2.1": { value: bamboo.hectaresCounted, late: lateOf(bamboo) },
    "3.2.1": school("3.2.1"),
    "3.2.2": school("3.2.2"),
  });
}
