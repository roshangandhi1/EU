/** Turns a failure into an i18n key the user can act on; the detail goes to the log only. */
export function saveErrorKey(e: unknown): string {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  console.warn("save failed", msg);
  if (/SQLITE_FULL|ENOSPC|disk is full|database or disk is full|no space/i.test(msg)) return "ux.errPhoneFull";
  return "ux.errSave";
}
