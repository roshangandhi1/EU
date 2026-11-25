"use client";
import { useMemo, useState } from "react";
import type { MultiPolygon } from "geojson";
import { featureCollection } from "@eu/maps";
import { MapView } from "@eu/maps/web";

export interface PlotItem {
  siteId: string;
  code: string;
  village: string;
  status: string;
  geom: MultiPolygon | null;
  geomApproved: boolean;
  areaHa: number;
  plantedPerHa: number;
  outcome: string;
}

const OUTCOME_COLORS: Record<string, string> = {
  counted: "#1C6B33",
  below_density: "#E8A827",
  missing_evidence: "#E8A827",
  not_planted: "#9AA39A",
  no_authoritative_boundary: "#B3261E",
};
const OUTCOME_ICON: Record<string, string> = {
  counted: "✓", below_density: "▲", missing_evidence: "▲", not_planted: "○", no_authoritative_boundary: "✕",
};

export function PlotsView({ locale, stream, plots, labels }: {
  locale: string;
  stream: string;
  plots: PlotItem[];
  labels: { plot: string; village: string; area: string; perHa: string; outcome: string; unapproved: string; outcomes: Record<string, string>; statuses: Record<string, string> };
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const data = useMemo(
    () => featureCollection(plots.map((p) => ({ id: p.siteId, geometry: p.geom, properties: { code: p.code, outcome: p.outcome, approved: p.geomApproved } }))),
    [plots],
  );
  const overlays = useMemo(() => [{ id: `plots-${stream}`, kind: "fill" as const, data, colorBy: "outcome", colors: OUTCOME_COLORS, defaultColor: "#9AA39A", labelBy: "code", solidWhen: "approved" }], [data, stream]);
  const fmt = (n: number, d = 2) => n.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: d });

  return (
    <div className="map-list">
      <div className="map-pane">
        <MapView overlays={overlays} selectedId={selected} onSelect={(id) => setSelected(id)} ariaLabel={labels.plot} />
        <p className="muted small">{labels.unapproved}</p>
      </div>
      <div className="list-pane">
        <table className="grid">
          <thead>
            <tr><th>{labels.plot}</th><th>{labels.village}</th><th className="num">{labels.area}</th><th className="num">{labels.perHa}</th><th>{labels.outcome}</th></tr>
          </thead>
          <tbody>
            {plots.map((p) => (
              <tr key={p.siteId} aria-selected={selected === p.siteId} onClick={() => setSelected(p.siteId)} className={selected === p.siteId ? "sel" : undefined}>
                <td>{p.code}<br /><span className="muted small">{labels.statuses[p.status] ?? p.status}</span></td>
                <td>{p.village}</td>
                <td className="num">{fmt(p.areaHa)}</td>
                <td className="num">{fmt(p.plantedPerHa, 0)}</td>
                <td><span className="badge" style={{ borderColor: OUTCOME_COLORS[p.outcome] }}>{OUTCOME_ICON[p.outcome]} {labels.outcomes[p.outcome]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
