"use client";
import { useEffect, useState } from "react";

/**
 * A search box that hides the rows of table `#target` whose `data-q` text does not contain what is
 * typed (case and accents ignored). Keeps server-rendered rows and forms untouched.
 */
export function RowFilter({ target, placeholder, noMatch, shown }: { target: string; placeholder: string; noMatch: string; shown: string }) {
  const [q, setQ] = useState("");
  const [count, setCount] = useState<{ n: number; total: number } | null>(null);
  useEffect(() => {
    const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
    const needle = fold(q.trim());
    const rows = Array.from(document.querySelectorAll<HTMLElement>(`#${target} [data-q]`));
    let n = 0;
    for (const r of rows) {
      const hit = !needle || fold(r.dataset.q ?? "").includes(needle);
      r.hidden = !hit;
      if (hit) n++;
    }
    setCount({ n, total: rows.length });
  }, [q, target]);
  return (
    <div className="list-tools">
      <input className="ctl search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {count && q && <span className="list-count" role="status">{count.n === 0 ? noMatch : shown.replace("{n}", String(count.n)).replace("{total}", String(count.total))}</span>}
    </div>
  );
}
