import { commitImport, previewImport } from "@eu/forestry/server";
import { fa, ImportFileError, MAX_IMPORT_BYTES, type ForestryStream } from "@eu/forestry";
import { authenticate, db, json } from "@/lib/http";
import { entities, permissions } from "@/lib/registry";
import { isIsoDate } from "@/lib/dates";

export const maxDuration = 60;

/**
 * POST multipart/form-data: file (KMZ/KML), action = "preview" | "commit".
 * On commit the server re-reads the file; it never trusts geometry sent back by the browser.
 */
export async function POST(req: Request, { params }: { params: Promise<{ stream: string }> }) {
  const { stream } = await params;
  if (stream !== "bamboo" && stream !== "miombo") return json({ error: "not_found" }, 404);
  const s = stream as ForestryStream;
  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;
  const { user } = auth.principal;
  if (!permissions.can(user, fa(s, "import.run"), { stream: s })) return json({ error: "forbidden" }, 403);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return json({ error: "file_required" }, 400);
  if (file.size > MAX_IMPORT_BYTES) return json({ error: "file_too_large" }, 413);
  const name = file.name || "upload.kmz";
  if (!/\.(kmz|kml)$/i.test(name)) return json({ error: "unsupported_format" }, 400);

  let preview;
  try {
    preview = await previewImport(db(), s, name, new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    // kml_too_large, no_kml_in_kmz, too_many_placemarks, file_too_large; anything else is unreadable.
    return json({ error: err instanceof ImportFileError ? err.code : "unreadable_file" }, 400);
  }
  if (form.get("action") !== "commit") return json(preview);

  const include = new Set(form.getAll("include").map(String));
  const chosen = preview.candidates.filter((c) => include.has(String(c.index)));
  const village = String(form.get("village") ?? "").trim();
  if (!village) return json({ error: "village_required" }, 400);
  const status = String(form.get("status") ?? "planted");
  if (!["planned", "pegged", "planted", "established"].includes(status)) return json({ error: "invalid_status" }, 400);
  const approveFrom = form.get("approveFrom");
  const result = await commitImport(
    { db: db(), user, deviceId: auth.principal.deviceId ?? `web:${user.id}`, permissions, entities },
    chosen,
    {
      stream: s,
      village,
      sourceName: name,
      status: status as "planted",
      species: form.getAll("species").map(String).filter(Boolean),
      approveFrom: isIsoDate(approveFrom) ? approveFrom : null,
      checkedAgainst: String(form.get("checkedAgainst") ?? "").trim() || null,
    },
  );
  return json(result);
}
