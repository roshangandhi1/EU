import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader, Section, Table } from "@/components/ui";
import { SubmitButton } from "@/components/ui/form";
import { adminAccess } from "@/lib/access";
import { NoAccess } from "@/components/no-access";
import { titled } from "@/lib/meta";
import { t } from "@eu/core/i18n";
import { db } from "@/lib/http";
import { fmtDate, fmtEur } from "@/lib/format";
import { budgetEur, loadOutcomes, loadPeriods, validatedEur } from "@/lib/periods";
import { addPeriodAction } from "./actions";

export const dynamic = "force-dynamic";
export const generateMetadata = titled("ui.nav.periods");

export default async function PeriodsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, allowed } = await adminAccess((await params).locale, "periods.manage");
  if (!allowed) return <NoAccess locale={locale} />;
  const a = (k: string, v?: Record<string, string | number>) => t(locale, `dashboard.admin.${k}`, v);
  const [periods, outcomes] = await Promise.all([loadPeriods(db()), loadOutcomes(db())]);
  const d = (iso: string | null) => fmtDate(iso, locale);
  return (
    <section>
      <PageHeader icon={<Icon name="coins" size={24} />} title={t(locale, "ui.nav.periods")} subtitle={a("intro")} />
      <Section icon="calendar" title={a("periods")} count={periods.length}
        actions={<form action={addPeriodAction}><input type="hidden" name="locale" value={locale} /><SubmitButton icon="plus" variant="secondary" small>{a("add")}</SubmitButton></form>}>
        <Table
          rows={periods}
          rowKey={(p) => String(p.n)}
          empty={a("add")}
          emptyIcon="calendar"
          flush
          columns={[
            { key: "n", header: a("period"), render: (p) => <Link href={`/${locale}/admin/periods/${p.n}`}>{a("editTitle", { n: p.n })}</Link> },
            { key: "dates", header: a("dates"), render: (p) => `${d(p.startsOn)} – ${d(p.endsOn)}` },
            { key: "status", header: a("status"), render: (p) => <span className={`pill ${p.status === "validated" ? "good" : "info"}`}>{a(p.status)}</span> },
            { key: "budget", header: a("budget"), numeric: true, render: (p) => fmtEur(budgetEur(p), locale) },
            { key: "val", header: a("validatedEur"), numeric: true, render: (p) => { const v = validatedEur(p); return v === null ? "–" : fmtEur(v, locale); } },
            { key: "edit", header: "", shrink: true, render: (p) => <Link className="btn ghost sm" href={`/${locale}/admin/periods/${p.n}`}><Icon name="pencil" size={15} />{a("edit")}</Link> },
          ]}
        />
        <p className="muted small" style={{ margin: "10px 16px 14px" }}>{a("addHint")}</p>
      </Section>
      <Section icon="chart" title={a("outcomes")} description={a("outcomesIntro")}
        actions={<Link className="btn secondary sm" href={`/${locale}/admin/periods/outcomes`}><Icon name="pencil" size={15} />{a("editOutcomes")}</Link>}>
        <Table
          rows={outcomes}
          rowKey={(o) => o.code}
          empty="–"
          flush
          columns={[
            { key: "code", header: t(locale, "dashboard.col.code"), shrink: true, render: (o) => o.code },
            { key: "name", header: t(locale, "dashboard.col.name"), render: (o) => t(locale, `dashboard.outcomes.name.o${o.code.replace(".", "")}`) },
            { key: "target", header: a("outcomeTarget"), render: (o) => (locale === "fr" ? o.targetFr : o.targetEn) },
            { key: "rep", header: a("outcomeReported"), render: (o) => (locale === "fr" ? o.reportedFr ?? o.reportedEn : o.reportedEn ?? o.reportedFr) ?? "–" },
          ]}
        />
      </Section>
    </section>
  );
}
