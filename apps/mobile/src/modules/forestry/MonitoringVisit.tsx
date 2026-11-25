import { colors, streamAccent } from "@eu/core/tokens";
import {
  bearingDeg, compass, defaultSettings, distanceM, estimateStocking, monitoringVisitSchema, placeSamplePoints,
  type ForestryStream, type SamplePlot,
} from "@eu/forestry/mobile";
import { useContext, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { LocaleContext, useT } from "../../i18n";
import type { Session } from "../../session";
import { Button, Card, Chips, DateField, Field, Header, Notice, NumberField, Page, Section, Segmented, Stat, Txt } from "../../ui";
import { Icon } from "../../icons";
import { getFix, localToday, type Fix } from "../location";
import { loadSpecies, type PlotLite, type SpeciesOption } from "./data";
import { PhotoStrip } from "../photos";

type Threat = "fire" | "charcoal" | "grazing" | "encroachment" | "pests" | "disease" | "livestock" | "flooding" | "other";
const THREATS: Threat[] = ["fire", "charcoal", "grazing", "encroachment", "pests", "disease", "livestock", "flooding", "other"];
type Skip = "inaccessible" | "flooded" | "other";
interface Counts { alive: string; dead: string; natural: string }
interface PointState { counts: Record<string, Counts>; skipped?: Skip; fix?: Fix }

const n = (v: string | undefined) => {
  const x = Number((v ?? "").replace(/\s/g, ""));
  return Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0;
};

/**
 * Monitoring visit: the phone draws random sample circles inside the plot from a stored seed,
 * guides the officer to each one, and records living, dead and (miombo) natural plants per
 * species. Survival and stocking are estimated on the spot, and again on the server.
 */
export function MonitoringVisit({ session, stream, plot, onDone }: { session: Session; stream: ForestryStream; plot: PlotLite; onDone: (saved: boolean) => void }) {
  const t = useT();
  const { locale } = useContext(LocaleContext);
  const cfg = defaultSettings[stream];
  const [settings, setSettings] = useState({ ...cfg });
  const [species, setSpecies] = useState<SpeciesOption[]>([...cfg.speciesList]);
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [visitedOn, setVisitedOn] = useState(localToday());
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"points" | "summary">(plot.geom ? "points" : "summary");
  const [points, setPoints] = useState<Record<number, PointState>>({});
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [threats, setThreats] = useState<Threat[]>([]);
  const [weeding, setWeeding] = useState<("done" | "partial" | "needed")[]>([]);
  const [height, setHeight] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const row = (await session.client.list(`${stream}.settings`)).find((r) => !r.voidedAt);
      if (row) setSettings((cur) => ({ ...cur, ...(row as object) }));
      setSpecies(await loadSpecies(session.client, stream, cfg.speciesList));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, stream]);

  const drawn = useMemo(() => (plot.geom ? placeSamplePoints(plot.geom, seed, settings) : []), [plot.geom, seed, settings]);
  const plotSpecies = species.filter((o) => plot.species.length === 0 || plot.species.includes(o.key));
  const label = (o: SpeciesOption) => (locale === "fr" ? o.fr : o.en) ?? o.latin;

  const locate = async () => {
    setGpsNote(t("forestry.m.locating"));
    const f = await getFix();
    if (f === "denied") return setGpsNote(t("forestry.m.gps_denied"));
    if (!f) return setGpsNote(t("forestry.m.gps_none"));
    setFix(f);
    setGpsNote(null);
  };
  useEffect(() => {
    void locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const samples: SamplePlot[] = drawn.map((p) => {
    const st = points[p.pointIndex];
    return {
      pointIndex: p.pointIndex,
      lat: st?.fix?.lat ?? p.lat,
      lng: st?.fix?.lng ?? p.lng,
      ...(st?.fix?.accuracyM != null ? { gpsAccuracyM: st.fix.accuracyM } : {}),
      radiusM: settings.sampleRadiusM,
      counts: st?.skipped
        ? []
        : Object.entries(st?.counts ?? {}).map(([sp, c]) => ({
            species: sp,
            alive: n(c.alive),
            dead: n(c.dead),
            ...(stream === "miombo" ? { naturalAlive: n(c.natural) } : {}),
          })),
      ...(st?.skipped ? { skipped: st.skipped } : {}),
    };
  });
  const counted = samples.filter((x) => x.skipped || points[x.pointIndex]);
  const est = counted.length > 0 ? estimateStocking(counted, { includeNatural: stream === "miombo" }) : null;

  const setCount = (sp: string, field: keyof Counts, v: string) => {
    const cur = points[idx] ?? { counts: {} };
    const c = cur.counts[sp] ?? { alive: "", dead: "", natural: "" };
    setPoints({ ...points, [idx]: { ...cur, skipped: undefined, fix: cur.fix ?? fix ?? undefined, counts: { ...cur.counts, [sp]: { ...c, [field]: v } } } });
  };
  const skip = (r: Skip) => setPoints({ ...points, [idx]: { counts: {}, skipped: r } });

  const save = async () => {
    const parsed = monitoringVisitSchema.safeParse({
      visitedOn: visitedOn.trim(),
      sampleSeed: drawn.length ? seed : null,
      samples: counted,
      meanHeightCm: height.trim() ? Number(height) : null,
      threats,
      weeding: weeding[0] ?? null,
      photos: photos.map((fileId) => ({ fileId })),
      notes: notes.trim() || null,
      gpsLat: fix?.lat ?? null,
      gpsLng: fix?.lng ?? null,
      gpsAccuracyM: fix?.accuracyM ?? null,
    });
    if (!parsed.success || visitedOn > localToday()) return setError(t("forestry.m.invalid"));
    setSaving(true);
    try {
      await session.client.create(`${stream}.visit`, plot.scopeId, parsed.data);
      void session.syncNow();
      onDone(true);
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  const fmt = (x: number) => (Number.isFinite(x) ? String(Math.round(x)) : "–");

  const accent = streamAccent[stream];
  const header = (sub: string) => <Header title={t("forestry.visit.new")} subtitle={sub} onBack={() => onDone(false)} backLabel={t("forestry.m.back")} accent={accent} />;
  const leave = () => { if (!points[idx]) setPoints({ ...points, [idx]: { counts: {}, fix: fix ?? undefined } }); };

  if (phase === "points" && drawn.length > 0) {
    const p = drawn[idx]!;
    const st = points[idx];
    const d = fix ? distanceM(fix.lat, fix.lng, p.lat, p.lng) : null;
    const near = d !== null && d <= Math.max(settings.sampleRadiusM, fix?.accuracyM ?? 0);
    const last = idx + 1 >= drawn.length;
    return (
      <Page
        header={header(`${t("forestry.plot")} ${plot.code}`)}
        footer={
          <>
            {idx > 0 && <Button kind="secondary" icon="chevronLeft" label={t("ux.previous")} onPress={() => setIdx(idx - 1)} flex={1} />}
            <Button
              icon={last ? "check" : undefined}
              iconAfter={last ? undefined : "chevronRight"}
              label={last ? t("forestry.m.finish_points") : t("forestry.m.next_point")}
              onPress={() => { leave(); if (last) setPhase("summary"); else setIdx(idx + 1); }}
              flex={2}
            />
          </>
        }
      >
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Txt variant="title" style={{ flex: 1 }}>{t("forestry.visit.sample_n", { n: idx + 1, total: drawn.length })}</Txt>
          </View>
          <View style={s.dots}>
            {drawn.map((x, i) => {
              const done = !!points[i];
              return <View key={x.pointIndex} style={[s.dot, done && { backgroundColor: accent }, i === idx && s.dotOn]} />;
            })}
          </View>
        </View>
        {idx === 0 && !st && <Txt variant="small" tone="muted">{t("forestry.m.samples_intro", { n: drawn.length, r: settings.sampleRadiusM })}</Txt>}

        <Card style={near ? { backgroundColor: colors.gcGreenTint, borderColor: colors.gcGreen } : undefined}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={[s.guide, { backgroundColor: near ? colors.gcGreen : colors.gcGreenDeep }]}>
              <Icon name={near ? "check" : "compass"} size={26} color={colors.surface} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              {gpsNote ? (
                <Txt tone="muted">{gpsNote}</Txt>
              ) : d !== null && fix ? (
                <Txt variant="heading" color={near ? colors.gcGreen : colors.text}>
                  {near ? t("forestry.m.at_point", { m: Math.round(Math.max(settings.sampleRadiusM, fix.accuracyM ?? 0)) }) : t("forestry.m.heading", { m: Math.round(d), dir: t(`forestry.m.dir.${compass(bearingDeg(fix.lat, fix.lng, p.lat, p.lng))}`) })}
                </Txt>
              ) : (
                <Txt tone="muted">{t("forestry.m.gps_none")}</Txt>
              )}
            </View>
          </View>
          <Button kind="secondary" icon="locate" label={t("forestry.m.where_am_i")} onPress={() => void locate()} />
        </Card>

        {st?.skipped ? (
          <Notice tone="warning" title={t("forestry.m.skipped")}>{t(`forestry.m.skip_reason.${st.skipped}`)}</Notice>
        ) : (
          plotSpecies.map((o) => {
            const c = st?.counts[o.key];
            return (
              <Section key={o.key} title={label(o)}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <NumberField compact label={t("forestry.visit.alive")} value={c?.alive ?? ""} onChange={(v) => setCount(o.key, "alive", v)} />
                  <NumberField compact label={t("forestry.visit.dead")} value={c?.dead ?? ""} onChange={(v) => setCount(o.key, "dead", v)} />
                </View>
                {stream === "miombo" && <NumberField label={t("forestry.visit.natural")} value={c?.natural ?? ""} onChange={(v) => setCount(o.key, "natural", v)} />}
              </Section>
            );
          })
        )}

        <View style={{ gap: 6 }}>
          <Txt variant="label" tone="muted">{t("forestry.visit.skip")}</Txt>
          <Chips<Skip> selected={st?.skipped ? [st.skipped] : []} onToggle={(r) => (st?.skipped === r ? setPoints({ ...points, [idx]: { counts: {} } }) : skip(r))} options={(["inaccessible", "flooded", "other"] as const).map((v) => ({ value: v, label: t(`forestry.m.skip_reason.${v}`) }))} />
        </View>
      </Page>
    );
  }

  return (
    <Page
      header={header(`${t("forestry.plot")} ${plot.code} · ${plot.village}`)}
      footer={
        <>
          {drawn.length > 0 && <Button kind="secondary" icon="chevronLeft" label={t("ux.points")} onPress={() => setPhase("points")} flex={1} />}
          <Button icon="check" label={t("ux.saveVisit")} onPress={() => void save()} disabled={saving} flex={2} />
        </>
      }
    >
      {!plot.geom && <Notice tone="warning">{t("forestry.m.no_boundary_visit")}</Notice>}
      {est && (
        <Card>
          <Txt variant="label" tone="muted">{t("ux.estimate")}</Txt>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Stat value={fmt(est.livingPerHa.value)} label={t("ux.perHa", { low: fmt(est.livingPerHa.low), high: fmt(est.livingPerHa.high) })} />
            {est.survivalPct && <Stat value={`${fmt(est.survivalPct.value)} %`} label={t("ux.survival", { low: fmt(est.survivalPct.low), high: fmt(est.survivalPct.high) })} tone={est.survivalPct.value >= 80 ? "good" : est.survivalPct.value >= 60 ? "warning" : "critical"} />}
          </View>
        </Card>
      )}
      <DateField label={t("forestry.m.visit_date")} value={visitedOn} onChange={setVisitedOn} max={localToday()} todayLabel={t("app.today")} yesterdayLabel={t("app.yesterday")} />
      <Section title={t("forestry.m.threats")} hint={t("ux.tickAll")}>
        <Chips<Threat> selected={threats} onToggle={(v) => setThreats(threats.includes(v) ? threats.filter((x) => x !== v) : [...threats, v])} options={THREATS.map((v) => ({ value: v, label: t(`forestry.threat.${v}`) }))} />
      </Section>
      <Section title={t("forestry.m.weeding")}>
        <Segmented value={weeding[0] ?? null} onChange={(v) => setWeeding(weeding[0] === v ? [] : [v])} options={(["done", "partial", "needed"] as const).map((v) => ({ value: v, label: t(`forestry.m.weed.${v}`) }))} />
      </Section>
      <Section title={t("ux.notesPhotos")}>
        <NumberField label={`${t("forestry.m.mean_height")} (${t("ux.optional")})`} value={height} onChange={setHeight} step={5} suffix="cm" />
        <Field label={`${t("forestry.m.notes")} (${t("ux.optional")})`} value={notes} onChangeText={setNotes} multiline />
        <PhotoStrip session={session} entity={`${stream}.visit`} scopeId={plot.scopeId} ids={photos} onChange={setPhotos} hint={t("forestry.m.photo_hint")} />
      </Section>
      {error && <Notice tone="critical">{error}</Notice>}
    </Page>
  );
}

const s = StyleSheet.create({
  dots: { flexDirection: "row", gap: 6 },
  dot: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "#DDE3D9" },
  dotOn: { backgroundColor: colors.gcGreenDeep },
  guide: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
