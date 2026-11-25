import { cookies } from "next/headers";
import { revokeSession, SESSION_COOKIE } from "@/lib/auth";
import { db, json, sameOrigin } from "@/lib/http";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "cross_origin" }, 403);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(db(), token);
  const res = json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
