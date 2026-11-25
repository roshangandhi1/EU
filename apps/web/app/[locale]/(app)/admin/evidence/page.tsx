import Link from "next/link";
import { Button, Field, Form, Notice, PageHeader, Table } from "@/components/ui";
import { formatLocal, requireAction } from "@/lib/admin";
import { listCutoffs } from "@/lib/evidence";
import { db } from "@/lib/http";
import { createCutoffAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function CutoffsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale, tr } = await requireAction((await params).locale, "evidence.manage");
  const sp = await searchParams;
  const cutoffs = await listCutoffs(db());
  return (
    <section>
      <PageHeader title={tr("cutoffs")} subtitle={tr("cutoffsIntro")} />
      {sp.error && <Notice tone="error">{tr("reasonRequired")}</Notice>}
      <Table
        rows={cutoffs}
        rowKey={(c) => c.id}
        empty={tr("none")}
        columns={[
          { key: "label", header: tr("label"), render: (c) => <Link href={`/${locale}/admin/evidence/${c.id}`}>{c.label}</Link> },
          { key: "at", header: tr("cutoffAt"), render: (c) => formatLocal(c.cutoffAt, locale) },
        ]}
      />
      <h2>{tr("newCutoff")}</h2>
      <Form action={createCutoffAction}>
        <input type="hidden" name="locale" value={locale} />
        <Field label={tr("label")}>
          <input name="label" required minLength={2} placeholder="Q4 2026 verification" />
        </Field>
        <Field label={tr("cutoffAt")}>
          <input name="cutoffAt" type="datetime-local" required />
        </Field>
        <Button>{tr("create")}</Button>
      </Form>
    </section>
  );
}
