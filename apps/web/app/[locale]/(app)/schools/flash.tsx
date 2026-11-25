import { Notice } from "@/components/ui";

/**
 * Shows ?ok= / ?error= messages set by server actions. When the action named a section (?s=),
 * the message shows inside that section, next to the form that was used, not at the page top.
 */
export function Flash({ sp, tr, section }: { sp: Record<string, string | string[] | undefined>; tr: (k: string, v?: Record<string, string | number>) => string; section?: string }) {
  const s = typeof sp.s === "string" ? sp.s : undefined;
  if (s !== section) return null;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  if (error) {
    const known: Record<string, string> = {
      forbidden: tr("common.forbidden"),
      invalid: tr("common.invalid"),
      not_in_assigned_book: tr("fees.notInBook"),
      already_used: tr("fees.alreadyUsed"),
      letter_taken: tr("setup.letterTaken"),
    };
    return <Notice tone="error">{known[error] ?? tr("common.rejected", { reason: error })}</Notice>;
  }
  if (ok) {
    const msg: Record<string, string> = { added: tr("ux.added"), removed: tr("ux.removed"), left: tr("ux.left"), voided: tr("ux.voided"), paid: tr("ux.paid", { num: typeof sp.num === "string" ? sp.num : "" }), enrolled: tr("ux.enrolled", { num: typeof sp.num === "string" ? sp.num : "" }) };
    return <Notice tone="success">{msg[ok] ?? tr("common.saved")}</Notice>;
  }
  return null;
}

export type SP = Promise<Record<string, string | string[] | undefined>>;
export const param = (sp: Record<string, string | string[] | undefined>, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
