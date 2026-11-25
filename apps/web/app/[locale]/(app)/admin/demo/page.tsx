import { redirect } from "next/navigation";
import { isLocale, t } from "@eu/core/i18n";
import { currentPrincipal } from "@/lib/session";
import { permissions } from "@/lib/registry";
import { demoStatus } from "@/lib/demo";
import { db } from "@/lib/http";
import { ConfirmButton, Notice, PageHeader } from "@/components/ui";
import { NoAccess } from "@/components/no-access";
import { titled } from "@/lib/meta";
import { Icon } from "@/components/icons";
import { demoAction } from "../../demo-actions";

export const dynamic = "force-dynamic";
export const generateMetadata = titled("ui.demo.title");

export default async function DemoPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ demo?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  if (!permissions.can(me.user, "sites.manage", { stream: "platform" })) return <NoAccess locale={locale} />;
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
          <ConfirmButton
            text={t(locale, demo.loaded ? "admin.demoRemove" : "admin.demoLoad")}
            label={t(locale, demo.loaded ? "admin.demoRemove" : "admin.demoLoad")}
            icon={demo.loaded ? "logout" : "sparkle"}
            variant={demo.loaded ? "danger" : "primary"}
            small={false}
            confirm={t(locale, demo.loaded ? "ui.demo.confirmRemove" : "ui.demo.confirmLoad", { count: demo.sites.length })}
            yes={t(locale, demo.loaded ? "ui.demo.yesRemove" : "ui.demo.yesLoad")}
            no={t(locale, "ui.form.cancel")}
          />
        </form>
      </div>
    </div>
  );
}
