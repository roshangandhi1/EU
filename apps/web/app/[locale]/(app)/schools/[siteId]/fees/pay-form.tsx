"use client";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Chip, ChoiceGroup, Field, Fields, FormFooter, SubmitButton } from "@/components/ui";
import { recordPayment } from "./actions";

export interface PayPupil { id: string; name: string; number: string; cls: string; level: number; balance: string; overdue: string; owes: boolean }
export interface PayItem { id: string; name: string; amount: string; levels: number[] }

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Record a payment from a paper receipt. The pupil is found by typing part of a name or the
 * student number; once chosen, the pupil's balance shows and the fee chips narrow to their level.
 */
export function PayForm({ locale, siteId, pupils, items, d, l }: {
  locale: string; siteId: string; pupils: PayPupil[]; items: PayItem[];
  d: { studentId: string; amount: string; receiptNumber: string; paidOn: string; today: string; items: string[] };
  l: Record<string, string>;
}) {
  const [picked, setPicked] = useState<PayPupil | null>(() => pupils.find((p) => p.id === d.studentId) ?? null);
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return [];
    return pupils.filter((p) => norm(`${p.name} ${p.number}`).includes(n)).slice(0, 8);
  }, [q, pupils]);
  const shown = picked ? items.filter((i) => i.levels.includes(picked.level)) : items;

  return (
    <form action={recordPayment} onSubmit={(e) => {
      if (picked) return;
      // No pupil chosen yet: say so on the search box instead of sending an incomplete payment.
      e.preventDefault();
      const box = e.currentTarget.querySelector<HTMLInputElement>(".pay-search input");
      box?.setCustomValidity(l.pickHint!);
      box?.reportValidity();
    }}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="studentId" value={picked?.id ?? ""} />
      <Fields>
        <Field span={6} label={l.student!} hint={picked ? undefined : l.pickHint}>
          {picked ? (
            <span className="pay-picked">
              <span className="pay-picked-name"><strong>{picked.name}</strong><span className="muted small">{picked.number} · {picked.cls}</span></span>
              <button type="button" className="btn ghost sm" onClick={() => { setPicked(null); setQ(""); }}>{l.change}</button>
            </span>
          ) : (
            <span className="pay-search">
              <input type="search" value={q} onChange={(e) => { e.target.setCustomValidity(""); setQ(e.target.value); }} placeholder={l.searchPupil} autoComplete="off"
                aria-autocomplete="list" aria-controls="pay-matches" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (matches[0]) setPicked(matches[0]); } }} />
              {q.trim() && (
                <ul id="pay-matches" className="pay-matches" role="listbox">
                  {matches.length === 0 ? <li className="muted">{l.noMatch}</li> : matches.map((p) => (
                    <li key={p.id} role="option" aria-selected={false}>
                      <button type="button" onClick={() => setPicked(p)}><strong>{p.name}</strong><span className="muted small">{p.number} · {p.cls}</span></button>
                    </li>
                  ))}
                </ul>
              )}
            </span>
          )}
        </Field>
        <Field span={3} label={l.receipt!} hint={l.receiptHint} error={l.numberError} optional={l.paperRequired ? undefined : l.optional}>
          <input name="receiptNumber" inputMode="numeric" required={!!l.paperRequired} pattern="[0-9]+" className="num-input" defaultValue={d.receiptNumber} />
        </Field>
        <Field span={3} label={l.paidOn!}><input name="paidOn" type="date" defaultValue={d.paidOn || d.today} max={d.today} required /></Field>
        {picked && (
          <div className={picked.owes ? "pay-balance owes" : "pay-balance"} role="status">
            <Icon name={picked.owes ? "alert" : "check"} size={16} />
            <span>{l.balanceNow!.replace("{amount}", picked.balance)}{picked.overdue ? ` · ${l.overdue}${l.colon}${picked.overdue}` : ""}</span>
          </div>
        )}
        <Field span={4} label={l.amount!} hint={l.amountHint} error={l.amountError}>
          <input name="amount" inputMode="numeric" required pattern="[0-9 ,.]+" className="num-input" defaultValue={d.amount} />
        </Field>
        {shown.length > 0 && (
          <ChoiceGroup span={8} legend={l.items!} optional={l.optional} hint={l.itemsHint}>
            {shown.map((i) => <Chip key={i.id} name="feeItemIds" value={i.id} label={i.name} sub={i.amount} defaultChecked={d.items.includes(i.id)} />)}
          </ChoiceGroup>
        )}
      </Fields>
      <FormFooter><span className="muted small">{l.systemHint}</span><SubmitButton icon="check" pending={l.saving}>{l.save}</SubmitButton></FormFooter>
    </form>
  );
}
