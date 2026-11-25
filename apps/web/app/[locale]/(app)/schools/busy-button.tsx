"use client";
import { Icon } from "@/components/icons";

/**
 * The kit's submit button look, for forms sent with startTransition (which keeps typed values after a
 * refusal, but does not drive useFormStatus): the caller passes useActionState's `pending`.
 */
export function BusyButton({ pending, label, busy, icon = "check", small }: { pending: boolean; label: string; busy: string; icon?: string; small?: boolean }) {
  return (
    <button type="submit" className={small ? "btn sm" : "btn"} disabled={pending} aria-busy={pending || undefined}>
      {pending ? <span className="spinner" aria-hidden /> : <Icon name={icon} size={small ? 15 : 17} />}
      {pending ? busy : label}
    </button>
  );
}
