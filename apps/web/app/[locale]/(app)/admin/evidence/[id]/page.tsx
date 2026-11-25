import { notFound } from "next/navigation";
import { ButtonLink, Field, Fields, Notice, PageHeader, RowMenu, SubmitButton, Table } from "@/components/ui";
import { formatLocal } from "@/lib/admin";
import { adminAccess } from "@/lib/access";
import { NoAccess } from "@/components/no-access";
import { siteNames } from "@/lib/site-names";
import { titled } from "@/lib/meta";
import { t } from "@eu/core/i18n";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { getCutoff, lateRecords, summarise, type LateRecord } from "@/lib/evidence";
import { db } from "@/lib/http";
import { entities } from "@/lib/registry";
import { decideAction } from "../../actions";

export const dynamic = "force-dynamic";
export const generateMetadata = titled(async (l, p) => (await getCutoff(db(), p.id ?? "").catch(() => undefined))?.label ?? t(l, "admin.cutoffs"));

export default async function CutoffPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await params;
  const { locale, tr, allowed } = await adminAccess(p.locale, "evidence.manage");
  if (!allowed) return <NoAccess locale={locale} />;
  const sp = await searchParams;
  const cutoff = await getCutoff(db(), p.id);
  if (!cutoff) notFound();
  const summary = await summarise(db(), entities, cutoff);
  const late: LateRecord[] = (await Promise.all(entities.all().map((e) => lateRecords(db(), e, cutoff)))).flat();
  const label = (name: string) => entities.get(name)?.label[locale] ?? name;
  const where = await siteNames(late.map((r) => r.scopeId));

  return (
    <section>
      <Link className="back-link" href={`/${locale}/admin/evidence`}><Icon name="back" size={16} />{t(locale, "ui.evidence.back")}</Link>
      <PageHeader
        title={cutoff.label}
        subtitle={formatLocal(cutoff.cutoffAt, locale)}
        actions={<ButtonLink href={`/api/admin/evidence/${cutoff.id}`} variant="secondary">{tr("download")}</ButtonLink>}
      />
      {sp.error && <Notice tone="error">{sp.error === "invalid" ? t(locale, "ui.evidence.invalidDecision") : tr("reasonRequired")}</Notice>}
      {sp.ok && <Notice tone="success">{tr("saved")}</Notice>}
      <Table
        rows={summary}
        rowKey={(s) => s.entity}
        empty={tr("none")}
        columns={[
          { key: "type", header: tr("recordType"), render: (s) => s.label[locale] },
          { key: "counted", header: tr("counted"), numeric: true, render: (s) => s.counted },
          { key: "admitted", header: tr("lateAdmitted"), numeric: true, render: (s) => s.lateAdmitted },
          { key: "pending", header: tr("latePending"), numeric: true, render: (s) => (s.latePending ? <strong>{s.latePending}</strong> : 0) },
          { key: "excluded", header: tr("lateExcluded"), numeric: true, render: (s) => s.lateExcluded },
          { key: "clock", header: tr("clockSuspect"), numeric: true, render: (s) => s.clockSuspect },
        ]}
      />
      <h2>{tr("latePending")}</h2>
      <Table
        rows={late}
        rowKey={(r) => `${r.entity}:${r.recordId}`}
        empty={tr("none")}
        columns={[
          { key: "type", header: tr("recordType"), render: (r) => label(r.entity) },
          { key: "where", header: t(locale, "ui.evidence.site"), render: (r) => where.get(r.scopeId) ?? <span className="muted">{t(locale, "ui.evidence.deletedSite")}</span> },
          { key: "captured", header: tr("capturedAt"), render: (r) => <>{formatLocal(r.deviceTime, locale)}{r.clockSuspect && <> · <strong>{tr("clockSuspect")}</strong></>}</> },
          { key: "received", header: tr("receivedAt"), render: (r) => formatLocal(r.serverTime, locale) },
          {
            key: "decision",
            header: tr("decision"),
            shrink: true,
            render: (r) => (
              <span className="decide">
                {r.decision && <span className={r.decision === "admitted" ? "pill good" : "pill bad"} title={r.reason ?? ""}>{r.decision === "admitted" ? tr("lateAdmitted") : tr("lateExcluded")}</span>}
                <RowMenu label={tr("decision")} icon="check">
                  <form action={decideAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="cutoffId" value={cutoff.id} />
                    <input type="hidden" name="entity" value={r.entity} />
                    <input type="hidden" name="recordId" value={r.recordId} />
                    {r.decision && <p style={{ margin: "0 0 8px" }}><strong>{r.decision === "admitted" ? tr("lateAdmitted") : tr("lateExcluded")}</strong>: {r.reason}</p>}
                    <Fields>
                      <Field span={12} label={tr("reason")}><input name="reason" required minLength={3} /></Field>
                    </Fields>
                    <div className="ffoot"><div className="ffoot-actions">
                      <SubmitButton small variant="secondary" name="decision" value="excluded">{tr("exclude")}</SubmitButton>
                      <SubmitButton small name="decision" value="admitted">{tr("admit")}</SubmitButton>
                    </div></div>
                  </form>
                </RowMenu>
              </span>
            ),
          },
        ]}
      />
    </section>
  );
}
