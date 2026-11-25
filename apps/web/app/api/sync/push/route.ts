import { devices } from "@eu/db";
import { pushRequestSchema } from "@eu/sync";
import { handlePush } from "@eu/sync/server";
import { clockSkewMs } from "@eu/core";
import { eq } from "drizzle-orm";
import { authenticate, db, json, readJson } from "@/lib/http";
import { entities, permissions } from "@/lib/registry";

export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;
  const parsed = pushRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const { principal } = auth;
  const deviceId = principal.deviceId ?? `web:${principal.user.id}`;
  const res = await handlePush({ db: db(), user: principal.user, deviceId, permissions, entities }, parsed.data);
  if (principal.deviceId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db() as any)
      .update(devices)
      .set({ lastSeenAt: new Date(), lastSkewMs: clockSkewMs(new Date(), new Date(parsed.data.deviceNow)) })
      .where(eq(devices.id, principal.deviceId));
  }
  return json(res);
}
