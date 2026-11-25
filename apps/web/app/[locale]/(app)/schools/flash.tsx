import { Notice } from "@/components/ui";

/** Shows ?ok= / ?error= messages set by server actions. */
export function Flash({ sp, tr }: { sp: Record<string, string | string[] | undefined>; tr: (k: string, v?: Record<string, string | number>) => string }) {
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
  if (ok) return <Notice tone="success">{tr("common.saved")}</Notice>;
  return null;
}

export type SP = Promise<Record<string, string | string[] | undefined>>;
export const param = (sp: Record<string, string | string[] | undefined>, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
