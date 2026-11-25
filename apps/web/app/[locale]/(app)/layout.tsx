import { FormValidation } from "@/components/ui/validation";
import { redirect } from "next/navigation";
import { isLocale, t, type Locale } from "@eu/core/i18n";
import { AppShell, type NavGroup } from "@/components/shell/app-shell";
import { currentPrincipal } from "@/lib/session";
import { navAccess } from "@/lib/nav";
import { demoStatus } from "@/lib/demo";
import { db } from "@/lib/http";
import Link from "next/link";

export const dynamic = "force-dynamic";

/** Every signed-in page: sidebar navigation by role, demo-data banner, page container. */
export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: l } = await params;
  if (!isLocale(l)) redirect("/fr");
  const locale: Locale = l;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  const u = (k: string, v?: Record<string, string | number>) => t(locale, `ui.${k}`, v);
  const a = navAccess(me);
  const b = `/${locale}`;
  const groups: NavGroup[] = [
    { items: [{ href: b, label: u("nav.overview"), icon: "home", exact: true }] },
    {
      label: u("nav.programme"),
      items: [
        ...(a.dashboard ? [{ href: `${b}/dashboard`, label: u("nav.dashboard"), icon: "chart" }] : []),
        ...(a.opsMap ? [{ href: `${b}/operations-map`, label: u("nav.opsMap"), icon: "map" }] : []),
        { href: `${b}/map`, label: u("nav.publicMap"), icon: "globe" },
      ],
    },
    {
      label: u("nav.streams"),
      items: [
        ...(a.streams.schools ? [{ href: `${b}/schools`, label: u("nav.schools"), icon: "school", color: "var(--accent-schools)" }] : []),
        ...(a.streams.boreholes ? [{ href: `${b}/boreholes`, label: u("nav.boreholes"), icon: "drop", color: "var(--accent-boreholes)" }] : []),
        ...(a.streams.bamboo ? [{ href: `${b}/forestry/bamboo`, label: u("nav.bamboo"), icon: "bamboo", color: "var(--accent-bamboo)" }] : []),
        ...(a.streams.miombo ? [{ href: `${b}/forestry/miombo`, label: u("nav.miombo"), icon: "tree", color: "var(--accent-miombo)" }] : []),
      ],
    },
    {
      label: u("nav.admin"),
      items: [
        ...(a.users ? [{ href: `${b}/admin/users`, label: u("nav.users"), icon: "users" }] : []),
        ...(a.phones ? [{ href: `${b}/admin/phones`, label: u("nav.phones"), icon: "phone" }] : []),
        ...(a.cutoffs ? [{ href: `${b}/admin/evidence`, label: u("nav.cutoffs"), icon: "clock" }] : []),
        ...(a.templates ? [{ href: `${b}/boreholes/templates`, label: u("nav.templates"), icon: "wrench" }] : []),
        ...(a.demo ? [{ href: `${b}/admin/demo`, label: u("nav.demo"), icon: "database" }] : []),
      ],
    },
  ].filter((g) => g.items.length > 0);
  const top = me.user.assignments[0];
  const role = top ? u(`roles.${top.role}`) : "";
  const demo = a.demo ? await demoStatus(db()) : null;

  return (
    <AppShell
      locale={locale}
      groups={groups}
      user={{ name: me.name, role }}
      labels={{ brandSub: u("brandSub"), funded: t(locale, "common.fundedByEu"), signOut: u("signOut"), menu: u("menu"), close: u("closeMenu") }}
    >
      <main className="page">
        {demo?.loaded && (
          <div className="demo-banner" role="status">
            <span><span className="demo-tag">{u("demo.tag")}</span> {u("demo.banner")}</span>
            <Link href={`${b}/admin/demo`} className="btn secondary sm">{u("demo.manage")}</Link>
          </div>
        )}
        {children}
        <FormValidation />
      </main>
    </AppShell>
  );
}
