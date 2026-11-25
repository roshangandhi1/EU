import Link from "next/link";
import { Icon } from "@/components/icons";

type Tr = (k: string, v?: Record<string, string | number>) => string;

/** Entry / results switch at the top of the marks pages, plus the grading setup for those who configure. */
export function MarksNav({ base, active, siteId, locale, tr, canConfigure, classId }: {
  base: string; active: "entry" | "results"; siteId: string; locale: string; tr: Tr; canConfigure: boolean; classId?: string;
}) {
  const q = classId ? `?class=${classId}` : "";
  return (
    <div className="marks-nav no-print">
      <nav className="marks-switch" aria-label={tr("marks.nav")}>
        <Link href={`${base}${q}`} aria-current={active === "entry" ? "page" : undefined}><Icon name="list" size={16} />{tr("marks.entryTab")}</Link>
        <Link href={`${base}/results${q}`} aria-current={active === "results" ? "page" : undefined}><Icon name="chart" size={16} />{tr("marks.resultsTab")}</Link>
      </nav>
      {canConfigure && <Link className="btn ghost sm" href={`/${locale}/schools/${siteId}/setup/grading`}><Icon name="layers" size={15} />{tr("marks.setupLink")}</Link>}
    </div>
  );
}
