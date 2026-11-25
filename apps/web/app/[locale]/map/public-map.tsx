"use client";
import { useMemo, useState } from "react";
import type { FeatureCollection } from "geojson";
import type { OverlayLayer } from "@eu/maps";
import { MapView } from "@eu/maps/web";

type Layer = "bamboo" | "miombo" | "boreholes";
const COLORS: Record<Layer, { yes: string; no: string }> = {
  bamboo: { yes: "#1C6B33", no: "#8DBF4E" },
  miombo: { yes: "#7A5C1E", no: "#E8A827" },
  boreholes: { yes: "#2B7BB9", no: "#9AA39A" },
};

export function PublicMap({ layers, labels }: {
  layers: { layer: Layer; data: FeatureCollection }[];
  labels: { aria: string; layer: Record<Layer, string>; legend: { counted: string; growing: string; operational: string; other: string } };
}) {
  const [hidden, setHidden] = useState<Set<Layer>>(new Set());
  const overlays: OverlayLayer[] = useMemo(
    () =>
      layers
        .filter((l) => !hidden.has(l.layer))
        .map((l) => {
          const key = l.layer === "boreholes" ? "operational" : "counted";
          const data: FeatureCollection = {
            ...l.data,
            features: l.data.features.map((f, i) => ({ ...f, properties: { ...f.properties, _id: `${l.layer}-${i}`, state: f.properties?.[key] ? "yes" : "no" } })),
          };
          return {
            id: l.layer,
            kind: l.layer === "boreholes" ? "circle" : "fill",
            data,
            colorBy: "state",
            colors: COLORS[l.layer],
            defaultColor: COLORS[l.layer].no,
            labelBy: "village",
          } satisfies OverlayLayer;
        }),
    [layers, hidden],
  );
  const toggle = (l: Layer) => setHidden((h) => { const n = new Set(h); if (n.has(l)) n.delete(l); else n.add(l); return n; });

  return (
    <div className="public-map-wrap">
      <div className="legend" role="group">
        {layers.map((l) => (
          <label key={l.layer} className="legend-item">
            <input type="checkbox" checked={!hidden.has(l.layer)} onChange={() => toggle(l.layer)} />
            <span>{labels.layer[l.layer]}</span>
            <span className="swatch" style={{ background: COLORS[l.layer].yes }} /> {l.layer === "boreholes" ? labels.legend.operational : labels.legend.counted}
            <span className="swatch" style={{ background: COLORS[l.layer].no }} /> {l.layer === "boreholes" ? labels.legend.other : labels.legend.growing}
          </label>
        ))}
      </div>
      <MapView overlays={overlays} height={560} ariaLabel={labels.aria} />
    </div>
  );
}
