import { z } from "zod";
import { demoStatus, loadDemo, removeDemo } from "@/lib/demo";
import { authenticate, db, json, readJson } from "@/lib/http";
import { entities, permissions } from "@/lib/registry";

export const maxDuration = 60;

/** Demo data for a first look: GET status, POST {action: "load" | "remove"}. Phones (Bearer) and web. */
export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;
  if (!permissions.can(auth.principal.user, "sites.manage", { stream: "platform" })) return json({ error: "forbidden" }, 403);
  return json(await demoStatus(db()));
}

const body = z.object({ action: z.enum(["load", "remove"]) });

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const { user, deviceId } = auth.principal;
  const ctx = { db: db(), user, deviceId: deviceId ?? `web:${user.id}`, permissions, entities };
  const r = parsed.data.action === "load" ? await loadDemo(ctx) : await removeDemo(ctx);
  return json(r.ok ? r : { error: r.reason }, r.ok ? 200 : r.reason === "forbidden" ? 403 : 409);
}
