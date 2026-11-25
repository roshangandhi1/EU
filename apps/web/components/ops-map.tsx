"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { FeatureCollection } from "geojson";
import type { OverlayLayer, RasterLayer } from "@eu/maps";
import { MapView } from "@eu/maps/web";
import { fmtDate, fmtNum } from "@/lib/format";

type LayerKey = "bamboo" | "miombo" | "boreholes" | "schools";
export interface OpsMapLabels {
  aria: string; layers: Record<LayerKey, string>; area: string; operational: string; notOperational: string; open: string; selectHint: string;
  pupils: string; people: string; village: string; lastVisit: string; close: string;
}

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const COLOR: Record<LayerKey, string> = { bamboo: "#AFC437", miombo: "#EBAC27", boreholes: "#2B7BB9", schools: "#E8D72C" };
const SATELLITE: RasterLayer[] = [{
  id: "satellite",
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
  maxzoom: 18,
}];

/** All located records on satellite imagery, with layer toggles and a details panel for the selected feature. */
export function OpsMap({ locale, data, labels, height = 560, compact = false }: {
  locale: string;
  data: Record<LayerKey, FeatureCollection>;
  labels: OpsMapLabels;
  height?: number | string;
  compact?: boolean;
}) {
  const keys = (Object.keys(COLOR) as LayerKey[]).filter((k) => data[k].features.length > 0);
  const [hidden, setHidden] = useState<Set<LayerKey>>(new Set());
  const [sel, setSel] = useState<{ id: string; layer: LayerKey } | null>(null);
  const overlays: OverlayLayer[] = useMemo(
    () =>
      (["miombo", "bamboo", "schools", "boreholes"] as LayerKey[]).map((k) => ({
        id: k,
        kind: k === "bamboo" || k === "miombo" ? ("fill" as const) : ("circle" as const),
        data: hidden.has(k) ? EMPTY : data[k],
        defaultColor: COLOR[k],
        ...(k === "boreholes" ? { colorBy: "counted", colors: { true: "#2B7BB9", false: "#9AA6B2" } } : {}),
        labelBy: k === "schools" ? "name" : "code",
      })),
    [data, hidden],
  );
  const feature = sel ? data[sel.layer].features.find((f) => f.properties?._id === sel.id) : null;
  const p = (feature?.properties ?? {}) as Record<string, string | number | boolean>;
  const fmt = (n: number, d = 2) => fmtNum(n, locale, d);
  // "Open" goes to the item itself, not to its list.
  const href = (k: LayerKey) =>
    k === "schools" ? `/${locale}/schools/${sel?.id}` : k === "boreholes" ? `/${locale}/boreholes/${sel?.id}` : `/${locale}/forestry/${k}/${sel?.id}`;

  return (
    <div className={compact ? "opsmap compact" : "opsmap"}>
      <MapView overlays={overlays} imagery={SATELLITE} height={height} fitPadding={compact ? { top: 60, right: 220, bottom: 60, left: 420 } : 60} selectedId={sel?.id ?? null} ariaLabel={labels.aria}
        onSelect={(id, layer) => setSel(id && layer ? { id, layer: layer as LayerKey } : null)} />
      <div className="opsmap-legend" role="group" aria-label={labels.aria}>
        {keys.map((k) => (
          <label key={k}>
            <input type="checkbox" checked={!hidden.has(k)} onChange={() => {
              const n = new Set(hidden);
              if (n.has(k)) n.delete(k); else n.add(k);
              setHidden(n);
            }} />
            <span className={k === "boreholes" || k === "schools" ? "swatch round" : "swatch"} style={{ background: COLOR[k] }} />
            {labels.layers[k]} <span className="muted">{data[k].features.length}</span>
          </label>
        ))}
      </div>
      {feature && sel && (
        <div className="opsmap-card" role="dialog" aria-label={String(p.code ?? p.name ?? "")}>
          <button type="button" className="close" onClick={() => setSel(null)} aria-label={labels.close} title={labels.close}>×</button>
          <div className="muted small">{labels.layers[sel.layer]}</div>
          <div className="opsmap-title">{String(p.name ?? p.code ?? "")}</div>
          <dl>
            {p.village ? <><dt>{labels.village}</dt><dd>{String(p.village)}</dd></> : null}
            {typeof p.areaHa === "number" && <><dt>{labels.area}</dt><dd>{fmt(p.areaHa)} ha</dd></>}
            {p.species ? <><dt>&nbsp;</dt><dd><i>{String(p.species)}</i></dd></> : null}
            {sel.layer === "boreholes" && <><dt>{labels.operational}</dt><dd>{p.counted ? "✓" : labels.notOperational}</dd></>}
            {typeof p.people === "number" && p.people > 0 && <><dt>{labels.people}</dt><dd>{fmt(p.people, 0)}</dd></>}
            {p.lastVisit ? <><dt>{labels.lastVisit}</dt><dd>{fmtDate(String(p.lastVisit), locale)}</dd></> : null}
            {typeof p.pupils === "number" && <><dt>{labels.pupils}</dt><dd>{fmt(p.pupils, 0)}</dd></>}
          </dl>
          <Link className="btn secondary sm" href={href(sel.layer)}>{labels.open}</Link>
        </div>
      )}
    </div>
  );
}
