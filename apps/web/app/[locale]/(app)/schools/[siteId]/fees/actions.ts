"use server";
import { checkReceiptNumber, insertMutation, nextReceiptCode, payment as paymentSchema, receiptLabel, voidMutation } from "@eu/schools";
import { revalidatePath } from "next/cache";
import { back, can, firstRejection, int, newId, push, schoolFor, signedIn, str, today } from "@/lib/schools";

export async function recordPayment(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const path = `/${locale}/schools/${siteId}/fees`;
  const d = await schoolFor(me, siteId);
  const paperRequired = d.school?.paperReceiptRequired !== false;
  const fields = {
    studentId: str(fd, "studentId"),
    paidOn: str(fd, "paidOn") || today(),
    amount: int(fd, "amount"),
    receiptNumber: str(fd, "receiptNumber") ? int(fd, "receiptNumber") : null,
    receiptCode: d.school ? nextReceiptCode(d.school.code, "W", d.payments) : null,
    feeItemIds: fd.getAll("feeItemIds").map(String).filter(Boolean),
  };
  // A refused payment comes back with what was typed (as query values the form reads back).
  const typed = { studentId: str(fd, "studentId"), amount: str(fd, "amount"), receiptNumber: str(fd, "receiptNumber"), paidOn: str(fd, "paidOn") };
  if (!paymentSchema.safeParse(fields).success || !d.students.some((s) => s.id === fields.studentId && !s.voidedAt)) back(path, { error: "invalid", ...typed });
  if (fields.receiptNumber === null && paperRequired) back(path, { error: "paper_receipt_required", ...typed });
  if (fields.receiptNumber !== null) {
    const problem = checkReceiptNumber(fields.receiptNumber!, me.user.id, d.receiptBooks, d.payments);
    // Programme staff entering on behalf of a school are not tied to a receipt book; duplicates are still refused.
    if (problem === "already_used" || (problem === "not_in_assigned_book" && !can(me, "payment.any_receipt", siteId))) back(path, { error: problem!, ...typed });
  }
  const send = (f: typeof fields) => push(me, [insertMutation("school.payment", siteId, f, { mutationId: newId(), recordId: newId() })]);
  let res = await send(fields);
  let bad = firstRejection(res);
  // Another web user took the same system number a moment ago: take the next one.
  if (bad === "receipt_code_taken" && d.school) {
    const fresh = await schoolFor(me, siteId);
    fields.receiptCode = nextReceiptCode(d.school.code, "W", fresh.payments);
    res = await send(fields);
    bad = firstRejection(res);
  }
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  // After a save the date stays (a day's receipts are usually typed in one go); the receipt number moves on.
  back(path, bad ? { error: bad, ...typed } : { ok: "paid", num: fields.receiptCode ?? String(fields.receiptNumber), paidOn: fields.paidOn });
}

export async function voidPayment(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const path = `/${locale}/schools/${siteId}/fees`;
  const reason = str(fd, "reason");
  if (reason.length < 3) back(path, { error: "void_reason_required" });
  const res = await push(me, [voidMutation("school.payment", siteId, str(fd, "paymentId"), reason, newId())]);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const bad = firstRejection(res);
  back(path, bad ? { error: bad } : { ok: "voided" });
}

/**
 * "Correct" a payment (headteacher): payments are never edited, so the wrong one is voided with the
 * reason given and the payment form opens filled in with its details, ready to fix and save again.
 */
export async function correctPayment(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const path = `/${locale}/schools/${siteId}/fees`;
  const d = await schoolFor(me, siteId);
  const pay = d.payments.find((p) => p.id === str(fd, "paymentId") && !p.voidedAt);
  const reason = str(fd, "reason");
  if (!pay) back(path, { error: "already_voided" });
  if (reason.length < 3) back(path, { error: "void_reason_required" });
  const res = await push(me, [voidMutation("school.payment", siteId, pay!.id, reason, newId())]);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const bad = firstRejection(res);
  if (bad) back(path, { error: bad });
  back(path, {
    ok: "corrected", num: receiptLabel(pay!), studentId: pay!.studentId, amount: String(pay!.amount),
    receiptNumber: pay!.receiptNumber === null ? "" : String(pay!.receiptNumber), paidOn: pay!.paidOn, items: pay!.feeItemIds.join(","),
  });
}
