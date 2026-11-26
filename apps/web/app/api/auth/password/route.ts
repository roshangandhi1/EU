import { z } from "zod";
import { changeOwnPassword } from "@/lib/auth";
import { authenticate, clientIp, db, json, readJson, sameOrigin } from "@/lib/http";

const body = z.object({ current: z.string().min(1).max(500), next: z.string().min(1).max(500) });

/**
 * The signed-in person changes their own password (web cookie or phone token).
 * 400 wrong_password | weak_password | same_password, 429 locked. This session stays signed in.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "cross_origin" }, 403);
  const auth = await authenticate(req, { allowPasswordChange: true });
  if (!auth.ok) return auth.res;
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const r = await changeOwnPassword(db(), auth.principal, parsed.data.current, parsed.data.next, clientIp(req));
  if (!r.ok) return json({ error: r.reason }, r.reason === "locked" ? 429 : 400);
  return json({ ok: true });
}
