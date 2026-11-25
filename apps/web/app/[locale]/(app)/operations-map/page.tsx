import Link from "next/link";
import { redirect } from "next/navigation";
import { isLocale, t } from "@eu/core/i18n";
import { currentPrincipal } from "@/lib/session";
import { loadOverview } from "@/lib/overview";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { OpsMap } from "@/components/ops-map";
import { opsMapLabels } from "./labels";
import { titled } from "@/lib/meta";
import { NoAccess } from "@/components/no-access";

export const dynamic = "force-dynamic";
export const generateMetadata = titled("ui.map.title");

export default async function OperationsMapPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  const u = (k: string) => t(locale, `ui.${k}`);
  const ov = await loadOverview(me);
  if (!ov.access.opsMap) return <NoAccess locale={locale} />;
  const located = Object.values(ov.map).reduce((n, c) => n + c.features.length, 0);
  return (
    <div data-stream="platform">
      <PageHeader icon={<Icon name="map" size={24} />} title={u("map.title")} subtitle={u("map.intro")}
        actions={<Link className="btn secondary" href={`/${locale}/map`}><Icon name="globe" size={16} />{u("nav.publicMap")}</Link>} />
      {located === 0 ? (
        <div className="empty-state">
          <div className="es-icon"><Icon name="map" size={28} /></div>
          <p>{u("map.empty")}</p>
          <div className="es-actions">
            {ov.access.streams.bamboo && <Link className="btn" href={`/${locale}/forestry/bamboo/import`}><Icon name="upload" size={16} />{u("home.steps.kmz.title")}</Link>}
            {ov.access.streams.miombo && <Link className="btn" href={`/${locale}/forestry/miombo/import`}><Icon name="upload" size={16} />{u("home.steps.miombo.title")}</Link>}
            {ov.access.streams.boreholes && <Link className="btn secondary" href={`/${locale}/boreholes`}>{u("home.steps.borehole.link")}</Link>}
            {ov.access.streams.schools && <Link className="btn secondary" href={`/${locale}/schools`}>{u("home.steps.school.link")}</Link>}
          </div>
        </div>
      ) : (
        <OpsMap locale={locale} data={ov.map} labels={opsMapLabels(locale)} height="calc(100vh - 220px)" />
      )}
    </div>
  );
}
