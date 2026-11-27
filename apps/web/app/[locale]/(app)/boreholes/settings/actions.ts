"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isLocale } from "@eu/core/i18n";
import { CRITERIA_KEYS } from "@eu/boreholes";
import { saveSettings } from "@eu/boreholes/server";
import { db } from "@/lib/http";
import { entities, permissions } from "@/lib/registry";
import { currentPrincipal } from "@/lib/session";

/** Save which checks count for 1.1.1 and the two windows (system administrators only). */
export async function saveCriteriaAction(fd: FormData) {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const locale = s("locale");
  if (!isLocale(locale)) redirect("/fr");
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  const path = `/${locale}/boreholes/settings`;
  const back = (q: Record<string, string>): never => redirect(`${path}?${new URLSearchParams(q)}`);
  if (!permissions.can(me.user, "boreholes.criteria.write", { stream: "boreholes" })) back({ error: "forbidden" });
  const on = new Set(fd.getAll("on").map(String));
  const days = (k: string) => (s(k) === "" ? null : Number(s(k).replace(/\s/g, "")));
  const window = days("maxCheckAgeDays");
  const wq = days("wqMaxAgeDays");
  const okDays = (n: number | null) => n === null || (Number.isInteger(n) && n >= 1 && n <= 36_500);
  if (window === null || !okDays(window) || !okDays(wq)) back({ error: "invalid" });
  const r = await saveSettings(
    { db: db(), user: me.user, deviceId: me.deviceId ?? `web:${me.user.id}`, permissions, entities },
    { maxCheckAgeDays: window!, criteria: { on: Object.fromEntries(CRITERIA_KEYS.map((k) => [k, on.has(k)])), waterQualityMaxAgeDays: wq } },
  );
  revalidatePath(`/${locale}/boreholes`, "layout");
  if (r.ok) back({ ok: "saved" });
  back({ error: r.ok ? "" : r.reason });
}
