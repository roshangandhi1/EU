"use server";
import { createSchoolSite, insertMutation } from "@eu/schools";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/http";
import { back, can, firstRejection, newId, push, signedIn, str } from "@/lib/schools";

export async function createSchool(fd: FormData) {
  const { me, locale } = await signedIn(str(fd, "locale"));
  const path = `/${locale}/schools`;
  if (!can(me, "sites.manage")) back(path, { error: "forbidden" });
  const id = str(fd, "siteId").toLowerCase();
  const name = str(fd, "name");
  const code = str(fd, "code").toUpperCase();
  if (!/^[a-z0-9-]{2,40}$/.test(id) || !name || !/^[A-Z]{2,12}$/.test(code)) back(path, { error: "invalid" });
  await createSchoolSite(db(), { id, name });
  const res = await push(me, [
    insertMutation("school.school", id, { siteId: id, code, locale, shiftsRunning: ["morning"] }, { mutationId: newId(), recordId: newId() }),
  ]);
  const bad = firstRejection(res);
  revalidatePath(path);
  if (bad) back(path, { error: bad });
  back(`${path}/${id}/setup`, { ok: "1" });
}
