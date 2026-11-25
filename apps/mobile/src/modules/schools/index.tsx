import type { School } from "@eu/schools/mobile";
import { colors } from "@eu/core/tokens";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useT } from "../../i18n";
import type { Session } from "../../session";
import { Card, Header, IconBadge, ListGroup, ListRow, Notice, Page, Txt } from "../../ui";
import { Attendance } from "./Attendance";
import { activeOn } from "@eu/schools/mobile";
import { listSchools, live, today, useSchool, type Local } from "./data";
import { Fees } from "./Fees";
import { ACCENT } from "./parts";
import { Students } from "./Students";

type View_ = "menu" | "attendance" | "students" | "fees";

/** True when this phone holds at least one school the user can open. */
export function useHasSchools(session: Session): boolean {
  const [has, setHas] = useState(false);
  useEffect(() => {
    const check = () => void listSchools(session).then((s) => setHas(s.length > 0));
    check();
    return session.subscribe(check);
  }, [session]);
  return has;
}

/** The schools module: choose a school (if more than one), then attendance, pupils or fees. */
export function SchoolsApp({ session, onExit }: { session: Session; onExit: () => void }) {
  const t = useT();
  const [schools, setSchools] = useState<Local<School>[] | null>(null);
  const [school, setSchool] = useState<Local<School> | null>(null);
  useEffect(() => {
    void listSchools(session).then((s) => {
      setSchools(s);
      if (s.length === 1) setSchool(s[0] ?? null);
    });
  }, [session]);

  const header = <Header title={t("app.schools")} onBack={onExit} backLabel={t("schools.mobile.back")} accent={ACCENT} />;
  if (!schools) return <Page header={header}><Txt tone="muted">…</Txt></Page>;
  if (!school)
    return (
      <Page header={header}>
        <Txt variant="heading">{t("schools.mobile.pickSchool")}</Txt>
        {schools.length === 0 && <Notice tone="warning">{t("schools.mobile.noSchools")}</Notice>}
        <ListGroup>
          {schools.map((s) => (
            <ListRow key={s.id} title={s.code} leading={<IconBadge icon="school" color={ACCENT} />} onPress={() => setSchool(s)} chevron />
          ))}
        </ListGroup>
      </Page>
    );
  return <SchoolMenu session={session} school={school} onExit={schools.length > 1 ? () => setSchool(null) : onExit} />;
}

function SchoolMenu({ session, school, onExit }: { session: Session; school: Local<School>; onExit: () => void }) {
  const t = useT();
  const { data } = useSchool(session, school);
  const [view, setView] = useState<View_>("menu");
  if (!data) return <Page header={<Header title={school.code} onBack={onExit} accent={ACCENT} />}><Txt tone="muted">…</Txt></Page>;
  const back = () => setView("menu");
  if (view === "attendance") return <Attendance session={session} data={data} onBack={back} />;
  if (view === "students") return <Students session={session} data={data} onBack={back} />;
  if (view === "fees") return <Fees session={session} data={data} onBack={back} />;

  const d = today();
  const year = data.years.find((y) => !y.voidedAt && y.startsOn <= d && y.endsOn >= d);
  const yearClasses = live(data.classes).filter((c) => c.academicYearId === year?.id);
  const taken = yearClasses.filter((c) => live(data.registers).some((r) => r.classId === c.id && r.date === d)).length;
  const enrolled = activeOn(data.enrolments, d).length;
  const paidToday = live(data.payments).filter((p) => p.paidOn === d).length;
  const pct = yearClasses.length ? taken / yearClasses.length : 0;

  return (
    <Page header={<Header title={school.code} subtitle={year ? t("ux.schoolYear", { year: year.label }) : undefined} onBack={onExit} backLabel={t("schools.mobile.back")} accent={ACCENT} />}>
      {yearClasses.length > 0 && (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Txt variant="display" color={taken === yearClasses.length ? colors.statusGood : colors.text}>{`${taken}/${yearClasses.length}`}</Txt>
            <Txt tone="muted" style={{ flex: 1 }}>{t("ux.registersToday")}</Txt>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: "#E7ECE4", overflow: "hidden" }}>
            <View style={{ width: `${Math.round(pct * 100)}%`, height: 8, backgroundColor: taken === yearClasses.length ? colors.statusGood : colors.gcLime }} />
          </View>
        </Card>
      )}
      {!year && <Notice tone="warning">{t("schools.mobile.needYear")}</Notice>}
      <ListGroup>
        <ListRow title={t("schools.attendance.takeRegister")} detail={t("ux.registerHint")} leading={<IconBadge icon="clipboard" color={colors.gcGreen} size={48} />} onPress={() => setView("attendance")} chevron />
        <ListRow title={t("ux.pupils")} detail={t("ux.pupilsHint", { count: enrolled })} leading={<IconBadge icon="users" color={colors.gcGreen} size={48} />} onPress={() => setView("students")} chevron />
        <ListRow title={t("schools.fees.payment")} detail={paidToday ? t("ux.paymentsToday", { count: paidToday }) : t("ux.paymentHint")} leading={<IconBadge icon="coins" color={colors.gcGreen} size={48} />} onPress={() => setView("fees")} chevron />
      </ListGroup>
    </Page>
  );
}
