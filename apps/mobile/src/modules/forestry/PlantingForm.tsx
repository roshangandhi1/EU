import { streamAccent } from "@eu/core/tokens";
import { defaultSettings, plantingEventSchema, type ForestryStream } from "@eu/forestry/mobile";
import { useContext, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useDraft } from "../../drafts";
import { saveErrorKey } from "../../errors";
import { LocaleContext, useT } from "../../i18n";
import type { Session } from "../../session";
import { Anchor, Button, Chips, DateField, Field, Header, IconButton, NumberField, Notice, Page, Section, Segmented, Txt, useDialog, useFormScroll, useLeaveGuard } from "../../ui";
import { GpsStatus } from "../gps";
import { localToday, useGps, type Fix } from "../location";
import { PhotoStrip } from "../photos";
import { loadSpecies, type PlotLite, type SpeciesOption } from "./data";

interface Line {
  species: string;
  count: string;
}

interface PlantingDraft {
  plantedOn: string;
  lines: Line[];
  gapFilling: boolean;
  team: string;
  notes: string;
  photos: string[];
  fix: Fix | null;
}

/**
 * Record one planting event on a plot. Saved to the phone's outbox at once (append-only), so it
 * works with no signal; it syncs on the next run. Kept as a draft while being filled in.
 */
export function PlantingForm({ session, stream, plot, onDone }: { session: Session; stream: ForestryStream; plot: PlotLite; onDone: (saved: boolean) => void }) {
  const t = useT();
  const { locale } = useContext(LocaleContext);
  const form = useFormScroll();
  const { ask, node: dialog } = useDialog();
  const today = localToday();
  const firstLine = (): Line[] => [{ species: plot.species[0] ?? "", count: "" }];
  const [species, setSpecies] = useState<SpeciesOption[]>([...defaultSettings[stream].speciesList]);
  const [plantedOn, setPlantedOn] = useState(today);
  const [lines, setLines] = useState<Line[]>(firstLine);
  const [gapFilling, setGapFilling] = useState(false);
  const [team, setTeam] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const gps = useGps();
  const [lineErrors, setLineErrors] = useState<Record<number, { species?: string; count?: string }>>({});
  const [dateError, setDateError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadSpecies(session.client, stream, defaultSettings[stream].speciesList).then(setSpecies);
  }, [session, stream]);

  const dirty = plantedOn !== today || lines.length > 1 || lines.some((l) => l.count !== "") || gapFilling || !!team.trim() || !!notes.trim() || photos.length > 0;
  const draftKey = `planting:${stream}:${plot.scopeId}`;
  const draft = useDraft<PlantingDraft>(session, draftKey, { plantedOn, lines, gapFilling, team, notes, photos, fix: gps.fix }, dirty, (d, recovered) => {
    if (d) {
      setPlantedOn(d.plantedOn); setLines(d.lines.length ? d.lines : firstLine()); setGapFilling(d.gapFilling); setTeam(d.team); setNotes(d.notes);
      if (d.fix) gps.setFix(d.fix);
    }
    setPhotos([...(d?.photos ?? []), ...recovered.map((r) => r.fileId)]);
  });

  // Take a fix as the form opens (unless the draft had one); the planter can retake it.
  useEffect(() => {
    if (draft.ready && !gps.fix) void gps.locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.ready]);

  const label = (o: SpeciesOption) => (locale === "fr" ? o.fr : o.en) ?? o.latin;
  const setLine = (i: number, patch: Partial<Line>) => {
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    if (lineErrors[i]) setLineErrors({ ...lineErrors, [i]: { ...lineErrors[i], ...(patch.species !== undefined ? { species: undefined } : {}), ...(patch.count !== undefined ? { count: undefined } : {}) } });
  };
  const count = (l: Line) => Number(l.count.replace(/\s/g, ""));

  const save = async () => {
    if (saving) return;
    setError(null);
    const errs: Record<number, { species?: string; count?: string }> = {};
    const seen = new Set<string>();
    lines.forEach((l, i) => {
      const e: { species?: string; count?: string } = {};
      if (!l.species) e.species = t("ux.chooseSpecies");
      else if (seen.has(l.species)) e.species = t("ux.speciesTwice");
      seen.add(l.species);
      if (!l.count.trim() || !Number.isInteger(count(l)) || count(l) <= 0) e.count = t("ux.countNeeded");
      if (e.species || e.count) errs[i] = e;
    });
    setLineErrors(errs);
    const badDate = plantedOn > today ? t("ux.dateFuture") : null;
    setDateError(badDate);
    if (badDate) return form.scrollTo("date");
    if (Object.keys(errs).length) return form.scrollTo("lines");
    const parsed = plantingEventSchema.safeParse({
      plantedOn: plantedOn.trim(),
      lines: lines.map((l) => ({ species: l.species, count: count(l) })),
      isGapFilling: gapFilling,
      team: team.trim() || null,
      notes: notes.trim() || null,
      photos,
      gpsLat: gps.fix?.lat ?? null,
      gpsLng: gps.fix?.lng ?? null,
      gpsAccuracyM: gps.fix?.accuracyM ?? null,
    });
    if (!parsed.success) {
      console.warn("planting invalid", parsed.error.issues);
      return setError(t("forestry.m.invalid"));
    }
    setSaving(true);
    try {
      await session.client.create(`${stream}.planting`, plot.scopeId, parsed.data);
      await draft.clear();
      await session.localSaved();
      void session.syncNow();
      onDone(true);
    } catch (e) {
      setError(t(saveErrorKey(e)));
      setSaving(false);
    }
  };

  const back = useLeaveGuard(dirty, () => void draft.clear().then(() => onDone(false)), ask);
  const total = lines.reduce((n, l) => n + (Number(l.count) || 0), 0);

  return (
    <Page
      form={form}
      header={<Header title={t("forestry.planting.new")} subtitle={`${t("forestry.plot")} ${plot.code} · ${plot.village}`} onBack={back} backLabel={t("forestry.m.back")} accent={streamAccent[stream]} />}
      footer={<Button icon="check" label={total > 0 ? t("ux.savePlanting", { n: total.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB") }) : t("forestry.m.save")} onPress={() => void save()} busy={saving} flex={1} />}
    >
      {draft.restoredAt && <Notice tone="info" title={t("ux.draftRestored")}>{t("ux.draftRestoredBody")}</Notice>}
      {error && <Notice tone="critical">{error}</Notice>}
      <Anchor form={form} name="date">
        <DateField label={t("forestry.planting.date")} value={plantedOn} onChange={(d) => { setPlantedOn(d); setDateError(null); }} max={today} todayLabel={t("app.today")} yesterdayLabel={t("app.yesterday")} />
        {dateError ? <Txt variant="small" tone="critical">{dateError}</Txt> : null}
      </Anchor>

      <Anchor form={form} name="lines">
        <Section title={t("ux.whatPlanted")}>
          {lines.map((line, i) => (
            <View key={i} style={[s.line, i > 0 && s.lineNext]}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Txt variant="label" style={{ flex: 1 }}>{t("forestry.planting.species")}{lines.length > 1 ? ` ${i + 1}` : ""}</Txt>
                {lines.length > 1 && <IconButton icon="x" label={t("forestry.m.remove")} onPress={() => { setLines(lines.filter((_, j) => j !== i)); setLineErrors({}); }} />}
              </View>
              <Chips options={species.map((o) => ({ value: o.key, label: label(o) }))} selected={[line.species]} onToggle={(v) => setLine(i, { species: v })} />
              {lineErrors[i]?.species ? <Txt variant="small" tone="critical">{lineErrors[i]!.species}</Txt> : null}
              <NumberField label={t("forestry.planting.count")} value={line.count} onChange={(v) => setLine(i, { count: v })} step={10} />
              {lineErrors[i]?.count ? <Txt variant="small" tone="critical">{lineErrors[i]!.count}</Txt> : null}
            </View>
          ))}
          <Button kind="ghost" icon="plus" label={t("forestry.m.add_species")} onPress={() => setLines([...lines, { species: "", count: "" }])} />
        </Section>
      </Anchor>

      <Section title={t("forestry.planting.gap_filling")} hint={t("ux.gapHint")}>
        <Segmented value={gapFilling} onChange={setGapFilling} options={[{ value: false, label: t("forestry.m.no") }, { value: true, label: t("forestry.m.yes") }]} />
      </Section>

      <Section title={t("ux.notesPhotos")}>
        <Field label={`${t("forestry.m.team")} (${t("ux.optional")})`} value={team} onChangeText={setTeam} />
        <Field label={`${t("forestry.m.notes")} (${t("ux.optional")})`} value={notes} onChangeText={setNotes} multiline />
        <PhotoStrip session={session} entity={`${stream}.planting`} scopeId={plot.scopeId} ids={photos} onChange={setPhotos} hint={t("forestry.m.photo_hint")} draftKey={draftKey} />
        <GpsStatus fix={gps.fix} locating={gps.locating} problem={gps.problem} onRetry={() => void gps.locate()} />
      </Section>
      {dialog}
    </Page>
  );
}

const s = StyleSheet.create({
  line: { gap: 12 },
  lineNext: { borderTopWidth: 1, borderTopColor: "#E4E8E1", paddingTop: 12 },
});
