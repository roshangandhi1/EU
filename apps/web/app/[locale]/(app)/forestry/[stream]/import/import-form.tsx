"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { featureCollection } from "@eu/maps";
import { MapView } from "@eu/maps/web";
import { Icon } from "@/components/icons";
import { Chip, ChoiceGroup, Field, Fields, FormFooter, Notice } from "@/components/ui";
import { fmtNum, plural } from "@/lib/format";
import type { ImportPreview, ImportResult } from "./types";

type Labels = Record<"choose" | "preview" | "commit" | "found" | "found_one" | "skipped" | "skipped_one" | "village" | "status" | "approve_from" | "checked_against" | "done" | "done_one" | "rejected" | "include" | "problems" | "area" | "plot" | "species"
  | "step1" | "step2" | "step3" | "fileHint" | "backTo" | "selected" | "whatFollows" | "saving" | "optional" | "mapHint" | "created" | "open", string> & {
  problemNames: Record<string, string>;
  statuses: Record<string, string>;
  errors: Record<string, string>;
};

/** Vercel refuses request bodies above about 4.5 MB, so check before uploading. */
const MAX_UPLOAD = 4 * 1024 * 1024;

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** KMZ/KML import in three steps: choose the file, check the plots on a map, describe and import. */
export function ImportForm({ locale, stream, canApprove, species, labels }: {
  locale: string; stream: string; canApprove: boolean; species: { key: string; label: string }[]; labels: Labels;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [include, setInclude] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/forestry/${stream}/import`;
  const fmt = (n: number) => fmtNum(n, locale, 2);
  // Server codes become sentences; an unknown code is shown inside a generic sentence, never alone.
  const err = (code: string) => labels.errors[code] ?? labels.errors.unknown!.replace("{reason}", code);
  const problem = (code: string) => {
    const [key, arg = ""] = code.split(":");
    return (labels.problemNames[code] ?? labels.problemNames[key!] ?? code).replace("{code}", arg);
  };
  const toggle = (i: number) => setInclude((cur) => { const next = new Set(cur); if (next.has(i)) next.delete(i); else next.add(i); return next; });
  async function post(fd: FormData): Promise<{ ok: boolean; body: Record<string, unknown> }> {
    try {
      const res = await fetch(url, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({ error: res.status === 413 ? "file_too_large" : "unknown" }));
      return { ok: res.ok, body };
    } catch {
      return { ok: false, body: { error: "network" } };
    }
  }

  async function doPreview(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (file.size > MAX_UPLOAD) return setError(err("file_too_large"));
    if (!/\.(kmz|kml)$/i.test(file.name)) return setError(err("unsupported_format"));
    setBusy("preview"); setError(null); setResult(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("action", "preview");
    const { ok, body } = await post(fd);
    setBusy(null);
    if (!ok) return setError(err(String(body.error ?? "unknown")));
    setPreview(body as unknown as ImportPreview);
    setInclude(new Set((body as unknown as ImportPreview).candidates.filter((c) => c.problems.length === 0).map((c) => c.index)));
  }

  async function doCommit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || !preview) return;
    setBusy("commit"); setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("file", file);
    fd.set("action", "commit");
    for (const i of include) fd.append("include", String(i));
    const { ok, body } = await post(fd);
    setBusy(null);
    if (!ok) return setError(err(String(body.error ?? "unknown")));
    setResult(body as unknown as ImportResult);
  }

  const overlays = useMemo(() => preview ? [{
    id: "import-preview", kind: "fill" as const, labelBy: "name", defaultColor: "#AFC437", colorBy: "included", colors: { true: "#AFC437", false: "#9AA39A" },
    data: featureCollection(preview.candidates.map((c) => ({ id: String(c.index), geometry: c.geom, properties: { name: c.name, included: include.has(c.index) } }))),
  }] : [], [preview, include]);
  const selectedHa = preview ? preview.candidates.filter((c) => include.has(c.index)).reduce((n, c) => n + c.areaHa, 0) : 0;
  const spin = <span className="spinner" aria-hidden />;

  if (result) {
    return (
      <section className="fsec" role="status">
        <header className="fsec-head">
          <span className="fsec-icon" aria-hidden><Icon name="check" size={19} /></span>
          <div className="fsec-titles"><h2>{plural(locale, result.created.length, { one: labels.done_one, other: labels.done })}</h2></div>
        </header>
        <div className="fsec-body">
          {result.rejected.map((r) => <Notice key={r.code} tone="warning">{fill(labels.rejected, { code: r.code, reason: err(r.reason) })}</Notice>)}
          {result.created.length > 0 && (
            <ul className="created-list">
              {result.created.map((c) => <li key={c.siteId}><Link href={`/${locale}/forestry/${stream}/${c.siteId}`}>{c.code}</Link> <span className="muted">· {fmt(c.areaHa)} ha</span></li>)}
            </ul>
          )}
          <FormFooter><Link className="btn" href={`/${locale}/forestry/${stream}`}>{labels.backTo}</Link></FormFooter>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="fsec step">
        <header className="fsec-head">
          <span className="step-n" aria-hidden>1</span>
          <div className="fsec-titles"><h2>{labels.step1}</h2><p>{labels.fileHint}</p></div>
        </header>
        <div className="fsec-body">
          <form onSubmit={doPreview}>
            <Fields>
              <Field span={12} label={labels.choose}>
                <input type="file" required accept=".kmz,.kml,application/vnd.google-earth.kmz,application/vnd.google-earth.kml+xml" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setResult(null); }} />
              </Field>
            </Fields>
            {error && <div className="notice-tight"><Notice tone="error">{error}</Notice></div>}
            <FormFooter><button className={preview ? "btn secondary" : "btn"} disabled={!file || !!busy}>{busy === "preview" ? spin : <Icon name="map" size={17} />}{labels.preview}</button></FormFooter>
          </form>
        </div>
      </section>

      {preview && (
        <form onSubmit={doCommit}>
          <section className="fsec step flush">
            <header className="fsec-head">
              <span className="step-n" aria-hidden>2</span>
              <div className="fsec-titles">
                <h2>{labels.step2}</h2>
                <p>{plural(locale, preview.candidates.length, { one: labels.found_one, other: labels.found }, { ha: fmt(preview.totalAreaHa) })}{preview.skipped.length > 0 && <> · {plural(locale, preview.skipped.length, { one: labels.skipped_one, other: labels.skipped })}</>}</p>
                <p className="muted small">{labels.mapHint}</p>
              </div>
              <div className="fsec-actions"><span className="pill good">{fill(labels.selected, { n: include.size, total: preview.candidates.length })} · {fmt(selectedHa)} ha</span></div>
            </header>
            <div className="fsec-body">
              <MapView overlays={overlays} height={360} ariaLabel={labels.plot} onSelect={(id) => { if (id !== null && id !== "") toggle(Number(id)); }} />
              <div className="table-scroll">
                <table className="grid">
                  <thead><tr><th style={{ width: 1 }}>{labels.include}</th><th>{labels.plot}</th><th className="num">{labels.area}</th><th>{labels.problems}</th></tr></thead>
                  <tbody>
                    {preview.candidates.map((c) => (
                      <tr key={c.index} onClick={() => toggle(c.index)}>
                        <td><input className="tick" type="checkbox" aria-label={`${labels.include} ${c.name}`} checked={include.has(c.index)} onChange={() => {}} /></td>
                        <td><strong>{c.name}</strong></td>
                        <td className="num">{fmt(c.areaHa)}</td>
                        <td>{c.problems.length ? c.problems.map((p) => <span key={p} className="pill warn">{problem(p)}</span>) : <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="fsec step">
            <header className="fsec-head">
              <span className="step-n" aria-hidden>3</span>
              <div className="fsec-titles"><h2>{labels.step3}</h2><p>{labels.whatFollows}</p></div>
            </header>
            <div className="fsec-body">
              <Fields>
                <Field span={6} label={labels.village}><input name="village" required /></Field>
                <Field span={6} label={labels.status}>
                  <select name="status" defaultValue="planted">
                    {Object.entries(labels.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                {species.length > 0 && (
                  <ChoiceGroup legend={labels.species} optional={labels.optional}>
                    {species.map((sp) => <Chip key={sp.key} name="species" value={sp.key} label={<em>{sp.label}</em>} />)}
                  </ChoiceGroup>
                )}
                {canApprove && <>
                  <Field span={6} label={labels.approve_from}><input type="date" name="approveFrom" /></Field>
                  <Field span={6} label={labels.checked_against} optional={labels.optional}><input name="checkedAgainst" /></Field>
                </>}
              </Fields>
              {error && <div className="notice-tight"><Notice tone="error">{error}</Notice></div>}
              <FormFooter>
                <button className="btn" type="submit" disabled={!!busy || include.size === 0}>{busy === "commit" ? spin : <Icon name="upload" size={17} />}{busy === "commit" ? labels.saving : `${labels.commit} (${include.size})`}</button>
              </FormFooter>
            </div>
          </section>
        </form>
      )}
    </>
  );
}
