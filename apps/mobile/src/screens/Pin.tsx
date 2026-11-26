import { useRef, useState } from "react";
import { Button, Field, Notice, Txt } from "../ui";
import { useT } from "../i18n";
import type { Session } from "../session";
import { AuthLayout } from "./AuthLayout";

const valid = (p: string) => /^\d{4,6}$/.test(p);
const digits = (v: string) => v.replace(/\D/g, "");

/** 0000, 1111, 1234, 9876…: the first codes anyone tries on a found phone. */
export function trivialPin(p: string): boolean {
  if (/^(\d)\1+$/.test(p)) return true;
  const d = p.split("").map(Number);
  const step = d[1]! - d[0]!;
  return (step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1]! === step);
}

export function SetPin({ session }: { session: Session }) {
  const t = useT();
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    if (trivialPin(first)) return setError("app.pinTooSimple");
    if (first !== second) return setError("auth.pinMismatch");
    setBusy(true);
    try {
      await session.setPin(first);
    } catch {
      setError("ux.errSave");
      setBusy(false);
    }
  };
  return (
    <AuthLayout title={t("auth.setPin")} intro={t("app.pinIntro")}>
      {session.user && <Txt variant="small" tone="muted">{t("auth.signedInAs", { name: session.user.name })}</Txt>}
      {session.notice === "app.pwChanged" && !error && <Notice tone="good">{t("app.pwChanged")}</Notice>}
      {error && <Notice tone="critical">{t(error)}</Notice>}
      <Field big label={t("auth.setPin")} value={first} onChangeText={(v) => { setFirst(digits(v)); setError(null); }} keyboardType="number-pad" secureTextEntry maxLength={6} autoFocus hint={t("app.pinHint")} />
      <Field big label={t("auth.confirmPin")} value={second} onChangeText={(v) => { setSecond(digits(v)); setError(null); }} keyboardType="number-pad" secureTextEntry maxLength={6} onSubmitEditing={() => valid(first) && valid(second) && void submit()} />
      <Button label={busy ? t("app.pinSaving") : t("common.save")} onPress={() => void submit()} disabled={!valid(first) || !valid(second)} busy={busy} />
    </AuthLayout>
  );
}

export function Unlock({ session }: { session: Session }) {
  const t = useT();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A ref as well as state: a second tap in the same frame must not count as a second wrong PIN.
  const checking = useRef(false);
  const submit = async () => {
    if (checking.current || !valid(value)) return;
    checking.current = true;
    setBusy(true);
    try {
      const r = await session.unlock(value);
      setValue("");
      if (!r.ok) setError(t("auth.pinWrong", { count: r.remaining }));
    } finally {
      checking.current = false;
      setBusy(false);
    }
  };
  return (
    <AuthLayout title={session.user ? t("app.hello", { name: session.user.name }) : t("auth.enterPin")} intro={t("app.pinIntro")}>
      {error && <Notice tone="critical">{error}</Notice>}
      <Field big label={t("app.pinTitleUnlock")} value={value} editable={!busy} onChangeText={(v) => { setValue(digits(v)); setError(null); }} keyboardType="number-pad" secureTextEntry maxLength={6} autoFocus onSubmitEditing={() => void submit()} />
      <Button label={busy ? t("app.pinChecking") : t("common.signIn")} onPress={() => void submit()} disabled={!valid(value)} busy={busy} />
      <Button kind="ghost" label={t("app.forgotPin")} onPress={() => session.toSignIn()} disabled={busy} />
    </AuthLayout>
  );
}
