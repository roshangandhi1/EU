import Link from "next/link";
import { Icon } from "@/components/icons";
import { Field, Fields, FormFooter, Notice, PageHeader, Section, SubmitButton, Table } from "@/components/ui";
import { formatLocal } from "@/lib/admin";
import { adminAccess } from "@/lib/access";
import { NoAccess } from "@/components/no-access";
import { titled } from "@/lib/meta";
import { t } from "@eu/core/i18n";
import { listCutoffs } from "@/lib/evidence";
import { db } from "@/lib/http";
import { createCutoffAction } from "../actions";

export const dynamic = "force-dynamic";
export const generateMetadata = titled("admin.cutoffs");

export default async function CutoffsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale, tr, allowed } = await adminAccess((await params).locale, "evidence.manage");
  if (!allowed) return <NoAccess locale={locale} />;
  const sp = await searchParams;
  const cutoffs = await listCutoffs(db());
  return (
    <section>
      <PageHeader icon={<Icon name="clock" size={24} />} title={tr("cutoffs")} subtitle={tr("cutoffsIntro")} />
      {sp.error && <Notice tone="error">{t(locale, "ui.evidence.invalid")}</Notice>}
      <Table
        rows={cutoffs}
        rowKey={(c) => c.id}
        empty={tr("none")}
        emptyIcon="clock"
        columns={[
          { key: "label", header: tr("label"), render: (c) => <Link href={`/${locale}/admin/evidence/${c.id}`}>{c.label}</Link> },
          { key: "at", header: tr("cutoffAt"), render: (c) => formatLocal(c.cutoffAt, locale) },
        ]}
      />
      <Section icon="plus" title={tr("newCutoff")}>
        <form action={createCutoffAction}>
          <input type="hidden" name="locale" value={locale} />
          <Fields>
            <Field span={8} label={tr("label")}>
              <input name="label" required minLength={2} placeholder={t(locale, "ui.evidence.placeholder")} />
            </Field>
            <Field span={4} label={tr("cutoffAt")}>
              <input name="cutoffAt" type="datetime-local" required />
            </Field>
          </Fields>
          <FormFooter><SubmitButton icon="plus">{tr("create")}</SubmitButton></FormFooter>
        </form>
      </Section>
    </section>
  );
}
