"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { MultiPolygon } from "geojson";
import { featureCollection } from "@eu/maps";
import { MapView } from "@eu/maps/web";
import { fmtDate, fmtNum } from "@/lib/format";

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
  plantedOn: string | null;
  plants: number;
  survivalPct: number | null;
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
type Filter = "all" | "unapproved" | "not_counted";

/** Map plus list of plots. A row or a polygon opens the plot; search and chips narrow the list. */
export function PlotsView({ locale, stream, plots, labels }: {
  locale: string;
  stream: string;
  plots: PlotItem[];
  labels: { plot: string; village: string; area: string; perHa: string; outcome: string; unapproved: string; plantedOn: string; plants: string; survival: string;
    search: string; noMatch: string; shown: string; filters: Record<Filter, string>;
    outcomes: Record<string, string>; statuses: Record<string, string> };
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const href = (id: string) => `/${locale}/forestry/${stream}/${id}`;
  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    return plots.filter((p) =>
      (!needle || p.code.toLocaleLowerCase().includes(needle) || p.village.toLocaleLowerCase().includes(needle)) &&
      (filter === "all" || (filter === "unapproved" && !p.geomApproved) || (filter === "not_counted" && p.outcome !== "counted")));
  }, [plots, q, filter]);
  const data = useMemo(
    () => featureCollection(shown.map((p) => ({ id: p.siteId, geometry: p.geom, properties: { code: p.code, outcome: p.outcome, approved: p.geomApproved } }))),
    [shown],
  );
  const overlays = useMemo(() => [{ id: `plots-${stream}`, kind: "fill" as const, data, colorBy: "outcome", colors: OUTCOME_COLORS, defaultColor: "#9AA39A", labelBy: "code", solidWhen: "approved" }], [data, stream]);
  const fmt = (n: number, d = 2) => fmtNum(n, locale, d);

  return (
    <div className="map-list">
      <div className="map-pane">
        <MapView overlays={overlays} onSelect={(id) => { if (id) router.push(href(id)); }} ariaLabel={labels.plot} />
        <p className="muted small" style={{ margin: "6px 12px" }}>{labels.unapproved}</p>
      </div>
      <div className="list-pane">
        <div className="list-tools">
          <input className="ctl search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={labels.search} aria-label={labels.search} />
          <div className="seg" role="group">
            {(Object.keys(labels.filters) as Filter[]).map((k) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{labels.filters[k]}</button>
            ))}
          </div>
          <span className="list-count">{labels.shown.replace("{n}", String(shown.length)).replace("{total}", String(plots.length))}</span>
        </div>
        {shown.length === 0 ? <p className="muted" style={{ padding: 16 }}>{labels.noMatch}</p> : (
          <table className="grid stack">
            <thead>
              <tr><th>{labels.plot}</th><th>{labels.village}</th><th className="num">{labels.area}</th><th>{labels.plantedOn}</th><th className="num">{labels.plants}</th><th className="num">{labels.perHa}</th><th className="num">{labels.survival}</th><th>{labels.outcome}</th></tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.siteId} onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) router.push(href(p.siteId)); }}>
                  <td><Link className="row-link" href={href(p.siteId)}>{p.code}</Link><br /><span className="muted small">{labels.statuses[p.status] ?? p.status}</span></td>
                  <td data-label={labels.village}>{p.village}</td>
                  <td className="num" data-label={labels.area}>{fmt(p.areaHa)}</td>
                  <td className="nowrap" data-label={labels.plantedOn}>{fmtDate(p.plantedOn, locale)}</td>
                  <td className="num" data-label={labels.plants}>{p.plants ? fmt(p.plants, 0) : "—"}</td>
                  <td className="num" data-label={labels.perHa}>{fmt(p.plantedPerHa, 0)}</td>
                  <td className="num" data-label={labels.survival}>{p.survivalPct === null ? "—" : `${fmt(p.survivalPct, 0)} %`}</td>
                  <td data-label={labels.outcome}><span className="badge" style={{ borderColor: OUTCOME_COLORS[p.outcome] }}>{OUTCOME_ICON[p.outcome]} {labels.outcomes[p.outcome]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
