import { acceptUpload, fileMetaSchema, MAX_FILE_BYTES } from "@/lib/files";
import { blobConfigured, vercelBlobs } from "@/lib/blob";
import { authenticate, db, json } from "@/lib/http";
import { entities, permissions } from "@/lib/registry";

export const maxDuration = 60;

/**
 * Phone photo upload: multipart form with "meta" (JSON, see fileMetaSchema) and "file".
 * Answers { status: "uploaded" | "duplicate" | "rejected", ... }; only "rejected" is final failure.
 */
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;
  if (!blobConfigured()) return json({ error: "storage_not_configured" }, 503);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_FILE_BYTES + 64_000) return json({ status: "rejected", reason: "too_large" }, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const file = form.get("file");
  let rawMeta: unknown;
  try {
    rawMeta = JSON.parse(String(form.get("meta") ?? ""));
  } catch {
    rawMeta = undefined;
  }
  const meta = fileMetaSchema.safeParse(rawMeta);
  if (!meta.success || !(file instanceof Blob)) return json({ error: "invalid_request" }, 400);

  const { principal } = auth;
  const result = await acceptUpload(
    { db: db(), user: principal.user, deviceId: principal.deviceId ?? null, permissions, entities, blobs: vercelBlobs },
    meta.data,
    new Uint8Array(await file.arrayBuffer()),
  );
  return json(result, result.status === "rejected" ? 422 : 200);
}
