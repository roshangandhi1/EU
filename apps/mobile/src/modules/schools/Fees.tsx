import { activeOn, checkReceiptNumber, enrolmentBalance, formatCdf, newestFirst, nextReceiptCode, normaliseName, receiptLabel, tagForDevice, type Student } from "@eu/schools/mobile";
import { useContext, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { saveErrorKey } from "../../errors";
import { deviceId } from "../../secure";
import { LocaleContext, useT } from "../../i18n";
import type { Session } from "../../session";
import { addDays } from "../../time";
import { Avatar, Button, Card, DateField, Field, Header, IconBadge, ListGroup, ListRow, Notice, Page, Stat, StatusChip, Toast, Txt, useDateLabel, useDialog, useLeaveGuard } from "../../ui";
import { colors } from "@eu/core/tokens";
import { live, studentName, today, type Local, type SchoolData } from "./data";
import { ACCENT, classLabel, schoolLevels, nextReceipt, schoolName } from "./parts";

/** Paper receipts are often typed up days later, but not months: older ones go through the web. */
const BACKDATE_DAYS = 30;

/** Record a cash payment against a paper receipt, and show the pupil's balance. */
export function Fees({ session, data, onBack }: { session: Session; data: SchoolData; onBack: () => void }) {
  const t = useT();
  const { locale } = useContext(LocaleContext);
  const dateLabel = useDateLabel();
  const date = today();
  const { ask, node: dialog } = useDialog();
  const [paidOn, setPaidOn] = useState(date);
  const [q, setQ] = useState("");
  const [student, setStudent] = useState<Local<Student> | null>(null);
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState("");
  const [msg, setMsg] = useState<{ field: "amount" | "receipt" | "form"; text: string } | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "good" | "critical" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [myDevice, setMyDevice] = useState<string | null>(null);
  useEffect(() => void deviceId().then(setMyDevice), []);
  // The school may not use paper receipt books; every payment still gets a receipt number from this phone.
  const paperRequired = data.school.paperReceiptRequired !== false;
  const tag = myDevice ? tagForDevice(data.deviceTags, myDevice) : null;

  const enrolled = activeOn(data.enrolments, date, data.years);
  const classes = new Map(data.classes.map((c) => [c.id, c]));
  const shifts = new Set(live(data.classes).map((c) => c.shift)).size;
  const LV = schoolLevels(data.school);
  const classOf = (id: string) => classes.get(enrolled.find((e) => e.studentId === id)?.classId ?? "");
  const ids = new Set(enrolled.map((e) => e.studentId));
  const n = normaliseName(q);
  const found = n.length >= 2 ? live(data.students).filter((s) => ids.has(s.id) && (normaliseName(studentName(s)).includes(n) || s.studentNumber.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 20) : [];

  const fmt = (v: number) => formatCdf(v, locale);
  const balOf = (id: string) => {
    const e = enrolled.find((x) => x.studentId === id);
    return e ? enrolmentBalance(data, e, date) : null;
  };
  const bal = student ? balOf(student.id) : null;
  const mine = student ? data.payments.filter((p) => p.studentId === student.id).sort(newestFirst) : [];
  const next = session.user ? nextReceipt(session.user.id, data.receiptBooks, data.payments) : null;

  // Offer the next unused number from the person's receipt book: it is almost always the one in hand.
  useEffect(() => {
    if (student && !receipt && next) setReceipt(String(next));
  }, [student, next]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!student || !session.user || busy) return;
    const a = Number(amount), r = receipt ? Number(receipt) : null;
    if (!Number.isInteger(a) || a <= 0) return setMsg({ field: "amount", text: t("ux.amountNeeded") });
    if (r === null ? paperRequired : !Number.isInteger(r) || r <= 0) return setMsg({ field: "receipt", text: t("ux.receiptNeeded") });
    const problem = r === null ? null : checkReceiptNumber(r, session.user.id, data.receiptBooks, data.payments);
    // System receipt number: school code, this phone's letter, next count. A phone without a letter
    // leaves it to the paper number (the school's setup gives each phone a letter).
    const code = tag ? nextReceiptCode(data.school.code, tag, data.payments) : null;
    if (problem) return setMsg({ field: "receipt", text: t(problem === "already_used" ? "schools.fees.alreadyUsed" : "schools.fees.notInBook") });
    // Read it back before it goes in the books: an extra zero is easy to type and hard to undo.
    const over = bal && a > bal.balance;
    const ok = await ask<boolean>({
      title: t("ux.confirmPaymentTitle"),
      body: (
        <View style={{ gap: 6 }}>
          <Txt variant="display">{fmt(a)}</Txt>
          <Txt weight={700}>{studentName(student)}</Txt>
          <Txt>{t("ux.receiptNo", { n: code ?? r ?? "" })}{code && r !== null ? ` · ${t("schools.fees.paperNumber")} ${r}` : ""} · {dateLabel(paidOn, true)}</Txt>
          {over ? <Notice tone="warning">{t("ux.overBalance", { balance: fmt(bal.balance) })}</Notice> : null}
        </View>
      ),
      actions: [
        { label: t("ux.confirmSave"), value: true, kind: "primary" },
        { label: t("ux.correct"), value: false, kind: "secondary" },
      ],
    });
    if (!ok) return;
    setBusy(true);
    try {
      await session.client.create("school.payment", data.school.siteId, { studentId: student.id, paidOn, amount: a, receiptNumber: r, receiptCode: code, feeItemIds: [] });
      await session.localSaved();
      void session.syncNow();
      setAmount("");
      setReceipt("");
      setMsg(null);
      setToast({ msg: t("ux.paymentSaved", { amount: fmt(a), receipt: code ?? r ?? "" }), tone: "good" });
    } catch (e) {
      setToast({ msg: t(saveErrorKey(e)), tone: "critical" });
    } finally {
      setBusy(false);
    }
  };

  const pick = (s: Local<Student> | null) => {
    setStudent(s);
    setMsg(null);
    setAmount("");
    setReceipt("");
  };
  const dirty = !!student && (amount !== "" || (receipt !== "" && receipt !== String(next ?? "")));
  const back = useLeaveGuard(dirty, () => (student ? pick(null) : onBack()), ask);

  return (
    <Page
      header={<Header title={t("schools.fees.payment")} subtitle={schoolName(data.school)} onBack={back} backLabel={t("schools.mobile.back")} accent={ACCENT} />}
      footer={student ? <Button icon="check" label={t("ux.savePayment")} onPress={() => void save()} disabled={!amount || (paperRequired && !receipt)} busy={busy} flex={1} /> : undefined}
      toast={<Toast message={toast?.msg ?? null} tone={toast?.tone} onHide={() => setToast(null)} />}
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
                    detail={`${s.studentNumber}${c ? ` · ${classLabel(c, shifts, t, LV)}` : ""}`}
                    leading={<Avatar name={studentName(s)} />}
                    status={!b ? undefined : b.balance > 0 ? <StatusChip label={fmt(b.balance)} tone={b.overdue > 0 ? "warning" : "muted"} /> : <StatusChip label={t("ux.paidUp")} tone="good" icon="check" />}
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
                <Txt variant="small" tone="muted">{student.studentNumber}{classOf(student.id) ? ` · ${classLabel(classOf(student.id)!, shifts, t, LV)}` : ""}</Txt>
              </View>
            </View>
            {bal && (
              <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                <Stat value={fmt(bal.balance)} label={t("ux.balanceToday")} tone={bal.balance > 0 ? undefined : "good"} />
                {bal.overdue > 0 && <Stat value={fmt(bal.overdue)} label={t("schools.fees.overdue")} tone="warning" />}
              </View>
            )}
          </Card>
          <DateField label={t("schools.fees.paidOn")} value={paidOn} onChange={setPaidOn} max={date} min={addDays(date, -BACKDATE_DAYS)} todayLabel={t("app.today")} yesterdayLabel={t("app.yesterday")} />
          <Field big label={t("schools.fees.amount")} value={amount} onChangeText={(v) => { setAmount(v.replace(/\D/g, "")); setMsg(null); }} keyboardType="number-pad" suffix="FC"
            hint={amount ? fmt(Number(amount)) : undefined} error={msg?.field === "amount" ? msg.text : null} />
          {bal && bal.balance > 0 && String(bal.balance) !== amount && (
            <Pressable accessibilityRole="button" onPress={() => setAmount(String(bal.balance))} style={{ alignSelf: "flex-start", minHeight: 48, justifyContent: "center", paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.gcGreen }}>
              <Txt weight={700} color={colors.gcGreen}>{t("ux.payAll", { amount: fmt(bal.balance) })}</Txt>
            </Pressable>
          )}
          <Field label={paperRequired ? t("schools.fees.paperNumber") : `${t("schools.fees.paperNumber")} (${t("schools.common.optional")})`} icon="receipt" value={receipt} onChangeText={(v) => { setReceipt(v.replace(/\D/g, "")); setMsg(null); }} keyboardType="number-pad"
            hint={next && String(next) === receipt ? t("ux.nextReceipt") : t("schools.fees.systemReceiptHint")} error={msg?.field === "receipt" ? msg.text : null} />
          {mine.length > 0 && (
            <>
              <Txt variant="label" tone="muted">{t("schools.fees.recent")}</Txt>
              <ListGroup>
                {mine.slice(0, 10).map((p) => (
                  <ListRow
                    key={p.id}
                    title={fmt(p.amount)}
                    detail={`${dateLabel(p.paidOn)} · ${t("ux.receiptNo", { n: receiptLabel(p) })}`}
                    leading={<IconBadge icon="receipt" color={p.voidedAt ? colors.textMuted : colors.gcGreen} />}
                    trailing={p.voidedAt ? <StatusChip label={t("schools.fees.voided")} tone="critical" /> : p.pending ? <StatusChip label={t("ux.notSynced")} tone="warning" /> : undefined}
                  />
                ))}
              </ListGroup>
            </>
          )}
        </>
      )}
      {dialog}
    </Page>
  );
}
