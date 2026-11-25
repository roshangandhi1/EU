import { z } from "zod";
import { nextCutoff, recordDeviceStatus } from "@/lib/evidence";
import { authenticate, db, json, readJson } from "@/lib/http";

const body = z.object({ pendingChanges: z.number().int().min(0), pendingPhotos: z.number().int().min(0) });

/** Phones report what they still hold unsynced; the answer tells them about the next evidence cut-off. */
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  if (auth.principal.deviceId) await recordDeviceStatus(db(), auth.principal.deviceId, parsed.data);
  const next = await nextCutoff(db());
  return json({ nextCutoff: next ? { at: next.cutoffAt.toISOString(), label: next.label } : null });
}
