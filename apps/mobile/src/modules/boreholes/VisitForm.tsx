import { failedResults, visitSchema, type TaskResult } from "@eu/boreholes/mobile";
import { colors, radius, space, touch } from "@eu/core/tokens";
import { useContext, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LocaleContext, useT } from "../../i18n";
import type { Session } from "../../session";
import { Body, Button, Field, Title } from "../../ui";
import { getFix, localToday, type Fix } from "../location";
import type { BoreholeRow, Schedule } from "./data";

type Mark = "ok" | "problem" | "not_done";
type Kind = "routine" | "repair" | "inspection" | "commissioning";
type Severity = "no_water" | "reduced" | "minor";

function Choice<T extends string | boolean>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={s.pills}>
      {options.map((o) => (
        <Pressable key={String(o.v)} accessibilityRole="button" onPress={() => onChange(o.v)} style={[s.pill, value === o.v && s.pillOn]}>
          <Text style={[s.pillText, value === o.v && s.pillTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

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
    return { taskKey: key, done: true, pass: m === "ok", note };
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
      photos: [],
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
    { v: true, label: t("forestry.m.yes") },
    { v: false, label: t("forestry.m.no") },
  ];

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Title>{t("boreholes.visit.new")}</Title>
      <Body tone="muted">
        {borehole.code} · {borehole.village}
      </Body>
      <Field label={t("boreholes.m.visit_date")} value={visitedOn} onChangeText={setVisitedOn} placeholder={t("forestry.m.date_hint")} keyboardType="numbers-and-punctuation" />
      <Choice<Kind> value={kind} onChange={setKind} options={(["routine", "repair", "inspection", "commissioning"] as const).map((k) => ({ v: k, label: t(`boreholes.m.kind.${k}`) }))} />

      <Text style={s.h}>{t("boreholes.m.operational")}</Text>
      <Text style={s.label}>{t("boreholes.op.pump_delivers")}</Text>
      <Choice value={pumpDelivers} onChange={setPumpDelivers} options={yesNo} />
      <Field label={t("boreholes.m.bucket_seconds")} value={bucketSec} onChangeText={setBucketSec} keyboardType="decimal-pad" />
      <Body tone="muted">{lpm !== null ? t("boreholes.m.flow_result", { lpm }) : t("boreholes.visit.flow_help")}</Body>
      <Text style={s.label}>{t("boreholes.op.tank_taps")}</Text>
      <Choice value={tankTaps} onChange={setTankTaps} options={yesNo} />

      <Text style={s.h}>{t("boreholes.m.tasks")}</Text>
      {tasks.map((task) => {
        const r = resultFor(task.key);
        return (
          <View key={task.key} style={[s.task, dueKeys.has(task.key) && s.taskDue]}>
            <Text style={s.taskTitle}>{task.label[locale]}</Text>
            {(() => {
              const d = borehole.due.find((x) => x.taskKey === task.key);
              return d ? <Text style={s.label}>{t(`boreholes.due.${d.status}`)}{d.dueOn ? ` · ${d.dueOn}` : ""}</Text> : null;
            })()}
            {task.proof.kind === "reading" ? (
              <Field
                label={t("boreholes.m.reading", { unit: task.proof.unit })}
                value={readings[task.key] ?? (task.proof.unit === "L/min" && lpm !== null ? String(lpm) : "")}
                onChangeText={(v) => setReadings({ ...readings, [task.key]: v })}
                keyboardType="decimal-pad"
              />
            ) : (
              <Choice<Mark>
                value={marks[task.key] ?? ("" as Mark)}
                onChange={(m) => setMarks({ ...marks, [task.key]: m })}
                options={[
                  { v: "ok", label: t("boreholes.m.done_ok") },
                  { v: "problem", label: t("boreholes.m.problem") },
                  { v: "not_done", label: t("boreholes.m.not_done") },
                ]}
              />
            )}
            {task.proof.kind === "photo" && <Body tone="muted">{t("boreholes.m.photo_task")}</Body>}
            {r && r.pass === false && task.failOpensFault && <Body tone="critical">{t("boreholes.m.out_of_range")}</Body>}
            {r && r.pass === false && (
              <Field label={t("boreholes.m.note")} value={taskNotes[task.key] ?? ""} onChangeText={(v) => setTaskNotes({ ...taskNotes, [task.key]: v })} />
            )}
          </View>
        );
      })}

      {faults.length > 0 && (
        <>
          <Body tone="warning">{t("boreholes.m.faults_will_open", { n: faults.length })}</Body>
          <Text style={s.label}>{t("boreholes.m.fault_severity")}</Text>
          <Choice<Severity> value={severity} onChange={setSeverity} options={(["no_water", "reduced", "minor"] as const).map((v) => ({ v, label: t(`boreholes.m.sev.${v}`) }))} />
        </>
      )}

      <Field label={t("forestry.m.notes")} value={notes} onChangeText={setNotes} multiline />
      <Body tone={fix ? "good" : "muted"}>{fix ? t("forestry.m.gps_ok", { m: Math.round(fix.accuracyM ?? 0) }) : t("forestry.m.gps_none")}</Body>
      {error && <Body tone="critical">{error}</Body>}
      <Button label={t("forestry.m.save")} onPress={() => void save()} disabled={saving} />
      <Button kind="secondary" label={t("forestry.m.back")} onPress={() => onDone(false)} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space.md, paddingTop: space.xl, gap: space.sm, backgroundColor: colors.surface },
  h: { fontSize: 18, fontWeight: "700", color: colors.gcGreen, marginTop: space.sm },
  label: { fontSize: 14, color: colors.textMuted },
  task: { gap: space.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.sm },
  taskDue: { borderColor: colors.statusWarning, borderWidth: 2 },
  taskTitle: { fontSize: touch.bodyText, fontWeight: "600", color: colors.text },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  pill: { minHeight: touch.minTarget, justifyContent: "center", paddingHorizontal: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gcGreen },
  pillOn: { backgroundColor: colors.gcGreen },
  pillText: { fontSize: touch.bodyText, color: colors.gcGreen },
  pillTextOn: { color: colors.surface },
});
