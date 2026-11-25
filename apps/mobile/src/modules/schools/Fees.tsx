import { activeOn, checkReceiptNumber, formatCdf, normaliseName, studentBalance, type Student } from "@eu/schools/mobile";
import { useContext, useState } from "react";
import { LocaleContext, useT } from "../../i18n";
import type { Session } from "../../session";
import { BackBar, Body, Button, Field, Title } from "../../ui";
import { live, studentName, today, type Local, type SchoolData } from "./data";
import { Row, Scroll } from "./parts";

/** Record a cash payment against a paper receipt, and show the pupil's balance. */
export function Fees({ session, data, onBack }: { session: Session; data: SchoolData; onBack: () => void }) {
  const t = useT();
  const { locale } = useContext(LocaleContext);
  const date = today();
  const [q, setQ] = useState("");
  const [student, setStudent] = useState<Local<Student> | null>(null);
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState("");
  const [msg, setMsg] = useState<{ tone: "good" | "critical"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const enrolled = activeOn(data.enrolments, date);
  const classes = new Map(data.classes.map((c) => [c.id, c]));
  const levelOf = (id: string) => classes.get(enrolled.find((e) => e.studentId === id)?.classId ?? "")?.level ?? 0;
  const ids = new Set(enrolled.map((e) => e.studentId));
  const n = normaliseName(q);
  const found = n.length >= 2 ? live(data.students).filter((s) => ids.has(s.id) && (normaliseName(studentName(s)).includes(n) || s.studentNumber.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 20) : [];

  const fmt = (v: number) => formatCdf(v, locale);
  const bal = student ? studentBalance(student.id, levelOf(student.id), data.feeItems, data.exemptions, data.payments, date) : null;
  const mine = student ? data.payments.filter((p) => p.studentId === student.id).sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1)) : [];

  const save = async () => {
    if (!student || !session.user) return;
    const a = Number(amount), r = Number(receipt);
    if (!Number.isInteger(a) || a <= 0 || !Number.isInteger(r) || r <= 0) return setMsg({ tone: "critical", text: t("schools.common.invalid") });
    const problem = checkReceiptNumber(r, session.user.id, data.receiptBooks, data.payments);
    if (problem) return setMsg({ tone: "critical", text: t(problem === "already_used" ? "schools.fees.alreadyUsed" : "schools.fees.notInBook") });
    setBusy(true);
    await session.client.create("school.payment", data.school.siteId, { studentId: student.id, paidOn: date, amount: a, receiptNumber: r, feeItemIds: [] });
    await session.refreshCounts();
    void session.syncNow();
    setBusy(false);
    setAmount("");
    setReceipt("");
    setMsg({ tone: "good", text: t("schools.mobile.savedOffline") });
  };

  return (
    <Scroll>
      <BackBar label={t("schools.mobile.back")} onBack={onBack} />
      <Title>{t("schools.fees.payment")}</Title>
      {!student ? (
        <>
          <Field label={t("schools.mobile.pickStudent")} value={q} onChangeText={setQ} autoCorrect={false} placeholder={t("schools.student.search")} />
          {found.map((s) => <Row key={s.id} title={studentName(s)} detail={s.studentNumber} onPress={() => { setStudent(s); setMsg(null); }} />)}
        </>
      ) : (
        <>
          <Row title={studentName(student)} detail={student.studentNumber} right="✕" onRightPress={() => { setStudent(null); setMsg(null); }} />
          {bal && <Body tone={bal.overdue > 0 ? "warning" : "muted"}>{t("schools.mobile.balanceNow", { amount: fmt(bal.balance) })}{bal.overdue > 0 ? ` · ${t("schools.fees.overdue")}: ${fmt(bal.overdue)}` : ""}</Body>}
          <Field label={t("schools.fees.amount")} value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, ""))} keyboardType="number-pad" />
          <Field label={t("schools.fees.receiptNumber")} value={receipt} onChangeText={(v) => setReceipt(v.replace(/\D/g, ""))} keyboardType="number-pad" />
          {msg && <Body tone={msg.tone}>{msg.text}</Body>}
          <Button label={t("schools.common.save")} onPress={() => void save()} disabled={busy || !amount || !receipt} />
          {mine.slice(0, 10).map((p) => (
            <Row key={p.id} title={`${p.paidOn} · ${fmt(p.amount)}`} detail={`${t("schools.fees.receipts")} ${p.receiptNumber}${p.voidedAt ? ` · ${t("schools.fees.voided")}` : ""}${p.pending ? ` · ${t("schools.mobile.pending")}` : ""}`} />
          ))}
        </>
      )}
    </Scroll>
  );
}
