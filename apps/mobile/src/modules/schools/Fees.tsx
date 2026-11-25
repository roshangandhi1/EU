import { activeOn, checkReceiptNumber, formatCdf, normaliseName, studentBalance, type Student } from "@eu/schools/mobile";
import { useContext, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { LocaleContext, useT } from "../../i18n";
import type { Session } from "../../session";
import { Avatar, Button, Card, Field, Header, IconBadge, ListGroup, ListRow, Notice, Page, Stat, StatusChip, Toast, Txt, useDateLabel } from "../../ui";
import { colors } from "@eu/core/tokens";
import { live, studentName, today, type Local, type SchoolData } from "./data";
import { ACCENT, classLabel, nextReceipt } from "./parts";

/** Record a cash payment against a paper receipt, and show the pupil's balance. */
export function Fees({ session, data, onBack }: { session: Session; data: SchoolData; onBack: () => void }) {
  const t = useT();
  const { locale } = useContext(LocaleContext);
  const dateLabel = useDateLabel();
  const date = today();
  const [q, setQ] = useState("");
  const [student, setStudent] = useState<Local<Student> | null>(null);
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enrolled = activeOn(data.enrolments, date);
  const classes = new Map(data.classes.map((c) => [c.id, c]));
  const shifts = new Set(live(data.classes).map((c) => c.shift)).size;
  const classOf = (id: string) => classes.get(enrolled.find((e) => e.studentId === id)?.classId ?? "");
  const levelOf = (id: string) => classOf(id)?.level ?? 0;
  const ids = new Set(enrolled.map((e) => e.studentId));
  const n = normaliseName(q);
  const found = n.length >= 2 ? live(data.students).filter((s) => ids.has(s.id) && (normaliseName(studentName(s)).includes(n) || s.studentNumber.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 20) : [];

  const fmt = (v: number) => formatCdf(v, locale);
  const balOf = (id: string) => studentBalance(id, levelOf(id), data.feeItems, data.exemptions, data.payments, date);
  const bal = student ? balOf(student.id) : null;
  const mine = student ? data.payments.filter((p) => p.studentId === student.id).sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1)) : [];
  const next = session.user ? nextReceipt(session.user.id, data.receiptBooks, data.payments) : null;

  // Offer the next unused number from the person's receipt book: it is almost always the one in hand.
  useEffect(() => {
    if (student && !receipt && next) setReceipt(String(next));
  }, [student, next]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!student || !session.user) return;
    const a = Number(amount), r = Number(receipt);
    if (!Number.isInteger(a) || a <= 0 || !Number.isInteger(r) || r <= 0) return setMsg(t("schools.common.invalid"));
    const problem = checkReceiptNumber(r, session.user.id, data.receiptBooks, data.payments);
    if (problem) return setMsg(t(problem === "already_used" ? "schools.fees.alreadyUsed" : "schools.fees.notInBook"));
    setBusy(true);
    await session.client.create("school.payment", data.school.siteId, { studentId: student.id, paidOn: date, amount: a, receiptNumber: r, feeItemIds: [] });
    await session.refreshCounts();
    void session.syncNow();
    setBusy(false);
    setAmount("");
    setReceipt("");
    setMsg(null);
    setToast(t("ux.paymentSaved", { amount: fmt(a), receipt: r }));
  };

  const pick = (s: Local<Student> | null) => {
    setStudent(s);
    setMsg(null);
    setAmount("");
    setReceipt("");
  };

  return (
    <Page
      header={<Header title={t("schools.fees.payment")} subtitle={data.school.code} onBack={student ? () => pick(null) : onBack} backLabel={t("schools.mobile.back")} accent={ACCENT} />}
      footer={student ? <Button icon="check" label={t("ux.savePayment")} onPress={() => void save()} disabled={busy || !amount || !receipt} flex={1} /> : undefined}
      toast={<Toast message={toast} onHide={() => setToast(null)} />}
    >
      {!student ? (
        <>
          <Field label={t("schools.mobile.pickStudent")} icon="search" value={q} onChangeText={setQ} autoCorrect={false} placeholder={t("schools.student.search")} autoFocus />
          {n.length >= 2 && found.length === 0 && <Notice tone="muted" icon="search">{t("ux.noMatch")}</Notice>}
          {found.length > 0 && (
            <ListGroup>
              {found.map((s) => {
                const b = balOf(s.id);
                const c = classOf(s.id);
                return (
                  <ListRow
                    key={s.id}
                    title={studentName(s)}
                    detail={`${s.studentNumber}${c ? ` · ${classLabel(c, shifts, t)}` : ""}`}
                    leading={<Avatar name={studentName(s)} />}
                    status={b.balance > 0 ? <StatusChip label={fmt(b.balance)} tone={b.overdue > 0 ? "warning" : "muted"} /> : <StatusChip label={t("ux.paidUp")} tone="good" icon="check" />}
                    onPress={() => pick(s)}
                    chevron
                  />
                );
              })}
            </ListGroup>
          )}
          {n.length < 2 && <Txt variant="small" tone="muted">{t("ux.typeTwo")}</Txt>}
        </>
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={studentName(student)} size={48} />
              <View style={{ flex: 1 }}>
                <Txt variant="heading" lines={1}>{studentName(student)}</Txt>
                <Txt variant="small" tone="muted">{student.studentNumber}{classOf(student.id) ? ` · ${classLabel(classOf(student.id)!, shifts, t)}` : ""}</Txt>
              </View>
            </View>
            {bal && (
              <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                <Stat value={fmt(bal.balance)} label={t("ux.balanceToday")} tone={bal.balance > 0 ? undefined : "good"} />
                {bal.overdue > 0 && <Stat value={fmt(bal.overdue)} label={t("schools.fees.overdue")} tone="warning" />}
              </View>
            )}
          </Card>
          <Field big label={t("schools.fees.amount")} value={amount} onChangeText={(v) => { setAmount(v.replace(/\D/g, "")); setMsg(null); }} keyboardType="number-pad" suffix="FC"
            hint={amount ? fmt(Number(amount)) : undefined} />
          {bal && bal.balance > 0 && String(bal.balance) !== amount && (
            <Pressable accessibilityRole="button" onPress={() => setAmount(String(bal.balance))} style={{ alignSelf: "flex-start", minHeight: 48, justifyContent: "center", paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.gcGreen }}>
              <Txt weight={700} color={colors.gcGreen}>{t("ux.payAll", { amount: fmt(bal.balance) })}</Txt>
            </Pressable>
          )}
          <Field label={t("schools.fees.receiptNumber")} icon="receipt" value={receipt} onChangeText={(v) => { setReceipt(v.replace(/\D/g, "")); setMsg(null); }} keyboardType="number-pad"
            hint={next && String(next) === receipt ? t("ux.nextReceipt") : undefined} />
          {msg && <Notice tone="critical">{msg}</Notice>}
          {mine.length > 0 && (
            <>
              <Txt variant="label" tone="muted">{t("schools.fees.recent")}</Txt>
              <ListGroup>
                {mine.slice(0, 10).map((p) => (
                  <ListRow
                    key={p.id}
                    title={fmt(p.amount)}
                    detail={`${dateLabel(p.paidOn)} · ${t("ux.receiptNo", { n: p.receiptNumber })}`}
                    leading={<IconBadge icon="receipt" color={p.voidedAt ? colors.textMuted : colors.gcGreen} />}
                    trailing={p.voidedAt ? <StatusChip label={t("schools.fees.voided")} tone="critical" /> : p.pending ? <StatusChip label={t("ux.notSynced")} tone="warning" /> : undefined}
                  />
                ))}
              </ListGroup>
            </>
          )}
        </>
      )}
    </Page>
  );
}
