import { activeOn, findLikelyDuplicates, nextStudentNumber, normaliseName, tagForDevice, type Sex } from "@eu/schools/mobile";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { deviceId } from "../../secure";
import { useT } from "../../i18n";
import type { Session } from "../../session";
import { Avatar, Button, CheckRow, Chips, Field, Header, ListGroup, ListRow, Notice, Page, Section, Segmented, StatusChip, Toast, Txt } from "../../ui";
import { currentYear, live, studentName, today, type SchoolData } from "./data";
import { ACCENT, classLabel, maskDate } from "./parts";

/** Pupils enrolled this year, with search and a class filter, and enrolment of a new pupil. */
export function Students({ session, data, onBack }: { session: Session; data: SchoolData; onBack: () => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const date = today();
  const classes = new Map(data.classes.map((c) => [c.id, c]));
  const enrolled = activeOn(data.enrolments, date);
  const byStudent = new Map(enrolled.map((e) => [e.studentId, e]));
  const year = currentYear(data, date);
  const yearClasses = live(data.classes).filter((c) => c.academicYearId === year?.id).sort((a, b) => a.level - b.level || a.section.localeCompare(b.section));
  const shifts = new Set(yearClasses.map((c) => c.shift)).size;
  const rows = useMemo(() => {
    const n = normaliseName(q);
    return data.students
      .filter((s) => !s.voidedAt && byStudent.has(s.id))
      .filter((s) => filter === "all" || byStudent.get(s.id)?.classId === filter)
      .filter((s) => !n || normaliseName(studentName(s)).includes(n) || s.studentNumber.toLowerCase().includes(q.trim().toLowerCase()))
      .sort((a, b) => studentName(a).localeCompare(studentName(b)));
  }, [data.students, q, filter, enrolled.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (adding) return <Enrol session={session} data={data} onDone={(saved) => { setAdding(false); if (saved) setToast(t("app.savedOnPhone")); }} />;

  return (
    <Page
      header={<Header title={t("ux.pupils")} subtitle={`${data.school.code} · ${t("ux.enrolledCount", { count: enrolled.length })}`} onBack={onBack} backLabel={t("schools.mobile.back")} accent={ACCENT} />}
      footer={<Button icon="plus" label={t("schools.mobile.newStudent")} onPress={() => setAdding(true)} flex={1} />}
      toast={<Toast message={toast} onHide={() => setToast(null)} />}
    >
      <Field label={t("schools.student.search")} icon="search" value={q} onChangeText={setQ} autoCorrect={false} returnKeyType="search" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -16 }}>
        <View style={{ width: 8 }} />
        <Chips
          options={[{ value: "all", label: t("ux.allClasses") }, ...yearClasses.map((c) => ({ value: c.id, label: classLabel(c, shifts, t) }))]}
          selected={[filter]}
          onToggle={setFilter}
        />
        <View style={{ width: 8 }} />
      </ScrollView>
      {rows.length === 0 ? (
        <Notice tone="muted" icon="search">{t("ux.noMatch")}</Notice>
      ) : (
        <ListGroup>
          {rows.slice(0, 200).map((s) => {
            const c = classes.get(byStudent.get(s.id)?.classId ?? "");
            return (
              <ListRow
                key={s.id}
                title={studentName(s)}
                detail={`${s.studentNumber}${c ? ` · ${classLabel(c, shifts, t)}` : ""}`}
                leading={<Avatar name={studentName(s)} />}
                trailing={s.pending ? <StatusChip label={t("ux.notSynced")} tone="warning" /> : undefined}
              />
            );
          })}
        </ListGroup>
      )}
    </Page>
  );
}

function Enrol({ session, data, onDone }: { session: Session; data: SchoolData; onDone: (saved: boolean) => void }) {
  const t = useT();
  const date = today();
  const year = currentYear(data, date);
  const classes = live(data.classes).filter((c) => c.academicYearId === year?.id).sort((a, b) => a.level - b.level || a.section.localeCompare(b.section));
  const shifts = new Set(classes.map((c) => c.shift)).size;
  const [f, setF] = useState({ firstName: "", lastName: "", postName: "", dateOfBirth: "", birthYear: "", guardianName: "", guardianPhone: "", village: "" });
  const [sex, setSex] = useState<Sex | "">("");
  const [classId, setClassId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [myDevice, setMyDevice] = useState<string | null>(null);
  useEffect(() => void deviceId().then(setMyDevice), []);
  const tag = myDevice ? tagForDevice(data.deviceTags, myDevice) : null;
  const set = (k: keyof typeof f) => (v: string) => { setF({ ...f, [k]: v }); setConfirmed(false); setError(null); };

  const dob = maskDate(f.dateOfBirth).iso;
  const by = /^\d{4}$/.test(f.birthYear) ? Number(f.birthYear) : null;
  const candidate = sex ? { id: "", firstName: f.firstName, lastName: f.lastName, postName: f.postName, sex, dateOfBirth: dob, birthYearEstimate: dob ? null : by, guardianPhone: f.guardianPhone } : null;
  const matches = candidate && f.firstName && f.lastName ? findLikelyDuplicates(candidate, live(data.students)) : [];
  const names = new Map(data.students.map((s) => [s.id, s]));
  const ready = !!(f.lastName.trim() && f.firstName.trim() && sex && (dob || by) && classId);

  const save = async () => {
    if (!year || !candidate || !classId || !f.firstName.trim() || !f.lastName.trim() || (!dob && !by)) return setError(t("ux.fillRequired"));
    if (matches.length && !confirmed) return setError(null);
    if (!tag) return;
    setBusy(true);
    const studentNumber = nextStudentNumber(data.school.code, Number(year.startsOn.slice(0, 4)), tag, data.students.map((s) => s.studentNumber));
    const site = data.school.siteId;
    const studentId = await session.client.create("school.student", site, {
      studentNumber, firstName: f.firstName.trim(), lastName: f.lastName.trim(), postName: f.postName.trim(), sex,
      dateOfBirth: dob, birthYearEstimate: dob ? null : by, guardianName: f.guardianName.trim(), guardianPhone: f.guardianPhone.trim(), village: f.village.trim(),
    });
    await session.client.create("school.enrolment", site, { studentId, classId, academicYearId: year.id, enrolledOn: date, leftOn: null, status: "active" });
    await session.refreshCounts();
    void session.syncNow();
    setBusy(false);
    onDone(true);
  };

  const header = <Header title={t("schools.student.add")} subtitle={data.school.code} onBack={() => onDone(false)} backLabel={t("schools.mobile.back")} accent={ACCENT} />;
  if (!year) return <Page header={header}><Notice tone="warning">{t("schools.mobile.needYear")}</Notice></Page>;

  return (
    <Page
      header={header}
      footer={<Button icon="check" label={t("ux.enrolPupil")} onPress={() => void save()} disabled={busy || !tag || !ready || (matches.length > 0 && !confirmed)} flex={1} />}
    >
      {myDevice && !tag && <Notice tone="critical">{t("schools.mobile.noTag")}</Notice>}
      <Section title={t("ux.pupil")}>
        <Field label={t("schools.student.lastName")} value={f.lastName} onChangeText={set("lastName")} autoCapitalize="characters" />
        <Field label={`${t("schools.student.postName")} (${t("ux.optional")})`} value={f.postName} onChangeText={set("postName")} autoCapitalize="characters" />
        <Field label={t("schools.student.firstName")} value={f.firstName} onChangeText={set("firstName")} autoCapitalize="words" />
        <View style={{ gap: 6 }}>
          <Txt variant="label">{t("schools.student.sex")}</Txt>
          <Segmented<Sex | ""> value={sex} onChange={(v) => { setSex(v); setConfirmed(false); }} options={[{ value: "F", label: t("schools.student.female") }, { value: "M", label: t("schools.student.male") }]} />
        </View>
      </Section>
      <Section title={t("ux.age")} hint={t("schools.student.birthHint")}>
        <Field label={t("schools.student.dateOfBirth")} value={maskDate(f.dateOfBirth).text} onChangeText={(v) => set("dateOfBirth")(v.replace(/\D/g, ""))} keyboardType="number-pad" placeholder={t("ux.datePattern")} maxLength={10}
          error={f.dateOfBirth.length === 8 && !dob ? t("ux.badDate") : null} />
        {!dob && <Field label={t("schools.student.birthYearEstimate")} value={f.birthYear} onChangeText={(v) => set("birthYear")(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={4} placeholder={String(Number(date.slice(0, 4)) - 7)} />}
      </Section>
      <Section title={t("schools.student.enrolledIn")}>
        <Segmented columns={shifts > 1 ? 2 : 3} value={classId} onChange={setClassId} options={classes.map((c) => ({ value: c.id, label: classLabel(c, shifts, t) }))} />
      </Section>
      <Section title={t("ux.family")} hint={t("ux.optional")}>
        <Field label={t("schools.student.guardianName")} value={f.guardianName} onChangeText={set("guardianName")} autoCapitalize="words" />
        <Field label={t("schools.student.guardianPhone")} value={f.guardianPhone} onChangeText={set("guardianPhone")} keyboardType="phone-pad" />
        <Field label={t("schools.student.village")} value={f.village} onChangeText={set("village")} autoCapitalize="words" />
      </Section>
      {matches.length > 0 && (
        <Notice tone="warning" title={t("ux.maybeDuplicate")}>
          <Txt>{t("schools.student.duplicateWarning", { matches: matches.map((m) => { const s = names.get(m.id); return s ? `${studentName(s)} (${s.studentNumber})` : m.id; }).join(", ") })}</Txt>
          <CheckRow label={t("schools.student.confirmDifferent")} checked={confirmed} onChange={setConfirmed} />
        </Notice>
      )}
      {error && <Notice tone="critical">{error}</Notice>}
    </Page>
  );
}
