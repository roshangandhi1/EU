import { streamAccent } from "@eu/core/tokens";
import { defaultSettings, plantingEventSchema, type ForestryStream } from "@eu/forestry/mobile";
import { useContext, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { LocaleContext, useT } from "../../i18n";
import type { Session } from "../../session";
import { Button, Chips, DateField, Field, Header, IconButton, NumberField, Notice, Page, Section, Segmented, Txt } from "../../ui";
import { GpsLine } from "../boreholes/VisitForm";
import { getFix, localToday, type Fix } from "../location";
import { PhotoStrip } from "../photos";
import { loadSpecies, type PlotLite, type SpeciesOption } from "./data";

interface Line {
  species: string;
  count: string;
}

/**
 * Record one planting event on a plot. Saved to the phone's outbox at once (append-only), so it
 * works with no signal; it syncs on the next run.
 */
export function PlantingForm({ session, stream, plot, onDone }: { session: Session; stream: ForestryStream; plot: PlotLite; onDone: (saved: boolean) => void }) {
  const t = useT();
  const { locale } = useContext(LocaleContext);
  const [species, setSpecies] = useState<SpeciesOption[]>([...defaultSettings[stream].speciesList]);
  const [plantedOn, setPlantedOn] = useState(localToday());
  const [lines, setLines] = useState<Line[]>([{ species: plot.species[0] ?? "", count: "" }]);
  const [gapFilling, setGapFilling] = useState(false);
  const [team, setTeam] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadSpecies(session.client, stream, defaultSettings[stream].speciesList).then(setSpecies);
  }, [session, stream]);

  // Take a fix as the form opens; the planter can retake it.
  const recordGps = async () => {
    setGpsNote(t("forestry.m.locating"));
    const f = await getFix();
    if (f === "denied") return setGpsNote(t("forestry.m.gps_denied"));
    if (!f) return setGpsNote(t("forestry.m.gps_none"));
    setFix(f);
    setGpsNote(null);
  };
  useEffect(() => {
    void recordGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = (o: SpeciesOption) => (locale === "fr" ? o.fr : o.en) ?? o.latin;
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = async () => {
    const parsed = plantingEventSchema.safeParse({
      plantedOn: plantedOn.trim(),
      lines: lines.map((l) => ({ species: l.species, count: Number(l.count.replace(/\s/g, "")) })),
      isGapFilling: gapFilling,
      team: team.trim() || null,
      notes: notes.trim() || null,
      photos,
      gpsLat: fix?.lat ?? null,
      gpsLng: fix?.lng ?? null,
      gpsAccuracyM: fix?.accuracyM ?? null,
    });
    if (!parsed.success || plantedOn > localToday()) return setError(t("forestry.m.invalid"));
    setSaving(true);
    try {
      await session.client.create(`${stream}.planting`, plot.scopeId, parsed.data);
      void session.syncNow();
      onDone(true);
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  const total = lines.reduce((n, l) => n + (Number(l.count) || 0), 0);

  return (
    <Page
      header={<Header title={t("forestry.planting.new")} subtitle={`${t("forestry.plot")} ${plot.code} · ${plot.village}`} onBack={() => onDone(false)} backLabel={t("forestry.m.back")} accent={streamAccent[stream]} />}
      footer={<Button icon="check" label={total > 0 ? t("ux.savePlanting", { n: total.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB") }) : t("forestry.m.save")} onPress={() => void save()} disabled={saving} flex={1} />}
    >
      <DateField label={t("forestry.planting.date")} value={plantedOn} onChange={setPlantedOn} max={localToday()} todayLabel={t("app.today")} yesterdayLabel={t("app.yesterday")} />

      <Section title={t("ux.whatPlanted")}>
        {lines.map((line, i) => (
          <View key={i} style={[s.line, i > 0 && s.lineNext]}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Txt variant="label" style={{ flex: 1 }}>{t("forestry.planting.species")}{lines.length > 1 ? ` ${i + 1}` : ""}</Txt>
              {lines.length > 1 && <IconButton icon="x" label={t("forestry.m.remove")} onPress={() => setLines(lines.filter((_, j) => j !== i))} />}
            </View>
            <Chips options={species.map((o) => ({ value: o.key, label: label(o) }))} selected={[line.species]} onToggle={(v) => setLine(i, { species: v })} />
            <NumberField label={t("forestry.planting.count")} value={line.count} onChange={(v) => setLine(i, { count: v })} step={10} />
          </View>
        ))}
        <Button kind="ghost" icon="plus" label={t("forestry.m.add_species")} onPress={() => setLines([...lines, { species: "", count: "" }])} />
      </Section>

      <Section title={t("forestry.planting.gap_filling")} hint={t("ux.gapHint")}>
        <Segmented value={gapFilling} onChange={setGapFilling} options={[{ value: false, label: t("forestry.m.no") }, { value: true, label: t("forestry.m.yes") }]} />
      </Section>

      <Section title={t("ux.notesPhotos")}>
        <Field label={`${t("forestry.m.team")} (${t("ux.optional")})`} value={team} onChangeText={setTeam} />
        <Field label={`${t("forestry.m.notes")} (${t("ux.optional")})`} value={notes} onChangeText={setNotes} multiline />
        <PhotoStrip session={session} entity={`${stream}.planting`} scopeId={plot.scopeId} ids={photos} onChange={setPhotos} hint={t("forestry.m.photo_hint")} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <GpsLine fix={fix} note={gpsNote} />
          <IconButton icon="locate" label={t("forestry.m.record_gps")} onPress={() => void recordGps()} />
        </View>
      </Section>
      {error && <Notice tone="critical">{error}</Notice>}
    </Page>
  );
}

const s = StyleSheet.create({
  line: { gap: 12 },
  lineNext: { borderTopWidth: 1, borderTopColor: "#E4E8E1", paddingTop: 12 },
});
