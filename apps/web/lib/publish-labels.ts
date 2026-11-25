/** What the "Publish to the public map" confirmation says: how many items go public, how many are demo, last publish date. */
import { t, type Locale } from "@eu/core/i18n";
import { buildPublicLayer as boreholeLayer } from "@eu/boreholes/server";
import { buildPublicLayer as forestryLayer } from "@eu/forestry/server";
import { latestSnapshots, type PublicLayer } from "@eu/maps/server";
import type { PublishLabels } from "@/components/publish-button";
import { db } from "./http";
import { todayDrc } from "./dates";
import { fmtDate, tn } from "./format";

export async function publishLabels(locale: Locale, layer: PublicLayer): Promise<PublishLabels> {
  const asAt = todayDrc();
  const [built, snaps] = await Promise.all([
    layer === "boreholes" ? boreholeLayer(db(), asAt) : forestryLayer(db(), layer, asAt),
    latestSnapshots(db()),
  ]);
  const n = built.data.features.length;
  const demo = built.data.features.filter((f) => String((f.properties as { code?: string } | null)?.code ?? "").toUpperCase().startsWith("DEMO-")).length;
  const last = snaps.find((s) => s.layer === layer);
  const u = (k: string, v?: Record<string, string | number>) => t(locale, `ui.publish.${k}`, v);
  return {
    button: t(locale, "publicmap.publish.button"), help: t(locale, "publicmap.publish.help"), done: t(locale, "publicmap.publish.done"),
    failed: t(locale, "publicmap.publish.failed"), view: t(locale, "publicmap.publish.view"),
    confirm: u("confirm"),
    body: n === 0 ? u("empty") : tn(locale, "ui.publish.body", n),
    demo: demo > 0 ? tn(locale, "ui.publish.demo", demo) : "",
    last: last ? u("last", { date: fmtDate(new Date(last.publishedAt), locale) }) : u("never"),
    yes: u("yes"), cancel: t(locale, "ui.form.cancel"), network: u("network"),
  };
}
