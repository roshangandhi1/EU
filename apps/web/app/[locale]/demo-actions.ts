"use server";
import { isLocale } from "@eu/core/i18n";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadDemo, removeDemo } from "@/lib/demo";
import { db } from "@/lib/http";
import { entities, permissions } from "@/lib/registry";
import { currentPrincipal } from "@/lib/session";

export async function demoAction(fd: FormData) {
  const locale = String(fd.get("locale"));
  if (!isLocale(locale)) return;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  const ctx = { db: db(), user: me.user, deviceId: me.deviceId ?? `web:${me.user.id}`, permissions, entities };
  const r = fd.get("action") === "remove" ? await removeDemo(ctx) : await loadDemo(ctx);
  revalidatePath(`/${locale}`, "layout");
  redirect(`/${locale}?demo=${r.ok ? (fd.get("action") === "remove" ? "removed" : "loaded") : "failed"}`);
}
