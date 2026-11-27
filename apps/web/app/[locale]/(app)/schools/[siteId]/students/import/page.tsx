import { currentYear, live, schoolsEn, schoolsFr, levelsOf } from "@eu/schools";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { NoAccess } from "@/components/no-access";
import { classCode } from "@/lib/pupil-import";
import { can, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { byLevel, classLabel } from "../../labels";
import { NotSetUp } from "../../not-set-up";
import { ImportWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function ImportPupils({ params }: { params: Promise<{ locale: string; siteId: string }> }) {
  const p = await params;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const d = await schoolFor(me, p.siteId);
  const LV = levelsOf(d.school);
  if (!can(me, "student.write", p.siteId) || !can(me, "enrolment.write", p.siteId)) return <NoAccess locale={locale} reason={tr("common.forbidden")} />;
  const date = today();
  const year = currentYear(d, date);
  const classes = live(d.classes).sort(byLevel);
  const thisYear = year ? classes.filter((c) => c.academicYearId === year.id) : [];
  const base = `/${locale}/schools/${p.siteId}/students`;
  return (
    <>
      <div className="list-head">
        <Link className="btn ghost" href={base}><Icon name="back" size={16} />{tr("pimport.back")}</Link>
      </div>
      {thisYear.length === 0 && <NotSetUp me={me} siteId={p.siteId} locale={locale} />}
      <ImportWizard
        locale={locale}
        siteId={p.siteId}
        base={base}
        today={date}
        defaultDate={year && year.startsOn <= date ? year.startsOn : date}
        classes={classes.map((c) => ({ id: c.id, yearId: c.academicYearId, label: classLabel(c, tr, LV), code: classCode(c, classes, locale) }))}
        yearId={year?.id ?? ""}
        l={(locale === "fr" ? schoolsFr : schoolsEn).pimport}
      />
    </>
  );
}
