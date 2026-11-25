import { colors, radius, space, touch } from "@eu/core/tokens";
import {
  bearingDeg, compass, defaultSettings, distanceM, estimateStocking, monitoringVisitSchema, placeSamplePoints,
  type ForestryStream, type SamplePlot,
} from "@eu/forestry/mobile";
import { useContext, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LocaleContext, useT } from "../../i18n";
import type { Session } from "../../session";
import { BackBar, Body, Button, Field, Title } from "../../ui";
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

function Pills<T extends string>({ value, options, onToggle }: { value: T[]; options: { v: T; label: string }[]; onToggle: (v: T) => void }) {
  return (
    <View style={s.pills}>
      {options.map((o) => (
        <Pressable key={o.v} accessibilityRole="button" onPress={() => onToggle(o.v)} style={[s.pill, value.includes(o.v) && s.pillOn]}>
          <Text style={[s.pillText, value.includes(o.v) && s.pillTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

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

  if (phase === "points" && drawn.length > 0) {
    const p = drawn[idx]!;
    const st = points[idx];
    const d = fix ? distanceM(fix.lat, fix.lng, p.lat, p.lng) : null;
    const near = d !== null && d <= Math.max(settings.sampleRadiusM, fix?.accuracyM ?? 0);
    return (
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <BackBar label={t("forestry.m.back")} onBack={() => onDone(false)} />
        <Title>{t("forestry.visit.new")}</Title>
        <Body tone="muted">
          {t("forestry.plot")} {plot.code} · {t("forestry.visit.sample_n", { n: idx + 1, total: drawn.length })}
        </Body>
        {idx === 0 && !st && <Body tone="muted">{t("forestry.m.samples_intro", { n: drawn.length, r: settings.sampleRadiusM })}</Body>}
        {gpsNote ? (
          <Body tone="muted">{gpsNote}</Body>
        ) : d !== null && fix ? (
          <Body tone={near ? "good" : "warning"}>
            {near ? t("forestry.m.at_point", { m: Math.round(Math.max(settings.sampleRadiusM, fix.accuracyM ?? 0)) }) : t("forestry.m.heading", { m: Math.round(d), dir: t(`forestry.m.dir.${compass(bearingDeg(fix.lat, fix.lng, p.lat, p.lng))}`) })}
          </Body>
        ) : null}
        <Button kind="secondary" label={t("forestry.m.where_am_i")} onPress={() => void locate()} />

        {st?.skipped ? (
          <Body tone="warning">
            {t("forestry.m.skipped")}: {t(`forestry.m.skip_reason.${st.skipped}`)}
          </Body>
        ) : (
          plotSpecies.map((o) => {
            const c = st?.counts[o.key];
            return (
              <View key={o.key} style={s.box}>
                <Text style={s.boxTitle}>{label(o)}</Text>
                <Field label={t("forestry.visit.alive")} value={c?.alive ?? ""} onChangeText={(v) => setCount(o.key, "alive", v)} keyboardType="number-pad" />
                <Field label={t("forestry.visit.dead")} value={c?.dead ?? ""} onChangeText={(v) => setCount(o.key, "dead", v)} keyboardType="number-pad" />
                {stream === "miombo" && (
                  <Field label={t("forestry.visit.natural")} value={c?.natural ?? ""} onChangeText={(v) => setCount(o.key, "natural", v)} keyboardType="number-pad" />
                )}
              </View>
            );
          })
        )}

        <Text style={s.label}>{t("forestry.visit.skip")}</Text>
        <Pills<Skip> value={st?.skipped ? [st.skipped] : []} onToggle={skip} options={(["inaccessible", "flooded", "other"] as const).map((v) => ({ v, label: t(`forestry.m.skip_reason.${v}`) }))} />

        {idx + 1 < drawn.length ? (
          <Button label={t("forestry.m.next_point")} onPress={() => { if (!points[idx]) setPoints({ ...points, [idx]: { counts: {}, fix: fix ?? undefined } }); setIdx(idx + 1); }} />
        ) : (
          <Button label={t("forestry.m.finish_points")} onPress={() => { if (!points[idx]) setPoints({ ...points, [idx]: { counts: {}, fix: fix ?? undefined } }); setPhase("summary"); }} />
        )}
        {idx > 0 && <Button kind="secondary" label={t("forestry.m.prev_point")} onPress={() => setIdx(idx - 1)} />}
        <Button kind="secondary" label={t("forestry.m.back")} onPress={() => onDone(false)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <BackBar label={t("forestry.m.back")} onBack={() => onDone(false)} />
      <Title>{t("forestry.visit.new")}</Title>
      <Body tone="muted">
        {t("forestry.plot")} {plot.code} · {plot.village}
      </Body>
      {!plot.geom && <Body tone="warning">{t("forestry.m.no_boundary_visit")}</Body>}
      {est && (
        <View style={s.box}>
          <Body>{t("forestry.m.estimate", { perHa: fmt(est.livingPerHa.value), low: fmt(est.livingPerHa.low), high: fmt(est.livingPerHa.high) })}</Body>
          {est.survivalPct && <Body>{t("forestry.m.survival", { pct: fmt(est.survivalPct.value), low: fmt(est.survivalPct.low), high: fmt(est.survivalPct.high) })}</Body>}
        </View>
      )}
      <Field label={t("forestry.m.visit_date")} value={visitedOn} onChangeText={setVisitedOn} placeholder={t("forestry.m.date_hint")} keyboardType="numbers-and-punctuation" />
      <Text style={s.label}>{t("forestry.m.threats")}</Text>
      <Pills<Threat> value={threats} onToggle={(v) => setThreats(threats.includes(v) ? threats.filter((x) => x !== v) : [...threats, v])} options={THREATS.map((v) => ({ v, label: t(`forestry.threat.${v}`) }))} />
      <Text style={s.label}>{t("forestry.m.weeding")}</Text>
      <Pills value={weeding} onToggle={(v) => setWeeding(weeding[0] === v ? [] : [v])} options={(["done", "partial", "needed"] as const).map((v) => ({ v, label: t(`forestry.m.weed.${v}`) }))} />
      <Field label={t("forestry.m.mean_height")} value={height} onChangeText={setHeight} keyboardType="number-pad" />
      <Field label={t("forestry.m.notes")} value={notes} onChangeText={setNotes} multiline />
      <Body tone="muted">{t("forestry.m.photo_hint")}</Body>
      <PhotoStrip session={session} entity={`${stream}.visit`} scopeId={plot.scopeId} ids={photos} onChange={setPhotos} />
      {error && <Body tone="critical">{error}</Body>}
      <Button label={t("forestry.m.save")} onPress={() => void save()} disabled={saving} />
      {drawn.length > 0 && <Button kind="secondary" label={t("forestry.m.prev_point")} onPress={() => setPhase("points")} />}
      <Button kind="secondary" label={t("forestry.m.back")} onPress={() => onDone(false)} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space.md, paddingTop: space.xl, gap: space.sm, backgroundColor: colors.surface },
  label: { fontSize: 14, color: colors.textMuted },
  box: { gap: space.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.sm },
  boxTitle: { fontSize: touch.bodyText, fontWeight: "600", color: colors.text },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  pill: { minHeight: touch.minTarget, justifyContent: "center", paddingHorizontal: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gcGreen },
  pillOn: { backgroundColor: colors.gcGreen },
  pillText: { fontSize: touch.bodyText, color: colors.gcGreen },
  pillTextOn: { color: colors.surface },
});
