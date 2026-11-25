import type { ForestryStream } from "@eu/forestry/mobile";
import type { SyncClient } from "@eu/sync/client";

type Geom = { type: "MultiPolygon"; coordinates: number[][][][] };

export interface PlotLite {
  id: string;
  scopeId: string;
  code: string;
  village: string;
  status: string;
  species: string[];
  geom: Geom | null;
  plantings: number;
  planted: number;
}

const live = (r: Record<string, unknown>) => !r.voidedAt;

/** Plots on this phone with their latest boundary and a planting tally, sorted by code. */
export async function loadPlots(client: SyncClient, stream: ForestryStream): Promise<PlotLite[]> {
  const [plots, boundaries, plantings] = await Promise.all([
    client.list(`${stream}.plot`),
    client.list(`${stream}.boundary`),
    client.list(`${stream}.planting`),
  ]);
  const latest = new Map<string, { at: string; geom: Geom }>();
  for (const b of boundaries.filter(live)) {
    const scope = String(b.scopeId);
    const at = String(b.deviceTime ?? "");
    const cur = latest.get(scope);
    if (!cur || at > cur.at) latest.set(scope, { at, geom: b.geom as Geom });
  }
  const tally = new Map<string, { n: number; total: number }>();
  for (const p of plantings.filter(live)) {
    const scope = String(p.scopeId);
    const lines = (p.lines as { count: number }[] | undefined) ?? [];
    const cur = tally.get(scope) ?? { n: 0, total: 0 };
    tally.set(scope, { n: cur.n + 1, total: cur.total + lines.reduce((s, l) => s + (l.count ?? 0), 0) });
  }
  return plots
    .filter(live)
    .map((p) => {
      const scopeId = String(p.scopeId);
      return {
        id: String(p.id),
        scopeId,
        code: String(p.code ?? ""),
        village: String(p.village ?? ""),
        status: String(p.status ?? ""),
        species: (p.species as string[] | undefined) ?? [],
        geom: latest.get(scopeId)?.geom ?? null,
        plantings: tally.get(scopeId)?.n ?? 0,
        planted: tally.get(scopeId)?.total ?? 0,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

export interface SpeciesOption {
  key: string;
  latin: string;
  en?: string;
  fr?: string;
}

/** Species list from the synced stream settings, else the built-in defaults. */
export async function loadSpecies(client: SyncClient, stream: ForestryStream, fallback: readonly SpeciesOption[]): Promise<SpeciesOption[]> {
  const settings = (await client.list(`${stream}.settings`)).find(live);
  const list = settings?.speciesList as SpeciesOption[] | undefined;
  return list && list.length > 0 ? list : [...fallback];
}
