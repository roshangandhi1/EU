import { notFound, redirect } from "next/navigation";
import { isLocale, t, type Locale } from "@eu/core/i18n";
import { permissions } from "./registry";
import type { Principal } from "./auth";
import { currentPrincipal } from "./session";

/**
 * Like requireAction, but returns `allowed: false` instead of a 404 so the page can show the
 * shared NoAccess panel. Still 404s on a bad locale and sends signed-out people to the login.
 */
export async function adminAccess(localeParam: string, action: string): Promise<{ me: Principal; locale: Locale; allowed: boolean; tr: (k: string, v?: Record<string, string | number>) => string }> {
  if (!isLocale(localeParam)) notFound();
  const me = await currentPrincipal();
  if (!me) redirect(`/${localeParam}/login`);
  const locale = localeParam;
  return { me, locale, allowed: permissions.can(me.user, action, { stream: "platform" }), tr: (k, v) => t(locale, `admin.${k}`, v) };
}
