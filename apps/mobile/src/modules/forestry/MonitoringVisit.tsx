import { colors, streamAccent } from "@eu/core/tokens";
import {
  bearingDeg, compass, defaultSettings, distanceM, estimateStocking, monitoringVisitSchema, placeSamplePoints,
  type ForestryStream, type SamplePlot,
} from "@eu/forestry/mobile";
import { useContext, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useDraft } from "../../drafts";
import { saveErrorKey } from "../../errors";
import { LocaleContext, useT } from "../../i18n";
import type { Session } from "../../session";
import { Button, Card, Chips, DateField, Field, Header, Notice, NumberField, Page, Section, Segmented, Stat, Txt, useDialog, useLeaveGuard } from "../../ui";
import { Icon } from "../../icons";
import { GpsStatus } from "../gps";
import { localToday, noFixKey, useGps, type Fix } from "../location";
import { loadSpecies, type PlotLite, type SpeciesOption } from "./data";
import { PhotoStrip } from "../photos";

type Threat = "fire" | "charcoal" | "grazing" | "encroachment" | "pests" | "disease" | "livestock" | "flooding" | "other";
const THREATS: Threat[] = ["fire", "charcoal", "grazing", "encroachment", "pests", "disease", "livestock", "flooding", "other"];
type Skip = "inaccessible" | "flooded" | "other";
type Weeding = "done" | "partial" | "needed";
interface Counts { alive: string; dead: string; natural: string }
/** One circle: counts typed, or skipped with a reason, or an explicit "no plants here" (zero). */
interface PointState { counts: Record<string, Counts>; skipped?: Skip; zero?: boolean; fix?: Fix }

interface MonitoringDraft {
  seed: number;
  visitedOn: string;
  idx: number;
  phase: "points" | "summary";
  points: Record<number, PointState>;
  threats: Threat[];
  weeding: Weeding | null;
  height: string;
  notes: string;
  photos: string[];
}

const n = (v: string | undefined) => {
  const x = Number((v ?? "").replace(/\s/g, ""));
  return Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0;
};

/** A circle counts only when something was entered for it, it was skipped, or "0 plants" was chosen. */
export function isCounted(st: PointState | undefined): boolean {
  if (!st) return false;
  if (st.skipped || st.zero) return true;
  return Object.values(st.counts).some((c) => c.alive !== "" || c.dead !== "" || c.natural !== "");
}

/**
 * Monitoring visit: the phone draws random sample circles inside the plot from a stored seed,
 * guides the officer to each one, and records living, dead and (miombo) natural plants per
 * species. Survival and stocking are estimated on the spot, and again on the server. The whole
 * visit (seed included, so the circles stay put) is kept as a draft until saved.
 */
export function MonitoringVisit({ session, stream, plot, onDone }: { session: Session; stream: ForestryStream; plot: PlotLite; onDone: (saved: boolean) => void }) {
  const t = useT();
  const { locale } = useContext(LocaleContext);
  const { ask, node: dialog } = useDialog();
  const cfg = defaultSettings[stream];
  const today = localToday();
  const [settings, setSettings] = useState({ ...cfg });
  const [settingsReady, setSettingsReady] = useState(false);
  const [species, setSpecies] = useState<SpeciesOption[]>([...cfg.speciesList]);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [visitedOn, setVisitedOn] = useState(today);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"points" | "summary">(plot.geom ? "points" : "summary");
  const [points, setPoints] = useState<Record<number, PointState>>({});
  const gps = useGps();
  const fix = gps.fix;
  const [threats, setThreats] = useState<Threat[]>([]);
  const [weeding, setWeeding] = useState<Weeding | null>(null);
  const [height, setHeight] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const row = (await session.client.list(`${stream}.settings`)).find((r) => !r.voidedAt);
        if (row) setSettings((cur) => ({ ...cur, ...(row as object) }));
        setSpecies(await loadSpecies(session.client, stream, cfg.speciesList));
      } finally {
        setSettingsReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, stream]);

  const dirty = Object.values(points).some(isCounted) || visitedOn !== today || threats.length > 0 || !!weeding || !!height || !!notes.trim() || photos.length > 0;
  const draftKey = `monitoring:${stream}:${plot.scopeId}`;
  const draft = useDraft<MonitoringDraft>(session, draftKey, { seed, visitedOn, idx, phase, points, threats, weeding, height, notes, photos }, dirty, (d, recovered) => {
    if (d) {
      setSeed(d.seed); setVisitedOn(d.visitedOn); setIdx(d.idx); setPhase(d.phase); setPoints(d.points);
      setThreats(d.threats); setWeeding(d.weeding); setHeight(d.height); setNotes(d.notes);
    }
    setPhotos([...(d?.photos ?? []), ...recovered.map((r) => r.fileId)]);
  });

  // Circles are drawn only once the plot's settings and any draft are in, so they never move under the officer.
  const drawn = useMemo(
    () => (plot.geom && settingsReady && draft.ready ? placeSamplePoints(plot.geom, seed, settings) : []),
    [plot.geom, seed, settings, settingsReady, draft.ready],
  );
  const i = Math.min(idx, Math.max(0, drawn.length - 1));
  const plotSpecies = species.filter((o) => plot.species.length === 0 || plot.species.includes(o.key));
  const label = (o: SpeciesOption) => (locale === "fr" ? o.fr : o.en) ?? o.latin;

  useEffect(() => {
    void gps.locate();
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
  // Untouched circles are never saved as zero: they would pull density and survival down.
  const counted = samples.filter((x) => isCounted(points[x.pointIndex]));
  const uncounted = drawn.length - counted.length;
  const est = counted.length > 0 ? estimateStocking(counted, { includeNatural: stream === "miombo" }) : null;

  const setCount = (sp: string, field: keyof Counts, v: string) => {
    const cur = points[i] ?? { counts: {} };
    const c = cur.counts[sp] ?? { alive: "", dead: "", natural: "" };
    setPoints({ ...points, [i]: { ...cur, skipped: undefined, zero: undefined, fix: cur.fix ?? fix ?? undefined, counts: { ...cur.counts, [sp]: { ...c, [field]: v } } } });
  };
  const skip = (r: Skip) => setPoints({ ...points, [i]: { counts: {}, skipped: r } });

  /** "Next point" on a circle with nothing entered: say it is empty, go back and count, or leave it for later. */
  const next = async () => {
    const last = i + 1 >= drawn.length;
    const go = () => (last ? setPhase("summary") : setIdx(i + 1));
    if (isCounted(points[i])) return go();
    const v = await ask<"zero" | "later" | "count">({
      title: t("ux.nothingCounted"),
      message: t("ux.nothingCountedBody"),
      actions: [
        { label: t("ux.countFirst"), value: "count", kind: "primary" },
        { label: t("ux.zeroHere"), value: "zero", kind: "secondary" },
        { label: t("ux.countLater"), value: "later", kind: "ghost" },
      ],
    });
    if (v === "zero") {
      setPoints({ ...points, [i]: { counts: {}, zero: true, fix: fix ?? undefined } });
      go();
    } else if (v === "later") go();
  };

  const save = async () => {
    if (saving) return;
    if (visitedOn > today) return setError(t("ux.dateFuture"));
    const parsed = monitoringVisitSchema.safeParse({
      visitedOn: visitedOn.trim(),
      sampleSeed: drawn.length ? seed : null,
      samples: counted,
      meanHeightCm: height.trim() ? Number(height) : null,
      threats,
      weeding: weeding ?? null,
      photos: photos.map((fileId) => ({ fileId })),
      notes: notes.trim() || null,
      gpsLat: fix?.lat ?? null,
      gpsLng: fix?.lng ?? null,
      gpsAccuracyM: fix?.accuracyM ?? null,
    });
    if (!parsed.success) {
      console.warn("monitoring invalid", parsed.error.issues);
      return setError(t("forestry.m.invalid"));
    }
    if (uncounted > 0 && drawn.length > 0) {
      const ok = await ask<boolean>({
        title: t("ux.uncountedTitle", { n: uncounted, total: drawn.length }),
        message: t("ux.uncountedBody"),
        actions: [
          { label: t("ux.backToPoints"), value: false, kind: "primary" },
          { label: t("ux.saveAnyway"), value: true, kind: "secondary" },
        ],
      });
      if (!ok) {
        if (ok === false) {
          const firstOpen = drawn.findIndex((p) => !isCounted(points[p.pointIndex]));
          setIdx(Math.max(0, firstOpen));
          setPhase("points");
        }
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      await session.client.create(`${stream}.visit`, plot.scopeId, parsed.data);
      await draft.clear();
      await session.localSaved();
      void session.syncNow();
      onDone(true);
    } catch (e) {
      setError(t(saveErrorKey(e)));
      setSaving(false);
    }
  };

  const fmt = (x: number) => (Number.isFinite(x) ? String(Math.round(x)) : "–");
  const accent = streamAccent[stream];
  const back = useLeaveGuard(dirty, () => void draft.clear().then(() => onDone(false)), ask);
  const header = (sub: string) => <Header title={t("forestry.visit.new")} subtitle={sub} onBack={back} backLabel={t("forestry.m.back")} accent={accent} />;

  if (phase === "points" && plot.geom && drawn.length === 0) {
    return <Page header={header(`${t("forestry.plot")} ${plot.code}`)}><Txt tone="muted">…</Txt></Page>;
  }

  if (phase === "points" && drawn.length > 0) {
    const p = drawn[i]!;
    const st = points[i];
    const d = fix ? distanceM(fix.lat, fix.lng, p.lat, p.lng) : null;
    const near = d !== null && d <= Math.max(settings.sampleRadiusM, fix?.accuracyM ?? 0);
    const last = i + 1 >= drawn.length;
    return (
      <Page
        header={header(`${t("forestry.plot")} ${plot.code}`)}
        footer={
          <>
            {i > 0 && <Button kind="secondary" icon="chevronLeft" label={t("ux.previous")} onPress={() => setIdx(i - 1)} flex={1} />}
            <Button
              icon={last ? "check" : undefined}
              iconAfter={last ? undefined : "chevronRight"}
              label={last ? t("forestry.m.finish_points") : t("forestry.m.next_point")}
              onPress={() => void next()}
              flex={2}
            />
          </>
        }
      >
        {draft.restoredAt && <Notice tone="info" title={t("ux.draftRestored")}>{t("ux.draftRestoredBody")}</Notice>}
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Txt variant="title" style={{ flex: 1 }}>{t("forestry.visit.sample_n", { n: i + 1, total: drawn.length })}</Txt>
          </View>
          <View style={s.dots} accessibilityLabel={t("ux.circlesCounted", { n: counted.length, total: drawn.length })}>
            {drawn.map((x, j) => {
              const done = isCounted(points[j]);
              return <View key={x.pointIndex} style={[s.dot, done && { backgroundColor: accent }, j === i && s.dotOn]} />;
            })}
          </View>
        </View>
        {i === 0 && !st && <Txt variant="small" tone="muted">{t("forestry.m.samples_intro", { n: drawn.length, r: settings.sampleRadiusM })}</Txt>}

        <Card style={near ? { backgroundColor: colors.gcGreenTint, borderColor: colors.gcGreen } : undefined}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={[s.guide, { backgroundColor: near ? colors.gcGreen : colors.gcGreenDeep }]}>
              <Icon name={near ? "check" : "compass"} size={26} color={colors.surface} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              {gps.locating ? (
                <Txt tone="muted">{t("forestry.m.locating")}</Txt>
              ) : d !== null && fix ? (
                <Txt variant="heading" color={near ? colors.gcGreen : colors.text}>
                  {near ? t("forestry.m.at_point", { m: Math.round(Math.max(settings.sampleRadiusM, fix.accuracyM ?? 0)) }) : t("forestry.m.heading", { m: Math.round(d), dir: t(`forestry.m.dir.${compass(bearingDeg(fix.lat, fix.lng, p.lat, p.lng))}`) })}
                </Txt>
              ) : (
                <Txt tone="muted">{t(noFixKey(gps.problem ?? null))}</Txt>
              )}
            </View>
          </View>
          <Button kind="secondary" icon="locate" label={t("forestry.m.where_am_i")} onPress={() => void gps.locate()} busy={gps.locating} />
        </Card>

        {st?.skipped ? (
          <Notice tone="warning" title={t("forestry.m.skipped")}>{t(`forestry.m.skip_reason.${st.skipped}`)}</Notice>
        ) : (
          <>
            {st?.zero && <Notice tone="info" title={t("ux.zeroRecorded")}>{t("ux.zeroRecordedBody")}</Notice>}
            {plotSpecies.map((o) => {
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
            })}
          </>
        )}

        <View style={{ gap: 6 }}>
          <Txt variant="label" tone="muted">{t("forestry.visit.skip")}</Txt>
          <Chips<Skip> selected={st?.skipped ? [st.skipped] : []} onToggle={(r) => (st?.skipped === r ? setPoints({ ...points, [i]: { counts: {} } }) : skip(r))} options={(["inaccessible", "flooded", "other"] as const).map((v) => ({ value: v, label: t(`forestry.m.skip_reason.${v}`) }))} />
        </View>
        {dialog}
      </Page>
    );
  }

  return (
    <Page
      header={header(`${t("forestry.plot")} ${plot.code} · ${plot.village}`)}
      footer={
        <>
          {drawn.length > 0 && <Button kind="secondary" icon="chevronLeft" label={t("ux.points")} onPress={() => setPhase("points")} flex={1} />}
          <Button icon="check" label={t("ux.saveVisit")} onPress={() => void save()} busy={saving} flex={2} />
        </>
      }
    >
      {draft.restoredAt && drawn.length === 0 && <Notice tone="info" title={t("ux.draftRestored")}>{t("ux.draftRestoredBody")}</Notice>}
      {error && <Notice tone="critical">{error}</Notice>}
      {!plot.geom && <Notice tone="warning">{t("forestry.m.no_boundary_visit")}</Notice>}
      {drawn.length > 0 && uncounted > 0 && (
        <Notice tone="warning" title={t("ux.uncountedTitle", { n: uncounted, total: drawn.length })}>{t("ux.uncountedHint")}</Notice>
      )}
      {est && (
        <Card>
          <Txt variant="label" tone="muted">{t("ux.estimate")}</Txt>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Stat value={fmt(est.livingPerHa.value)} label={t("ux.perHa", { low: fmt(est.livingPerHa.low), high: fmt(est.livingPerHa.high) })} />
            {est.survivalPct && <Stat value={`${fmt(est.survivalPct.value)} %`} label={t("ux.survival", { low: fmt(est.survivalPct.low), high: fmt(est.survivalPct.high) })} tone={est.survivalPct.value >= 80 ? "good" : est.survivalPct.value >= 60 ? "warning" : "critical"} />}
          </View>
        </Card>
      )}
      <DateField label={t("forestry.m.visit_date")} value={visitedOn} onChange={setVisitedOn} max={today} todayLabel={t("app.today")} yesterdayLabel={t("app.yesterday")} />
      <Section title={t("forestry.m.threats")} hint={t("ux.tickAll")}>
        <Chips<Threat> selected={threats} onToggle={(v) => setThreats(threats.includes(v) ? threats.filter((x) => x !== v) : [...threats, v])} options={THREATS.map((v) => ({ value: v, label: t(`forestry.threat.${v}`) }))} />
      </Section>
      <Section title={t("forestry.m.weeding")}>
        <Segmented value={weeding} onChange={(v) => setWeeding(weeding === v ? null : v)} options={(["done", "partial", "needed"] as const).map((v) => ({ value: v, label: t(`forestry.m.weed.${v}`) }))} />
      </Section>
      <Section title={t("ux.notesPhotos")}>
        <NumberField label={`${t("forestry.m.mean_height")} (${t("ux.optional")})`} value={height} onChange={setHeight} step={5} suffix="cm" />
        <Field label={`${t("forestry.m.notes")} (${t("ux.optional")})`} value={notes} onChangeText={setNotes} multiline />
        <PhotoStrip session={session} entity={`${stream}.visit`} scopeId={plot.scopeId} ids={photos} onChange={setPhotos} hint={t("forestry.m.photo_hint")} draftKey={draftKey} />
        <GpsStatus fix={fix} locating={gps.locating} problem={gps.problem} onRetry={() => void gps.locate()} />
      </Section>
      {dialog}
    </Page>
  );
}

const s = StyleSheet.create({
  dots: { flexDirection: "row", gap: 6 },
  dot: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "#DDE3D9" },
  dotOn: { backgroundColor: colors.gcGreenDeep },
  guide: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
