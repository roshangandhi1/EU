"use server";
import { checkReceiptNumber, insertMutation, payment as paymentSchema, voidMutation } from "@eu/schools";
import { revalidatePath } from "next/cache";
import { back, can, firstRejection, int, newId, push, schoolFor, signedIn, str, today } from "@/lib/schools";

export async function recordPayment(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const path = `/${locale}/schools/${siteId}/fees`;
  const d = await schoolFor(me, siteId);
  const fields = {
    studentId: str(fd, "studentId"),
    paidOn: str(fd, "paidOn") || today(),
    amount: int(fd, "amount"),
    receiptNumber: int(fd, "receiptNumber"),
    feeItemIds: fd.getAll("feeItemIds").map(String).filter(Boolean),
  };
  // A refused payment comes back with what was typed (as query values the form reads back).
  const typed = { studentId: str(fd, "studentId"), amount: str(fd, "amount"), receiptNumber: str(fd, "receiptNumber"), paidOn: str(fd, "paidOn") };
  if (!paymentSchema.safeParse(fields).success || !d.students.some((s) => s.id === fields.studentId && !s.voidedAt)) back(path, { error: "invalid", ...typed });
  const problem = checkReceiptNumber(fields.receiptNumber!, me.user.id, d.receiptBooks, d.payments);
  // Programme staff entering on behalf of a school are not tied to a receipt book; duplicates are still refused.
  if (problem === "already_used" || (problem === "not_in_assigned_book" && !can(me, "payment.any_receipt", siteId))) back(path, { error: problem!, ...typed });
  const res = await push(me, [insertMutation("school.payment", siteId, fields, { mutationId: newId(), recordId: newId() })]);
  revalidatePath(`/${locale}/schools/${siteId}`, "layout");
  const bad = firstRejection(res);
  // After a save the date stays (a day's receipts are usually typed in one go); the receipt number moves on.
  back(path, bad ? { error: bad, ...typed } : { ok: "paid", num: String(fields.receiptNumber), paidOn: fields.paidOn });
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
    ok: "corrected", num: String(pay!.receiptNumber), studentId: pay!.studentId, amount: String(pay!.amount),
    receiptNumber: String(pay!.receiptNumber), paidOn: pay!.paidOn, items: pay!.feeItemIds.join(","),
  });
}
