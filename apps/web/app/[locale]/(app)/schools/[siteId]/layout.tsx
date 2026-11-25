import { PageHeader, Tabs } from "@/components/ui";
import { can, schoolFor, signedIn, tr as trFor } from "@/lib/schools";

export default async function SchoolLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string; siteId: string }> }) {
  const p = await params;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const data = await schoolFor(me, p.siteId);
  const base = `/${locale}/schools/${p.siteId}`;
  const items = [
    { href: base, label: tr("nav.overview") },
    { href: `${base}/students`, label: tr("nav.students") },
    { href: `${base}/attendance`, label: tr("nav.attendance") },
    { href: `${base}/fees`, label: tr("nav.fees") },
    { href: `${base}/reports`, label: tr("nav.reports") },
    ...(can(me, "school.configure", p.siteId) ? [{ href: `${base}/setup`, label: tr("nav.setup") }] : []),
  ];
  return (
    <section>
      <PageHeader title={data.site.name} subtitle={data.school?.code} />
      <Tabs items={items} />
      {children}
    </section>
  );
}
