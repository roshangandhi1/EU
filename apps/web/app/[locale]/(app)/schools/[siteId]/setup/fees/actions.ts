"use server";
import { colKey, exemption, insertMutation, LEVELS, live, missingTermsForCopy, planFeeCopy, planFeeSchedule, updateMutation, voidMutation, type FeeGrid } from "@eu/schools";
import type { Mutation } from "@eu/sync";
import { revalidatePath } from "next/cache";
import { back, can, firstRejection, newId, push, schoolFor, signedIn, str } from "@/lib/schools";

async function ctx(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const yearId = str(fd, "yearId");
  const fee = str(fd, "fee");
  const q = new URLSearchParams({ year: yearId, ...(fee ? { fee } : {}) });
  const path = `/${locale}/schools/${siteId}/setup/fees?${q.toString()}`;
  if (!can(me, "school.configure", siteId)) back(path, { error: "forbidden" });
  const d = await schoolFor(me, siteId);
  const year = live(d.years).find((y) => y.id === yearId);
  if (!year) back(path, { error: "invalid" });
  return { me, locale, siteId, d, year: year!, path };
}

async function apply(me: Parameters<typeof push>[0], muts: Mutation[], locale: string, siteId: string) {
  const res = muts.length ? await push(me, muts) : [];
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  return firstRejection(res);
}

/** Whole francs only: "15 000", "15,000" and "15000" all mean 15000. */
function francs(raw: string): number | null | "bad" {
  const s = raw.replace(/[\s,.  ]/g, "");
  if (s === "") return null;
  return /^\d+$/.test(s) && Number(s) > 0 ? Number(s) : "bad";
}

/** Saves the levels × terms grid for one fee name, editing existing items in place. */
export async function saveFeeSchedule(fd: FormData) {
  const { me, locale, siteId, d, year, path } = await ctx(fd);
  const name = (str(fd, "newFee") || str(fd, "fee")).trim();
  if (!name) back(path, { error: "invalid" });
  const out = `/${locale}/schools/${siteId}/setup/fees?${new URLSearchParams({ year: year.id, fee: name })}`;
  const columns: (string | null)[] = [null, ...live(d.terms).filter((t) => t.academicYearId === year.id).sort((a, b) => a.number - b.number).map((t) => t.id)];
  const grid: FeeGrid = { amounts: new Map(), dues: new Map() };
  for (const termId of columns) {
    const c = colKey(termId);
    let any = false;
    for (const l of LEVELS) {
      const a = francs(str(fd, `amt:${c}:${l}`));
      if (a === "bad") back(out, { error: "fee_amount" });
      if (a !== null) {
        grid.amounts.set(`${c}:${l}`, a as number);
        any = true;
      }
    }
    const due = str(fd, `due:${c}`);
    if (any && !/^\d{4}-\d{2}-\d{2}$/.test(due)) back(out, { error: "fee_due" });
    if (due) grid.dues.set(c, due);
  }
  const ops = planFeeSchedule(d.feeItems, year.id, name, columns, grid);
  if (ops.length === 0) back(out, { fee_nothing: "1" });
  const muts: Mutation[] = ops.map((o) =>
    o.op === "create"
      ? insertMutation("school.fee_item", siteId, { ...o.fields }, { mutationId: newId(), recordId: newId() })
      : o.op === "update"
        ? updateMutation("school.fee_item", siteId, o.id, o.fields, newId())
        : voidMutation("school.fee_item", siteId, o.id, "Removed in the fee schedule", newId()),
  );
  const bad = await apply(me, muts, locale, siteId);
  if (bad) back(out, { error: bad });
  const n = (k: string) => String(ops.filter((o) => o.op === k).length);
  back(out, { fee_saved: `${n("create")}.${n("update")}.${n("void")}` });
}

/** Copies a year's fee items from this or another school into the shown year. */
export async function copyFees(fd: FormData) {
  const { me, locale, siteId, d, year, path } = await ctx(fd);
  const [srcSite, srcYear] = str(fd, "source").split("|");
  if (!srcSite || !srcYear || (srcSite === siteId && srcYear === year.id)) back(path, { error: "invalid" });
  if (!can(me, "school.configure", srcSite!)) back(path, { error: "forbidden" });
  const src = srcSite === siteId ? d : await schoolFor(me, srcSite!);
  const sy = live(src.years).find((y) => y.id === srcYear);
  if (!sy) back(path, { error: "invalid" });
  const source = { items: src.feeItems, terms: src.terms, yearId: sy!.id, yearStart: sy!.startsOn };
  // Terms the fees need but this year lacks are created first, with dates moved to this year.
  const newTerms = missingTermsForCopy(source, { terms: d.terms, yearId: year.id, yearStart: year.startsOn }).map((t) => ({
    id: newId(), ...t, scopeId: siteId, deviceTime: new Date().toISOString(), serverTime: null, voidedAt: null,
  }));
  const plan = planFeeCopy(source, { items: d.feeItems, terms: [...d.terms, ...newTerms], yearId: year.id, yearStart: year.startsOn });
  const used = new Set(plan.creates.map((f) => f.termId));
  const addedTerms = newTerms.filter((t) => used.has(t.id));
  const muts = [
    ...addedTerms.map(({ id, academicYearId, number, startsOn, endsOn }) =>
      insertMutation("school.term", siteId, { academicYearId, number, startsOn, endsOn }, { mutationId: newId(), recordId: id })),
    ...plan.creates.map((f) => insertMutation("school.fee_item", siteId, { ...f }, { mutationId: newId(), recordId: newId() })),
  ];
  const bad = await apply(me, muts, locale, siteId);
  if (bad) back(path, { error: bad });
  back(`/${locale}/schools/${siteId}/setup/fees?year=${year.id}`, {
    fee_copied: String(plan.creates.length),
    ...(plan.skippedNames.length ? { fee_skipped: plan.skippedNames.join(", ") } : {}),
    ...(plan.skippedNoTerm ? { fee_noterm: String(plan.skippedNoTerm) } : {}),
    ...(addedTerms.length ? { fee_terms: String(addedTerms.length) } : {}),
  });
}

/** One exemption for many pupils at once. Pupils who already have the same exemption are skipped. */
export async function bulkExempt(fd: FormData) {
  const { me, locale, siteId, d, path } = await ctx(fd);
  const ids = [...new Set(fd.getAll("studentId").map(String))].filter((id) => d.students.some((s) => s.id === id));
  if (ids.length === 0) back(path, { error: "fee_pupils" });
  const feeItemId = str(fd, "feeItemId") || null;
  const kind = str(fd, "kind");
  const value = kind === "full" ? 0 : Number(str(fd, "value").replace(/\s/g, ""));
  const reason = str(fd, "reason").trim();
  const already = new Set(live(d.exemptions).filter((e) => e.feeItemId === feeItemId && e.kind === kind && e.value === value).map((e) => e.studentId));
  const fields = (studentId: string) => ({ studentId, feeItemId, kind, value, reason });
  const todo = ids.filter((id) => !already.has(id));
  if (todo.some((id) => !exemption.safeParse(fields(id)).success) || (kind === "percent" && value > 100)) back(path, { error: "invalid" });
  const bad = await apply(me, todo.map((id) => insertMutation("school.exemption", siteId, fields(id), { mutationId: newId(), recordId: newId() })), locale, siteId);
  if (bad) back(path, { error: bad });
  back(path, { fee_exempted: String(todo.length) });
}
