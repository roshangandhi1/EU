"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { revokeDevice } from "@/lib/auth";
import { parseLocalDateTime, requireAction } from "@/lib/admin";
import { createCutoff, decide } from "@/lib/evidence";
import { db } from "@/lib/http";
import { entities } from "@/lib/registry";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const back = (path: string, q: Record<string, string>): never => redirect(`${path}?${new URLSearchParams(q)}`);

export async function createCutoffAction(fd: FormData) {
  const { me, locale } = await requireAction(str(fd, "locale"), "evidence.manage");
  const path = `/${locale}/admin/evidence`;
  const at = parseLocalDateTime(str(fd, "cutoffAt"));
  const label = str(fd, "label");
  if (!at || label.length < 2) back(path, { error: "invalid" });
  const c = await createCutoff(db(), { label, cutoffAt: at!, userId: me.user.id });
  revalidatePath(path);
  redirect(`${path}/${c.id}`);
}

export async function decideAction(fd: FormData) {
  const { me, locale } = await requireAction(str(fd, "locale"), "evidence.manage");
  const cutoffId = str(fd, "cutoffId");
  const path = `/${locale}/admin/evidence/${cutoffId}`;
  const entity = entities.get(str(fd, "entity"));
  const decision = str(fd, "decision");
  if (!entity || (decision !== "admitted" && decision !== "excluded")) back(path, { error: "invalid" });
  const r = await decide(db(), { cutoffId, entity: entity!, recordId: str(fd, "recordId"), decision: decision as "admitted" | "excluded", reason: str(fd, "reason"), userId: me.user.id });
  revalidatePath(path);
  back(path, r.ok ? { ok: "1" } : { error: r.reason });
}

export async function revokeAction(fd: FormData) {
  const { locale } = await requireAction(str(fd, "locale"), "devices.manage");
  const path = `/${locale}/admin/phones`;
  if (str(fd, "confirm") !== "yes") back(path, { error: "confirm" });
  await revokeDevice(db(), str(fd, "deviceId"));
  revalidatePath(path);
  back(path, { ok: "1" });
}
