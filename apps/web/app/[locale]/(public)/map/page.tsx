import { notFound } from "next/navigation";
import { isLocale, t } from "@eu/core/i18n";
import { latestSnapshots } from "@eu/maps/server";
import { db } from "@/lib/http";
import "@/lib/registry";
import { PublicMap } from "./public-map";
import { PublicChrome } from "@/components/shell/public-chrome";

export const dynamic = "force-dynamic";

/** The public map: published snapshots only, no sign-in. */
export default async function PublicMapPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const layers = await latestSnapshots(db());
  const fmt = (n: number) => n.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB");
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const tt = (k: string, v?: Record<string, string | number>) => t(locale, `publicmap.${k}`, v);

  return (
    <PublicChrome locale={locale} path="map">
    <section className="module public-map">
      <h1>{tt("title")}</h1>
      <p className="muted">{tt("intro")}</p>
      {layers.length === 0 ? (
        <p>{tt("none")}</p>
      ) : (
        <>
          <div className="stats">
            {layers.map((l) => (
              <div key={l.layer} className="stat-card" data-stream={l.layer}>
                <h2>{tt(`layer.${l.layer}`)}</h2>
                <ul>
                  {Object.entries(l.summary).map(([k, v]) => (
                    <li key={k}>{tt(`stat.${k}`, { n: fmt(v) })}</li>
                  ))}
                </ul>
                <p className="muted small">{tt("updated", { date: date(l.publishedAt) })}</p>
              </div>
            ))}
          </div>
          <PublicMap
            layers={layers.map((l) => ({ layer: l.layer, data: l.data }))}
            labels={{
              aria: tt("title"),
              layer: { bamboo: tt("layer.bamboo"), miombo: tt("layer.miombo"), boreholes: tt("layer.boreholes") },
              legend: { counted: tt("legend.counted"), growing: tt("legend.growing"), operational: tt("legend.operational"), other: tt("legend.other") },
            }}
          />
        </>
      )}
    </section>
    </PublicChrome>
  );
}
