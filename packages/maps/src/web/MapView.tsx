"use client";
import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource, type Map as MlMap, type StyleSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { bboxOf, OSM_ATTRIBUTION, type Basemap, type OverlayLayer, type RasterLayer } from "../index";

let protocolAdded = false;

export interface MapViewProps {
  overlays: OverlayLayer[];
  imagery?: RasterLayer[];
  basemap?: Basemap;
  /** Initial centre if there is nothing to fit to: [lng, lat]. Defaults to Haut-Lomami. */
  center?: [number, number];
  zoom?: number;
  height?: number | string;
  selectedId?: string | null;
  onSelect?: (id: string | null, layerId: string | null) => void;
  ariaLabel: string;
  /** Padding when fitting to the data, e.g. to keep features clear of an overlay panel. */
  fitPadding?: number | { top: number; right: number; bottom: number; left: number };
}

function baseStyle(b: Basemap): StyleSpecification {
  const tiles = b.kind === "osm" ? ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"] : undefined;
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      base: b.kind === "osm"
        ? { type: "raster", tiles, tileSize: 256, attribution: OSM_ATTRIBUTION, maxzoom: 19 }
        : { type: "raster", url: b.url!, tileSize: 256 },
    },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

function colorExpr(l: OverlayLayer): any {
  if (!l.colorBy || !l.colors) return l.defaultColor;
  return ["match", ["to-string", ["get", l.colorBy]], ...Object.entries(l.colors).flat(), l.defaultColor];
}

export function MapView({ overlays, imagery = [], basemap = { kind: "osm" }, center = [24.8, -8.7], zoom = 9, height = 480, selectedId, onSelect, ariaLabel, fitPadding = 40 }: MapViewProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const loaded = useRef(false);
  const latest = useRef({ overlays, imagery, onSelect });
  latest.current = { overlays, imagery, onSelect };

  useEffect(() => {
    if (!el.current) return;
    if (!protocolAdded) {
      maplibregl.addProtocol("pmtiles", new Protocol().tile);
      protocolAdded = true;
    }
    const m = new maplibregl.Map({ container: el.current, style: baseStyle(basemap), center, zoom, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }));
    m.on("load", () => {
      loaded.current = true;
      sync(m, latest.current.overlays, latest.current.imagery, true, fitPadding);
    });
    m.on("click", (e) => {
      const ids = latest.current.overlays.flatMap((l) => [`${l.id}-main`]).filter((id) => m.getLayer(id));
      const f = m.queryRenderedFeatures(e.point, { layers: ids })[0];
      const layerId = f ? f.layer.id.replace(/-main$/, "") : null;
      latest.current.onSelect?.(f ? String(f.properties?._id) : null, layerId);
    });
    m.on("mousemove", (e) => {
      const ids = latest.current.overlays.map((l) => `${l.id}-main`).filter((id) => m.getLayer(id));
      m.getCanvas().style.cursor = m.queryRenderedFeatures(e.point, { layers: ids }).length ? "pointer" : "";
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      loaded.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (map.current && loaded.current) sync(map.current, overlays, imagery, false);
  }, [overlays, imagery]);

  useEffect(() => {
    const m = map.current;
    if (!m || !loaded.current) return;
    for (const l of overlays) {
      const id = `${l.id}-selected`;
      if (m.getLayer(id)) m.setFilter(id, ["==", ["get", "_id"], selectedId ?? ""]);
    }
  }, [selectedId, overlays]);

  return <div ref={el} role="region" aria-label={ariaLabel} style={{ width: "100%", height, borderRadius: 8, overflow: "hidden" }} />;
}

function sync(m: MlMap, overlays: OverlayLayer[], imagery: RasterLayer[], fit: boolean, padding: MapViewProps["fitPadding"] = 40) {
  for (const r of imagery) {
    if (m.getSource(`img-${r.id}`)) continue;
    m.addSource(`img-${r.id}`, { type: "raster", url: r.url.startsWith("pmtiles://") ? r.url : undefined, tiles: r.url.startsWith("pmtiles://") ? undefined : [r.url], tileSize: 256, attribution: r.attribution, maxzoom: r.maxzoom });
    m.addLayer({ id: `img-${r.id}`, type: "raster", source: `img-${r.id}` });
  }
  for (const l of overlays) {
    const src = m.getSource(l.id) as GeoJSONSource | undefined;
    if (src) {
      src.setData(l.data);
      continue;
    }
    m.addSource(l.id, { type: "geojson", data: l.data });
    const color = colorExpr(l);
    if (l.kind === "fill") {
      m.addLayer({ id: `${l.id}-main`, type: "fill", source: l.id, paint: { "fill-color": color, "fill-opacity": 0.45 } });
      m.addLayer({ id: `${l.id}-line`, type: "line", source: l.id, paint: { "line-color": "#1a1a1a", "line-width": 1.5,
        ...(l.solidWhen ? { "line-dasharray": ["case", ["==", ["get", l.solidWhen], true], ["literal", [1, 0]], ["literal", [2, 2]]] } : {}) } as any });
      m.addLayer({ id: `${l.id}-selected`, type: "line", source: l.id, filter: ["==", ["get", "_id"], ""], paint: { "line-color": "#003399", "line-width": 4 } });
    } else {
      m.addLayer({ id: `${l.id}-main`, type: "circle", source: l.id, paint: { "circle-color": color, "circle-radius": 8, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
      m.addLayer({ id: `${l.id}-selected`, type: "circle", source: l.id, filter: ["==", ["get", "_id"], ""], paint: { "circle-radius": 12, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#003399", "circle-stroke-width": 3 } });
    }
    if (l.labelBy) {
      m.addLayer({ id: `${l.id}-label`, type: "symbol", source: l.id, minzoom: 12,
        layout: { "text-field": ["get", l.labelBy], "text-size": 13, "text-font": ["Open Sans Regular"], "text-offset": l.kind === "circle" ? [0, 1.4] : [0, 0] },
        paint: { "text-color": "#1a1a1a", "text-halo-color": "#ffffff", "text-halo-width": 1.5 } });
    }
  }
  if (fit) {
    const b = bboxOf(overlays.map((l) => l.data));
    if (b) m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding, maxZoom: 16, duration: 0 });
  }
}
