import type { School } from "@eu/schools/mobile";
import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import type { Session } from "../../session";
import { BackBar, Body, Button, Screen, Title } from "../../ui";
import { Attendance } from "./Attendance";
import { listSchools, live, today, useSchool, type Local } from "./data";
import { Fees } from "./Fees";
import { Students } from "./Students";

type View = "menu" | "attendance" | "students" | "fees";

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

/** The schools module: choose a school (if more than one), then attendance, students or fees. */
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

  if (!schools) return <Screen><Body tone="muted">…</Body></Screen>;
  if (!school)
    return (
      <Screen>
        <BackBar label={t("schools.mobile.back")} onBack={onExit} />
        <Title>{t("schools.mobile.pickSchool")}</Title>
        {schools.length === 0 && <Body tone="warning">{t("schools.mobile.noSchools")}</Body>}
        {schools.map((s) => <Button key={s.id} kind="secondary" label={s.code} onPress={() => setSchool(s)} />)}
      </Screen>
    );
  return <SchoolMenu session={session} school={school} onExit={schools.length > 1 ? () => setSchool(null) : onExit} />;
}

function SchoolMenu({ session, school, onExit }: { session: Session; school: Local<School>; onExit: () => void }) {
  const t = useT();
  const { data } = useSchool(session, school);
  const [view, setView] = useState<View>("menu");
  if (!data) return <Screen><Body tone="muted">…</Body></Screen>;
  const back = () => setView("menu");
  if (view === "attendance") return <Screen><Attendance session={session} data={data} onBack={back} /></Screen>;
  if (view === "students") return <Screen><Students session={session} data={data} onBack={back} /></Screen>;
  if (view === "fees") return <Screen><Fees session={session} data={data} onBack={back} /></Screen>;

  const d = today();
  const yearClasses = live(data.classes).filter((c) => data.years.some((y) => !y.voidedAt && y.id === c.academicYearId && y.startsOn <= d && y.endsOn >= d));
  const missing = yearClasses.filter((c) => !live(data.registers).some((r) => r.classId === c.id && r.date === d)).length;
  return (
    <Screen>
      <BackBar label={t("schools.mobile.back")} onBack={onExit} />
      <Title>{school.code}</Title>
      <Body tone="muted">{t("schools.mobile.menu")}</Body>
      {missing > 0 && <Body tone="warning">{t("schools.mobile.notTaken", { count: missing })}</Body>}
      <Button label={t("schools.attendance.takeRegister")} onPress={() => setView("attendance")} />
      <Button label={t("schools.nav.students")} onPress={() => setView("students")} />
      <Button label={t("schools.fees.payment")} onPress={() => setView("fees")} />
    </Screen>
  );
}
