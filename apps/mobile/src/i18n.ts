import { DEFAULT_LOCALE, isLocale, t as translate, type Locale } from "@eu/core/i18n";
import { getLocales } from "expo-localization";
import { createContext, useContext } from "react";

/** Phone language if it is French or English, otherwise French (the field default). */
export function deviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode ?? null;
  return isLocale(code) ? code : DEFAULT_LOCALE;
}

export const LocaleContext = createContext<{ locale: Locale; setLocale: (l: Locale) => void }>({
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
});

export function useT() {
  const { locale } = useContext(LocaleContext);
  return (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
