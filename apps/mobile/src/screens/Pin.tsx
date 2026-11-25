import { useState } from "react";
import { Body, Button, EuBand, Field, Screen, Title } from "../ui";
import { useT } from "../i18n";
import type { Session } from "../session";

const valid = (p: string) => /^\d{4,6}$/.test(p);

export function SetPin({ session }: { session: Session }) {
  const t = useT();
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (first !== second) return setError("auth.pinMismatch");
    await session.setPin(first);
  };
  return (
    <Screen>
      <Title>{t("auth.setPin")}</Title>
      {session.user && <Body tone="muted">{t("auth.signedInAs", { name: session.user.name })}</Body>}
      {error && <Body tone="critical">{t(error)}</Body>}
      <Field label={t("auth.setPin")} value={first} onChangeText={setFirst} keyboardType="number-pad" secureTextEntry maxLength={6} />
      <Field label={t("auth.confirmPin")} value={second} onChangeText={setSecond} keyboardType="number-pad" secureTextEntry maxLength={6} />
      <Button label={t("common.save")} onPress={submit} disabled={!valid(first) || !valid(second)} />
      <EuBand text={t("common.fundedByEu")} />
    </Screen>
  );
}

export function Unlock({ session }: { session: Session }) {
  const t = useT();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const r = await session.unlock(value);
    setValue("");
    if (!r.ok) setError(t("auth.pinWrong", { count: r.remaining }));
  };
  return (
    <Screen>
      <Title>{t("auth.enterPin")}</Title>
      {session.user && <Body tone="muted">{t("auth.signedInAs", { name: session.user.name })}</Body>}
      {error && <Body tone="critical">{error}</Body>}
      <Field label={t("auth.enterPin")} value={value} onChangeText={setValue} keyboardType="number-pad" secureTextEntry maxLength={6} autoFocus />
      <Button label={t("common.signIn")} onPress={submit} disabled={!valid(value)} />
      <EuBand text={t("common.fundedByEu")} />
    </Screen>
  );
}
