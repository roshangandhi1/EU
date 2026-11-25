import { useState } from "react";
import { Button, Field, Notice, Txt } from "../ui";
import { useT } from "../i18n";
import type { Session } from "../session";
import { AuthLayout } from "./AuthLayout";

const valid = (p: string) => /^\d{4,6}$/.test(p);
const digits = (v: string) => v.replace(/\D/g, "");

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
    <AuthLayout title={t("auth.setPin")} intro={t("app.pinIntro")}>
      {session.user && <Txt variant="small" tone="muted">{t("auth.signedInAs", { name: session.user.name })}</Txt>}
      {error && <Notice tone="critical">{t(error)}</Notice>}
      <Field big label={t("auth.setPin")} value={first} onChangeText={(v) => { setFirst(digits(v)); setError(null); }} keyboardType="number-pad" secureTextEntry maxLength={6} autoFocus />
      <Field big label={t("auth.confirmPin")} value={second} onChangeText={(v) => { setSecond(digits(v)); setError(null); }} keyboardType="number-pad" secureTextEntry maxLength={6} onSubmitEditing={() => valid(first) && valid(second) && void submit()} />
      <Button label={t("common.save")} onPress={submit} disabled={!valid(first) || !valid(second)} />
    </AuthLayout>
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
    <AuthLayout title={session.user ? t("app.hello", { name: session.user.name }) : t("auth.enterPin")} intro={t("app.pinIntro")}>
      {error && <Notice tone="critical">{error}</Notice>}
      <Field big label={t("app.pinTitleUnlock")} value={value} onChangeText={(v) => { setValue(digits(v)); setError(null); }} keyboardType="number-pad" secureTextEntry maxLength={6} autoFocus onSubmitEditing={() => valid(value) && void submit()} />
      <Button label={t("common.signIn")} onPress={submit} disabled={!valid(value)} />
    </AuthLayout>
  );
}
