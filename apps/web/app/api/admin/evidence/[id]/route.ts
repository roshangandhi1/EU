import { auditLog } from "@eu/db";
import { csvLocale } from "@/lib/csv";
import { evidenceCsv, getCutoff } from "@/lib/evidence";
import { authenticate, db, json } from "@/lib/http";
import { entities, permissions } from "@/lib/registry";

/** Evidence CSV for one cut-off: every record captured by then, with its counted / late status. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;
  if (!permissions.can(auth.principal.user, "evidence.manage", { stream: "platform" })) return json({ error: "forbidden" }, 403);
  const cutoff = await getCutoff(db(), (await params).id);
  if (!cutoff) return json({ error: "not_found" }, 404);
  const csv = await evidenceCsv(db(), entities, cutoff, csvLocale(new URL(req.url).searchParams.get("locale") ?? auth.principal.locale));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db() as any).insert(auditLog).values({
    entity: "platform.evidence_export",
    recordId: cutoff.id,
    op: "export",
    userId: auth.principal.user.id,
    newValues: { cutoffAt: cutoff.cutoffAt.toISOString(), rows: csv.split("\r\n").length - 2 },
  });
  const name = `evidence-${cutoff.cutoffAt.toISOString().slice(0, 10)}.csv`;
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } });
}
