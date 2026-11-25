import { z } from "zod";
import { checkCredentials, loadAssignments, registerDevice } from "@/lib/auth";
import { clientIp, db, json, readJson } from "@/lib/http";
import { users } from "@eu/db";
import { eq } from "drizzle-orm";

const body = z.object({
  email: z.string().min(3),
  password: z.string().min(1),
  deviceId: z.string().min(8).max(100),
  deviceName: z.string().min(1).max(100),
  appVersion: z.string().max(50).optional(),
});

/** Phone sign-in: checks credentials once, then issues a long-lived device token. */
export async function POST(req: Request) {
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const p = parsed.data;
  const cred = await checkCredentials(db(), p.email, p.password, new Date(), clientIp(req));
  if (!cred.ok) return json({ error: cred.reason }, cred.reason === "locked" ? 429 : 401);
  const reg = await registerDevice(db(), cred.userId, p.deviceId, p.deviceName, p.appVersion ?? null);
  if (!reg.ok) return json({ error: reg.reason }, reg.reason === "invalid_device_id" ? 400 : 403);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [u] = await (db() as any).select().from(users).where(eq(users.id, cred.userId));
  return json({
    token: reg.token,
    user: { id: u.id, name: u.name, email: u.email, locale: u.locale, assignments: await loadAssignments(db(), u.id) },
  });
}
