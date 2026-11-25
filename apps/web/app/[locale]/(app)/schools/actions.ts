"use server";
import { sites } from "@eu/db";
import { createSchoolSite, insertMutation, schoolsTables } from "@eu/schools";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/http";
import { can, firstRejection, newId, push, signedIn, str, tr as trFor } from "@/lib/schools";
import { parseLatLng } from "./[siteId]/setup/checks";
import type { SetupState } from "./[siteId]/setup/actions";
import { errorText } from "./text";

/** Adds a school. A refused form keeps what was typed and outlines the field (short id or code already used). */
export async function createSchool(prev: SetupState, fd: FormData): Promise<SetupState> {
  const n = (prev.n ?? 0) + 1;
  const { me, locale } = await signedIn(str(fd, "locale"));
  const tr = trFor(locale);
  const fail = (code: string, fields: string[], setup = true) => ({ n, message: setup ? tr(`err.setup.${code}`) : errorText(code, tr), fields });
  if (!can(me, "sites.manage")) return fail("forbidden", [], false);
  const id = str(fd, "siteId").toLowerCase();
  const name = str(fd, "name");
  const code = str(fd, "code").toUpperCase();
  if (name.length < 3 || name.length > 120) return fail("schoolName", ["name"]);
  if (!/^[a-z0-9-]{2,40}$/.test(id)) return fail("siteId", ["siteId"]);
  if (!/^[A-Z]{2,12}$/.test(code)) return fail("code", ["code"]);
  const loc = parseLatLng(str(fd, "lat"), str(fd, "lng"));
  if ("code" in loc) return fail(loc.code, loc.fields);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = db() as any;
  if ((await q.select({ id: sites.id }).from(sites).where(eq(sites.id, id))).length) return fail("site_taken", ["siteId"], false);
  const t = schoolsTables.schoolSchools;
  if ((await q.select({ id: t.siteId }).from(t).where(eq(t.code, code))).length) return fail("code_taken", ["code"], false);
  await createSchoolSite(db(), { id, name, lat: loc.lat, lng: loc.lng });
  const res = await push(me, [
    insertMutation("school.school", id, { siteId: id, code, locale, shiftsRunning: ["morning"] }, { mutationId: newId(), recordId: newId() }),
  ]);
  const bad = firstRejection(res);
  revalidatePath(`/${locale}/schools`);
  if (bad) return fail(bad, [], false);
  redirect(`/${locale}/schools/${id}/setup?ok=1`);
}
