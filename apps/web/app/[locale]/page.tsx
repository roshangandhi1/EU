import { redirect } from "next/navigation";
import { isLocale, t } from "@eu/core/i18n";
import Link from "next/link";
import { permissions } from "@/lib/registry";
import { currentPrincipal } from "@/lib/session";
import { SignOutButton } from "./sign-out";
import { demoAction } from "./demo-actions";
import { demoStatus } from "@/lib/demo";
import { db } from "@/lib/http";

export const dynamic = "force-dynamic";

export default async function Home({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ demo?: string }> }) {
  const { locale } = await params;
  const { demo: demoFlash } = await searchParams;
  if (!isLocale(locale)) return null;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  const canDemo = permissions.can(me.user, "sites.manage", { stream: "platform" });
  const demo = canDemo ? await demoStatus(db()) : null;
  return (
    <section>
      <h1>{t(locale, "common.appName")}</h1>
      <p>{me.name}</p>
      <ul>
        {me.user.assignments.map((a, i) => (
          <li key={i}>
            {a.role} · {a.scope.type === "global" ? "global" : a.scope.type === "stream" ? a.scope.stream : a.scope.siteId}
          </li>
        ))}
      </ul>
      {(permissions.can(me.user, "evidence.manage", { stream: "platform" }) || permissions.can(me.user, "devices.manage", { stream: "platform" })) && (
        <>
          <h2>{t(locale, "admin.menu")}</h2>
          <ul>
            {permissions.can(me.user, "evidence.manage", { stream: "platform" }) && (
              <li>
                <Link href={`/${locale}/admin/evidence`}>{t(locale, "admin.cutoffs")}</Link>
              </li>
            )}
            {permissions.can(me.user, "devices.manage", { stream: "platform" }) && (
              <li>
                <Link href={`/${locale}/admin/phones`}>{t(locale, "admin.phones")}</Link>
              </li>
            )}
          </ul>
        </>
      )}
      {permissions.can(me.user, "dashboard.read", { stream: "platform" }) && (
        <p><Link className="btn" href={`/${locale}/dashboard`}>{t(locale, "dashboard.nav")}</Link></p>
      )}
      {demo && (
        <>
          <h2>{t(locale, "admin.demoTitle")}</h2>
          {demoFlash && <p role="status">{t(locale, `admin.demo_${demoFlash === "loaded" || demoFlash === "removed" ? demoFlash : "failed"}`)}</p>}
          <p>{t(locale, demo.loaded ? "admin.demoLoadedIntro" : "admin.demoIntro", { count: demo.sites.length })}</p>
          <form action={demoAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="action" value={demo.loaded ? "remove" : "load"} />
            <button className="btn" type="submit">{t(locale, demo.loaded ? "admin.demoRemove" : "admin.demoLoad")}</button>
          </form>
        </>
      )}
      <SignOutButton label={t(locale, "common.signOut")} locale={locale} />
    </section>
  );
}
