import { activeOn, dailyCollections, duplicateReceipts, formatCdf, live, studentBalance } from "@eu/schools";
import { t } from "@eu/core/i18n";
import { Chip, ChoiceGroup, Field, Fields, FormFooter, Notice, RowMenu, Section, SubmitButton, Table } from "@/components/ui";
import { fmtDate } from "../format";
import { can, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { Flash, param, type SP } from "../../flash";
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

  const saving = t(locale, "ui.form.saving");
  const monthTotal = daily.reduce((n, x) => n + x.total, 0);

  return (
    <>
      <Flash sp={sp} tr={tr} />
      {dupes.length > 0 && <Notice tone="warning">{tr("fees.duplicates", { numbers: dupes.join(", ") })}</Notice>}
      {canPay && (
        <Section id="pay" icon="receipt" title={tr("fees.payment")} description={tr("ux.payIntro")}>
          <form action={recordPayment}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="siteId" value={p.siteId} />
            <Fields>
              <Field span={6} label={tr("fees.student")}>
                <select name="studentId" required defaultValue={param(sp, "studentId")}>
                  <option value="" disabled>—</option>
                  {active.map((r) => <option key={r.s.id} value={r.s.id}>{studentName(r.s)} · {r.s.studentNumber} · {classLabel(r.c, tr)}</option>)}
                </select>
              </Field>
              <Field span={3} label={tr("fees.receiptNumber")} hint={tr("ux.receiptHint")} error={tr("ux.numberError")}><input name="receiptNumber" inputMode="numeric" required pattern="[0-9]+" className="num-input" defaultValue={param(sp, "receiptNumber")} /></Field>
              <Field span={3} label={tr("fees.paidOn")}><input name="paidOn" type="date" defaultValue={param(sp, "paidOn") || date} max={date} required /></Field>
              <Field span={4} label={tr("fees.amount")} hint={tr("ux.amountHint")} error={tr("ux.amountError")}><input name="amount" inputMode="numeric" required pattern="[0-9 ,.]+" className="num-input" defaultValue={param(sp, "amount")} /></Field>
              {items.length > 0 && (
                <ChoiceGroup span={8} legend={tr("setup.feeItems")} optional={tr("common.optional")} hint={tr("ux.feeItemsHint")}>
                  {items.map((i) => <Chip key={i.id} name="feeItemIds" value={i.id} label={i.name} sub={fc(i.amount)} />)}
                </ChoiceGroup>
              )}
            </Fields>
            <FormFooter><SubmitButton icon="check" pending={saving}>{tr("fees.payment")}</SubmitButton></FormFooter>
          </form>
        </Section>
      )}

      <Section flush icon="alert" title={tr("fees.arrears")} count={arrears.length}>
        <Table
          flush
          rows={arrears}
          rowKey={(r) => r.e.id}
          empty={tr("ux.noArrears")}
          emptyHint={tr("ux.noArrearsHint")}
          emptyIcon="check"
          columns={[
            { key: "name", header: tr("common.name"), render: (r) => <><strong>{studentName(r.s)}</strong><div className="muted small">{r.s.studentNumber}</div></> },
            { key: "class", header: tr("common.class"), render: (r) => classLabel(r.c, tr) },
            { key: "charged", header: tr("fees.charged"), numeric: true, render: (r) => fc(r.b.charged) },
            { key: "paid", header: tr("fees.paid"), numeric: true, render: (r) => fc(r.b.paid) },
            { key: "overdue", header: tr("fees.overdue"), numeric: true, render: (r) => <strong className="text-bad">{fc(r.b.overdue)}</strong> },
            { key: "guardian", header: tr("student.guardianPhone"), render: (r) => r.s.guardianPhone || <span className="muted">—</span> },
          ]}
        />
      </Section>

      <Section flush icon="coins" title={tr("fees.daily")} actions={<span className="inline-stat"><b>{fc(monthTotal)}</b></span>}>
        <Table
          flush
          rows={daily}
          rowKey={(r) => r.date}
          empty={tr("ux.noCollections")}
          emptyIcon="coins"
          columns={[
            { key: "date", header: tr("common.date"), render: (r) => fmtDate(r.date, locale) },
            { key: "count", header: tr("fees.receipts"), numeric: true, render: (r) => <>{r.count} <span className="muted">({r.firstReceipt}–{r.lastReceipt})</span></> },
            { key: "total", header: tr("common.total"), numeric: true, render: (r) => <strong>{fc(r.total)}</strong> },
          ]}
        />
      </Section>

      <Section flush icon="receipt" title={tr("fees.recent")} count={recent.length}>
        <Table
          flush
          rows={recent}
          rowKey={(r) => r.id}
          empty={tr("ux.noPayments")}
          emptyIcon="receipt"
          rowClass={(r) => (r.voidedAt ? "voided" : undefined)}
          columns={[
            { key: "name", header: tr("fees.student"), render: (r) => { const s = students.get(r.studentId); return s ? <strong>{studentName(s)}</strong> : "—"; } },
            { key: "date", header: tr("common.date"), render: (r) => fmtDate(r.paidOn, locale) },
            { key: "receipt", header: tr("fees.receiptNumber"), numeric: true, render: (r) => r.receiptNumber },
            { key: "amount", header: tr("fees.amount"), numeric: true, render: (r) => (r.voidedAt ? <s>{fc(r.amount)}</s> : <strong>{fc(r.amount)}</strong>) },
            {
              key: "void",
              header: "",
              shrink: true,
              render: (r) =>
                r.voidedAt ? <span className="pill bad" title={r.voidReason ?? ""}>{tr("fees.voided")}{r.voidReason ? `: ${r.voidReason}` : ""}</span> : canVoid ? (
                  <RowMenu label={tr("fees.void")} icon="x" tone="danger">
                    <form action={voidPayment}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="siteId" value={p.siteId} />
                      <input type="hidden" name="paymentId" value={r.id} />
                      <p style={{ margin: "0 0 4px", color: "var(--text)", fontWeight: 650 }}>{tr("ux.voidTitle", { n: r.receiptNumber })}</p>
                      <p style={{ margin: "0 0 10px" }}>{tr("ux.voidHint")}</p>
                      <Fields>
                        <Field span={12} label={tr("fees.voidReason")}><input name="reason" required minLength={3} /></Field>
                      </Fields>
                      <FormFooter><SubmitButton small variant="danger" pending={saving}>{tr("fees.void")}</SubmitButton></FormFooter>
                    </form>
                  </RowMenu>
                ) : null,
            },
          ]}
        />
      </Section>
    </>
  );
}
