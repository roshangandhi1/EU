import { activeOn, currentYear, dailyCollections, duplicateReceipts, formatCdf, live, enrolmentBalance, matchesReceipt, newestFirst, receiptLabel } from "@eu/schools";
import { t } from "@eu/core/i18n";
import Link from "next/link";
import { Field, Fields, FormFooter, Notice, RowMenu, Section, SubmitButton, Table } from "@/components/ui";
import { fmtDate, fmtMonth } from "../format";
import { can, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { Flash, param, type SP } from "../../flash";
import { PrintButton } from "../../print-button";
import { classLabel, studentName } from "../labels";
import { NotSetUp } from "../not-set-up";
import { correctPayment, voidPayment } from "./actions";
import { PayForm } from "./pay-form";
import { booksOf, suggestReceipt } from "./receipts";

export default async function Fees({ params, searchParams }: { params: Promise<{ locale: string; siteId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const C = tr("common.colon");
  const d = await schoolFor(me, p.siteId);
  const date = today();
  const fc = (n: number) => formatCdf(n, locale);
  const base = `/${locale}/schools/${p.siteId}`;
  const students = new Map(d.students.map((s) => [s.id, s]));
  const classes = new Map(d.classes.map((c) => [c.id, c]));
  const active = activeOn(d.enrolments, date, d.years)
    .map((e) => ({ e, s: students.get(e.studentId), c: classes.get(e.classId) }))
    .filter((r): r is { e: typeof r.e; s: NonNullable<typeof r.s>; c: NonNullable<typeof r.c> } => !!r.s && !!r.c && !r.s.voidedAt)
    .sort((a, b) => studentName(a.s).localeCompare(studentName(b.s)));
  // Each pupil is charged the fees of the year they are enrolled in.
  const balances = active.map((r) => ({ ...r, b: enrolmentBalance(d, r.e, date) }));
  const arrears = balances.filter((r) => r.b.overdue > 0).sort((a, b) => b.b.overdue - a.b.overdue);
  const month = /^\d{4}-\d{2}$/.test(param(sp, "month")) && param(sp, "month") <= date.slice(0, 7) ? param(sp, "month") : date.slice(0, 7);
  const daily = dailyCollections(d.payments, `${month}-01`, `${month}-31`).reverse();
  const dupes = [...duplicateReceipts(d.payments).keys()];
  const pq = param(sp, "pq").toLowerCase();
  const recent = [...d.payments]
    .filter((r) => { if (!pq) return true; const s = students.get(r.studentId); return matchesReceipt(r, pq) || (!!s && (studentName(s).toLowerCase().includes(pq) || s.studentNumber.toLowerCase().includes(pq))); })
    .sort(newestFirst)
    .slice(0, pq ? 200 : 50);
  const paperRequired = d.school?.paperReceiptRequired !== false;
  const canPay = can(me, "payment.write", p.siteId);
  const canVoid = can(me, "payment.void", p.siteId);
  const canConfigure = can(me, "school.configure", p.siteId);
  const anyReceipt = can(me, "payment.any_receipt", p.siteId);
  const year = currentYear(d, date);
  const items = live(d.feeItems).filter((i) => i.academicYearId === year?.id);
  const myBooks = booksOf(me.user.id, d.receiptBooks);
  const suggested = suggestReceipt(me.user.id, d.receiptBooks, d.payments);
  const ranges = myBooks.map((b) => `${b.firstNumber}–${b.lastNumber}`).join(", ");

  const saving = t(locale, "ui.form.saving");
  const monthTotal = daily.reduce((n, x) => n + x.total, 0);
  const monthLabel = fmtMonth(month, locale);
  const fromParams = param(sp, "ok") === "corrected" || !!param(sp, "error");
  const payKey = `${param(sp, "ok")}-${param(sp, "num")}-${param(sp, "error")}-${param(sp, "studentId")}`;
  const pl = {
    student: tr("fees.student"), pickHint: tr("pay.pickHint"), change: tr("pay.change"), searchPupil: tr("pay.search"), noMatch: tr("pay.noMatch"),
    receipt: tr("fees.paperNumber"), receiptHint: paperRequired ? (ranges ? tr("pay.yourBooks", { ranges }) : tr("ux.receiptHint")) : tr("fees.paperOptional"), paperRequired: paperRequired ? "1" : "",
    systemHint: tr("fees.systemReceiptHint"), numberError: tr("ux.numberError"),
    colon: C, paidOn: tr("fees.paidOn"), balanceNow: tr("pay.balance"), overdue: tr("fees.overdue"), amount: tr("fees.amount"), amountHint: tr("ux.amountHint"),
    amountError: tr("ux.amountError"), items: tr("setup.feeItems"), optional: tr("common.optional"), itemsHint: tr("ux.feeItemsHint"), saving, save: tr("fees.payment"),
  };
  const voidForm = (r: (typeof recent)[number], action: typeof voidPayment, title: string, hint: string, button: string) => (
    <form action={action}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="siteId" value={p.siteId} />
      <input type="hidden" name="paymentId" value={r.id} />
      <p style={{ margin: "0 0 4px", color: "var(--text)", fontWeight: 650 }}>{title}</p>
      <p style={{ margin: "0 0 10px" }}>{hint}</p>
      <Fields>
        <Field span={12} label={tr("fees.voidReason")}><input name="reason" required minLength={3} /></Field>
      </Fields>
      <FormFooter><SubmitButton small variant="danger" pending={saving}>{button}</SubmitButton></FormFooter>
    </form>
  );

  return (
    <>
      <Flash sp={sp} tr={tr} />
      {dupes.length > 0 && <Notice tone="warning">{tr("fees.duplicates", { numbers: dupes.join(", ") })}</Notice>}
      {!year && <NotSetUp me={me} siteId={p.siteId} locale={locale} what="fees" />}
      {canPay && paperRequired && myBooks.length === 0 && !anyReceipt && (
        <Notice tone="warning">
          {canConfigure ? <>{tr("pay.noBookCan")} <Link href={`${base}/setup#books`}>{tr("pay.noBookLink")}</Link></> : tr("pay.noBookAsk")}
        </Notice>
      )}
      {canPay && paperRequired && myBooks.length > 0 && suggested === null && <Notice tone="warning">{tr("pay.booksFull", { ranges })}</Notice>}
      {canPay && (
        <Section id="pay" icon="receipt" title={tr("fees.payment")} description={tr("ux.payIntro")}>
          <PayForm key={payKey} locale={locale} siteId={p.siteId} l={pl}
            pupils={balances.map((r) => ({ id: r.s.id, name: studentName(r.s), number: r.s.studentNumber, cls: classLabel(r.c, tr), level: r.c.level, balance: fc(Math.max(0, r.b.balance)), overdue: r.b.overdue > 0 ? fc(r.b.overdue) : "", owes: r.b.balance > 0 }))}
            items={items.map((i) => ({ id: i.id, name: i.name, amount: fc(i.amount), levels: i.levels }))}
            d={{
              studentId: fromParams ? param(sp, "studentId") : "", amount: fromParams ? param(sp, "amount") : "",
              receiptNumber: fromParams ? param(sp, "receiptNumber") : suggested ? String(suggested) : "",
              paidOn: param(sp, "paidOn"), today: date, items: param(sp, "items").split(",").filter(Boolean),
            }} />
        </Section>
      )}

      <div id="arrears">
        <Section flush icon="alert" title={tr("fees.arrears")} count={arrears.length} description={<span className="print-only">{d.site.name} · {fmtDate(date, locale)}</span>}
          actions={arrears.length > 0 ? <PrintButton target="arrears" label={tr("print.print")} /> : undefined}>
          <Table
            flush
            rows={arrears}
            rowKey={(r) => r.e.id}
            empty={tr("ux.noArrears")}
            emptyHint={tr("ux.noArrearsHint")}
            emptyIcon="check"
            columns={[
              { key: "name", header: tr("common.name"), render: (r) => <><Link className="row-link" href={`${base}/students/${r.s.id}#fees`}><strong>{studentName(r.s)}</strong></Link><div className="muted small">{r.s.studentNumber}</div></> },
              { key: "class", header: tr("common.class"), render: (r) => classLabel(r.c, tr) },
              { key: "charged", header: tr("fees.charged"), numeric: true, render: (r) => fc(r.b.charged) },
              { key: "paid", header: tr("fees.paid"), numeric: true, render: (r) => fc(r.b.paid) },
              { key: "overdue", header: tr("fees.overdue"), numeric: true, render: (r) => <strong className="text-bad">{fc(r.b.overdue)}</strong> },
              { key: "guardian", header: tr("student.guardianPhone"), render: (r) => r.s.guardianPhone || <span className="muted">—</span> },
            ]}
          />
        </Section>
      </div>

      <div id="daily">
        <Section flush icon="coins" title={tr("fees.daily")} description={<>{monthLabel}<span className="print-only"> · {d.site.name}</span></>}
          actions={<>
            <span className="inline-stat"><b>{fc(monthTotal)}</b></span>
            {daily.length > 0 && <PrintButton target="daily" label={tr("print.print")} />}
          </>}>
          <form method="get" className="filterbar inset no-print">
            <label className="tb-field">{tr("pay.month")}<input className="ctl" type="month" name="month" defaultValue={month} max={date.slice(0, 7)} /></label>
            <button className="btn secondary" type="submit">{tr("ux.show")}</button>
          </form>
          <Table
            flush
            rows={daily}
            rowKey={(r) => r.date}
            empty={month === date.slice(0, 7) ? tr("ux.noCollections") : tr("pay.noCollectionsMonth")}
            emptyIcon="coins"
            columns={[
              { key: "date", header: tr("common.date"), render: (r) => fmtDate(r.date, locale) },
              { key: "count", header: tr("fees.receipts"), numeric: true, render: (r) => <>{r.count} <span className="muted">({r.firstCode ? `${r.firstCode} – ${r.lastCode}` : `${r.firstReceipt}–${r.lastReceipt}`})</span></> },
              { key: "total", header: tr("common.total"), numeric: true, render: (r) => <strong>{fc(r.total)}</strong> },
            ]}
          />
        </Section>
      </div>

      <Section flush icon="receipt" title={tr("fees.recent")} count={recent.length}>
        <form method="get" className="filterbar inset no-print" role="search">
          <label className="tb-field">{tr("pay.find")}<input className="ctl" type="search" name="pq" defaultValue={param(sp, "pq")} placeholder={tr("pay.findHint")} /></label>
          <button className="btn secondary" type="submit">{tr("ux.show")}</button>
          {pq && <a className="btn ghost" href="?">{tr("ux.clear")}</a>}
        </form>
        <Table
          flush
          rows={recent}
          rowKey={(r) => r.id}
          empty={pq ? tr("pay.noFound") : tr("ux.noPayments")}
          emptyIcon="receipt"
          rowClass={(r) => (r.voidedAt ? "voided" : undefined)}
          columns={[
            { key: "name", header: tr("fees.student"), render: (r) => { const s = students.get(r.studentId); return s ? <Link className="row-link" href={`${base}/students/${s.id}#fees`}><strong>{studentName(s)}</strong></Link> : tr("pupil.removed"); } },
            { key: "date", header: tr("common.date"), render: (r) => fmtDate(r.paidOn, locale) },
            { key: "receipt", header: tr("fees.receiptCode"), render: (r) => <span className="mono">{receiptLabel(r)}</span> },
            { key: "paper", header: tr("fees.paperNumber"), numeric: true, render: (r) => (r.receiptCode && r.receiptNumber !== null ? r.receiptNumber : <span className="muted">—</span>) },
            { key: "amount", header: tr("fees.amount"), numeric: true, render: (r) => (r.voidedAt ? <s>{fc(r.amount)}</s> : <strong>{fc(r.amount)}</strong>) },
            {
              key: "void",
              header: "",
              shrink: true,
              render: (r) =>
                r.voidedAt ? <span className="pill bad" title={r.voidReason ?? ""}>{tr("fees.voided")}{r.voidReason ? `${C}${r.voidReason}` : ""}</span> : canVoid ? (
                  <span className="pay-row-actions">
                    {canPay && (
                      <RowMenu label={tr("pay.correct")} icon="wrench">
                        {voidForm(r, correctPayment, tr("pay.correctTitle", { n: receiptLabel(r) }), tr("pay.correctHint"), tr("pay.correctGo"))}
                      </RowMenu>
                    )}
                    <RowMenu label={tr("fees.void")} icon="x" tone="danger">
                      {voidForm(r, voidPayment, tr("ux.voidTitle", { n: receiptLabel(r) }), tr("ux.voidHint"), tr("fees.void"))}
                    </RowMenu>
                  </span>
                ) : null,
            },
          ]}
        />
      </Section>
    </>
  );
}
