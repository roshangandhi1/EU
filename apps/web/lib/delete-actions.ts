"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isLocale } from "@eu/core/i18n";
import { db } from "./http";
import { entities, permissions } from "./registry";
import { currentPrincipal } from "./session";
import { canDeleteSites, deleteSite, linkedRecords, restoreSite, type DeletableKind } from "./site-delete";

const KINDS: DeletableKind[] = ["borehole", "plot", "school"];

export type DeletePreview =
  | { ok: true; name: string; linked: { label: { en: string; fr: string }; n: number; own: boolean }[] }
  | { ok: false; reason: string };

/** What the confirmation dialog shows: the site's name and the live records held under it. */
export async function previewDelete(siteId: string, kind: string): Promise<DeletePreview> {
  const me = await currentPrincipal();
  if (!me || !canDeleteSites(permissions, me.user)) return { ok: false, reason: "forbidden" };
  const r = await linkedRecords(db(), entities, siteId);
  if (!r || r.site.kind !== kind || !r.site.active) return { ok: false, reason: "not_found" };
  const own = new Set(["boreholes.borehole", "bamboo.plot", "miombo.plot", "school.school"]);
  return { ok: true, name: r.site.name, linked: r.linked.map((l) => ({ label: l.label, n: l.n, own: own.has(l.entity) })) };
}

export type DeleteState = { ok: false; reason: string } | null;

/** Deletes the site (system administrators only), then reloads the list it was deleted from with a notice. */
export async function deleteSiteAction(_prev: DeleteState, fd: FormData): Promise<DeleteState> {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const locale = s("locale");
  const kind = s("kind") as DeletableKind;
  const me = await currentPrincipal();
  if (!me || !isLocale(locale) || !KINDS.includes(kind)) return { ok: false, reason: "forbidden" };
  const reason = s("reason").slice(0, 500) || "Archived by a system administrator";
  const r = await deleteSite({ db: db(), user: me.user, deviceId: me.deviceId ?? `web:${me.user.id}`, permissions, entities }, s("siteId"), kind, reason);
  if (!r.ok) return { ok: false, reason: r.reason };
  const back = s("back").startsWith(`/${locale}/`) ? s("back").split(/[?#]/)[0]! : `/${locale}`;
  revalidatePath(back);
  // The site's own record is one of the voided records; the notice counts the others.
  redirect(`${back}?${new URLSearchParams({ deleted: r.name, n: String(Math.max(0, r.voided - 1)) })}`);
}

/** Restores an archived site and its records (system administrators only), then reloads the list. */
export async function restoreSiteAction(_prev: DeleteState, fd: FormData): Promise<DeleteState> {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const locale = s("locale");
  const kind = s("kind") as DeletableKind;
  const me = await currentPrincipal();
  if (!me || !isLocale(locale) || !KINDS.includes(kind)) return { ok: false, reason: "forbidden" };
  const r = await restoreSite({ db: db(), user: me.user, deviceId: me.deviceId ?? `web:${me.user.id}`, permissions, entities }, s("siteId"), kind);
  if (!r.ok) return { ok: false, reason: r.reason };
  const back = s("back").startsWith(`/${locale}/`) ? s("back").split(/[?#]/)[0]! : `/${locale}`;
  revalidatePath(back);
  redirect(`${back}?${new URLSearchParams({ restored: r.name, n: String(r.voided) })}`);
}
