import { Notice } from "@/components/ui";
import { errorText } from "./text";

type Params = Record<string, string | string[] | undefined>;

/**
 * Shows ?ok= / ?error= messages set by server actions. When the action named a section (?s=),
 * the message shows inside that section, next to the form that was used, not at the page top.
 * Error codes are always turned into a sentence (see errorText); the raw code is never shown.
 */
export function Flash({ sp, tr, section }: { sp: Params; tr: (k: string, v?: Record<string, string | number>) => string; section?: string }) {
  const s = typeof sp.s === "string" ? sp.s : undefined;
  if (s !== section) return null;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const v = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  if (error) return <Notice tone="error">{errorText(error, tr, { count: v("count") })}</Notice>;
  if (ok) {
    const msg: Record<string, string> = {
      added: tr("ux.added"), removed: tr("ux.removed"), left: tr("ux.left"), voided: tr("ux.voided"), paid: tr("ux.paid", { num: v("num") }),
      enrolled: tr("ux.enrolled", { num: v("num") }), corrected: tr("pay.correcting", { num: v("num") }), returned: tr("pupil.returned"),
      edited: tr("pupil.edited"), moved: tr("pupil.moved"), conflict: tr("err.conflict"),
    };
    return <Notice tone={ok === "conflict" ? "warning" : ok === "corrected" ? "info" : "success"}>{msg[ok] ?? tr("common.saved")}</Notice>;
  }
  return null;
}

export type SP = Promise<Params>;
export const param = (sp: Params, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
