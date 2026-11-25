import type { Metadata } from "next";
import { isLocale, t, type Locale } from "@eu/core/i18n";
// Strings must be registered before titles are translated (metadata can run before the layout).
import "./registry";

type Params = { params: Promise<Record<string, string>> };

/**
 * `export const generateMetadata = titled("ui.nav.boreholes")`: the browser tab title of a page,
 * translated for the URL locale. A function receives the locale and the route params.
 */
export function titled(key: string | ((locale: Locale, params: Record<string, string>) => string | Promise<string>)) {
  return async ({ params }: Params): Promise<Metadata> => {
    const p = await params;
    const locale: Locale = isLocale(p.locale) ? p.locale : "fr";
    return { title: typeof key === "string" ? t(locale, key) : await key(locale, p) };
  };
}
