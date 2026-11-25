import { absenceReason, activeOn, planRegister, type Absence } from "@eu/schools/mobile";
import { colors } from "@eu/core/tokens";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useT } from "../../i18n";
import { Icon } from "../../icons";
import type { Session } from "../../session";
import { Button, Card, DateField, Header, ListGroup, Notice, Page, Segmented, Stat, StatusChip, Toast, Txt, ui } from "../../ui";
import { currentYear, live, studentName, today, type SchoolData } from "./data";
import { ACCENT, classLabel } from "./parts";

type Reason = Absence["reason"];
const REASONS = absenceReason.options;

/**
 * Typing up a paper register: pick a day and a class, tap the pupils who were absent.
 * Saving writes a register-taken marker, so "all present" differs from "not entered".
 */
export function Attendance({ session, data, onBack }: { session: Session; data: SchoolData; onBack: () => void }) {
  const t = useT();
  const [date, setDate] = useState(today());
  const year = currentYear(data, date);
  const classes = useMemo(
    () => live(data.classes).filter((c) => c.academicYearId === year?.id).sort((a, b) => a.level - b.level || a.section.localeCompare(b.section) || a.shift.localeCompare(b.shift)),
    [data.classes, year?.id],
  );
  const registers = live(data.registers);
  const takenFor = (cid: string) => registers.some((r) => r.classId === cid && r.date === date);
  // Open on the first class still missing a register for the day: usually the next one to type up.
  const [classId, setClassId] = useState<string | null>(null);
  useEffect(() => {
    if (!classId || !classes.some((c) => c.id === classId)) setClassId((classes.find((c) => !takenFor(c.id)) ?? classes[0])?.id ?? null);
  }, [classes, date]); // eslint-disable-line react-hooks/exhaustive-deps
  const cls = classes.find((c) => c.id === classId) ?? null;

  const existing = useMemo(
    () => live(data.absences).filter((a) => a.classId === classId && a.date === date),
    [data.absences, classId, date],
  );
  const taken = !!classId && takenFor(classId);
  const [absent, setAbsent] = useState<Map<string, Reason>>(new Map());
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Start from what is already recorded for this class and day.
  useEffect(() => {
    setAbsent(new Map(existing.map((a) => [a.studentId, a.reason])));
    setDirty(false);
  }, [classId, date, existing.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const students = new Map(data.students.map((s) => [s.id, s]));
  const roster = activeOn(data.enrolments, date)
    .filter((e) => e.classId === classId)
    .map((e) => students.get(e.studentId))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => studentName(a).localeCompare(studentName(b)));

  const toggle = (id: string) => {
    const next = new Map(absent);
    if (next.has(id)) next.delete(id);
    else next.set(id, "unknown");
    setAbsent(next);
    setDirty(true);
  };
  const cycleReason = (id: string) => {
    const r = absent.get(id) ?? "unknown";
    const next = new Map(absent);
    next.set(id, REASONS[(REASONS.indexOf(r) + 1) % REASONS.length] ?? "unknown");
    setAbsent(next);
    setDirty(true);
  };

  const save = async () => {
    if (!cls) return;
    setBusy(true);
    const c = session.client;
    const site = data.school.siteId;
    for (const o of planRegister(cls.id, date, data.absences, data.registers, absent)) {
      if (o.op === "create_register") await c.create("school.register", site, { classId: cls.id, date });
      else if (o.op === "create_absence") await c.create("school.absence", site, { studentId: o.studentId, classId: cls.id, date, reason: o.reason });
      else if (o.op === "update_reason") await c.update("school.absence", o.absenceId, { reason: o.reason });
      else await c.void("school.absence", o.absenceId, "marked present");
    }
    await session.refreshCounts();
    void session.syncNow();
    setBusy(false);
    setDirty(false);
    setToast(t("app.savedOnPhone"));
  };

  const shifts = new Set(classes.map((c) => c.shift)).size;
  const header = <Header title={t("schools.attendance.title")} subtitle={data.school.code} onBack={onBack} backLabel={t("schools.mobile.back")} accent={ACCENT} />;
  if (!year)
    return (
      <Page header={header}>
        <Notice tone="warning">{t("schools.mobile.needYear")}</Notice>
      </Page>
    );

  return (
    <Page
      header={header}
      toast={<Toast message={toast} onHide={() => setToast(null)} />}
      footer={cls && <Button icon="check" kind={taken && !dirty ? "secondary" : "primary"} label={taken && !dirty ? t("ux.registerSaved") : t("schools.attendance.saveRegister")} onPress={() => void save()} disabled={busy || roster.length === 0} flex={1} />}
    >
      <DateField value={date} onChange={setDate} max={today()} todayLabel={t("app.today")} yesterdayLabel={t("app.yesterday")} />
      {classes.length === 0 ? (
        <Notice tone="warning">{t("schools.mobile.noClasses")}</Notice>
      ) : (
        <View style={{ gap: 6 }}>
          <Txt variant="label">{t("schools.student.enrolledIn")}</Txt>
          <Segmented
            columns={Math.min(classes.length, shifts > 1 ? 2 : 3)}
            value={classId}
            onChange={(v) => setClassId(v)}
            options={classes.map((c) => ({ value: c.id, label: `${classLabel(c, shifts, t)}${takenFor(c.id) ? " ✓" : ""}` }))}
          />
        </View>
      )}
      {cls && (
        <>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Stat value={roster.length - absent.size} label={t("schools.attendance.present")} tone="good" />
              <Stat value={absent.size} label={t("schools.attendance.absent")} tone={absent.size ? "critical" : undefined} />
              {taken ? <StatusChip label={t("schools.attendance.taken")} tone="good" icon="check" /> : <StatusChip label={t("schools.attendance.notTaken")} tone="warning" />}
            </View>
          </Card>
          <Txt variant="small" tone="muted">{t("schools.mobile.tapAbsent")}</Txt>
          <ListGroup>
            {roster.map((s) => {
              const out = absent.has(s.id);
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: !out }}
                  accessibilityLabel={`${studentName(s)}, ${out ? t("schools.attendance.absent") : t("schools.attendance.present")}`}
                  onPress={() => toggle(s.id)}
                  android_ripple={{ color: colors.border }}
                  style={[st.row, out && { backgroundColor: ui.dangerTint }]}
                >
                  <View style={[st.mark, out ? st.markOut : st.markIn]}>
                    <Icon name={out ? "x" : "check"} size={20} color={colors.surface} strokeWidth={2.8} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt weight={600} lines={1} color={out ? colors.statusCritical : colors.text}>{studentName(s)}</Txt>
                    <Txt variant="small" tone="muted">{s.studentNumber}</Txt>
                  </View>
                  {out && (
                    <Pressable accessibilityRole="button" accessibilityLabel={t("ux.changeReason")} onPress={() => cycleReason(s.id)} style={st.reason} hitSlop={4}>
                      <Txt variant="label" color={colors.statusCritical}>{t(`schools.attendance.reasons.${absent.get(s.id)}`)}</Txt>
                      <Icon name="sync" size={14} color={colors.statusCritical} />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </ListGroup>
        </>
      )}
    </Page>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 8 },
  mark: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  markIn: { backgroundColor: colors.statusGood },
  markOut: { backgroundColor: colors.statusCritical },
  reason: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: colors.statusCritical, backgroundColor: colors.surface },
});
