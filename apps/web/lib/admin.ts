import { isLocale, t, type Locale } from "@eu/core/i18n";
import { notFound, redirect } from "next/navigation";
import type { Principal } from "./auth";
import { permissions } from "./registry";
import { currentPrincipal } from "./session";

/** Platform admin pages: signed in and holding `action`, else 404 (no hint that the page exists). */
export async function requireAction(localeParam: string, action: string): Promise<{ me: Principal; locale: Locale; tr: (k: string, v?: Record<string, string | number>) => string }> {
  if (!isLocale(localeParam)) notFound();
  const me = await currentPrincipal();
  if (!me) redirect(`/${localeParam}/login`);
  if (!permissions.can(me.user, action, { stream: "platform" })) notFound();
  const locale = localeParam;
  return { me, locale, tr: (k, v) => t(locale, `admin.${k}`, v) };
}

/** Haut-Lomami is UTC+2 all year; admins type local times. */
export function parseLocalDateTime(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  const d = new Date(`${s}:00+02:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatLocal(d: Date | null | undefined, locale: Locale): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lubumbashi" }).format(d);
}
