import { colors, radius, space, touch } from "@eu/core/tokens";
import { defaultSettings, plantingEventSchema, type ForestryStream } from "@eu/forestry/mobile";
import { useContext, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LocaleContext, useT } from "../../i18n";
import type { Session } from "../../session";
import { Body, Button, Field, Title } from "../../ui";
import { getFix, localToday, type Fix } from "../location";
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
      photos: [],
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

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Title>{t("forestry.planting.new")}</Title>
      <Body tone="muted">
        {t("forestry.plot")} {plot.code} · {plot.village}
      </Body>

      <Field label={t("forestry.planting.date")} value={plantedOn} onChangeText={setPlantedOn} placeholder={t("forestry.m.date_hint")} keyboardType="numbers-and-punctuation" />

      {lines.map((line, i) => (
        <View key={i} style={s.line}>
          <Text style={s.label}>{t("forestry.planting.species")}</Text>
          <View style={s.pills}>
            {species.map((o) => (
              <Pressable key={o.key} accessibilityRole="button" onPress={() => setLine(i, { species: o.key })} style={[s.pill, line.species === o.key && s.pillOn]}>
                <Text style={[s.pillText, line.species === o.key && s.pillTextOn]}>{label(o)}</Text>
              </Pressable>
            ))}
          </View>
          <Field label={t("forestry.planting.count")} value={line.count} onChangeText={(v) => setLine(i, { count: v })} keyboardType="number-pad" />
          {lines.length > 1 && <Button kind="secondary" label={t("forestry.m.remove")} onPress={() => setLines(lines.filter((_, j) => j !== i))} />}
        </View>
      ))}
      <Button kind="secondary" label={t("forestry.m.add_species")} onPress={() => setLines([...lines, { species: "", count: "" }])} />

      <Text style={s.label}>{t("forestry.planting.gap_filling")}</Text>
      <View style={s.pills}>
        {[false, true].map((v) => (
          <Pressable key={String(v)} accessibilityRole="button" onPress={() => setGapFilling(v)} style={[s.pill, gapFilling === v && s.pillOn]}>
            <Text style={[s.pillText, gapFilling === v && s.pillTextOn]}>{t(v ? "forestry.m.yes" : "forestry.m.no")}</Text>
          </Pressable>
        ))}
      </View>

      <Field label={t("forestry.m.team")} value={team} onChangeText={setTeam} />
      <Field label={t("forestry.m.notes")} value={notes} onChangeText={setNotes} multiline />

      <Body tone={fix ? "good" : "muted"}>{gpsNote ?? (fix ? t("forestry.m.gps_ok", { m: Math.round(fix.accuracyM ?? 0) }) : t("forestry.m.gps_none"))}</Body>
      <Button kind="secondary" label={t("forestry.m.record_gps")} onPress={() => void recordGps()} />
      <Body tone="muted">{t("forestry.m.photos_soon")}</Body>

      {error && <Body tone="critical">{error}</Body>}
      <Button label={t("forestry.m.save")} onPress={() => void save()} disabled={saving} />
      <Button kind="secondary" label={t("forestry.m.back")} onPress={() => onDone(false)} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space.md, paddingTop: space.xl, gap: space.sm, backgroundColor: colors.surface },
  line: { gap: space.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.sm },
  label: { fontSize: 14, color: colors.textMuted },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  pill: { minHeight: touch.minTarget, justifyContent: "center", paddingHorizontal: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gcGreen },
  pillOn: { backgroundColor: colors.gcGreen },
  pillText: { fontSize: touch.bodyText, color: colors.gcGreen },
  pillTextOn: { color: colors.surface },
});
