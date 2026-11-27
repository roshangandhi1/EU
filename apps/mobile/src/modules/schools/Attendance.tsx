import { absenceReason, activeOn, planRegister, type Absence, type Student } from "@eu/schools/mobile";
import { colors, space } from "@eu/core/tokens";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { saveErrorKey } from "../../errors";
import { useT } from "../../i18n";
import { Icon } from "../../icons";
import type { Session } from "../../session";
import { Button, Card, DateField, groupItemStyle, Header, Notice, Page, Segmented, Stat, StatusChip, Toast, Txt, ui, useDialog, useLeaveGuard } from "../../ui";
import { currentYear, live, studentName, today, type Local, type SchoolData } from "./data";
import { ACCENT, classLabel, longLabels, schoolLevels, schoolName } from "./parts";

type Reason = Absence["reason"];
const REASONS = absenceReason.options;

/**
 * Typing up a paper register: pick a day and a class, tap the pupils who were absent.
 * Saving writes a register-taken marker, so "all present" differs from "not entered".
 */
export function Attendance({ session, data, onBack }: { session: Session; data: SchoolData; onBack: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { ask, node: dialog } = useDialog();
  const [date, setDateRaw] = useState(today());
  const year = currentYear(data, date);
  const classes = useMemo(
    () => live(data.classes).filter((c) => c.academicYearId === year?.id).sort((a, b) => a.level - b.level || a.section.localeCompare(b.section) || a.shift.localeCompare(b.shift)),
    [data.classes, year?.id],
  );
  const registers = useMemo(() => live(data.registers), [data.registers]);
  const takenFor = (cid: string) => registers.some((r) => r.classId === cid && r.date === date);
  // Open on the first class still missing a register for the day: usually the next one to type up.
  const [classId, setClassIdRaw] = useState<string | null>(null);
  useEffect(() => {
    if (!classId || !classes.some((c) => c.id === classId)) setClassIdRaw((classes.find((c) => !takenFor(c.id)) ?? classes[0])?.id ?? null);
  }, [classes, date]); // eslint-disable-line react-hooks/exhaustive-deps
  const cls = classes.find((c) => c.id === classId) ?? null;
  const shifts = new Set(classes.map((c) => c.shift)).size;
  const LV = schoolLevels(data.school);

  const existing = useMemo(() => live(data.absences).filter((a) => a.classId === classId && a.date === date), [data.absences, classId, date]);
  const taken = !!classId && takenFor(classId);
  const [absent, setAbsent] = useState<Map<string, Reason>>(new Map());
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "good" | "critical" } | null>(null);
  const [busy, setBusy] = useState(false);

  // Start from what is already recorded for this class and day. A sync that brings new absences
  // refreshes the list only while nothing has been tapped: taps in progress are never thrown away.
  const shownFor = useRef<string>("");
  useEffect(() => {
    const k = `${classId}|${date}`;
    if (shownFor.current !== k || !dirty) {
      shownFor.current = k;
      setAbsent(new Map(existing.map((a) => [a.studentId, a.reason])));
      setDirty(false);
    }
  }, [classId, date, existing]); // eslint-disable-line react-hooks/exhaustive-deps

  const roster = useMemo(() => {
    const students = new Map(data.students.map((s) => [s.id, s]));
    return activeOn(data.enrolments, date, data.years)
      .filter((e) => e.classId === classId)
      .map((e) => students.get(e.studentId))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .sort((a, b) => studentName(a).localeCompare(studentName(b)));
  }, [data.students, data.enrolments, date, classId]);

  const toggle = useCallback((id: string) => {
    setAbsent((cur) => {
      const next = new Map(cur);
      if (next.has(id)) next.delete(id);
      else next.set(id, "unknown");
      return next;
    });
    setDirty(true);
  }, []);
  const pickReason = useCallback(
    (id: string, name: string, current: Reason) => {
      void ask<Reason>({
        title: t("ux.reasonFor", { name }),
        actions: REASONS.map((r) => ({ label: `${r === current ? "✓ " : ""}${t(`schools.attendance.reasons.${r}`)}`, value: r, kind: r === current ? "primary" : "secondary" })),
      }).then((r) => {
        if (!r) return;
        setAbsent((cur) => new Map(cur).set(id, r));
        setDirty(true);
      });
    },
    [ask, t],
  );

  const save = async (): Promise<boolean> => {
    if (!cls || busy) return false;
    setBusy(true);
    const c = session.client;
    const site = data.school.siteId;
    try {
      // Absences first, the "register taken" marker last: if the phone dies half-way, the class
      // shows as not taken (and is typed again) rather than "taken, everyone present".
      const ops = planRegister(cls.id, date, data.absences, data.registers, absent);
      const ordered = [...ops.filter((o) => o.op !== "create_register"), ...ops.filter((o) => o.op === "create_register")];
      for (const o of ordered) {
        if (o.op === "create_register") await c.create("school.register", site, { classId: cls.id, date });
        else if (o.op === "create_absence") await c.create("school.absence", site, { studentId: o.studentId, classId: cls.id, date, reason: o.reason });
        else if (o.op === "update_reason") await c.update("school.absence", o.absenceId, { reason: o.reason });
        else await c.void("school.absence", o.absenceId, "marked present");
      }
      setDirty(false);
      await session.localSaved();
      void session.syncNow();
      setToast({ msg: t("app.savedOnPhone"), tone: "good" });
      return true;
    } catch (e) {
      setToast({ msg: t(saveErrorKey(e)), tone: "critical" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Changing day or class with unsaved taps: save them, drop them, or stay. */
  const guardChange = async (apply: () => void) => {
    if (!dirty) return apply();
    const v = await ask<"save" | "discard" | "stay">({
      title: t("ux.saveBeforeChange", { cls: cls ? classLabel(cls, shifts, t, LV) : "" }),
      message: t("ux.saveBeforeChangeBody", { n: absent.size }),
      actions: [
        { label: t("schools.attendance.saveRegister"), value: "save", kind: "primary" },
        { label: t("ux.discardTaps"), value: "discard", kind: "danger" },
        { label: t("ux.keepEditing"), value: "stay", kind: "ghost" },
      ],
    });
    if (v === "save") {
      if (await save()) apply();
    } else if (v === "discard") {
      setDirty(false);
      apply();
    }
  };
  const setDate = (d: string) => d !== date && void guardChange(() => setDateRaw(d));
  const setClassId = (id: string) => id !== classId && void guardChange(() => setClassIdRaw(id));

  const back = useLeaveGuard(dirty, onBack, ask);
  const header = <Header title={t("schools.attendance.title")} subtitle={schoolName(data.school)} onBack={back} backLabel={t("schools.mobile.back")} accent={ACCENT} />;
  if (!year)
    return (
      <Page header={header}>
        <Notice tone="warning">{t("schools.mobile.needYear")}</Notice>
      </Page>
    );

  const top = (
    <View style={s.top}>
      <DateField value={date} onChange={setDate} max={today()} todayLabel={t("app.today")} yesterdayLabel={t("app.yesterday")} />
      {classes.length === 0 ? (
        <Notice tone="warning">{t("schools.mobile.noClasses")}</Notice>
      ) : (
        <View style={{ gap: 6 }}>
          <Txt variant="label">{t("schools.student.enrolledIn")}</Txt>
          <Segmented
            columns={Math.min(classes.length, shifts > 1 || longLabels(classes.map((c) => classLabel(c, shifts, t, LV))) ? 2 : 3)}
            value={classId}
            onChange={setClassId}
            options={classes.map((c) => ({ value: c.id, label: `${classLabel(c, shifts, t, LV)}${takenFor(c.id) ? " ✓" : ""}` }))}
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
          <Txt variant="small" tone="muted">{roster.length ? t("schools.mobile.tapAbsent") : t("ux.noPupilsInClass")}</Txt>
        </>
      )}
    </View>
  );

  return (
    <Page
      bare
      header={header}
      toast={<Toast message={toast?.msg ?? null} tone={toast?.tone} onHide={() => setToast(null)} />}
      footer={cls && <Button icon="check" kind={taken && !dirty ? "secondary" : "primary"} label={taken && !dirty ? t("ux.registerSaved") : t("schools.attendance.saveRegister")} onPress={() => void save()} disabled={roster.length === 0} busy={busy} flex={1} />}
    >
      <FlatList
        data={cls ? roster : []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={top}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: space.lg + (cls ? 0 : insets.bottom) }}
        renderItem={({ item, index }) => (
          <PupilRow pupil={item} reason={absent.get(item.id) ?? null} index={index} count={roster.length} onToggle={toggle} onReason={pickReason} />
        )}
      />
      {dialog}
    </Page>
  );
}

/** One pupil: tap the name to mark absent or present; the reason is its own 48 dp button beside it. */
const PupilRow = memo(function PupilRow({ pupil, reason, index, count, onToggle, onReason }: {
  pupil: Local<Student>; reason: Reason | null; index: number; count: number; onToggle: (id: string) => void; onReason: (id: string, name: string, r: Reason) => void;
}) {
  const t = useT();
  const out = reason !== null;
  const name = studentName(pupil);
  return (
    <View style={[groupItemStyle(index, count), s.row, out && { backgroundColor: ui.dangerTint }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !out }}
        accessibilityLabel={`${name}, ${out ? t("schools.attendance.absent") : t("schools.attendance.present")}`}
        onPress={() => onToggle(pupil.id)}
        android_ripple={{ color: colors.border }}
        style={s.toggle}
      >
        <View style={[s.mark, out ? s.markOut : s.markIn]}>
          <Icon name={out ? "x" : "check"} size={20} color={colors.surface} strokeWidth={2.8} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt weight={600} lines={1} color={out ? colors.statusCritical : colors.text}>{name}</Txt>
          <Txt variant="small" tone="muted">{pupil.studentNumber}</Txt>
        </View>
      </Pressable>
      {out && (
        <Pressable accessibilityRole="button" accessibilityLabel={`${t("ux.changeReason")}: ${t(`schools.attendance.reasons.${reason}`)}`} onPress={() => onReason(pupil.id, name, reason)} android_ripple={{ color: colors.border }} style={s.reason}>
          <Txt variant="label" color={colors.statusCritical} lines={1}>{t(`schools.attendance.reasons.${reason}`)}</Txt>
          <Icon name="chevronDown" size={16} color={colors.statusCritical} />
        </Pressable>
      )}
    </View>
  );
});

const s = StyleSheet.create({
  top: { padding: space.md, gap: space.md },
  row: { flexDirection: "row", alignItems: "center", minHeight: 64, paddingRight: 10 },
  toggle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingLeft: 16, paddingRight: 8, paddingVertical: 8 },
  mark: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  markIn: { backgroundColor: colors.statusGood },
  markOut: { backgroundColor: colors.statusCritical },
  reason: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 48, maxWidth: 150, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.statusCritical, backgroundColor: colors.surface },
});
