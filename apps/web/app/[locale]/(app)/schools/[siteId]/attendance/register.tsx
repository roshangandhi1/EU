"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { SubmitButton } from "@/components/ui";
import { useNavGuard } from "../../guard";

export interface RegisterPupil { id: string; name: string; number: string; absent: boolean; reason: string }

/**
 * The register as a list of pupils, each one tap from present to absent (as on the phone).
 * Absent pupils get reason chips; the save bar keeps the count in view.
 */
export function Register({ pupils, reasons, hidden, l }: {
  pupils: RegisterPupil[];
  reasons: { key: string; label: string }[];
  hidden: Record<string, string>;
  l: { present: string; absent: string; reason: string; save: string; saving: string; count: string; allPresent: string; markAll: string; hint: string; unsaved: string; leave: string };
}) {
  const [absent, setAbsent] = useState(() => new Map(pupils.filter((p) => p.absent).map((p) => [p.id, p.reason])));
  const [dirty, setDirty] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  // Leaving with taps not yet saved asks first (another day, another class, another tab).
  useNavGuard(dirty, l.leave, () => ref.current?.closest("form") ?? null);
  useEffect(() => {
    const f = ref.current?.closest("form");
    const saved = () => setDirty(false);
    f?.addEventListener("submit", saved);
    return () => f?.removeEventListener("submit", saved);
  }, []);
  const toggle = (id: string) => {
    const next = new Map(absent);
    if (next.has(id)) next.delete(id); else next.set(id, "unknown");
    setAbsent(next); setDirty(true);
  };
  const setReason = (id: string, r: string) => { const next = new Map(absent); next.set(id, r); setAbsent(next); setDirty(true); };
  const nAbsent = absent.size;
  return (
    <>
      <span ref={ref} hidden />
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <p className="muted small" style={{ margin: "0 20px 12px" }}>{l.hint}</p>
      <ul className="register">
        {pupils.map((p) => {
          const isAbsent = absent.has(p.id);
          return (
            <li key={p.id} className={isAbsent ? "absent" : undefined}>
              <button type="button" className="reg-toggle" aria-pressed={isAbsent} onClick={() => toggle(p.id)}>
                <span className="reg-mark" aria-hidden><Icon name={isAbsent ? "x" : "check"} size={18} /></span>
                <span className="reg-name"><strong>{p.name}</strong><span>{p.number}</span></span>
                <span className="reg-state">{isAbsent ? l.absent : l.present}</span>
              </button>
              {isAbsent && (
                <span className="reg-reasons" role="radiogroup" aria-label={`${l.reason}: ${p.name}`}>
                  {reasons.map((r) => (
                    <button key={r.key} type="button" role="radio" aria-checked={absent.get(p.id) === r.key} className="reason-chip" onClick={() => setReason(p.id, r.key)}>{r.label}</button>
                  ))}
                </span>
              )}
              {isAbsent && <><input type="hidden" name="absent" value={p.id} /><input type="hidden" name={`reason-${p.id}`} value={absent.get(p.id)} /></>}
            </li>
          );
        })}
      </ul>
      <div className="savebar" data-dirty={dirty}>
        <span className="savebar-status"><span className="savebar-dot" aria-hidden />
          <span>{nAbsent === 0 ? l.allPresent : l.count.replace("{absent}", String(nAbsent)).replace("{present}", String(pupils.length - nAbsent))}{dirty && <span className="muted-on-dark"> · {l.unsaved}</span>}</span>
        </span>
        <span className="savebar-actions">
          {nAbsent > 0 && <button type="button" className="btn ghost" onClick={() => { setAbsent(new Map()); setDirty(true); }}>{l.markAll}</button>}
          <SubmitButton variant="lime" icon="check" pending={l.saving}>{l.save}</SubmitButton>
        </span>
      </div>
    </>
  );
}

/** The register for someone who may read but not take it: who was absent, and why. */
export function RegisterView({ pupils, l }: { pupils: (RegisterPupil & { reasonLabel: string })[]; l: { present: string; absent: string; notTaken?: string } }) {
  return (
    <ul className="register readonly">
      {pupils.map((p) => (
        <li key={p.id} className={p.absent ? "absent" : undefined}>
          <span className="reg-toggle">
            <span className="reg-mark" aria-hidden><Icon name={p.absent ? "x" : "check"} size={18} /></span>
            <span className="reg-name"><strong>{p.name}</strong><span>{p.number}</span></span>
            <span className="reg-state">{p.absent ? `${l.absent} · ${p.reasonLabel}` : l.notTaken ?? l.present}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
