import { redirect } from "next/navigation";
import { isLocale, t } from "@eu/core/i18n";
import { currentPrincipal } from "@/lib/session";
import { permissions } from "@/lib/registry";
import { demoStatus } from "@/lib/demo";
import { db } from "@/lib/http";
import { Notice, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { demoAction } from "../../demo-actions";

export const dynamic = "force-dynamic";

export default async function DemoPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ demo?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  if (!permissions.can(me.user, "sites.manage", { stream: "platform" })) return <Notice tone="error">{t(locale, "ui.users.err.forbidden")}</Notice>;
  const flash = (await searchParams).demo;
  const demo = await demoStatus(db());
  return (
    <div data-stream="platform">
      <PageHeader icon={<Icon name="database" size={24} />} title={t(locale, "ui.demo.title")} subtitle={t(locale, "ui.demo.intro")} />
      {flash && <Notice tone={flash === "failed" ? "error" : "success"}>{t(locale, `admin.demo_${flash === "loaded" || flash === "removed" ? flash : "failed"}`)}</Notice>}
      <div className="card" style={{ maxWidth: 760 }}>
        <p>{t(locale, demo.loaded ? "admin.demoLoadedIntro" : "admin.demoIntro", { count: demo.sites.length })}</p>
        {demo.loaded && (
          <ul className="demo-sites">
            {demo.sites.map((s) => <li key={s.id}><span className="pill">{t(locale, `ui.streams.${s.stream}`)}</span> {s.name}</li>)}
          </ul>
        )}
        <form action={demoAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="action" value={demo.loaded ? "remove" : "load"} />
          <button className={demo.loaded ? "btn danger" : "btn"} type="submit">
            <Icon name={demo.loaded ? "logout" : "sparkle"} size={16} />
            {t(locale, demo.loaded ? "admin.demoRemove" : "admin.demoLoad")}
          </button>
        </form>
      </div>
    </div>
  );
}
