import { activeOn, placesAsAt } from "@eu/schools";
import { Icon } from "@/components/icons";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Field, Fields, Notice, PageHeader, Section, Table } from "@/components/ui";
import { t } from "@eu/core/i18n";
import { db } from "@/lib/http";
import { can, mySchools, signedIn, today, tr as trFor } from "@/lib/schools";
import { loadSchool } from "@eu/schools";
import { createSchool } from "./actions";
import { SetupForm } from "./[siteId]/setup/setup-form";
import { Flash, type SP } from "./flash";

export default async function SchoolsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const { me, locale } = await signedIn((await params).locale);
  const tr = trFor(locale);
  const sp = await searchParams;
  const sites = await mySchools(me);
  const date = today();
  const rows = await Promise.all(
    sites.map(async (s) => {
      const d = await loadSchool(db(), s.id);
      const enrolled = d ? activeOn(d.enrolments, date).length : 0;
      const places = d?.school ? placesAsAt(d.school, d.classrooms, date).totalPlaces : 0;
      return { ...s, enrolled, places };
    }),
  );
  const canCreate = can(me, "sites.manage");
  // A headteacher with one school goes straight to it.
  if (rows.length === 1 && !canCreate && !sp.ok && !sp.error) redirect(`/${locale}/schools/${rows[0]!.id}`);
  return (
    <section data-stream="schools">
      <PageHeader icon={<Icon name="school" size={24} />} title={tr("list.title")} subtitle={tr("list.subtitle")} />
      <Flash sp={sp} tr={tr} />
      {rows.length === 0 && !canCreate && <Notice>{tr("common.noAccess")}</Notice>}
      <Table
        rows={rows}
        rowKey={(r) => r.id}
        empty={tr("common.none")}
        emptyIcon="school"
        columns={[
          { key: "name", header: tr("common.name"), render: (r) => <Link href={`/${locale}/schools/${r.id}`}>{r.name}</Link> },
          { key: "enrolled", header: tr("list.pupils"), numeric: true, render: (r) => r.enrolled },
          { key: "places", header: tr("list.places"), numeric: true, render: (r) => r.places },
        ]}
      />
      {canCreate && (
        <Section id="add-school" icon="plus" title={tr("list.addSchool")} description={tr("ux.addSchoolIntro")}>
          <SetupForm action={createSchool} hidden={{ locale }} submit={tr("list.addSchool")} busy={t(locale, "ui.form.saving")}>
            <Fields>
              <Field span={6} label={tr("common.name")}>
                <input name="name" required minLength={3} maxLength={120} placeholder={tr("list.namePlaceholder")} />
              </Field>
              <Field span={3} label={tr("list.siteId")} hint={tr("list.siteIdHint")} error={tr("ux.siteIdError")}>
                <input name="siteId" required pattern="[a-z0-9-]{2,40}" autoCapitalize="none" spellCheck={false} />
              </Field>
              <Field span={3} label={tr("list.code")} hint={tr("list.codeHint")} error={tr("ux.codeError")}>
                <input name="code" required pattern="[A-Za-z]{2,12}" style={{ textTransform: "uppercase" }} />
              </Field>
              <Field span={3} label={tr("info.lat")} optional={tr("common.optional")} hint={tr("info.latHint")}>
                <input name="lat" inputMode="decimal" autoComplete="off" placeholder="-8,712" />
              </Field>
              <Field span={3} label={tr("info.lng")} optional={tr("common.optional")} hint={tr("info.lngHint")}>
                <input name="lng" inputMode="decimal" autoComplete="off" placeholder="24,790" />
              </Field>
            </Fields>
          </SetupForm>
        </Section>
      )}
    </section>
  );
}
