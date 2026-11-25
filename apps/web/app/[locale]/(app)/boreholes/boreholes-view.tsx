"use client";
import { useMemo, useState } from "react";
import { featureCollection } from "@eu/maps";
import { MapView } from "@eu/maps/web";

export interface BoreholeItem {
  siteId: string; code: string; village: string; lifecycle: string; lat: number | null; lng: number | null;
  lastVisitOn: string | null; worstDue: string; openFaults: number; counted: boolean; fails: string[];
}

const DUE_COLORS: Record<string, string> = { ok: "#1C6B33", due_soon: "#2B7BB9", due: "#E8A827", overdue: "#B3261E", none: "#9AA39A" };
const DUE_ICON: Record<string, string> = { ok: "✓", due_soon: "◷", due: "▲", overdue: "✕", none: "–" };

export function BoreholesView({ rows, labels }: {
  rows: BoreholeItem[];
  labels: { code: string; village: string; stage: string; lastVisit: string; maintenance: string; faults: string; status: string; counts: string; none: string;
    lifecycle: Record<string, string>; due: Record<string, string>; fails: Record<string, string> };
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const overlays = useMemo(() => [{
    id: "boreholes", kind: "circle" as const, colorBy: "due", colors: DUE_COLORS, defaultColor: "#9AA39A", labelBy: "code",
    data: featureCollection(rows.map((r) => ({ id: r.siteId, geometry: r.lat != null && r.lng != null ? { type: "Point" as const, coordinates: [r.lng, r.lat] } : null, properties: { code: r.code, due: r.worstDue } }))),
  }], [rows]);
  return (
    <div className="map-list">
      <div className="map-pane"><MapView overlays={overlays} selectedId={selected} onSelect={(id) => setSelected(id)} ariaLabel={labels.code} /></div>
      <div className="list-pane">
        <table className="grid">
          <thead><tr><th>{labels.code}</th><th>{labels.stage}</th><th>{labels.lastVisit}</th><th>{labels.maintenance}</th><th className="num">{labels.faults}</th><th>{labels.status}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.siteId} onClick={() => setSelected(r.siteId)} className={selected === r.siteId ? "sel" : undefined} aria-selected={selected === r.siteId}>
                <td>{r.code}<br /><span className="muted small">{r.village}</span></td>
                <td>{labels.lifecycle[r.lifecycle] ?? r.lifecycle}</td>
                <td>{r.lastVisitOn ?? labels.none}</td>
                <td><span className="badge" style={{ borderColor: DUE_COLORS[r.worstDue] }}>{DUE_ICON[r.worstDue]} {labels.due[r.worstDue]}</span></td>
                <td className="num">{r.openFaults}</td>
                <td>{r.counted ? <span className="badge" style={{ borderColor: DUE_COLORS.ok }}>✓ {labels.counts}</span> : null}
                  {r.fails.length > 0 && <ul className="fails">{r.fails.map((f) => <li key={f}>{labels.fails[f] ?? f}</li>)}</ul>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
