import { cookies } from "next/headers";
import { revokeSession, SESSION_COOKIE } from "@/lib/auth";
import { db, json } from "@/lib/http";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(db(), token);
  const res = json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
