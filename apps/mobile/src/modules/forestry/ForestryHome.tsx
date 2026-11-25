import { distanceToGeomM, pointInMultiPolygon, type ForestryStream } from "@eu/forestry/mobile";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius, space, touch } from "@eu/core/tokens";
import { useT } from "../../i18n";
import type { Session } from "../../session";
import { BackBar, Body, Button, Title } from "../../ui";
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
  if (open) {
    return (
      <ScrollView contentContainerStyle={s.wrap}>
        <BackBar label={t("forestry.m.back")} onBack={() => setOpen(null)} />
        <Title>
          {t("forestry.plot")} {open.code}
        </Title>
        <Body tone="muted">{open.village}</Body>
        <Body>{t("forestry.m.what_now")}</Body>
        <Button label={t("forestry.planting.new")} onPress={() => setMode("planting")} />
        <Button label={t("forestry.visit.new")} onPress={() => setMode("visit")} />
      </ScrollView>
    );
  }

  const sorted = plots && highlight ? [...plots.filter((p) => p.id === highlight), ...plots.filter((p) => p.id !== highlight)] : plots;

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <BackBar label={t("forestry.m.back")} onBack={onBack} />
      <Title>{t(`forestry.${stream}`)}</Title>
      {flash && <Body tone="good">{flash}</Body>}
      <Button label={t("forestry.m.find_plot")} onPress={() => void findPlot()} disabled={!plots || plots.length === 0} />
      {gpsNote && <Body tone="muted">{gpsNote}</Body>}
      <Body tone="muted">{t("forestry.m.choose_plot")}</Body>
      {plots && plots.length === 0 && <Body tone="warning">{t("forestry.m.no_plots")}</Body>}
      {sorted?.map((p) => (
        <Pressable key={p.id} accessibilityRole="button" onPress={() => setOpen(p)} style={[s.row, p.id === highlight && s.rowHot]}>
          <Text style={s.code}>{p.code}</Text>
          <Text style={s.meta}>
            {p.village} · {t(`forestry.status.${p.status}`)}
          </Text>
          {p.plantings > 0 && <Text style={s.meta}>{t("forestry.m.plantings_here", { n: p.plantings, total: p.planted })}</Text>}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space.md, paddingTop: space.xl, gap: space.sm, backgroundColor: colors.surface },
  row: { minHeight: touch.minTarget, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.sm, gap: 2 },
  rowHot: { borderColor: colors.gcGreen, borderWidth: 2 },
  code: { fontSize: touch.bodyText, fontWeight: "700", color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
});
