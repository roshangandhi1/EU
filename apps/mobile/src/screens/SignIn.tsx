import { useState } from "react";
import { Body, Button, EuBand, Field, Screen, Title } from "../ui";
import { useT } from "../i18n";
import type { Session } from "../session";

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
    <Screen>
      <Title>{t("common.appName")}</Title>
      {error && <Body tone="critical">{t(error)}</Body>}
      <Field label={t("common.email")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label={t("common.password")} value={password} onChangeText={setPassword} secureTextEntry />
      <Button label={busy ? t("common.loading") : t("common.signIn")} onPress={submit} disabled={busy || !email || !password} />
      <EuBand text={t("common.fundedByEu")} />
    </Screen>
  );
}
