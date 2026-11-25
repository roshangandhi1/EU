"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { featureCollection } from "@eu/maps";
import { MapView } from "@eu/maps/web";
import { fmtDate, fmtNum } from "@/lib/format";

export interface BoreholeItem {
  siteId: string; code: string; village: string; lifecycle: string; lat: number | null; lng: number | null;
  lastVisitOn: string | null; worstDue: string; openFaults: number; counted: boolean; fails: string[];
  population: number | null; flowLpm: number | null;
}

const DUE_COLORS: Record<string, string> = { ok: "#1C6B33", due_soon: "#2B7BB9", due: "#E8A827", overdue: "#B3261E", none: "#9AA39A" };
const DUE_ICON: Record<string, string> = { ok: "✓", due_soon: "◷", due: "▲", overdue: "✕", none: "–" };
type Filter = "all" | "overdue" | "faults" | "not_counted";

/** Map plus list of boreholes. A row or a marker opens the borehole; search and chips narrow the list. */
export function BoreholesView({ locale, rows, labels }: {
  locale: string;
  rows: BoreholeItem[];
  labels: { code: string; village: string; stage: string; lastVisit: string; maintenance: string; faults: string; status: string; counts: string; none: string;
    people: string; flow: string; lpm: string; search: string; noMatch: string; shown: string; open: string;
    filters: Record<Filter, string>;
    lifecycle: Record<string, string>; due: Record<string, string>; fails: Record<string, string> };
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const href = (id: string) => `/${locale}/boreholes/${id}`;
  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    return rows.filter((r) =>
      (!needle || r.code.toLocaleLowerCase().includes(needle) || r.village.toLocaleLowerCase().includes(needle)) &&
      (filter === "all" || (filter === "overdue" && r.worstDue === "overdue") || (filter === "faults" && r.openFaults > 0) || (filter === "not_counted" && !r.counted)));
  }, [rows, q, filter]);
  const overlays = useMemo(() => [{
    id: "boreholes", kind: "circle" as const, colorBy: "due", colors: DUE_COLORS, defaultColor: "#9AA39A", labelBy: "code",
    data: featureCollection(shown.map((r) => ({ id: r.siteId, geometry: r.lat != null && r.lng != null ? { type: "Point" as const, coordinates: [r.lng, r.lat] } : null, properties: { code: r.code, due: r.worstDue } }))),
  }], [shown]);
  return (
    <div className="map-list">
      <div className="map-pane"><MapView overlays={overlays} onSelect={(id) => { if (id) router.push(href(id)); }} ariaLabel={labels.code} /></div>
      <div className="list-pane">
        <div className="list-tools">
          <input className="ctl search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={labels.search} aria-label={labels.search} />
          <div className="seg" role="group">
            {(Object.keys(labels.filters) as Filter[]).map((k) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{labels.filters[k]}</button>
            ))}
          </div>
          <span className="list-count">{labels.shown.replace("{n}", String(shown.length)).replace("{total}", String(rows.length))}</span>
        </div>
        {shown.length === 0 ? <p className="muted" style={{ padding: "16px" }}>{labels.noMatch}</p> : (
          <table className="grid stack">
            <thead><tr><th>{labels.code}</th><th>{labels.stage}</th><th className="num">{labels.people}</th><th className="num">{labels.flow}</th><th>{labels.lastVisit}</th><th>{labels.maintenance}</th><th className="num">{labels.faults}</th><th>{labels.status}</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.siteId} onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) router.push(href(r.siteId)); }}>
                  <td><Link className="row-link" href={href(r.siteId)}>{r.code}</Link><br /><span className="muted small">{r.village}</span></td>
                  <td data-label={labels.stage}>{labels.lifecycle[r.lifecycle] ?? r.lifecycle}</td>
                  <td className="num" data-label={labels.people}>{fmtNum(r.population, locale, 0, "—")}</td>
                  <td className="num nowrap" data-label={labels.flow}>{r.flowLpm === null ? "—" : labels.lpm.replace("{n}", fmtNum(r.flowLpm, locale, 1))}</td>
                  <td className="nowrap" data-label={labels.lastVisit}>{r.lastVisitOn ? fmtDate(r.lastVisitOn, locale) : labels.none}</td>
                  <td data-label={labels.maintenance}><span className="badge" style={{ borderColor: DUE_COLORS[r.worstDue] }}>{DUE_ICON[r.worstDue]} {labels.due[r.worstDue]}</span></td>
                  <td className="num" data-label={labels.faults}>{r.openFaults}</td>
                  <td data-label={labels.status}>{r.counted ? <span className="badge" style={{ borderColor: DUE_COLORS.ok }}>✓ {labels.counts}</span> : null}
                    {r.fails.length > 0 && <ul className="fails">{r.fails.map((f) => <li key={f}>{labels.fails[f] ?? f}</li>)}</ul>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
