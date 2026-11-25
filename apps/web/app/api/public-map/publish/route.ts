import { z } from "zod";
import { PUBLIC_LAYERS } from "@eu/maps/server";
import { authenticate, json, readJson } from "@/lib/http";
import { publishLayer } from "@/lib/public-map";

const body = z.object({ layer: z.enum(PUBLIC_LAYERS) });

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const r = await publishLayer(auth.principal.user, parsed.data.layer);
  return json(r, r.ok ? 200 : 403);
}
