"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isLocale } from "@eu/core/i18n";
import { currentPrincipal } from "@/lib/session";
import { db } from "@/lib/http";
import { addRole, createUser, removeRole, resetPassword, setActive, type UsersResult } from "@/lib/users";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function usersAction(fd: FormData) {
  const locale = s(fd, "locale");
  if (!isLocale(locale)) return;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  let r: UsersResult;
  switch (s(fd, "op")) {
    case "create":
      r = await createUser(db(), me, { name: s(fd, "name"), email: s(fd, "email"), password: s(fd, "password"), role: s(fd, "role"), scope: s(fd, "scope"), locale: s(fd, "userLocale") });
      break;
    case "addRole": r = await addRole(db(), me, s(fd, "userId"), s(fd, "role"), s(fd, "scope")); break;
    case "removeRole": r = await removeRole(db(), me, s(fd, "assignmentId")); break;
    case "reset": r = await resetPassword(db(), me, s(fd, "userId"), s(fd, "password")); break;
    case "deactivate": r = await setActive(db(), me, s(fd, "userId"), false); break;
    case "reactivate": r = await setActive(db(), me, s(fd, "userId"), true); break;
    default: r = { ok: false, code: "invalid" };
  }
  revalidatePath(`/${locale}/admin/users`);
  redirect(`/${locale}/admin/users?${r.ok ? "done" : "err"}=${r.code}`);
}
