import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createFirstAdmin } from "@/lib/auth";
import { db, json, readJson } from "@/lib/http";

const body = z.object({ token: z.string(), email: z.email(), name: z.string().min(2), password: z.string() });

/** Creates the first system admin. Needs SETUP_TOKEN (a Vercel env var) and works only once. */
export async function POST(req: Request) {
  const expected = process.env.SETUP_TOKEN;
  if (!expected) return json({ error: "setup_disabled" }, 403);
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const a = Buffer.from(parsed.data.token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return json({ error: "bad_token" }, 403);
  const r = await createFirstAdmin(db(), parsed.data);
  if (!r.ok) return json({ error: r.reason }, r.reason === "closed" ? 409 : 400);
  return json({ ok: true });
}
