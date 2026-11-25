import { readableFile } from "@/lib/files";
import { vercelBlobs } from "@/lib/blob";
import { authenticate, db, json } from "@/lib/http";
import { entities, permissions } from "@/lib/registry";

/** Streams an evidence file to a signed-in user allowed to read its records. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const row = await readableFile({ db: db(), user: auth.principal.user, permissions, entities }, id);
  if (!row) return json({ error: "not_found" }, 404);
  const blob = await vercelBlobs.get(row.blobPath);
  if (!blob) return json({ error: "not_found" }, 404);
  return new Response(blob.stream, {
    headers: { "content-type": blob.mime, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
  });
}
