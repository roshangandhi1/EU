import { absenceReason, activeOn, type Absence } from "@eu/schools/rules";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useT } from "../../i18n";
import type { Session } from "../../session";
import { Body, Button, Title } from "../../ui";
import { addDays, currentYear, live, studentName, today, type SchoolData } from "./data";
import { Choice, Row, Scroll } from "./parts";

type Reason = Absence["reason"];
const REASONS = absenceReason.options;

/**
 * Typing up a paper register: pick a class and a day, tap the pupils who were absent.
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
  const [classId, setClassId] = useState<string | null>(null);
  const cls = classes.find((c) => c.id === classId) ?? null;

  const existing = useMemo(
    () => live(data.absences).filter((a) => a.classId === classId && a.date === date),
    [data.absences, classId, date],
  );
  const taken = live(data.registers).some((r) => r.classId === classId && r.date === date);
  const [absent, setAbsent] = useState<Map<string, Reason>>(new Map());
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Start from what is already recorded for this class and day.
  useEffect(() => {
    setAbsent(new Map(existing.map((a) => [a.studentId, a.reason])));
    setSaved(false);
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
    setSaved(false);
  };
  const cycleReason = (id: string) => {
    const r = absent.get(id) ?? "unknown";
    const next = new Map(absent);
    next.set(id, REASONS[(REASONS.indexOf(r) + 1) % REASONS.length] ?? "unknown");
    setAbsent(next);
    setSaved(false);
  };

  const save = async () => {
    if (!cls) return;
    setBusy(true);
    const c = session.client;
    const site = data.school.siteId;
    if (!taken) await c.create("school.register", site, { classId: cls.id, date });
    for (const [studentId, reason] of absent) {
      const prior = existing.find((a) => a.studentId === studentId);
      if (!prior) await c.create("school.absence", site, { studentId, classId: cls.id, date, reason });
      else if (prior.reason !== reason) await c.update("school.absence", prior.id, { reason });
    }
    for (const a of existing) if (!absent.has(a.studentId)) await c.void("school.absence", a.id, "marked present");
    await session.refreshCounts();
    void session.syncNow();
    setBusy(false);
    setSaved(true);
  };

  if (!year) return <><Title>{t("schools.attendance.title")}</Title><Body tone="warning">{t("schools.mobile.needYear")}</Body><Button kind="secondary" label={t("schools.mobile.back")} onPress={onBack} /></>;

  return (
    <Scroll>
      <Title>{t("schools.attendance.title")}</Title>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <View style={{ flex: 1 }}><Button kind="secondary" label="‹" onPress={() => setDate(addDays(date, -1))} /></View>
        <View style={{ flex: 3 }}><Body>{date}</Body></View>
        <View style={{ flex: 1 }}><Button kind="secondary" label="›" onPress={() => setDate(addDays(date, 1))} disabled={date >= today()} /></View>
      </View>
      {classes.length === 0 ? <Body tone="warning">{t("schools.mobile.noClasses")}</Body> : (
        <Choice
          value={classId ?? ""}
          onChange={(v) => setClassId(v)}
          options={classes.map((c) => ({ value: c.id, label: `${c.level}${c.section} · ${t(`schools.shift.${c.shift}`)}` }))}
        />
      )}
      {cls && (
        <>
          <Body tone={taken ? "good" : "muted"}>{taken ? t("schools.attendance.taken") : t("schools.attendance.notTaken")}</Body>
          <Body tone="muted">{t("schools.mobile.tapAbsent")}</Body>
          {roster.map((s) => (
            <Row key={s.id} title={studentName(s)} detail={s.studentNumber} selected={absent.has(s.id)} onPress={() => toggle(s.id)}
              right={absent.has(s.id) ? t(`schools.attendance.reasons.${absent.get(s.id)}`) : undefined} onRightPress={() => cycleReason(s.id)} />
          ))}
          <Body>{t("schools.attendance.present")}: {roster.length - absent.size} · {t("schools.attendance.absent")}: {absent.size}</Body>
          {saved && <Body tone="good">{t("schools.mobile.savedOffline")}</Body>}
          <Button label={t("schools.attendance.saveRegister")} onPress={() => void save()} disabled={busy || roster.length === 0} />
        </>
      )}
      <Button kind="secondary" label={t("schools.mobile.back")} onPress={onBack} />
    </Scroll>
  );
}
