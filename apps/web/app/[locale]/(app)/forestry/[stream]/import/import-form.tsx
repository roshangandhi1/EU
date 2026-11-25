"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { featureCollection } from "@eu/maps";
import { MapView } from "@eu/maps/web";
import type { ImportPreview, ImportResult } from "./types";

type Labels = Record<"choose" | "preview" | "commit" | "found" | "skipped" | "village" | "status" | "approve_from" | "checked_against" | "done" | "rejected" | "include" | "problems" | "area" | "plot" | "species", string> & {
  problemNames: Record<string, string>;
  statuses: Record<string, string>;
};

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export function ImportForm({ locale, stream, canApprove, species, labels }: {
  locale: string; stream: string; canApprove: boolean; species: { key: string; label: string }[]; labels: Labels;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [include, setInclude] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/forestry/${stream}/import`;
  const fmt = (n: number) => n.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 2 });

  async function doPreview() {
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("action", "preview");
    const res = await fetch(url, { method: "POST", body: fd });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "error");
    setPreview(body);
    setInclude(new Set((body as ImportPreview).candidates.filter((c) => c.problems.length === 0).map((c) => c.index)));
  }

  async function doCommit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || !preview) return;
    setBusy(true); setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("file", file);
    fd.set("action", "commit");
    for (const i of include) fd.append("include", String(i));
    const res = await fetch(url, { method: "POST", body: fd });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "error");
    setResult(body);
  }

  const overlays = useMemo(() => preview ? [{
    id: "import-preview", kind: "fill" as const, labelBy: "name", defaultColor: "#AFC437", colorBy: "included", colors: { true: "#AFC437", false: "#9AA39A" },
    data: featureCollection(preview.candidates.map((c) => ({ id: String(c.index), geometry: c.geom, properties: { name: c.name, included: include.has(c.index) } }))),
  }] : [], [preview, include]);

  return (
    <div className="form">
      <label>{labels.choose}
        <input type="file" accept=".kmz,.kml,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setResult(null); }} />
      </label>
      <div><button className="btn" type="button" disabled={!file || busy} onClick={doPreview}>{labels.preview}</button></div>
      {error && <p className="error" role="alert">{error}</p>}

      {preview && (
        <form className="form" onSubmit={doCommit}>
          <p><strong>{fill(labels.found, { n: preview.candidates.length, ha: fmt(preview.totalAreaHa) })}</strong>
            {preview.skipped.length > 0 && <> · {fill(labels.skipped, { n: preview.skipped.length })}</>}</p>
          <MapView overlays={overlays} height={360} ariaLabel={labels.plot} />
          <table className="grid">
            <thead><tr><th>{labels.include}</th><th>{labels.plot}</th><th className="num">{labels.area}</th><th>{labels.problems}</th></tr></thead>
            <tbody>
              {preview.candidates.map((c) => (
                <tr key={c.index}>
                  <td><input type="checkbox" aria-label={`${labels.include} ${c.name}`} checked={include.has(c.index)} onChange={(e) => {
                    const next = new Set(include);
                    if (e.target.checked) next.add(c.index); else next.delete(c.index);
                    setInclude(next);
                  }} /></td>
                  <td>{c.name}</td>
                  <td className="num">{fmt(c.areaHa)}</td>
                  <td>{c.problems.map((p) => labels.problemNames[p] ?? p).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <label>{labels.village}<input name="village" required /></label>
          <label>{labels.status}
            <select name="status" defaultValue="planted">
              {Object.entries(labels.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <fieldset><legend>{labels.species}</legend>
            {species.map((sp) => <label key={sp.key} className="check"><input type="checkbox" name="species" value={sp.key} /> <em>{sp.label}</em></label>)}
          </fieldset>
          {canApprove && <>
            <label>{labels.approve_from}<input type="date" name="approveFrom" /></label>
            <label>{labels.checked_against}<input name="checkedAgainst" /></label>
          </>}
          <div><button className="btn" type="submit" disabled={busy || include.size === 0}>{labels.commit}</button></div>
        </form>
      )}

      {result && (
        <div role="status">
          <p><strong>{fill(labels.done, { n: result.created.length })}</strong></p>
          {result.rejected.map((r) => <p key={r.code} className="warn">{fill(labels.rejected, r)}</p>)}
          <Link href={`/${locale}/forestry/${stream}`}>← {stream}</Link>
        </div>
      )}
    </div>
  );
}
