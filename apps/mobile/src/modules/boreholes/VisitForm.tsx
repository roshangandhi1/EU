import { failedResults, visitSchema, type TaskResult } from "@eu/boreholes/mobile";
import { colors, streamAccent } from "@eu/core/tokens";
import { useContext, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { LocaleContext, useT } from "../../i18n";
import type { Session } from "../../session";
import { Button, DateField, Field, Header, Notice, Page, Section, Segmented, StatusChip, Txt, type Tone } from "../../ui";
import { getFix, localToday, type Fix } from "../location";
import type { BoreholeRow, Schedule } from "./data";
import { PhotoStrip } from "../photos";

type Mark = "ok" | "problem" | "not_done";
type Kind = "routine" | "repair" | "inspection" | "commissioning";
type Severity = "no_water" | "reduced" | "minor";

/**
 * A technician's visit: the configured checklist (from the web template), the operational check
 * for indicator 1.1.1, and faults opened automatically for failed tasks. All saved offline.
 */
export function VisitForm({ session, borehole, schedule, onDone }: { session: Session; borehole: BoreholeRow; schedule: Schedule; onDone: (saved: boolean) => void }) {
  const t = useT();
  const { locale } = useContext(LocaleContext);
  const tasks = schedule.tasks.filter((task) => borehole.due.some((d) => d.taskKey === task.key));
  const dueKeys = new Set(borehole.due.filter((d) => d.status !== "ok").map((d) => d.taskKey));
  const [visitedOn, setVisitedOn] = useState(localToday());
  const [kind, setKind] = useState<Kind>("routine");
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({});
  const [pumpDelivers, setPumpDelivers] = useState<boolean>(true);
  const [tankTaps, setTankTaps] = useState<boolean>(true);
  const [bucketSec, setBucketSec] = useState("");
  const [severity, setSeverity] = useState<Severity>("reduced");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [taskPhotos, setTaskPhotos] = useState<Record<string, string[]>>({});
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getFix().then((f) => f && f !== "denied" && setFix(f));
  }, []);

  const sec = Number(bucketSec.replace(",", "."));
  const lpm = sec > 0 ? Math.round((20 / sec) * 60 * 10) / 10 : null;

  const resultFor = (key: string): TaskResult | null => {
    const task = tasks.find((x) => x.key === key)!;
    const note = taskNotes[key]?.trim() || undefined;
    if (task.proof.kind === "reading") {
      const raw = readings[key]?.replace(",", ".").trim();
      const value = raw ? Number(raw) : task.proof.unit === "L/min" && lpm !== null ? lpm : undefined;
      if (value === undefined || Number.isNaN(value)) return null;
      const pass = (task.proof.min === undefined || value >= task.proof.min) && (task.proof.max === undefined || value <= task.proof.max);
      return { taskKey: key, done: true, pass, value, note };
    }
    const m = marks[key];
    if (!m || m === "not_done") return m ? { taskKey: key, done: false, note } : null;
    const photo = taskPhotos[key]?.[0];
    return { taskKey: key, done: true, pass: m === "ok", note, ...(photo ? { photoFileId: photo } : {}) };
  };
  const results = tasks.map((x) => resultFor(x.key)).filter((r): r is TaskResult => r !== null);
  const faults = failedResults(tasks, results);

  const save = async () => {
    const parsed = visitSchema.safeParse({
      visitedOn: visitedOn.trim(),
      kind,
      templateKey: schedule.templateKey,
      templateVersion: schedule.templateVersion,
      results,
      operational: { pumpDelivers, flowLpm: lpm, tankFillsTapsOk: tankTaps },
      flowLpm: lpm,
      partsUsed: [],
      faultsClosed: [],
      photos,
      notes: notes.trim() || null,
      gpsLat: fix?.lat ?? null,
      gpsLng: fix?.lng ?? null,
      gpsAccuracyM: fix?.accuracyM ?? null,
    });
    if (!parsed.success || visitedOn > localToday()) return setError(t("boreholes.m.invalid"));
    setSaving(true);
    try {
      const visitId = await session.client.create("boreholes.visit", borehole.siteId, parsed.data);
      for (const f of faults) {
        const task = tasks.find((x) => x.key === f.taskKey)!;
        await session.client.create("boreholes.fault", borehole.siteId, {
          openedOn: parsed.data.visitedOn,
          openedByVisitId: visitId,
          taskKey: f.taskKey,
          description: [task.label[locale], f.value !== undefined ? `${f.value}` : null, f.note].filter(Boolean).join(" · "),
          severity,
          photos: [],
        });
      }
      void session.syncNow();
      onDone(true);
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  const yesNo = [
    { value: true, label: t("forestry.m.yes") },
    { value: false, label: t("forestry.m.no") },
  ];
  const dueTone = (st: string): Tone => (st === "overdue" ? "critical" : st === "due" ? "warning" : st === "due_soon" ? "info" : "muted");
  const answered = tasks.filter((x) => resultFor(x.key) !== null).length;

  return (
    <Page
      header={<Header title={t("ux.maintenanceVisit")} subtitle={`${borehole.code} · ${borehole.village}`} onBack={() => onDone(false)} backLabel={t("forestry.m.back")} accent={streamAccent.boreholes} />}
      footer={<Button icon="check" label={t("ux.saveVisit")} onPress={() => void save()} disabled={saving} flex={1} />}
    >
      <Section title={t("ux.theVisit")}>
        <DateField label={t("boreholes.m.visit_date")} value={visitedOn} onChange={setVisitedOn} max={localToday()} todayLabel={t("app.today")} yesterdayLabel={t("app.yesterday")} />
        <Segmented<Kind> columns={2} value={kind} onChange={setKind} options={(["routine", "repair", "inspection", "commissioning"] as const).map((k) => ({ value: k, label: t(`boreholes.m.kind.${k}`) }))} />
      </Section>

      <Section title={t("boreholes.m.operational")}>
        <View style={{ gap: 6 }}>
          <Txt variant="label">{t("boreholes.op.pump_delivers")}</Txt>
          <Segmented value={pumpDelivers} onChange={setPumpDelivers} options={yesNo} tones={{ false: "critical" }} />
        </View>
        <Field label={t("boreholes.m.bucket_seconds")} value={bucketSec} onChangeText={setBucketSec} keyboardType="decimal-pad" suffix="s" hint={lpm === null ? t("boreholes.visit.flow_help") : undefined} />
        {lpm !== null && <Notice tone="good" icon="drop" title={t("boreholes.m.flow_result", { lpm })} />}
        <View style={{ gap: 6 }}>
          <Txt variant="label">{t("boreholes.op.tank_taps")}</Txt>
          <Segmented value={tankTaps} onChange={setTankTaps} options={yesNo} tones={{ false: "critical" }} />
        </View>
      </Section>

      <Section title={t("boreholes.m.tasks")} right={<StatusChip label={`${answered}/${tasks.length}`} tone={answered === tasks.length ? "good" : "muted"} />}>
        {tasks.map((task) => {
          const r = resultFor(task.key);
          const d = borehole.due.find((x) => x.taskKey === task.key);
          return (
            <View key={task.key} style={[s.task, dueKeys.has(task.key) && d?.status !== "each_visit" && s.taskDue]}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <Txt weight={700} style={{ flex: 1 }}>{task.label[locale]}</Txt>
                {d && d.status !== "each_visit" ? <StatusChip label={t(`boreholes.due.${d.status}`)} tone={dueTone(d.status)} /> : null}
              </View>
              {task.proof.kind === "reading" ? (
                <Field
                  label={t("boreholes.m.reading", { unit: task.proof.unit })}
                  value={readings[task.key] ?? (task.proof.unit === "L/min" && lpm !== null ? String(lpm) : "")}
                  onChangeText={(v) => setReadings({ ...readings, [task.key]: v })}
                  keyboardType="decimal-pad"
                  suffix={task.proof.unit}
                />
              ) : (
                <Segmented<Mark>
                  value={marks[task.key]}
                  onChange={(m) => setMarks({ ...marks, [task.key]: m })}
                  tones={{ problem: "critical", not_done: "muted" }}
                  options={[
                    { value: "ok", label: t("ux.taskOk") },
                    { value: "problem", label: t("boreholes.m.problem") },
                    { value: "not_done", label: t("boreholes.m.not_done") },
                  ]}
                />
              )}
              {task.proof.kind === "photo" && (
                <PhotoStrip session={session} entity="boreholes.visit" scopeId={borehole.siteId} ids={taskPhotos[task.key] ?? []} onChange={(ids) => setTaskPhotos({ ...taskPhotos, [task.key]: ids })} hint={t("boreholes.m.photo_task")} />
              )}
              {r && r.pass === false && task.failOpensFault && <Notice tone="critical">{t("boreholes.m.out_of_range")}</Notice>}
              {r && r.pass === false && (
                <Field label={t("boreholes.m.note")} value={taskNotes[task.key] ?? ""} onChangeText={(v) => setTaskNotes({ ...taskNotes, [task.key]: v })} />
              )}
            </View>
          );
        })}
      </Section>

      {faults.length > 0 && (
        <Section title={t("boreholes.m.faults_will_open", { n: faults.length })} hint={t("boreholes.m.fault_severity")}>
          <Segmented<Severity> value={severity} onChange={setSeverity} options={(["no_water", "reduced", "minor"] as const).map((v) => ({ value: v, label: t(`boreholes.m.sev.${v}`) }))} />
        </Section>
      )}

      <Section title={t("ux.notesPhotos")}>
        <Field label={t("forestry.m.notes")} value={notes} onChangeText={setNotes} multiline />
        <PhotoStrip session={session} entity="boreholes.visit" scopeId={borehole.siteId} ids={photos} onChange={setPhotos} />
        <GpsLine fix={fix} />
      </Section>
      {error && <Notice tone="critical">{error}</Notice>}
    </Page>
  );
}

/** Whether the visit will carry a GPS position. */
export function GpsLine({ fix, note }: { fix: Fix | null; note?: string | null }) {
  const t = useT();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <StatusChip icon="pin" label={note ?? (fix ? t("forestry.m.gps_ok", { m: Math.round(fix.accuracyM ?? 0) }) : t("forestry.m.gps_none"))} tone={fix && !note ? "good" : "muted"} />
    </View>
  );
}

const s = StyleSheet.create({
  task: { gap: 10, borderWidth: 1, borderColor: "#E4E8E1", borderRadius: 12, padding: 12, backgroundColor: "#FAFBF9" },
  taskDue: { borderColor: colors.statusWarning, borderLeftWidth: 4 },
});
