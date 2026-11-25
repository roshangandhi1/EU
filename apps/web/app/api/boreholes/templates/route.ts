import { templateSchema } from "@eu/boreholes";
import { saveTemplate } from "@eu/boreholes/server";
import { authenticate, db, json, readJson } from "@/lib/http";
import { entities, permissions } from "@/lib/registry";

const body = templateSchema.omit({ templateVersion: true, active: true });

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid_request", issues: parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message) }, 400);
  const { user, deviceId } = auth.principal;
  const r = await saveTemplate({ db: db(), user, deviceId: deviceId ?? `web:${user.id}`, permissions, entities }, parsed.data as never);
  return json(r, r.ok ? 200 : r.reason === "forbidden" ? 403 : 400);
}
