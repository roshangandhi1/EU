import Link from "next/link";
import { Icon } from "@/components/icons";
import { Field, Fields, FormFooter, Notice, PageHeader, Section, SubmitButton } from "@/components/ui";
import { adminAccess } from "@/lib/access";
import { NoAccess } from "@/components/no-access";
import { titled } from "@/lib/meta";
import { t } from "@eu/core/i18n";
import { db } from "@/lib/http";
import { loadOutcomes } from "@/lib/periods";
import { saveOutcomesAction } from "../actions";

export const dynamic = "force-dynamic";
export const generateMetadata = titled("dashboard.outcomes.title");

export default async function OutcomesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale, allowed } = await adminAccess((await params).locale, "periods.manage");
  if (!allowed) return <NoAccess locale={locale} />;
  const a = (k: string) => t(locale, `dashboard.admin.${k}`);
  const sp = await searchParams;
  const outcomes = await loadOutcomes(db());
  const opt = t(locale, "ui.form.optional");
  return (
    <section>
      <PageHeader icon={<Icon name="chart" size={24} />} eyebrow={t(locale, "ui.nav.periods")} title={a("outcomes")} subtitle={a("outcomesIntro")}
        actions={<Link className="btn ghost sm" href={`/${locale}/admin/periods`}><Icon name="back" size={15} />{a("back")}</Link>} />
      {sp.ok && <Notice tone="success">{a("saved")}</Notice>}
      {sp.error && <Notice tone="error">{a(`errors.${sp.error}`)}</Notice>}
      <form action={saveOutcomesAction}>
        <input type="hidden" name="locale" value={locale} />
        {outcomes.map((o) => {
          const k = o.code.replace(".", "_");
          return (
            <Section key={o.code} title={`${o.code} ${t(locale, `dashboard.outcomes.name.o${o.code.replace(".", "")}`)}`}>
              <Fields>
                <Field span={6} label={`${a("outcomeTarget")} (EN)`}><textarea name={`ten_${k}`} rows={2} required defaultValue={o.targetEn} /></Field>
                <Field span={6} label={`${a("outcomeTarget")} (FR)`}><textarea name={`tfr_${k}`} rows={2} required defaultValue={o.targetFr} /></Field>
                <Field span={6} label={`${a("outcomeReported")} (EN)`} optional={opt}><textarea name={`ren_${k}`} rows={2} defaultValue={o.reportedEn ?? ""} /></Field>
                <Field span={6} label={`${a("outcomeReported")} (FR)`} optional={opt}><textarea name={`rfr_${k}`} rows={2} defaultValue={o.reportedFr ?? ""} /></Field>
                <Field span={4} label={a("reportedOn")} optional={opt}><input type="date" name={`on_${k}`} defaultValue={o.reportedOn ?? ""} /></Field>
              </Fields>
            </Section>
          );
        })}
        <FormFooter><SubmitButton icon="check">{a("saveOutcomes")}</SubmitButton></FormFooter>
      </form>
    </section>
  );
}
