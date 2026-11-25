import { distanceToGeomM, pointInMultiPolygon, type ForestryStream } from "@eu/forestry/mobile";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { colors, streamAccent } from "@eu/core/tokens";
import { useT } from "../../i18n";
import type { Session } from "../../session";
import { Button, Card, EmptyState, Header, IconBadge, ListGroup, ListRow, Notice, Page, Stat, StatusChip, Toast, Txt, type Tone } from "../../ui";
import { getFix } from "../location";
import { loadPlots, type PlotLite } from "./data";
import { MonitoringVisit } from "./MonitoringVisit";
import { PlantingForm } from "./PlantingForm";

/** A stream's plots on the phone: find the one you are standing in, then record a planting. */
export function ForestryHome({ session, stream, onBack }: { session: Session; stream: ForestryStream; onBack: () => void }) {
  const t = useT();
  const [plots, setPlots] = useState<PlotLite[] | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [open, setOpen] = useState<PlotLite | null>(null);
  const [mode, setMode] = useState<"planting" | "visit" | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(() => {
    void loadPlots(session.client, stream).then(setPlots);
  }, [session, stream]);
  useEffect(reload, [reload, session.status.lastOk]);

  const findPlot = async () => {
    if (!plots) return;
    setGpsNote(t("forestry.m.locating"));
    const fix = await getFix();
    if (fix === "denied") return setGpsNote(t("forestry.m.gps_denied"));
    if (!fix) return setGpsNote(t("forestry.m.gps_none"));
    const withGeom = plots.filter((p) => p.geom);
    if (withGeom.length === 0) return setGpsNote(t("forestry.m.no_boundaries"));
    const inside = withGeom.find((p) => pointInMultiPolygon(fix.lng, fix.lat, p.geom!));
    if (inside) {
      setHighlight(inside.id);
      return setGpsNote(t("forestry.m.in_plot", { code: inside.code }));
    }
    const nearest = withGeom
      .map((p) => ({ p, m: distanceToGeomM(fix.lat, fix.lng, p.geom!) }))
      .sort((a, b) => a.m - b.m)[0]!;
    setHighlight(nearest.p.id);
    setGpsNote(t("forestry.m.nearest", { code: nearest.p.code, m: Math.round(nearest.m) }));
  };

  const done = (saved: boolean, msg: string) => {
    setOpen(null);
    setMode(null);
    if (saved) setFlash(msg);
    reload();
  };
  if (open && mode === "planting") return <PlantingForm session={session} stream={stream} plot={open} onDone={(ok) => done(ok, t("forestry.m.saved"))} />;
  if (open && mode === "visit") return <MonitoringVisit session={session} stream={stream} plot={open} onDone={(ok) => done(ok, t("forestry.m.visit_saved"))} />;
  const accent = streamAccent[stream];
  const statusTone = (st: string): Tone => (st === "planted" || st === "established" ? "good" : st === "pegged" || st === "prepared" ? "info" : st === "failed" || st === "abandoned" ? "critical" : "muted");
  if (open) {
    return (
      <Page header={<Header title={`${t("forestry.plot")} ${open.code}`} subtitle={`${t(`forestry.${stream}`)} · ${open.village}`} onBack={() => setOpen(null)} backLabel={t("forestry.m.back")} accent={accent} />}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <StatusChip label={t(`forestry.status.${open.status}`)} tone={statusTone(open.status)} />
            {!open.geom && <StatusChip label={t("ux.noBoundary")} tone="warning" />}
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Stat value={open.planted.toLocaleString("fr-FR")} label={t("ux.plantsPlanted")} />
            <Stat value={open.plantings} label={t("ux.plantingsRecorded")} />
          </View>
        </Card>
        <Txt variant="heading">{t("forestry.m.what_now")}</Txt>
        <ListGroup>
          <ListRow title={t("forestry.planting.new")} detail={t("ux.plantingHint")} leading={<IconBadge icon="sprout" color={accent} size={48} />} onPress={() => setMode("planting")} chevron />
          <ListRow title={t("forestry.visit.new")} detail={t("ux.visitHint")} leading={<IconBadge icon="compass" color={accent} size={48} />} onPress={() => setMode("visit")} chevron />
        </ListGroup>
      </Page>
    );
  }

  const sorted = plots && highlight ? [...plots.filter((p) => p.id === highlight), ...plots.filter((p) => p.id !== highlight)] : plots;

  return (
    <Page
      header={<Header title={t(`forestry.${stream}`)} subtitle={plots ? t("ux.plotsSummary", { n: plots.length }) : undefined} onBack={onBack} backLabel={t("forestry.m.back")} accent={accent} />}
      toast={<Toast message={flash} onHide={() => setFlash(null)} />}
    >
      <Button kind="secondary" icon="locate" label={t("forestry.m.find_plot")} onPress={() => void findPlot()} disabled={!plots || plots.length === 0} />
      {gpsNote && <Notice tone={highlight ? "good" : "info"} icon={highlight ? "pin" : "locate"}>{gpsNote}</Notice>}
      {plots && plots.length === 0 && <EmptyState icon={stream === "bamboo" ? "bamboo" : "tree"} color={accent} title={t("app.emptyTitle")}><Txt center>{t("forestry.m.no_plots")}</Txt></EmptyState>}
      {sorted && sorted.length > 0 && (
        <ListGroup>
          {sorted.map((p) => (
            <ListRow
              key={p.id}
              title={p.code}
              detail={p.plantings > 0 ? `${p.village} · ${t("ux.plantsShort", { n: p.planted.toLocaleString("fr-FR") })}` : p.village}
              leading={<IconBadge icon={stream === "bamboo" ? "bamboo" : "tree"} color={accent} />}
              status={<StatusChip label={t(`forestry.status.${p.status}`)} tone={statusTone(p.status)} />}
              onPress={() => setOpen(p)}
              highlight={p.id === highlight}
              chevron
            />
          ))}
        </ListGroup>
      )}
    </Page>
  );
}
