import { activeOn, placesAsAt } from "@eu/schools";
import { Icon } from "@/components/icons";
import Link from "next/link";
import { Field, Fields, FormFooter, Notice, PageHeader, Section, SubmitButton, Table } from "@/components/ui";
import { t } from "@eu/core/i18n";
import { db } from "@/lib/http";
import { can, mySchools, signedIn, today, tr as trFor } from "@/lib/schools";
import { loadSchool } from "@eu/schools";
import { createSchool } from "./actions";
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
          <form action={createSchool}>
            <input type="hidden" name="locale" value={locale} />
            <Fields>
              <Field span={6} label={tr("common.name")}>
                <input name="name" required placeholder="École primaire Luniemu" />
              </Field>
              <Field span={3} label={tr("list.siteId")} hint={tr("list.siteIdHint")} error={tr("ux.siteIdError")}>
                <input name="siteId" required pattern="[a-z0-9-]{2,40}" autoCapitalize="none" spellCheck={false} />
              </Field>
              <Field span={3} label={tr("list.code")} hint={tr("list.codeHint")} error={tr("ux.codeError")}>
                <input name="code" required pattern="[A-Za-z]{2,12}" style={{ textTransform: "uppercase" }} />
              </Field>
            </Fields>
            <FormFooter>
              <SubmitButton icon="plus" pending={t(locale, "ui.form.saving")}>{tr("list.addSchool")}</SubmitButton>
            </FormFooter>
          </form>
        </Section>
      )}
    </section>
  );
}
