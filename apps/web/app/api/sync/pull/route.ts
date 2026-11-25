import { pullRequestSchema } from "@eu/sync";
import { handlePull } from "@eu/sync/server";
import { authenticate, db, json, readJson } from "@/lib/http";
import { entities, permissions } from "@/lib/registry";

export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;
  const parsed = pullRequestSchema.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const { principal } = auth;
  const deviceId = principal.deviceId ?? `web:${principal.user.id}`;
  return json(await handlePull({ db: db(), user: principal.user, deviceId, permissions, entities }, parsed.data));
}
