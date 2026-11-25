import Link from "next/link";
import { redirect } from "next/navigation";
import { isLocale, t } from "@eu/core/i18n";
import { currentPrincipal } from "@/lib/session";
import { loadOverview } from "@/lib/overview";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { OpsMap } from "@/components/ops-map";
import { opsMapLabels } from "./labels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Map" };

export default async function OperationsMapPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  const u = (k: string) => t(locale, `ui.${k}`);
  const ov = await loadOverview(me);
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
            {ov.access.streams.bamboo && <Link className="btn" href={`/${locale}/forestry/bamboo/import`}><Icon name="upload" size={16} />{u("home.steps.kmz.link")}</Link>}
            {ov.access.streams.boreholes && <Link className="btn secondary" href={`/${locale}/boreholes`}>{u("home.steps.borehole.link")}</Link>}
          </div>
        </div>
      ) : (
        <OpsMap locale={locale} data={ov.map} labels={opsMapLabels(locale)} height="calc(100vh - 220px)" />
      )}
    </div>
  );
}
