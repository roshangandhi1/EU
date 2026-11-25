import { activeOn, dailyCollections, duplicateReceipts, formatCdf, live, studentBalance } from "@eu/schools";
import { Button, Field, Form, Notice, Table } from "@/components/ui";
import { can, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { Flash, type SP } from "../../flash";
import { classLabel, studentName } from "../labels";
import { recordPayment, voidPayment } from "./actions";

export default async function Fees({ params, searchParams }: { params: Promise<{ locale: string; siteId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const d = await schoolFor(me, p.siteId);
  const date = today();
  const fc = (n: number) => formatCdf(n, locale);
  const students = new Map(d.students.map((s) => [s.id, s]));
  const classes = new Map(d.classes.map((c) => [c.id, c]));
  const active = activeOn(d.enrolments, date)
    .map((e) => ({ e, s: students.get(e.studentId), c: classes.get(e.classId) }))
    .filter((r): r is { e: typeof r.e; s: NonNullable<typeof r.s>; c: NonNullable<typeof r.c> } => !!r.s && !!r.c)
    .sort((a, b) => studentName(a.s).localeCompare(studentName(b.s)));
  const balances = active.map((r) => ({ ...r, b: studentBalance(r.s.id, r.c.level, d.feeItems, d.exemptions, d.payments, date) }));
  const arrears = balances.filter((r) => r.b.overdue > 0).sort((a, b) => b.b.overdue - a.b.overdue);
  const month = date.slice(0, 7);
  const daily = dailyCollections(d.payments, `${month}-01`, `${month}-31`).reverse();
  const dupes = [...duplicateReceipts(d.payments).keys()];
  const recent = [...d.payments].sort((a, b) => (a.paidOn < b.paidOn ? 1 : a.paidOn > b.paidOn ? -1 : b.receiptNumber - a.receiptNumber)).slice(0, 50);
  const canPay = can(me, "payment.write", p.siteId);
  const canVoid = can(me, "payment.void", p.siteId);
  const items = live(d.feeItems);

  return (
    <>
      <Flash sp={sp} tr={tr} />
      {dupes.length > 0 && <Notice tone="warning">{tr("fees.duplicates", { numbers: dupes.join(", ") })}</Notice>}
      {canPay && (
        <>
          <h2>{tr("fees.payment")}</h2>
          <Form action={recordPayment}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="siteId" value={p.siteId} />
            <Field label={tr("fees.student")}>
              <select name="studentId" required defaultValue="">
                <option value="" disabled />
                {active.map((r) => <option key={r.s.id} value={r.s.id}>{studentName(r.s)} · {r.s.studentNumber}</option>)}
              </select>
            </Field>
            <Field label={tr("fees.amount")}><input name="amount" inputMode="numeric" required pattern="[0-9 ,.]+" /></Field>
            <Field label={tr("fees.receiptNumber")}><input name="receiptNumber" inputMode="numeric" required pattern="[0-9]+" /></Field>
            <Field label={tr("fees.paidOn")}><input name="paidOn" type="date" defaultValue={date} max={date} required /></Field>
            {items.length > 0 && (
              <Field label={tr("setup.feeItems")} hint={tr("common.optional")}>
                <select name="feeItemIds" multiple size={Math.min(4, items.length)}>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name} · {fc(i.amount)}</option>)}
                </select>
              </Field>
            )}
            <Button type="submit">{tr("common.save")}</Button>
          </Form>
        </>
      )}

      <h2>{tr("fees.arrears")}</h2>
      <Table
        rows={arrears}
        rowKey={(r) => r.e.id}
        empty={tr("common.none")}
        columns={[
          { key: "name", header: tr("common.name"), render: (r) => `${studentName(r.s)} · ${r.s.studentNumber}` },
          { key: "class", header: tr("common.class"), render: (r) => classLabel(r.c, tr) },
          { key: "charged", header: tr("fees.charged"), numeric: true, render: (r) => fc(r.b.charged) },
          { key: "paid", header: tr("fees.paid"), numeric: true, render: (r) => fc(r.b.paid) },
          { key: "overdue", header: tr("fees.overdue"), numeric: true, render: (r) => fc(r.b.overdue) },
          { key: "guardian", header: tr("student.guardianPhone"), render: (r) => r.s.guardianPhone },
        ]}
      />

      <h2>{tr("fees.daily")}</h2>
      <Table
        rows={daily}
        rowKey={(r) => r.date}
        empty={tr("common.none")}
        columns={[
          { key: "date", header: tr("common.date"), render: (r) => r.date },
          { key: "count", header: tr("fees.receipts"), numeric: true, render: (r) => `${r.count} (${r.firstReceipt}–${r.lastReceipt})` },
          { key: "total", header: tr("common.total"), numeric: true, render: (r) => fc(r.total) },
        ]}
      />

      <h2>{tr("fees.recent")}</h2>
      <Table
        rows={recent}
        rowKey={(r) => r.id}
        empty={tr("common.none")}
        columns={[
          { key: "date", header: tr("common.date"), render: (r) => r.paidOn },
          { key: "receipt", header: tr("fees.receiptNumber"), numeric: true, render: (r) => r.receiptNumber },
          { key: "name", header: tr("fees.student"), render: (r) => { const s = students.get(r.studentId); return s ? studentName(s) : "—"; } },
          { key: "amount", header: tr("fees.amount"), numeric: true, render: (r) => (r.voidedAt ? <s>{fc(r.amount)}</s> : fc(r.amount)) },
          {
            key: "void",
            header: tr("common.status"),
            render: (r) =>
              r.voidedAt ? `${tr("fees.voided")}: ${r.voidReason ?? ""}` : canVoid ? (
                <form action={voidPayment} style={{ display: "flex", gap: 6 }}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="siteId" value={p.siteId} />
                  <input type="hidden" name="paymentId" value={r.id} />
                  <input name="reason" required minLength={3} placeholder={tr("fees.voidReason")} aria-label={tr("fees.voidReason")} />
                  <Button small variant="danger" type="submit">{tr("fees.void")}</Button>
                </form>
              ) : "",
          },
        ]}
      />
    </>
  );
}
