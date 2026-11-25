import { useEffect, useState } from "react";
import { Button, Field, Notice, Txt } from "../ui";
import { useT } from "../i18n";
import type { Session } from "../session";
import { AuthLayout } from "./AuthLayout";

const INFO = new Set(["app.sessionEnded", "app.forgotPinNotice"]);

export function SignIn({ session }: { session: Session }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(session.notice);
  const [sent, setSent] = useState<string | null>(null);
  const [canUnlock, setCanUnlock] = useState(false);
  useEffect(() => void session.canUnlock().then(setCanUnlock), [session]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setSent(null);
    setError(await session.signIn(email, password));
    setBusy(false);
  };
  const sendNow = async () => {
    setBusy(true);
    const r = await session.sendPreviousWork();
    setBusy(false);
    if (r === "sent") {
      setError(null);
      setSent("app.previousSent");
    } else setSent(r === "partly" ? "app.previousPartly" : "app.previousFailed");
  };

  const other = error === "app.otherUserPending" ? session.otherUser : null;
  return (
    <AuthLayout title={t("app.welcome")} intro={t("app.signInIntro")}>
      {other ? (
        <Notice tone="warning" title={t("app.otherUserTitle", { name: other.name })}>
          <Txt>{t("app.otherUserBody", { name: other.name, records: other.records, photos: other.photos })}</Txt>
          {other.canSendNow ? (
            <Button kind="secondary" icon="sync" label={t("app.sendTheirWork", { name: other.name })} onPress={() => void sendNow()} busy={busy} />
          ) : (
            <Txt variant="small" tone="muted">{t("app.otherUserHow", { name: other.name })}</Txt>
          )}
        </Notice>
      ) : error ? (
        <Notice tone={INFO.has(error) ? "info" : "critical"}>{t(error)}</Notice>
      ) : null}
      {sent && <Notice tone={sent === "app.previousSent" ? "good" : "warning"}>{t(sent)}</Notice>}
      <Field label={t("common.email")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" returnKeyType="next" />
      <Field label={t("common.password")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" returnKeyType="go" onSubmitEditing={() => email && password && void submit()} />
      <Button label={busy ? t("common.loading") : t("common.signIn")} onPress={() => void submit()} disabled={!email || !password} busy={busy} />
      {canUnlock && <Button kind="ghost" icon="lock" label={t("app.backToPin")} onPress={() => session.backToUnlock()} disabled={busy} />}
    </AuthLayout>
  );
}
