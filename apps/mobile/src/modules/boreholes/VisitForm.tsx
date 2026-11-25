import { failedResults, visitSchema, type TaskResult } from "@eu/boreholes/mobile";
import { colors, streamAccent } from "@eu/core/tokens";
import { useContext, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useDraft, type RecoveredPhoto } from "../../drafts";
import { saveErrorKey } from "../../errors";
import { LocaleContext, useT } from "../../i18n";
import type { Session } from "../../session";
import { Anchor, Button, DateField, Field, Header, Notice, Page, Section, Segmented, StatusChip, Txt, useDialog, useFormScroll, useLeaveGuard, type Tone } from "../../ui";
import { GpsStatus } from "../gps";
import { localToday, useGps, type Fix } from "../location";
import type { BoreholeRow, Schedule } from "./data";
import { PhotoStrip } from "../photos";

type Mark = "ok" | "problem" | "not_done";
type Kind = "routine" | "repair" | "inspection" | "commissioning";
type Severity = "no_water" | "reduced" | "minor";

/** The schema's ceiling: a bucket filled faster than this is a typing or timing mistake. */
const MAX_LPM = 2000;

interface VisitDraft {
  visitedOn: string;
  kind: Kind;
  marks: Record<string, Mark>;
  readings: Record<string, string>;
  taskNotes: Record<string, string>;
  pumpDelivers: boolean | null;
  tankTaps: boolean | null;
  bucketSec: string;
  severity: Severity;
  notes: string;
  photos: string[];
  taskPhotos: Record<string, string[]>;
  fix: Fix | null;
}

type ErrKey = "date" | "pump" | "taps" | "bucket" | `task:${string}`;

/**
 * A technician's visit: the configured checklist (from the web template), the operational check
 * for indicator 1.1.1, and faults opened automatically for failed tasks. All saved offline, and
 * kept as a draft while being filled in.
 */
export function VisitForm({ session, borehole, schedule, onDone }: { session: Session; borehole: BoreholeRow; schedule: Schedule; onDone: (saved: boolean) => void }) {
  const t = useT();
  const { locale } = useContext(LocaleContext);
  const form = useFormScroll();
  const { ask, node: dialog } = useDialog();
  const tasks = schedule.tasks.filter((task) => borehole.due.some((d) => d.taskKey === task.key));
  const dueKeys = new Set(borehole.due.filter((d) => d.status !== "ok").map((d) => d.taskKey));
  const today = localToday();
  const [visitedOn, setVisitedOn] = useState(today);
  const [kind, setKind] = useState<Kind>("routine");
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({});
  // No default: "the pump delivers" feeds indicator 1.1.1, so it must be a deliberate answer.
  const [pumpDelivers, setPumpDelivers] = useState<boolean | null>(null);
  const [tankTaps, setTankTaps] = useState<boolean | null>(null);
  const [bucketSec, setBucketSec] = useState("");
  const [severity, setSeverity] = useState<Severity>("reduced");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [taskPhotos, setTaskPhotos] = useState<Record<string, string[]>>({});
  const gps = useGps();
  const [errors, setErrors] = useState<Partial<Record<ErrKey, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const snapshot: VisitDraft = { visitedOn, kind, marks, readings, taskNotes, pumpDelivers, tankTaps, bucketSec, severity, notes, photos, taskPhotos, fix: gps.fix };
  const dirty = visitedOn !== today || kind !== "routine" || Object.keys(marks).length > 0 || Object.values(readings).some(Boolean) || pumpDelivers !== null || tankTaps !== null
    || !!bucketSec || !!notes.trim() || photos.length > 0 || Object.values(taskPhotos).some((x) => x.length > 0);
  const draftKey = `visit:${borehole.siteId}`;
  const draft = useDraft<VisitDraft>(session, draftKey, snapshot, dirty, (d, recovered) => {
    if (d) {
      setVisitedOn(d.visitedOn); setKind(d.kind); setMarks(d.marks); setReadings(d.readings); setTaskNotes(d.taskNotes);
      setPumpDelivers(d.pumpDelivers); setTankTaps(d.tankTaps); setBucketSec(d.bucketSec); setSeverity(d.severity); setNotes(d.notes);
      if (d.fix) gps.setFix(d.fix);
    }
    attachRecovered(d?.photos ?? [], d?.taskPhotos ?? {}, recovered);
  });
  const attachRecovered = (base: string[], baseTasks: Record<string, string[]>, recovered: RecoveredPhoto[]) => {
    const tp = { ...baseTasks };
    const main = [...base];
    for (const r of recovered) {
      if (r.slot.startsWith("task:")) tp[r.slot.slice(5)] = [...(tp[r.slot.slice(5)] ?? []), r.fileId];
      else main.push(r.fileId);
    }
    setPhotos(main);
    setTaskPhotos(tp);
  };

  useEffect(() => {
    // Take a fix as the form opens, unless the draft already had one.
    if (draft.ready && !gps.fix) void gps.locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.ready]);

  const secRaw = bucketSec.replace(",", ".").trim();
  const sec = Number(secRaw);
  const lpm = secRaw && sec > 0 ? Math.round((20 / sec) * 60 * 10) / 10 : null;
  const bucketProblem = secRaw && (!Number.isFinite(sec) || sec <= 0) ? t("ux.bucketInvalid") : lpm !== null && lpm > MAX_LPM ? t("ux.flowUnreal", { lpm }) : null;

  const readingOf = (key: string): number | undefined | "bad" => {
    const task = tasks.find((x) => x.key === key)!;
    if (task.proof.kind !== "reading") return undefined;
    const raw = readings[key]?.replace(",", ".").trim();
    if (raw) return Number.isFinite(Number(raw)) ? Number(raw) : "bad";
    return task.proof.unit === "L/min" && lpm !== null && lpm <= MAX_LPM ? lpm : undefined;
  };
  const resultFor = (key: string): TaskResult | null => {
    const task = tasks.find((x) => x.key === key)!;
    const note = taskNotes[key]?.trim() || undefined;
    if (task.proof.kind === "reading") {
      const value = readingOf(key);
      if (value === undefined || value === "bad") return null;
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

  const validate = (): Partial<Record<ErrKey, string>> => {
    const e: Partial<Record<ErrKey, string>> = {};
    if (visitedOn > today) e.date = t("ux.dateFuture");
    if (pumpDelivers === null) e.pump = t("ux.answerRequired");
    if (bucketProblem) e.bucket = bucketProblem;
    if (tankTaps === null) e.taps = t("ux.answerRequired");
    for (const task of tasks) if (readingOf(task.key) === "bad") e[`task:${task.key}`] = t("ux.numberInvalid");
    return e;
  };

  const save = async () => {
    if (saving) return;
    const e = validate();
    setErrors(e);
    setError(null);
    const order: ErrKey[] = ["date", "pump", "bucket", "taps", ...tasks.map((x) => `task:${x.key}` as const)];
    const first = order.find((k) => e[k]);
    if (first) return form.scrollTo(first === "date" ? "visit" : first.startsWith("task:") ? "tasks" : "operational");
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
      gpsLat: gps.fix?.lat ?? null,
      gpsLng: gps.fix?.lng ?? null,
      gpsAccuracyM: gps.fix?.accuracyM ?? null,
    });
    if (!parsed.success) {
      console.warn("visit invalid", parsed.error.issues);
      return setError(t("boreholes.m.invalid"));
    }
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
      await draft.clear();
      await session.localSaved();
      void session.syncNow();
      onDone(true);
    } catch (err) {
      setError(t(saveErrorKey(err)));
      setSaving(false);
    }
  };

  const leave = () => void draft.clear().then(() => onDone(false));
  const back = useLeaveGuard(dirty, leave, ask);

  const yesNo = [
    { value: true, label: t("forestry.m.yes") },
    { value: false, label: t("forestry.m.no") },
  ];
  const dueTone = (st: string): Tone => (st === "overdue" ? "critical" : st === "due" ? "warning" : st === "due_soon" ? "info" : "muted");
  const answered = tasks.filter((x) => resultFor(x.key) !== null).length;
  const clear = (k: ErrKey) => errors[k] && setErrors({ ...errors, [k]: undefined });

  return (
    <Page
      form={form}
      header={<Header title={t("ux.maintenanceVisit")} subtitle={`${borehole.code} · ${borehole.village}`} onBack={back} backLabel={t("forestry.m.back")} accent={streamAccent.boreholes} />}
      footer={<Button icon="check" label={t("ux.saveVisit")} onPress={() => void save()} busy={saving} flex={1} />}
    >
      {draft.restoredAt && <Notice tone="info" title={t("ux.draftRestored")}>{t("ux.draftRestoredBody")}</Notice>}
      {error && <Notice tone="critical">{error}</Notice>}
      <Anchor form={form} name="visit">
        <Section title={t("ux.theVisit")}>
          <DateField label={t("boreholes.m.visit_date")} value={visitedOn} onChange={setVisitedOn} max={today} todayLabel={t("app.today")} yesterdayLabel={t("app.yesterday")} />
          {errors.date ? <Txt variant="small" tone="critical">{errors.date}</Txt> : null}
          <Segmented<Kind> columns={2} value={kind} onChange={setKind} options={(["routine", "repair", "inspection", "commissioning"] as const).map((k) => ({ value: k, label: t(`boreholes.m.kind.${k}`) }))} />
        </Section>
      </Anchor>

      <Anchor form={form} name="operational">
        <Section title={t("boreholes.m.operational")} hint={t("ux.operationalHint")}>
          <View style={[s.question, !!errors.pump && s.questionErr]}>
            <Txt variant="label">{t("boreholes.op.pump_delivers")}</Txt>
            <Segmented value={pumpDelivers} onChange={(v) => { setPumpDelivers(v); clear("pump"); }} options={yesNo} tones={{ false: "critical" }} />
            {errors.pump ? <Txt variant="small" tone="critical">{errors.pump}</Txt> : null}
          </View>
          <Field label={t("boreholes.m.bucket_seconds")} value={bucketSec} onChangeText={(v) => { setBucketSec(v); clear("bucket"); }} keyboardType="decimal-pad" suffix="s"
            error={errors.bucket ?? bucketProblem} hint={lpm === null ? t("boreholes.visit.flow_help") : undefined} />
          {lpm !== null && !bucketProblem && <Notice tone="good" icon="drop" title={t("boreholes.m.flow_result", { lpm })} />}
          <View style={[s.question, !!errors.taps && s.questionErr]}>
            <Txt variant="label">{t("boreholes.op.tank_taps")}</Txt>
            <Segmented value={tankTaps} onChange={(v) => { setTankTaps(v); clear("taps"); }} options={yesNo} tones={{ false: "critical" }} />
            {errors.taps ? <Txt variant="small" tone="critical">{errors.taps}</Txt> : null}
          </View>
        </Section>
      </Anchor>

      <Anchor form={form} name="tasks">
        <Section title={t("boreholes.m.tasks")} right={<StatusChip label={`${answered}/${tasks.length}`} tone={answered === tasks.length ? "good" : "muted"} />}>
          {tasks.map((task) => {
            const r = resultFor(task.key);
            const d = borehole.due.find((x) => x.taskKey === task.key);
            const err = errors[`task:${task.key}`];
            return (
              <View key={task.key} style={[s.task, dueKeys.has(task.key) && d?.status !== "each_visit" && s.taskDue]}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <Txt weight={700} style={{ flex: 1 }}>{task.label[locale]}</Txt>
                  {d && d.status !== "each_visit" ? <StatusChip label={t(`boreholes.due.${d.status}`)} tone={dueTone(d.status)} /> : null}
                </View>
                {task.proof.kind === "reading" ? (
                  <Field
                    label={t("boreholes.m.reading", { unit: task.proof.unit })}
                    value={readings[task.key] ?? (task.proof.unit === "L/min" && lpm !== null && !bucketProblem ? String(lpm) : "")}
                    onChangeText={(v) => { setReadings({ ...readings, [task.key]: v }); clear(`task:${task.key}`); }}
                    keyboardType="decimal-pad"
                    suffix={task.proof.unit}
                    error={err}
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
                  <PhotoStrip session={session} entity="boreholes.visit" scopeId={borehole.siteId} ids={taskPhotos[task.key] ?? []} onChange={(ids) => setTaskPhotos({ ...taskPhotos, [task.key]: ids })} hint={t("boreholes.m.photo_task")} draftKey={draftKey} slot={`task:${task.key}`} />
                )}
                {r && r.pass === false && task.failOpensFault && <Notice tone="critical">{t("boreholes.m.out_of_range")}</Notice>}
                {r && r.pass === false && (
                  <Field label={t("boreholes.m.note")} value={taskNotes[task.key] ?? ""} onChangeText={(v) => setTaskNotes({ ...taskNotes, [task.key]: v })} />
                )}
              </View>
            );
          })}
        </Section>
      </Anchor>

      {faults.length > 0 && (
        <Section title={t("boreholes.m.faults_will_open", { n: faults.length })} hint={t("boreholes.m.fault_severity")}>
          <Segmented<Severity> value={severity} onChange={setSeverity} options={(["no_water", "reduced", "minor"] as const).map((v) => ({ value: v, label: t(`boreholes.m.sev.${v}`) }))} />
        </Section>
      )}

      <Section title={t("ux.notesPhotos")}>
        <Field label={`${t("forestry.m.notes")} (${t("ux.optional")})`} value={notes} onChangeText={setNotes} multiline />
        <PhotoStrip session={session} entity="boreholes.visit" scopeId={borehole.siteId} ids={photos} onChange={setPhotos} draftKey={draftKey} />
        <GpsStatus fix={gps.fix} locating={gps.locating} problem={gps.problem} onRetry={() => void gps.locate()} />
      </Section>
      {dialog}
    </Page>
  );
}

const s = StyleSheet.create({
  question: { gap: 6 },
  questionErr: { borderLeftWidth: 3, borderLeftColor: colors.statusCritical, paddingLeft: 10 },
  task: { gap: 10, borderWidth: 1, borderColor: "#E4E8E1", borderRadius: 12, padding: 12, backgroundColor: "#FAFBF9" },
  taskDue: { borderColor: colors.statusWarning, borderLeftWidth: 4 },
});
