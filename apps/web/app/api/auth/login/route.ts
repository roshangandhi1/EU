import { z } from "zod";
import { checkCredentials, createSession, SESSION_COOKIE, WEB_SESSION_DAYS } from "@/lib/auth";
import { db, json, readJson } from "@/lib/http";

const body = z.object({ email: z.string().min(3), password: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const r = await checkCredentials(db(), parsed.data.email, parsed.data.password);
  if (!r.ok) return json({ error: r.reason }, r.reason === "locked" ? 429 : 401);
  const token = await createSession(db(), r.userId, "web", null);
  const res = json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: WEB_SESSION_DAYS * 86_400,
  });
  return res;
}
