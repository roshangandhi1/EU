import { templateCsv } from "@/lib/pupil-import";
import { currentPrincipal } from "@/lib/session";

/** The pupil import template, in French (semicolons, as French Excel saves) or English (commas). */
export async function GET(req: Request) {
  if (!(await currentPrincipal())) return new Response("Unauthorized", { status: 401 });
  const lang = new URL(req.url).searchParams.get("lang") === "en" ? "en" : "fr";
  const name = lang === "fr" ? "modele-import-eleves.csv" : "pupil-import-template.csv";
  return new Response(templateCsv(lang), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
