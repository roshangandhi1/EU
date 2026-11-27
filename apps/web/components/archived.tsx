/** Server-side pieces shared by the boreholes, plots and schools lists: archive labels, notices, the Archived list. */
import { t, type Locale } from "@eu/core/i18n";
import { db } from "@/lib/http";
import { listArchived, type DeletableKind } from "@/lib/site-delete";
import { fmtDate, fmtNum } from "@/lib/format";
import { Notice, Section, Table } from "@/components/ui";
import { RestoreSite, type DeleteLabels } from "./delete-site";

const KEYS = ["action", "title", "loading", "alsoGoes", "nothingLinked", "effect", "reason", "reasonHint", "reasonDefault", "yes", "no", "deleting", "failed", "forbidden", "network"] as const;

export function deleteLabels(locale: Locale): DeleteLabels {
  return Object.fromEntries(KEYS.map((k) => [k, t(locale, `ui.del.${k}`)])) as unknown as DeleteLabels;
}

/** The notice after an archive or a restore (the actions redirect with ?deleted= or ?restored=). */
export function ArchiveNotice({ locale, sp }: { locale: Locale; sp: { deleted?: string; restored?: string; n?: string } }) {
  const n = fmtNum(Number(sp.n ?? 0) || 0, locale, 0);
  if (sp.deleted) return <Notice tone="success">{t(locale, "ui.del.done", { name: sp.deleted, n })}</Notice>;
  if (sp.restored) return <Notice tone="success">{t(locale, "ui.del.restored", { name: sp.restored, n })}</Notice>;
  return null;
}

/** Archived sites of this kind with a Restore button each. Shown to system administrators only, and only when there are some. */
export async function ArchivedList({ locale, kind, stream, back }: { locale: Locale; kind: DeletableKind; stream?: string; back: string }) {
  const rows = await listArchived(db(), kind, stream);
  if (rows.length === 0) return null;
  const d = (k: string) => t(locale, `ui.del.${k}`);
  const labels = { restore: d("restore"), restoreConfirm: d("restoreConfirm"), restoring: d("restoring"), no: d("no"), restoreFailed: d("restoreFailed"), codeTaken: d("codeTaken"), forbidden: d("forbidden") };
  return (
    <Section id="archived" icon="archive" title={d("archived")} description={d("archivedIntro")} count={rows.length} flush className="archived">
      <Table
        flush
        rows={rows}
        rowKey={(r) => r.siteId}
        empty="—"
        columns={[
          { key: "name", header: d("name"), render: (r) => <strong>{r.name}</strong> },
          { key: "on", header: d("archivedOn"), render: (r) => <span className="nowrap">{fmtDate(r.archivedAt, locale)}</span> },
          { key: "reason", header: d("reason"), render: (r) => r.reason },
          { key: "n", header: d("records"), numeric: true, render: (r) => fmtNum(r.records, locale, 0) },
          { key: "restore", header: "", render: (r) => <RestoreSite siteId={r.siteId} kind={kind} name={r.name} locale={locale} back={back} labels={labels} /> },
        ]}
      />
    </Section>
  );
}
