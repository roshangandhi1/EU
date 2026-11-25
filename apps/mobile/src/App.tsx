import type { Locale } from "@eu/core/i18n";
import { isLocale } from "@eu/core/i18n";
import { StatusBar } from "expo-status-bar";
import "./strings";
import { useEffect, useMemo, useReducer, useState } from "react";
import { Body, Screen } from "./ui";
import { deviceLocale, LocaleContext } from "./i18n";
import { savedLocale } from "./secure";
import { Session } from "./session";
import { Home, Revoked } from "./screens/Home";
import { SetPin, Unlock } from "./screens/Pin";
import { SignIn } from "./screens/SignIn";

export default function App() {
  const session = useMemo(() => new Session(), []);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [locale, setLocaleState] = useState<Locale>(deviceLocale());
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = session.subscribe(rerender);
    void savedLocale.get().then((l) => isLocale(l) && setLocaleState(l));
    session.boot().catch((e: unknown) => setBootError(String(e)));
    return () => {
      unsub();
    };
  }, [session]);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    void savedLocale.set(l);
  };

  let screen;
  if (bootError) screen = <Screen><Body tone="critical">{bootError}</Body></Screen>;
  else if (session.phase === "signIn") screen = <SignIn key="signIn" session={session} />;
  else if (session.phase === "setPin") screen = <SetPin session={session} />;
  else if (session.phase === "unlock") screen = <Unlock session={session} />;
  else if (session.phase === "home") screen = <Home session={session} />;
  else if (session.phase === "revoked") screen = <Revoked />;
  else screen = <Screen><Body tone="muted">…</Body></Screen>;

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <StatusBar style={session.phase === "home" || session.phase === "signIn" || session.phase === "setPin" || session.phase === "unlock" ? "light" : "dark"} />
      {screen}
    </LocaleContext.Provider>
  );
}
