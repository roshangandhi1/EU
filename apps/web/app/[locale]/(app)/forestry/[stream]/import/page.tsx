import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { isLocale, t } from "@eu/core/i18n";
import { fa, type ForestryStream } from "@eu/forestry";
import { loadSettings } from "@eu/forestry/server";
import { currentPrincipal } from "@/lib/session";
import { db } from "@/lib/http";
import { permissions } from "@/lib/registry";
import { ImportForm } from "./import-form";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { titled } from "@/lib/meta";

export const dynamic = "force-dynamic";
export const generateMetadata = titled((l, p) => `${t(l, "forestry.import.kmz")} · ${t(l, p.stream === "miombo" ? "forestry.miombo" : "forestry.bamboo")}`);

const KEYS = ["choose", "preview", "commit", "found", "found_one", "skipped", "skipped_one", "village", "status", "approve_from", "checked_against", "done", "done_one", "rejected", "include", "problems", "created"] as const;
const PROBLEMS = ["area_tiny", "area_implausible", "ring_too_short", "outside_drc", "name_missing", "name_too_long", "overlaps", "duplicate_name"] as const;
const ERRORS = ["file_required", "file_too_large", "unsupported_format", "unreadable_file", "no_kml_in_kmz", "village_required", "invalid_status", "invalid_approve_from", "forbidden", "forbidden_approve", "already_exists", "network", "unknown"] as const;

export default async function ImportPage({ params }: { params: Promise<{ locale: string; stream: string }> }) {
  const { locale, stream } = await params;
  if (!isLocale(locale) || (stream !== "bamboo" && stream !== "miombo")) notFound();
  const s = stream as ForestryStream;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  if (!permissions.can(me.user, fa(s, "import.run"), { stream: s })) return <NoAccess locale={locale} reason={t(locale, "forestry.import.err.forbidden")} />;
  const settings = await loadSettings(db(), s);
  const canApprove = permissions.can(me.user, fa(s, "boundary.approve"), { stream: s });
  return (
    <section className="module" data-stream={s}>
      <PageHeader icon={<Icon name="upload" size={24} />} eyebrow={t(locale, `forestry.${s}`)} title={t(locale, "forestry.import.kmz")} subtitle={t(locale, "forestry.boundary.draft_note")}
        actions={<Link className="btn secondary" href={`/${locale}/forestry/${s}`}><Icon name="back" size={16} />{t(locale, "forestry.import.back")}</Link>} />
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
          errors: Object.fromEntries(ERRORS.map((e) => [e, t(locale, `forestry.import.err.${e}`)])),
          mapHint: t(locale, "forestry.import.map_hint"), open: t(locale, "forestry.open"),
          ...Object.fromEntries(["step1", "step2", "step3", "fileHint", "backTo", "selected", "whatFollows", "saving", "optional"].map((k) => [k, t(locale, `ui.form.${k}`)])),
          statuses: Object.fromEntries(["planned", "pegged", "planted", "established"].map((o) => [o, t(locale, `forestry.status.${o}`)])),
        } as never}
      />
    </section>
  );
}
