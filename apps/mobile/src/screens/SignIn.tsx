import { useState } from "react";
import { Button, Field, Notice } from "../ui";
import { useT } from "../i18n";
import type { Session } from "../session";
import { AuthLayout } from "./AuthLayout";

export function SignIn({ session }: { session: Session }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(session.notice);

  const submit = async () => {
    setBusy(true);
    setError(await session.signIn(email, password));
    setBusy(false);
  };

  return (
    <AuthLayout title={t("app.welcome")} intro={t("app.signInIntro")}>
      {error && <Notice tone="critical">{t(error)}</Notice>}
      <Field label={t("common.email")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" returnKeyType="next" />
      <Field label={t("common.password")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" returnKeyType="go" onSubmitEditing={() => email && password && !busy && void submit()} />
      <Button label={busy ? t("common.loading") : t("common.signIn")} onPress={submit} disabled={busy || !email || !password} />
    </AuthLayout>
  );
}
