import { z } from "zod";
import { createBorehole } from "@eu/boreholes/server";
import { authenticate, db, json, readJson } from "@/lib/http";
import { entities, permissions } from "@/lib/registry";

const body = z.object({
  code: z.string().trim().min(1).max(40),
  village: z.string().trim().min(1).max(120),
  lat: z.number().min(-14).max(6).nullable().optional(),
  lng: z.number().min(12).max(32).nullable().optional(),
  pumpRatingKw: z.number().positive().max(50).nullable().optional(),
  lifecycle: z.enum(["planned", "drilled", "equipped", "commissioned", "handed_over", "operational", "needs_repair", "non_functional"]).optional(),
});

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const { user, deviceId } = auth.principal;
  const r = await createBorehole({ db: db(), user, deviceId: deviceId ?? `web:${user.id}`, permissions, entities }, parsed.data);
  return json(r, r.ok ? 200 : r.reason === "forbidden" ? 403 : 400);
}
