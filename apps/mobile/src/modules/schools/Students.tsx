import { activeOn, findLikelyDuplicates, nextStudentNumber, normaliseName, tagForDevice, type Sex } from "@eu/schools/mobile";
import { space } from "@eu/core/tokens";
import { useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, View } from "react-native";
import { saveErrorKey } from "../../errors";
import { deviceId } from "../../secure";
import { useT } from "../../i18n";
import type { Session } from "../../session";
import { ageOn } from "../../time";
import {
  Anchor, Avatar, Button, CheckRow, Chips, Field, groupItemStyle, Header, ListRow, Notice, Page, Section, Segmented, StatusChip, Toast, Txt,
  useDialog, useFormScroll, useLeaveGuard,
} from "../../ui";
import { currentYear, live, studentName, today, type SchoolData } from "./data";
import { ACCENT, classLabel, maskDate, schoolName } from "./parts";

const SHOW_MAX = 200;

/** Pupils enrolled this year, with search and a class filter, and enrolment of a new pupil. */
export function Students({ session, data, onBack }: { session: Session; data: SchoolData; onBack: () => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const date = today();
  const classes = new Map(data.classes.map((c) => [c.id, c]));
  const enrolled = activeOn(data.enrolments, date, data.years);
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
  const shown = rows.slice(0, SHOW_MAX);

  if (adding) return <Enrol session={session} data={data} onDone={(saved) => { setAdding(false); if (saved) setToast(t("app.savedOnPhone")); }} />;

  const top = (
    <View style={{ padding: space.md, gap: space.md }}>
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
      {rows.length === 0 && <Notice tone="muted" icon="search">{t("ux.noMatch")}</Notice>}
      {rows.length > SHOW_MAX && <Notice tone="info" icon="search">{t("ux.refineSearch", { shown: SHOW_MAX, total: rows.length })}</Notice>}
    </View>
  );

  return (
    <Page
      bare
      header={<Header title={t("ux.pupils")} subtitle={`${schoolName(data.school)} · ${t("ux.enrolledCount", { count: enrolled.length })}`} onBack={onBack} backLabel={t("schools.mobile.back")} accent={ACCENT} />}
      footer={<Button icon="plus" label={t("schools.mobile.newStudent")} onPress={() => setAdding(true)} flex={1} />}
      toast={<Toast message={toast} onHide={() => setToast(null)} />}
    >
      <FlatList
        data={shown}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={top}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: space.lg }}
        renderItem={({ item: s, index }) => {
          const c = classes.get(byStudent.get(s.id)?.classId ?? "");
          return (
            <View style={groupItemStyle(index, shown.length)}>
              <ListRow
                title={studentName(s)}
                detail={`${s.studentNumber}${c ? ` · ${classLabel(c, shifts, t)}` : ""}`}
                leading={<Avatar name={studentName(s)} />}
                trailing={s.pending ? <StatusChip label={t("ux.notSynced")} tone="warning" /> : undefined}
              />
            </View>
          );
        }}
      />
    </Page>
  );
}

/** Primary pupils are 3 to 25: outside that, the date was mistyped. */
const MIN_AGE = 3;
const MAX_AGE = 25;

type EnrolField = "lastName" | "firstName" | "sex" | "birth" | "class";

function Enrol({ session, data, onDone }: { session: Session; data: SchoolData; onDone: (saved: boolean) => void }) {
  const t = useT();
  const date = today();
  const year = currentYear(data, date);
  const classes = live(data.classes).filter((c) => c.academicYearId === year?.id).sort((a, b) => a.level - b.level || a.section.localeCompare(b.section));
  const shifts = new Set(classes.map((c) => c.shift)).size;
  const form = useFormScroll();
  const { ask, node: dialog } = useDialog();
  const [f, setF] = useState({ firstName: "", lastName: "", postName: "", dateOfBirth: "", birthYear: "", guardianName: "", guardianPhone: "", village: "" });
  const [sex, setSex] = useState<Sex | "">("");
  const [classId, setClassId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<EnrolField, string>>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [myDevice, setMyDevice] = useState<string | null>(null);
  useEffect(() => void deviceId().then(setMyDevice), []);
  const tag = myDevice ? tagForDevice(data.deviceTags, myDevice) : null;
  const clearErr = (k: EnrolField) => errors[k] && setErrors({ ...errors, [k]: undefined });
  const set = (k: keyof typeof f, e?: EnrolField) => (v: string) => { setF({ ...f, [k]: v }); setConfirmed(false); if (e) clearErr(e); };

  const dobRaw = maskDate(f.dateOfBirth).iso;
  const by = /^\d{4}$/.test(f.birthYear) ? Number(f.birthYear) : null;
  const thisYear = Number(date.slice(0, 4));
  // A real date that is not in the future and gives a primary-school age.
  const dobProblem = dobRaw === null ? (f.dateOfBirth.length === 8 ? "ux.badDate" : null)
    : dobRaw > date ? "ux.birthFuture"
    : ageOn(dobRaw, date) < MIN_AGE || ageOn(dobRaw, date) > MAX_AGE ? "ux.birthAge" : null;
  const byProblem = f.birthYear.length === 4 && by !== null && (by > thisYear - MIN_AGE || by < thisYear - MAX_AGE) ? "ux.birthYearAge" : null;
  const dob = dobProblem ? null : dobRaw;
  const byOk = byProblem ? null : by;
  const candidate = sex ? { id: "", firstName: f.firstName, lastName: f.lastName, postName: f.postName, sex, dateOfBirth: dob, birthYearEstimate: dob ? null : byOk, guardianPhone: f.guardianPhone } : null;
  const matches = candidate && f.firstName && f.lastName ? findLikelyDuplicates(candidate, live(data.students)) : [];
  const names = new Map(data.students.map((s) => [s.id, s]));
  const dirty = Object.values(f).some((v) => v.trim() !== "") || !!sex || !!classId;

  const validate = (): Partial<Record<EnrolField, string>> => {
    const e: Partial<Record<EnrolField, string>> = {};
    if (!f.lastName.trim()) e.lastName = t("ux.required");
    if (!f.firstName.trim()) e.firstName = t("ux.required");
    if (!sex) e.sex = t("ux.chooseOne");
    if (dobProblem) e.birth = t(dobProblem, { min: MIN_AGE, max: MAX_AGE });
    else if (!dob && byProblem) e.birth = t(byProblem, { min: MIN_AGE, max: MAX_AGE });
    else if (!dob && !byOk) e.birth = t("ux.birthNeeded");
    if (!classId) e.class = t("ux.chooseOne");
    return e;
  };

  const save = async () => {
    if (busy || !year || !tag) return;
    const e = validate();
    setErrors(e);
    const first = (["lastName", "firstName", "sex", "birth", "class"] as const).find((k) => e[k]);
    if (first) return form.scrollTo(first === "class" ? "class" : first === "birth" ? "birth" : "pupil");
    if (matches.length && !confirmed) return form.scrollTo("duplicate");
    if (!candidate) return;
    setBusy(true);
    setFailed(null);
    try {
      const studentNumber = nextStudentNumber(data.school.code, Number(year.startsOn.slice(0, 4)), tag, data.students.map((s) => s.studentNumber));
      const site = data.school.siteId;
      const studentId = await session.client.create("school.student", site, {
        studentNumber, firstName: f.firstName.trim(), lastName: f.lastName.trim(), postName: f.postName.trim(), sex,
        dateOfBirth: dob, birthYearEstimate: dob ? null : byOk, guardianName: f.guardianName.trim(), guardianPhone: f.guardianPhone.trim(), village: f.village.trim(),
      });
      await session.client.create("school.enrolment", site, { studentId, classId, academicYearId: year.id, enrolledOn: date, leftOn: null, status: "active" });
      await session.localSaved();
      void session.syncNow();
      onDone(true);
    } catch (err) {
      setFailed(t(saveErrorKey(err)));
      setBusy(false);
    }
  };

  const back = useLeaveGuard(dirty, () => onDone(false), ask);
  const header = <Header title={t("schools.student.add")} subtitle={schoolName(data.school)} onBack={back} backLabel={t("schools.mobile.back")} accent={ACCENT} />;
  if (!year) return <Page header={header}><Notice tone="warning">{t("schools.mobile.needYear")}</Notice></Page>;

  return (
    <Page
      header={header}
      form={form}
      footer={<Button icon="check" label={t("ux.enrolPupil")} onPress={() => void save()} disabled={!tag || (matches.length > 0 && !confirmed)} busy={busy} flex={1} />}
    >
      {myDevice && !tag && <Notice tone="critical">{t("schools.mobile.noTag")}</Notice>}
      {failed && <Notice tone="critical">{failed}</Notice>}
      <Anchor form={form} name="pupil">
        <Section title={t("ux.pupil")}>
          <Field label={t("schools.student.lastName")} value={f.lastName} onChangeText={set("lastName", "lastName")} autoCapitalize="characters" error={errors.lastName} />
          <Field label={`${t("schools.student.postName")} (${t("ux.optional")})`} value={f.postName} onChangeText={set("postName")} autoCapitalize="characters" />
          <Field label={t("schools.student.firstName")} value={f.firstName} onChangeText={set("firstName", "firstName")} autoCapitalize="words" error={errors.firstName} />
          <View style={{ gap: 6 }}>
            <Txt variant="label">{t("schools.student.sex")}</Txt>
            <Segmented<Sex | ""> value={sex} onChange={(v) => { setSex(v); setConfirmed(false); clearErr("sex"); }} options={[{ value: "F", label: t("schools.student.female") }, { value: "M", label: t("schools.student.male") }]} />
            {errors.sex ? <Txt variant="small" tone="critical">{errors.sex}</Txt> : null}
          </View>
        </Section>
      </Anchor>
      <Anchor form={form} name="birth">
        <Section title={t("ux.age")} hint={t("schools.student.birthHint")}>
          <Field label={t("schools.student.dateOfBirth")} value={maskDate(f.dateOfBirth).text} onChangeText={(v) => set("dateOfBirth", "birth")(v.replace(/\D/g, ""))} keyboardType="number-pad" placeholder={t("ux.datePattern")} maxLength={10}
            error={dobProblem ? t(dobProblem, { min: MIN_AGE, max: MAX_AGE }) : null} />
          {!dobRaw && (
            <Field label={t("schools.student.birthYearEstimate")} value={f.birthYear} onChangeText={(v) => set("birthYear", "birth")(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={4} placeholder={String(thisYear - 7)}
              error={byProblem ? t(byProblem, { min: MIN_AGE, max: MAX_AGE }) : null} />
          )}
          {errors.birth && !dobProblem && !byProblem ? <Txt variant="small" tone="critical">{errors.birth}</Txt> : null}
        </Section>
      </Anchor>
      <Anchor form={form} name="class">
        <Section title={t("schools.student.enrolledIn")}>
          <Segmented columns={shifts > 1 ? 2 : 3} value={classId} onChange={(v) => { setClassId(v); clearErr("class"); }} options={classes.map((c) => ({ value: c.id, label: classLabel(c, shifts, t) }))} />
          {errors.class ? <Txt variant="small" tone="critical">{errors.class}</Txt> : null}
        </Section>
      </Anchor>
      <Section title={t("ux.family")} hint={t("ux.optional")}>
        <Field label={t("schools.student.guardianName")} value={f.guardianName} onChangeText={set("guardianName")} autoCapitalize="words" />
        <Field label={t("schools.student.guardianPhone")} value={f.guardianPhone} onChangeText={set("guardianPhone")} keyboardType="phone-pad" />
        <Field label={t("schools.student.village")} value={f.village} onChangeText={set("village")} autoCapitalize="words" />
      </Section>
      {matches.length > 0 && (
        <Anchor form={form} name="duplicate">
          <Notice tone="warning" title={t("ux.maybeDuplicate")}>
            <Txt>{t("schools.student.duplicateWarning", { matches: matches.map((m) => { const s = names.get(m.id); return s ? `${studentName(s)} (${s.studentNumber})` : m.id; }).join(", ") })}</Txt>
            <CheckRow label={t("schools.student.confirmDifferent")} checked={confirmed} onChange={setConfirmed} />
          </Notice>
        </Anchor>
      )}
      {dialog}
    </Page>
  );
}
