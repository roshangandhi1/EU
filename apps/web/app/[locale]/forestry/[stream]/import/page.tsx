import { notFound, redirect } from "next/navigation";
import { isLocale, t } from "@eu/core/i18n";
import { fa, type ForestryStream } from "@eu/forestry";
import { loadSettings } from "@eu/forestry/server";
import { currentPrincipal } from "@/lib/session";
import { db } from "@/lib/http";
import { permissions } from "@/lib/registry";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

const KEYS = ["choose", "preview", "commit", "found", "skipped", "village", "status", "approve_from", "checked_against", "done", "rejected", "include", "problems"] as const;
const PROBLEMS = ["area_tiny", "area_implausible", "ring_too_short", "outside_drc"] as const;

export default async function ImportPage({ params }: { params: Promise<{ locale: string; stream: string }> }) {
  const { locale, stream } = await params;
  if (!isLocale(locale) || (stream !== "bamboo" && stream !== "miombo")) notFound();
  const s = stream as ForestryStream;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  if (!permissions.can(me.user, fa(s, "import.run"), { stream: s })) return <p className="error">{t(locale, "forestry.forbidden")}</p>;
  const settings = await loadSettings(db(), s);
  const canApprove = permissions.can(me.user, fa(s, "boundary.approve"), { stream: s });
  return (
    <section className="module" data-stream={s}>
      <h1>{t(locale, "forestry.import.kmz")} · {t(locale, `forestry.${s}`)}</h1>
      <p className="muted">{t(locale, "forestry.boundary.draft_note")}</p>
      <ImportForm
        locale={locale}
        stream={s}
        canApprove={canApprove}
        species={settings.speciesList.map((x) => ({ key: x.key, label: x.latin }))}
        labels={{
          ...Object.fromEntries(KEYS.map((k) => [k, t(locale, `forestry.import.${k}`)])),
          area: t(locale, "forestry.area_ha"),
          plot: t(locale, "forestry.plot"),
          species: t(locale, "forestry.planting.species"),
          problemNames: Object.fromEntries(PROBLEMS.map((p) => [p, t(locale, `forestry.import.problem.${p}`)])),
          statuses: Object.fromEntries(["planned", "pegged", "planted", "established"].map((o) => [o, t(locale, `forestry.status.${o}`)])),
        } as never}
      />
    </section>
  );
}
