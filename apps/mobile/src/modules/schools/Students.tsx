import { activeOn, findLikelyDuplicates, nextStudentNumber, normaliseName, tagForDevice, type Sex } from "@eu/schools/mobile";
import { useEffect } from "react";
import { useMemo, useState } from "react";
import { deviceId } from "../../secure";
import { useT } from "../../i18n";
import type { Session } from "../../session";
import { Body, Button, Field, Title } from "../../ui";
import { currentYear, live, studentName, today, type SchoolData } from "./data";
import { Choice, Row, Scroll } from "./parts";

/** Pupils enrolled this year, with search, and enrolment of a new pupil. */
export function Students({ session, data, onBack }: { session: Session; data: SchoolData; onBack: () => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const date = today();
  const classes = new Map(data.classes.map((c) => [c.id, c]));
  const enrolled = activeOn(data.enrolments, date);
  const byStudent = new Map(enrolled.map((e) => [e.studentId, e]));
  const rows = useMemo(() => {
    const n = normaliseName(q);
    return data.students
      .filter((s) => !s.voidedAt && byStudent.has(s.id))
      .filter((s) => !n || normaliseName(studentName(s)).includes(n) || s.studentNumber.toLowerCase().includes(q.trim().toLowerCase()))
      .sort((a, b) => studentName(a).localeCompare(studentName(b)));
  }, [data.students, q, enrolled.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (adding) return <Enrol session={session} data={data} onDone={() => setAdding(false)} />;

  return (
    <Scroll>
      <Title>{t("schools.student.title")}</Title>
      <Button label={t("schools.mobile.newStudent")} onPress={() => setAdding(true)} />
      <Field label={t("schools.student.search")} value={q} onChangeText={setQ} autoCorrect={false} />
      <Body tone="muted">{t("schools.overview.enrolled")}: {enrolled.length}</Body>
      {rows.slice(0, 200).map((s) => {
        const c = classes.get(byStudent.get(s.id)?.classId ?? "");
        return <Row key={s.id} title={studentName(s)} detail={`${s.studentNumber} · ${c ? `${c.level}${c.section}` : ""}${s.pending ? ` · ${t("schools.mobile.pending")}` : ""}`} />;
      })}
      <Button kind="secondary" label={t("schools.mobile.back")} onPress={onBack} />
    </Scroll>
  );
}

function Enrol({ session, data, onDone }: { session: Session; data: SchoolData; onDone: () => void }) {
  const t = useT();
  const date = today();
  const year = currentYear(data, date);
  const classes = live(data.classes).filter((c) => c.academicYearId === year?.id).sort((a, b) => a.level - b.level || a.section.localeCompare(b.section));
  const [f, setF] = useState({ firstName: "", lastName: "", postName: "", dateOfBirth: "", birthYear: "", guardianName: "", guardianPhone: "", village: "" });
  const [sex, setSex] = useState<Sex | "">("");
  const [classId, setClassId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [myDevice, setMyDevice] = useState<string | null>(null);
  useEffect(() => void deviceId().then(setMyDevice), []);
  const tag = myDevice ? tagForDevice(data.deviceTags, myDevice) : null;
  const set = (k: keyof typeof f) => (v: string) => { setF({ ...f, [k]: v }); setConfirmed(false); };

  const dob = /^\d{4}-\d{2}-\d{2}$/.test(f.dateOfBirth) ? f.dateOfBirth : null;
  const by = /^\d{4}$/.test(f.birthYear) ? Number(f.birthYear) : null;
  const candidate = sex ? { id: "", firstName: f.firstName, lastName: f.lastName, postName: f.postName, sex, dateOfBirth: dob, birthYearEstimate: dob ? null : by, guardianPhone: f.guardianPhone } : null;
  const matches = candidate && f.firstName && f.lastName ? findLikelyDuplicates(candidate, live(data.students)) : [];
  const names = new Map(data.students.map((s) => [s.id, s]));

  const save = async () => {
    if (!year || !candidate || !classId || !f.firstName.trim() || !f.lastName.trim() || (!dob && !by)) return setError(t("schools.common.invalid"));
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
    onDone();
  };

  if (!year) return <Scroll><Body tone="warning">{t("schools.mobile.needYear")}</Body><Button kind="secondary" label={t("schools.mobile.back")} onPress={onDone} /></Scroll>;

  return (
    <Scroll>
      <Title>{t("schools.student.add")}</Title>
      {myDevice && !tag && <Body tone="critical">{t("schools.mobile.noTag")}</Body>}
      <Field label={t("schools.student.lastName")} value={f.lastName} onChangeText={set("lastName")} autoCapitalize="characters" />
      <Field label={t("schools.student.postName")} value={f.postName} onChangeText={set("postName")} autoCapitalize="characters" />
      <Field label={t("schools.student.firstName")} value={f.firstName} onChangeText={set("firstName")} autoCapitalize="words" />
      <Body tone="muted">{t("schools.student.sex")}</Body>
      <Choice value={sex} onChange={(v) => { setSex(v as Sex); setConfirmed(false); }} options={[{ value: "F", label: t("schools.student.female") }, { value: "M", label: t("schools.student.male") }]} />
      <Field label={`${t("schools.student.dateOfBirth")} (AAAA-MM-JJ)`} value={f.dateOfBirth} onChangeText={set("dateOfBirth")} keyboardType="numbers-and-punctuation" placeholder="2019-03-04" />
      {!dob && <Field label={t("schools.student.birthYearEstimate")} value={f.birthYear} onChangeText={set("birthYear")} keyboardType="number-pad" maxLength={4} />}
      <Body tone="muted">{t("schools.student.birthHint")}</Body>
      <Field label={t("schools.student.guardianName")} value={f.guardianName} onChangeText={set("guardianName")} />
      <Field label={t("schools.student.guardianPhone")} value={f.guardianPhone} onChangeText={set("guardianPhone")} keyboardType="phone-pad" />
      <Field label={t("schools.student.village")} value={f.village} onChangeText={set("village")} />
      <Body tone="muted">{t("schools.student.enrolledIn")}</Body>
      <Choice value={classId} onChange={setClassId} options={classes.map((c) => ({ value: c.id, label: `${c.level}${c.section} · ${t(`schools.shift.${c.shift}`)}` }))} />
      {matches.length > 0 && (
        <>
          <Body tone="warning">{t("schools.student.duplicateWarning", { matches: matches.map((m) => { const s = names.get(m.id); return s ? `${studentName(s)} (${s.studentNumber})` : m.id; }).join(", ") })}</Body>
          <Choice value={confirmed ? "y" : ""} onChange={() => setConfirmed(!confirmed)} options={[{ value: "y", label: t("schools.student.confirmDifferent") }]} />
        </>
      )}
      {error && <Body tone="critical">{error}</Body>}
      <Button label={t("schools.common.save")} onPress={() => void save()} disabled={busy || !tag || (matches.length > 0 && !confirmed)} />
      <Button kind="secondary" label={t("schools.common.cancel")} onPress={onDone} />
    </Scroll>
  );
}
