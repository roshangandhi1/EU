"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Field, Fields, FormFooter, Notice } from "@/components/ui";
import { decodeCsv, problemsCsv } from "@/lib/csv-text";
import { commitImport, previewImport, type Preview, type PreviewRow } from "./actions";

/** Pupils saved per server call (the same as IMPORT_CHUNK on the server). */
const CHUNK = 25;

type L = Record<string, any>;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const fmtDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

type Step = "choose" | "preview" | "saving" | "done";
type Filter = "all" | "problems" | "ready";

interface Outcome { imported: number; already: number; notImported: { cells: string[]; reason: string }[]; failed?: string }

export function ImportWizard({ locale, siteId, base, today, defaultDate, classes, yearId, l }: {
  locale: string; siteId: string; base: string; today: string; defaultDate: string; yearId: string;
  classes: { id: string; yearId: string; label: string; code: string }[]; l: L;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [defaultClassId, setDefaultClassId] = useState("");
  const [defaultEnrolledOn, setDefaultEnrolledOn] = useState(defaultDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [encoding, setEncoding] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [anyway, setAnyway] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [progress, setProgress] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const importKey = useRef("");
  const thisYear = classes.filter((c) => c.yearId === yearId);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setError(""); setPreview(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // An .xlsx workbook is a zip file: "PK" at the start.
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) { setError(l.notCsv); return; }
      const { text, encoding: enc } = decodeCsv(bytes);
      setEncoding(enc === "utf-8" ? "UTF-8" : "Windows-1252 (Latin-1)");
      const p = await previewImport({ locale, siteId, text, defaultClassId, defaultEnrolledOn });
      if (p.error) { setError(p.error); return; }
      if (p.missing.length) { setError(fill(l.missing, { fields: p.missing.join(", ") })); return; }
      importKey.current = crypto.randomUUID();
      setAnyway(new Set());
      setFilter(p.rows.some((r) => r.status !== "ready") ? "problems" : "all");
      setPreview(p);
      setStep("preview");
    } catch {
      setError(l.readError);
    } finally {
      setBusy(false);
    }
  }

  const toSave = useMemo(() => (preview?.rows ?? []).filter((r) => r.pupil && (r.status === "ready" || (r.status === "duplicate" && anyway.has(r.line)))), [preview, anyway]);

  async function run() {
    if (!preview) return;
    setStep("saving"); setProgress(0);
    const out: Outcome = { imported: 0, already: 0, notImported: [] };
    const byLine = new Map(preview.rows.map((r) => [r.line, r]));
    for (const r of preview.rows) {
      if (r.status === "error") out.notImported.push({ cells: r.cells, reason: r.problems.join(" ") });
      else if (r.status === "duplicate" && !anyway.has(r.line)) out.notImported.push({ cells: r.cells, reason: fill(l.dupeOf, { who: who(r) }) });
    }
    for (let i = 0; i < toSave.length; i += CHUNK) {
      const chunk = toSave.slice(i, i + CHUNK);
      let res;
      try {
        res = await commitImport({ locale, siteId, importKey: importKey.current, rows: chunk.map((r) => ({ line: r.line, pupil: r.pupil! })) });
      } catch {
        res = { error: l.readError, imported: 0, already: 0, skipped: [] };
      }
      out.imported += res.imported; out.already += res.already;
      for (const s of res.skipped) out.notImported.push({ cells: byLine.get(s.line)?.cells ?? [], reason: s.reason });
      if (res.error) {
        out.failed = res.error;
        for (const r of toSave.slice(i)) out.notImported.push({ cells: r.cells, reason: res.error });
        break;
      }
      setProgress(Math.min(toSave.length, i + chunk.length));
    }
    setOutcome(out);
    setStep("done");
  }

  function who(r: PreviewRow) {
    return r.matches.map((m) => (m.startsWith("#") ? fill(l.dupeLine, { n: m.slice(1) }) : m)).join(", ");
  }

  function downloadProblems() {
    if (!preview || !outcome) return;
    const csv = problemsCsv(preview.headers, outcome.notImported, preview.delimiter, l.reasonHeader);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = (file?.name.replace(/\.[^.]+$/, "") || "pupils") + (locale === "fr" ? "-non-importes.csv" : "-not-imported.csv");
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function reset() {
    setStep("choose"); setPreview(null); setOutcome(null); setFile(null); setError("");
  }

  const spin = <span className="spinner" aria-hidden />;

  if (step === "done" && outcome) {
    const n = outcome.imported;
    return (
      <section className="fsec" role="status" aria-live="polite">
        <header className="fsec-head">
          <span className="fsec-icon" aria-hidden><Icon name={outcome.failed ? "alert" : "check"} size={19} /></span>
          <div className="fsec-titles">
            <h2>{n === 0 ? l.doneNone : n === 1 ? l.doneOne : fill(l.done, { n })}</h2>
            {outcome.notImported.length > 0 && <p>{fill(l.notImported, { n: outcome.notImported.length })}</p>}
          </div>
        </header>
        <div className="fsec-body">
          {outcome.failed && <div className="notice-tight"><Notice tone="error">{fill(l.failed, { reason: outcome.failed, n })}</Notice></div>}
          {n > 0 && <p className="muted small">{l.syncNote}</p>}
          <FormFooter>
            {outcome.notImported.length > 0 && <button type="button" className="btn secondary" onClick={downloadProblems}><Icon name="download" size={17} />{l.downloadProblems}</button>}
            <button type="button" className="btn secondary" onClick={reset}><Icon name="upload" size={17} />{l.again}</button>
            <Link className="btn" href={base}><Icon name="users" size={17} />{l.toList}</Link>
          </FormFooter>
        </div>
      </section>
    );
  }

  if (step === "saving") {
    const n = toSave.length;
    return (
      <section className="fsec" role="status" aria-live="polite">
        <header className="fsec-head">
          <span className="fsec-icon" aria-hidden>{spin}</span>
          <div className="fsec-titles"><h2>{fill(l.saving, { done: progress, n })}</h2><p>{l.savingKeep}</p></div>
        </header>
        <div className="fsec-body">
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={progress}><span style={{ width: `${n ? (progress / n) * 100 : 0}%` }} /></div>
        </div>
      </section>
    );
  }

  if (step === "preview" && preview) {
    const counts = { ready: 0, duplicate: 0, error: 0 };
    for (const r of preview.rows) counts[r.status]++;
    const shown = preview.rows.filter((r) => (filter === "all" ? true : filter === "ready" ? r.status === "ready" : r.status !== "ready"));
    const n = toSave.length;
    return (
      <section className="fsec step flush pimport">
        <header className="fsec-head">
          <span className="step-n" aria-hidden>2</span>
          <div className="fsec-titles">
            <h2>{l.step2}</h2>
            <p>{file?.name} · {fill(l.encoding, { enc: encoding, sep: preview.delimiter === "\t" ? "tab" : preview.delimiter })}</p>
          </div>
          <div className="fsec-actions pimport-sum">
            <span className="pill good">{fill(l.summaryReady, { n: counts.ready })}</span>
            {counts.duplicate > 0 && <span className="pill warn">{counts.duplicate === 1 ? l.summaryDupesOne : fill(l.summaryDupes, { n: counts.duplicate })}</span>}
            {counts.error > 0 && <span className="pill bad">{fill(l.summaryErrors, { n: counts.error })}</span>}
          </div>
        </header>
        <div className="fsec-body">
          {(preview.ignored.length > 0 || preview.examples > 0 || preview.tooMany) && (
            <div className="notice-tight">
              <Notice tone={preview.tooMany ? "warning" : "info"}>
                {[preview.tooMany && l.tooMany, preview.ignored.length > 0 && fill(l.ignored, { cols: preview.ignored.join(", ") }), preview.examples > 0 && (preview.examples === 1 ? l.examplesOne : fill(l.examples, { n: preview.examples }))].filter(Boolean).join(" ")}
              </Notice>
            </div>
          )}
          {counts.error > 0 && <div className="notice-tight"><Notice tone="error">{l.errorsSkip}</Notice></div>}
          {counts.duplicate > 0 && <div className="notice-tight"><Notice tone="warning">{l.dupesSkip}</Notice></div>}
          <div className="seg pimport-filter" role="group">
            {(["all", "problems", "ready"] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? l.showAll : f === "problems" ? l.showProblems : l.showReady}
                <span className="seg-n">{f === "all" ? preview.rows.length : f === "ready" ? counts.ready : counts.duplicate + counts.error}</span>
              </button>
            ))}
          </div>
          <div className="table-scroll">
            <table className="grid pimport-table">
              <thead><tr><th className="num">{l.line}</th><th>{l.pupil}</th><th>{l.sex}</th><th>{l.born}</th><th>{l.class}</th><th>{l.check2}</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.line} className={`pi-${r.status}`}>
                    <td className="num muted">{r.line}</td>
                    <td><strong>{r.name || <span className="muted">—</span>}</strong></td>
                    <td>{r.sex === "F" ? "F" : r.sex === "M" ? (locale === "fr" ? "G" : "B") : <span className="muted">—</span>}</td>
                    <td>{r.birth ? fmtDate(r.birth) : <span className="muted">—</span>}</td>
                    <td>{r.classLabel || <span className="muted">—</span>}</td>
                    <td className="pi-check">
                      {r.status === "ready" && <span className="pill good"><Icon name="check" size={13} />{l.ok}</span>}
                      {r.status === "error" && <ul className="pi-problems">{r.problems.map((p) => <li key={p}><Icon name="alert" size={14} />{p}</li>)}</ul>}
                      {r.status === "duplicate" && (
                        <>
                          <div className="pi-dupe"><Icon name="users" size={14} />{fill(l.dupeOf, { who: who(r) })}</div>
                          <label className="check-row pi-anyway">
                            <input type="checkbox" checked={anyway.has(r.line)} onChange={(e) => { const s = new Set(anyway); if (e.target.checked) s.add(r.line); else s.delete(r.line); setAnyway(s); }} />
                            <span>{l.importAnyway}</span>
                          </label>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="savebar pimport-bar">
            <button type="button" className="btn secondary" onClick={() => { setStep("choose"); setFile(null); }}><Icon name="back" size={16} />{l.other}</button>
            <button type="button" className="btn" disabled={n === 0} onClick={run}><Icon name="check" size={17} />{n === 0 ? l.nothing : n === 1 ? l.importOne : fill(l.importN, { n })}</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <p className="muted bulk-intro">{l.intro}</p>
      <section className="fsec step">
        <header className="fsec-head">
          <span className="step-n" aria-hidden>1</span>
          <div className="fsec-titles"><h2>{l.step1}</h2><p>{l.templateHint}</p></div>
        </header>
        <div className="fsec-body">
          <div className="pimport-templates">
            <a className="btn secondary" href={`${base}/import/template?lang=fr`} download><Icon name="download" size={17} />{l.templateFr}</a>
            <a className="btn secondary" href={`${base}/import/template?lang=en`} download><Icon name="download" size={17} />{l.templateEn}</a>
          </div>
          <ul className="pimport-tips">
            <li>{l.required}</li>
            <li>{l.saveAs}</li>
            <li>{l.phoneTip}</li>
          </ul>
          <div className="pimport-codes">
            {thisYear.length ? <><span className="muted small">{l.classCodes}</span> {thisYear.map((c) => <code key={c.id} title={c.label}>{c.code}</code>)}</> : <span className="muted small">{l.noClasses}</span>}
          </div>
          <form onSubmit={check}>
            <Fields>
              <Field span={12} label={l.file} hint={l.fileHint}>
                <input type="file" required accept=".csv,.txt,text/csv,text/plain" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(""); }} />
              </Field>
              <Field span={6} label={l.defaultClass} hint={l.defaultClassHint}>
                <select value={defaultClassId} onChange={(e) => setDefaultClassId(e.target.value)}>
                  <option value="">{l.defaultClassNone}</option>
                  {thisYear.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>
              <Field span={6} label={l.defaultDate} hint={l.defaultDateHint}>
                <input type="date" value={defaultEnrolledOn} max={today} onChange={(e) => setDefaultEnrolledOn(e.target.value)} />
              </Field>
            </Fields>
            {error && <div className="notice-tight"><Notice tone="error">{error}</Notice></div>}
            <FormFooter>
              <button className="btn" disabled={!file || busy}>{busy ? spin : <Icon name="search" size={17} />}{busy ? l.checking : l.check}</button>
            </FormFooter>
          </form>
        </div>
      </section>
    </>
  );
}
