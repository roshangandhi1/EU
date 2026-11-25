import type { Locale } from "@eu/core/i18n";
import { isLocale } from "@eu/core/i18n";
import { StatusBar } from "expo-status-bar";
import "./strings";
import { useEffect, useMemo, useReducer, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Body, Button, Notice, Screen, Title } from "./ui";
import { deviceLocale, LocaleContext } from "./i18n";
import { t as translate } from "@eu/core/i18n";
import { savedLocale } from "./secure";
import { BootError, Session } from "./session";
import { Home, Revoked } from "./screens/Home";
import { SetPin, Unlock } from "./screens/Pin";
import { SignIn } from "./screens/SignIn";

export default function App() {
  const session = useMemo(() => new Session(), []);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [locale, setLocaleState] = useState<Locale>(deviceLocale());
  const [bootError, setBootError] = useState<"locked" | "other" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fail = (e: unknown) => {
    console.warn("boot failed", e);
    setBootError(e instanceof BootError ? "locked" : "other");
  };
  const retry = (fn: () => Promise<void>) => {
    setBootError(null);
    setConfirmReset(false);
    fn().catch(fail);
  };

  useEffect(() => {
    const unsub = session.subscribe(rerender);
    void savedLocale.get().then((l) => isLocale(l) && setLocaleState(l));
    session.boot().catch(fail);
    return () => {
      unsub();
    };
  }, [session]);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    void savedLocale.set(l);
  };

  const tr = (k: string) => translate(locale, k);
  let screen;
  if (bootError)
    screen = (
      <Screen>
        <Title>{tr("common.appName")}</Title>
        <Notice tone="critical" title={tr("app.bootFailedTitle")}>{tr(bootError === "locked" ? "app.bootLocked" : "app.bootFailed")}</Notice>
        <Button icon="sync" label={tr("app.retry")} onPress={() => retry(() => session.boot())} />
        {bootError === "locked" &&
          (confirmReset ? (
            <>
              <Body tone="critical">{tr("app.resetWarn")}</Body>
              <Button kind="danger" label={tr("app.resetConfirm")} onPress={() => retry(() => session.resetPhone())} />
            </>
          ) : (
            <Button kind="secondary" label={tr("app.resetPhone")} onPress={() => setConfirmReset(true)} />
          ))}
      </Screen>
    );
  else if (session.phase === "signIn") screen = <SignIn key="signIn" session={session} />;
  else if (session.phase === "setPin") screen = <SetPin session={session} />;
  else if (session.phase === "unlock") screen = <Unlock session={session} />;
  else if (session.phase === "home") screen = <Home session={session} />;
  else if (session.phase === "revoked") screen = <Revoked session={session} />;
  else screen = <Screen><Body tone="muted">…</Body></Screen>;

  return (
    <SafeAreaProvider>
      <LocaleContext.Provider value={{ locale, setLocale }}>
        <StatusBar style={session.phase === "home" || session.phase === "signIn" || session.phase === "setPin" || session.phase === "unlock" ? "light" : "dark"} />
        {screen}
      </LocaleContext.Provider>
    </SafeAreaProvider>
  );
}
