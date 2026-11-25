"use client";
import { formatScore, readScore } from "@eu/schools/rules";
import { useMemo, useRef, useState } from "react";
import { SubmitButton } from "@/components/ui";
import { useLeaveGuard } from "@/components/ui/form";

export interface GridColumn { key: string; subject: string; period: string; title: string; sub: string; max: number }
export interface GridPupil { id: string; name: string; number: string }

/**
 * The marks entry grid: pupils down, one column per subject (or per period for one subject).
 * Enter, Tab and the arrow keys move down a column, the way a paper mark sheet is read;
 * Shift+Enter / Shift+Tab move back up. Bad values are flagged in place and block saving.
 */
export function MarksGrid({ action, hidden, pupils, columns, values, locale, l }: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  pupils: GridPupil[];
  columns: GridColumn[];
  values: Record<string, string>;
  locale: "en" | "fr";
  l: {
    pupil: string; total: string; save: string; saving: string; unsaved: string; noChanges: string; hint: string;
    errors: { format: string; step: string; range: string }; badCount: string; filled: string; absentShort: string;
  };
}) {
  const form = useRef<HTMLFormElement>(null);
  const [vals, setVals] = useState(values);
  const dirty = useMemo(() => Object.keys({ ...values, ...vals }).some((k) => (vals[k] ?? "").trim() !== (values[k] ?? "").trim()), [vals, values]);
  useLeaveGuard(dirty);
  // A click focuses and selects the cell; the mouseup that follows must not drop the selection.
  const justFocused = useRef(false);
  const cell = (pid: string, c: GridColumn) => `${pid}|${c.subject}|${c.period}`;
  const parsed = useMemo(() => {
    const out = new Map<string, ReturnType<typeof readScore>>();
    for (const p of pupils) for (const c of columns) out.set(cell(p.id, c), readScore(vals[cell(p.id, c)] ?? "", c.max));
    return out;
  }, [vals, pupils, columns]);
  const bad = [...parsed.values()].filter((v) => v.kind === "error").length;
  const filled = [...parsed.values()].filter((v) => v.kind === "score" || v.kind === "absent").length;
  const total = pupils.length * columns.length;

  const move = (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    const down = e.key === "Enter" || e.key === "Tab" || e.key === "ArrowDown";
    const up = e.key === "ArrowUp";
    if (!down && !up) return;
    const back = up || e.shiftKey;
    let r = row + (back ? -1 : 1);
    let c = col;
    if (r >= pupils.length) { r = 0; c++; }
    if (r < 0) { r = pupils.length - 1; c--; }
    if (c < 0 || c >= columns.length) {
      if (e.key === "Tab") return; // leave the grid normally
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const next = form.current?.querySelector<HTMLInputElement>(`input[data-cell="${r}:${c}"]`);
    next?.focus();
    next?.select();
  };

  const rowTotal = (pid: string) => {
    let got = 0, max = 0, any = false;
    for (const c of columns) {
      const v = parsed.get(cell(pid, c));
      if (v?.kind === "score") { got += v.value; max += c.max; any = true; }
      else if (v?.kind === "absent") { max += c.max; any = true; }
    }
    return any ? `${formatScore(got, locale)} / ${max}` : "—";
  };

  return (
    <form ref={form} action={action} onSubmit={(e) => { if (bad > 0) e.preventDefault(); }}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <p className="muted small marks-hint">{l.hint}</p>
      <div className="marks-grid-wrap">
        <table className="grid marks-grid">
          <thead>
            <tr>
              <th className="mg-pupil" scope="col">{l.pupil}</th>
              {columns.map((c) => (
                <th key={c.key} className="num mg-col" scope="col" title={c.title}>
                  <span className="mg-title">{c.title}</span>
                  <span className="mg-max">{c.sub}</span>
                </th>
              ))}
              {columns.length > 1 && <th className="num mg-total" scope="col">{l.total}</th>}
            </tr>
          </thead>
          <tbody>
            {pupils.map((p, r) => (
              <tr key={p.id}>
                <th scope="row" className="mg-pupil">
                  <span className="mg-who"><span className="mg-n">{r + 1}</span>
                  <span className="mg-name">{p.name}<span className="muted">{p.number}</span></span></span>
                </th>
                {columns.map((c, ci) => {
                  const k = cell(p.id, c);
                  const v = parsed.get(k);
                  const err = v?.kind === "error" ? l.errors[v.error].replace("{max}", String(c.max)) : undefined;
                  return (
                    <td key={c.key} className={`num${v?.kind === "absent" ? " mg-abs" : ""}`}>
                      <input
                        className="ctl num-input mg-input"
                        name={`m:${k}`}
                        data-cell={`${r}:${ci}`}
                        value={vals[k] ?? ""}
                        onChange={(e) => setVals((s) => ({ ...s, [k]: e.target.value }))}
                        onKeyDown={(e) => move(e, r, ci)}
                        onFocus={(e) => { e.target.select(); justFocused.current = true; }}
                        onMouseUp={(e) => { if (justFocused.current) e.preventDefault(); justFocused.current = false; }}
                        inputMode="decimal"
                        autoComplete="off"
                        enterKeyHint="next"
                        aria-label={`${p.name} · ${c.title} (/${c.max})`}
                        aria-invalid={err ? true : undefined}
                        title={err}
                        placeholder="·"
                      />
                      {err && <span className="mg-err" role="alert">{err}</span>}
                    </td>
                  );
                })}
                {columns.length > 1 && <td className="num mg-total">{rowTotal(p.id)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="savebar" data-dirty={dirty}>
        <span className="savebar-status"><span className="savebar-dot" aria-hidden />
          <span>
            {l.filled.replace("{n}", String(filled)).replace("{total}", String(total))}
            {bad > 0 ? <b> · {l.badCount.replace("{n}", String(bad))}</b> : dirty ? <span className="muted-on-dark"> · {l.unsaved}</span> : null}
          </span>
        </span>
        <span className="savebar-actions">
          <SubmitButton variant="lime" icon="check" pending={l.saving} disabled={bad > 0}>{l.save}</SubmitButton>
        </span>
      </div>
    </form>
  );
}
