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
  if (!paymentSchema.safeParse(fields).success || !d.students.some((s) => s.id === fields.studentId)) back(path, { error: "invalid" });
  const problem = checkReceiptNumber(fields.receiptNumber!, me.user.id, d.receiptBooks, d.payments);
  // Programme staff entering on behalf of a school are not tied to a receipt book; duplicates are still refused.
  if (problem === "already_used" || (problem === "not_in_assigned_book" && !can(me, "school.configure", siteId))) back(path, { error: problem });
  const res = await push(me, [insertMutation("school.payment", siteId, fields, { mutationId: newId(), recordId: newId() })]);
  revalidatePath(`/${locale}/schools/${siteId}`);
  const bad = firstRejection(res);
  back(path, bad ? { error: bad } : { ok: "1" });
}

export async function voidPayment(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const siteId = str(fd, "siteId");
  const path = `/${locale}/schools/${siteId}/fees`;
  const reason = str(fd, "reason");
  if (reason.length < 3) back(path, { error: "invalid" });
  const res = await push(me, [voidMutation("school.payment", siteId, str(fd, "paymentId"), reason, newId())]);
  revalidatePath(`/${locale}/schools/${siteId}`);
  const bad = firstRejection(res);
  back(path, bad ? { error: bad } : { ok: "1" });
}
