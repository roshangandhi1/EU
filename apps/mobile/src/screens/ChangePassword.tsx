import { useState } from "react";
import { Button, Field, Notice, Txt } from "../ui";
import { useT } from "../i18n";
import type { Session } from "../session";
import { AuthLayout } from "./AuthLayout";

/**
 * Choose a new password. Forced right after signing in with a password an admin set (no way back),
 * or opened from home (with a way back). Unsent work on the phone is never touched here.
 */
export function ChangePassword({ session }: { session: Session }) {
  const t = useT();
  const forced = session.passwordForced;
  const askCurrent = session.needsCurrentPassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = (!askCurrent || current.length > 0) && next.length >= 10 && again.length >= 10;

  const submit = async () => {
    if (busy || !ready) return;
    if (next !== again) return setError("app.pw_mismatch");
    setBusy(true);
    setError(await session.changePassword(askCurrent ? current : null, next));
    setBusy(false);
  };

  return (
    <AuthLayout title={t(forced ? "app.pwForcedTitle" : "app.pwTitle")} intro={t(forced ? "app.pwForcedIntro" : "app.pwIntro")}>
      {session.user && <Txt variant="small" tone="muted">{t("auth.signedInAs", { name: session.user.name })}</Txt>}
      {error && <Notice tone="critical">{t(error)}</Notice>}
      {askCurrent && (
        <Field label={t(forced ? "app.pwCurrentForced" : "app.pwCurrent")} value={current} onChangeText={(v) => { setCurrent(v); setError(null); }} secureTextEntry autoComplete="password" returnKeyType="next" />
      )}
      <Field label={t("app.pwNew")} value={next} onChangeText={(v) => { setNext(v); setError(null); }} secureTextEntry autoComplete="password-new" hint={t("app.pwHint")} returnKeyType="next" />
      <Field label={t("app.pwAgain")} value={again} onChangeText={(v) => { setAgain(v); setError(null); }} secureTextEntry autoComplete="password-new" returnKeyType="go" onSubmitEditing={() => void submit()} />
      <Txt variant="small" tone="muted">{t("app.pwKeepsWork")}</Txt>
      <Button label={busy ? t("app.pwSaving") : t("app.pwSubmit")} onPress={() => void submit()} disabled={!ready} busy={busy} />
      {!forced && <Button kind="ghost" icon="back" label={t("app.pwBack")} onPress={() => session.cancelChangePassword()} disabled={busy} />}
    </AuthLayout>
  );
}
