import { BEHAVIOUR, FINAL, bulletinLayout, classResults, degreeOf, domainsOf, formatScore, maxFor, periodsIn, type ClassResults, type PeriodDef, type Span, type Subject } from "@eu/schools";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyRow, Notice } from "@/components/ui";
import { can, schoolFor, signedIn, today, tr as trFor } from "@/lib/schools";
import { param, type SP } from "../../../flash";
import { studentName } from "../../labels";
import { MarksNav } from "../nav";
import { PrintButton } from "../print-button";
import { marksContext } from "../shared";
import "../marks.css";
import "./bulletin.css";

const DEGREE = {
  elementaire: "DEGRÉ ÉLÉMENTAIRE (1re, 2e ANNÉE)",
  moyen: "DEGRÉ MOYEN (3e, 4e ANNÉE)",
  terminal: "DEGRÉ TERMINAL",
  cteb: "ÉDUCATION DE BASE (7e, 8e ANNÉE)",
} as const;
const ordP = (n: number) => (n === 1 ? "1re P." : `${n}e P.`);
const levelFr = (n: number) => (n === 1 ? "1re année" : `${n}e année`);
/** The terminal forms are printed per year ("DEGRÉ TERMINAL (6e ANNÉE)"); the others cover two years. */
const degreeTitle = (lvl: number) => (degreeOf(lvl) === "terminal" ? `${DEGREE.terminal} (${lvl}e ANNÉE)` : DEGREE[degreeOf(lvl)]);

/**
 * The report card ("bulletin") laid out like the ministry form, as a working copy ("copie de
 * travail") to transcribe onto the official bulletin: the official form may not be reproduced.
 * One pupil (?student=) or the whole class, one A4 page each. Always in French, like the form.
 */
export default async function Bulletin({ params, searchParams }: { params: Promise<{ locale: string; siteId: string }>; searchParams: SP }) {
  const p = await params;
  const sp = await searchParams;
  const { me, locale } = await signedIn(p.locale);
  const tr = trFor(locale);
  const d = await schoolFor(me, p.siteId);
  const ctx = marksContext(d, p.siteId, today(), param(sp, "class"), locale);
  const base = `/${locale}/schools/${p.siteId}/marks`;
  const nav = <MarksNav base={base} active="results" siteId={p.siteId} locale={locale} tr={tr} canConfigure={can(me, "school.configure", p.siteId)} classId={ctx.cls?.id} />;
  const cls = ctx.cls;
  if (!cls) return <div className="stack">{nav}<EmptyRow icon="users" title={tr("ux.pickClass")} /></div>;

  const { scheme } = ctx;
  // Report cards print subject names in French, as the school entered them.
  const subjects: Subject[] = ctx.subjectsOf(cls.level).subjects;
  const lines = bulletinLayout(subjects, domainsOf(scheme, cls.level), "fr");
  const pupils = ctx.pupilsOf(cls.id);
  const only = param(sp, "student");
  const shown = only ? pupils.filter((s) => s.id === only) : pupils;
  if (only && shown.length === 0) notFound();
  const idx = ctx.index(cls.id);
  const ids = pupils.map((s) => s.id);
  const terms = [...new Set(ctx.periods.map((x) => x.term))];

  // Results for every column the form has: each period, each exam, each trimester, the year.
  const res = new Map<string, ClassResults>();
  const run = (key: string, span: Span) => res.set(key, classResults({ studentIds: ids, subjects, periods: periodsIn(scheme, span), marks: idx, scheme }));
  for (const x of ctx.periods) run(x.key, { kind: "period", key: x.key });
  for (const t of terms) run(`T${t}`, { kind: "term", term: t });
  run("Y", { kind: "year" });

  const num = (n: number) => formatScore(Math.round(n * 2) / 2, "fr");
  const pct = (n: number | null) => (n == null ? "" : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(n)} %`);
  const year = ctx.year?.label ?? "";
  const school = d.school;

  const card = (sid: string) => {
    const s = d.students.find((x) => x.id === sid)!;
    const row = (key: string) => res.get(key)!.rows.find((r) => r.studentId === sid)!;
    // A pupil who takes no optional subject (Religion) all year is not graded on it.
    const takes = (sub: Subject) => !sub.optional || ctx.periods.some((x) => idx.has(`${sid}|${sub.code}|${x.key}`));
    const subs = (codes: string[]) => subjects.filter((x) => codes.includes(x.code) && takes(x));
    const max = (codes: string[], periods: PeriodDef[]) => subs(codes).reduce((n, x) => n + periods.reduce((m, q) => m + maxFor(x, q, scheme), 0), 0);
    const got = (codes: string[], key: string) => {
      const r = row(key);
      let o = 0, any = false;
      for (const x of subs(codes)) { const b = r.bySubject.get(x.code); if (b && b.max > 0) { o += b.obtained; any = true; } }
      return any ? num(o) : "";
    };
    const cells = (codes: string[], perCol?: boolean) => {
      const out: React.ReactNode[] = [<td key="mp" className="b-max">{num(max(codes, [{ key: "P1", kind: "period", term: 1, n: 1 }]))}</td>];
      for (const t of terms) {
        const inTerm = ctx.periods.filter((x) => x.term === t);
        for (const x of inTerm.filter((q) => q.kind === "period")) out.push(<td key={x.key}>{got(codes, x.key)}</td>);
        const ex = inTerm.find((q) => q.kind === "exam");
        if (ex) out.push(<td key={`mx${t}`} className="b-max">{num(max(codes, [ex]))}</td>, <td key={ex.key}>{got(codes, ex.key)}</td>);
        out.push(<td key={`mt${t}`} className="b-max">{num(max(codes, inTerm))}</td>, <td key={`T${t}`} className="b-strong">{got(codes, `T${t}`)}</td>);
      }
      out.push(<td key="my" className="b-max">{num(max(codes, ctx.periods))}</td>, <td key="Y" className="b-strong">{got(codes, "Y")}</td>);
      void perCol;
      return out;
    };
    // Footer rows: one value per "points" column; the maxima columns are blacked out as on the form.
    const footer = (label: string, value: (key: string, kind: "period" | "exam" | "term" | "year") => string, onlyPeriods = false) => {
      const out: React.ReactNode[] = [<td key="mp" className="b-black" />];
      for (const t of terms) {
        const inTerm = ctx.periods.filter((x) => x.term === t);
        for (const x of inTerm.filter((q) => q.kind === "period")) out.push(<td key={x.key}>{value(x.key, "period")}</td>);
        const ex = inTerm.find((q) => q.kind === "exam");
        if (ex) out.push(<td key={`mx${t}`} className="b-black" />, <td key={ex.key} className={onlyPeriods ? "b-black" : undefined}>{onlyPeriods ? "" : value(ex.key, "exam")}</td>);
        out.push(<td key={`mt${t}`} className="b-black" />, <td key={`T${t}`} className={onlyPeriods ? "b-black" : "b-strong"}>{onlyPeriods ? "" : value(`T${t}`, "term")}</td>);
      }
      out.push(<td key="my" className="b-black" />, <td key="Y" className={onlyPeriods ? "b-black" : "b-strong"}>{onlyPeriods ? "" : value("Y", "year")}</td>);
      return <tr className="b-foot"><th scope="row">{label}</th>{out}</tr>;
    };
    const all = subjects.map((x) => x.code);
    const spanOf = (key: string): PeriodDef[] => (key === "Y" ? ctx.periods : key.startsWith("T") ? ctx.periods.filter((x) => x.term === Number(key.slice(1))) : ctx.periods.filter((x) => x.key === key));
    const letter = (code: string) => (key: string) => idx.get(`${sid}|${code}|${key}`)?.letter ?? "";
    const yr = row("Y");
    const decided = yr.percent != null && yr.missing === 0;
    const pass = decided && yr.passed;
    // 6e année: Résultat final. A blank school average falls back to the year percentage halved.
    const fin = (code: string) => idx.get(`${sid}|${code}|${FINAL.period}`);
    const ecoleMark = fin(FINAL.school);
    const ecole = ecoleMark?.score ?? (decided && yr.percent != null ? Math.round(yr.percent * 5) / 10 : null);
    const ecoleComputed = ecoleMark?.score == null && ecole != null;
    const enafep = fin(FINAL.exam)?.score ?? null;
    const dec = (n: number | null) => (n == null ? "" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n));

    return (
      <article key={sid} className="bulletin">
        <p className="b-copy">COPIE DE TRAVAIL · à reporter sur le bulletin officiel · ne remplace pas le bulletin officiel</p>
        <header className="b-head">
          <div className="b-title">
            <strong>RÉPUBLIQUE DÉMOCRATIQUE DU CONGO</strong>
            <strong>MINISTÈRE DE L&apos;ÉDUCATION NATIONALE ET NOUVELLE CITOYENNETÉ</strong>
          </div>
          <div className="b-id"><span>N° ID.</span><b>{s.idNumber || ""}</b></div>
          <div className="b-grid">
            <div className="b-wide"><span>PROVINCE ÉDUCATIONNELLE :</span><b>{school?.province || ""}</b></div>
            <div><span>CODE :</span><b /></div>
            <div><span>VILLE / TER. :</span><b>{school?.city || ""}</b></div>
            <div><span>ÉLÈVE :</span><b>{studentName(s)}</b><span>SEXE :</span><b>{s.sex}</b></div>
            <div><span>COMMUNE / SECTEUR :</span><b>{school?.commune || ""}</b></div>
            <div><span>NÉ(E) À :</span><b>{s.birthPlace || ""}</b><span>LE :</span><b>{s.dateOfBirth ? s.dateOfBirth.split("-").reverse().join("/") : s.birthYearEstimate ?? ""}</b></div>
            <div><span>ÉCOLE :</span><b>{d.site.name}</b></div>
            <div><span>CLASSE :</span><b>{levelFr(cls.level)} {cls.section}</b></div>
            <div><span>CODE :</span><b>{school?.ministryCode || ""}</b></div>
            <div><span>N° PERM. :</span><b>{s.permNumber || ""}</b></div>
          </div>
          <div className="b-heading"><strong>BULLETIN DE L&apos;ÉLÈVE : {degreeTitle(cls.level)}</strong><strong>ANNÉE SCOLAIRE {year}</strong></div>
        </header>
        <table className="b-table">
          <thead>
            <tr>
              <th rowSpan={2} className="b-branches">BRANCHES</th>
              <th rowSpan={2} className="b-max">MAX per.</th>
              {terms.map((t) => {
                const inTerm = ctx.periods.filter((x) => x.term === t);
                const n = inTerm.filter((x) => x.kind === "period").length + (inTerm.some((x) => x.kind === "exam") ? 2 : 0) + 2;
                return <th key={t} colSpan={n}>{["PREMIER", "DEUXIÈME", "TROISIÈME", "QUATRIÈME"][t - 1]} TRIMESTRE</th>;
              })}
              <th colSpan={2}>TOTAL</th>
            </tr>
            <tr>
              {terms.flatMap((t) => {
                const inTerm = ctx.periods.filter((x) => x.term === t);
                const out = inTerm.filter((x) => x.kind === "period").map((x) => <th key={x.key}>{ordP(x.n)}</th>);
                if (inTerm.some((x) => x.kind === "exam")) out.push(<th key={`mx${t}`} className="b-max">MAX EX.</th>, <th key={`ex${t}`}>PTS OBT.</th>);
                out.push(<th key={`mt${t}`} className="b-max">MAX TRIM.</th>, <th key={`t${t}`}>PTS OBT.</th>);
                return out;
              })}
              <th className="b-max">MAX</th><th>PTS OBT.</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              if (l.type === "domain") return <tr key={i} className="b-domain"><th colSpan={99}>{l.label.toUpperCase()}</th></tr>;
              if (l.type === "branch") return <tr key={i} className="b-branch"><th colSpan={99}>{l.label.toUpperCase()}</th></tr>;
              if (l.type === "subtotal") return <tr key={i} className="b-sub"><th scope="row">Sous-total</th>{cells(l.codes)}</tr>;
              const off = !takes(l.subject);
              return <tr key={i} className={off ? "b-off" : undefined}><th scope="row">{l.subject.name}{l.subject.optional ? " *" : ""}</th>{off ? <td colSpan={98} className="b-na">non suivi</td> : cells([l.subject.code])}</tr>;
            })}
          </tbody>
          <tfoot>
            {footer("Maxima généraux", (k) => num(max(all, spanOf(k))))}
            {footer("Totaux", (k) => { const r = row(k); return r.max > 0 ? num(r.obtained) : ""; })}
            {footer("Pourcentage", (k) => pct(row(k).percent))}
            {footer("Place", (k) => { const r = row(k); return r.rank ? `${r.rank}` : ""; })}
            {footer("Nbre d'élèves", (k) => { const r = res.get(k)!; return r.ranked ? String(r.ranked) : ""; })}
            {footer("Application", letter(BEHAVIOUR[0]), true)}
            {footer("Conduite", letter(BEHAVIOUR[1]), true)}
            {footer("Signat. de l'inst.", () => "", true)}
            {footer("Signat. du resp.", () => "", true)}
          </tfoot>
        </table>
        <footer className="b-end">
          <div>
            {cls.level === FINAL.level && (
              <table className="b-final">
                <thead><tr><th>RÉSULTAT FINAL</th><th>POINTS OBT.</th><th>MAX</th></tr></thead>
                <tbody>
                  <tr><th scope="row">MOYENNE ÉCOLE{ecoleComputed ? " **" : ""}</th><td>{dec(ecole)}</td><td>{FINAL.max}</td></tr>
                  <tr><th scope="row">ENAFEP</th><td>{dec(enafep)}</td><td>{FINAL.max}</td></tr>
                  <tr className="b-strong"><th scope="row">TOTAL</th><td>{ecole != null && enafep != null ? dec(Math.round((ecole + enafep) * 10) / 10) : ""}</td><td>{FINAL.max * 2}</td></tr>
                </tbody>
              </table>
            )}
            <p className={decided && !pass ? "b-struck" : undefined}>– L&apos;élève passe dans la classe supérieure</p>
            <p className={decided && pass ? "b-struck" : undefined}>– L&apos;élève double la classe</p>
            {subjects.some((x) => x.optional) && <p className="b-note">* Branche facultative.</p>}
            {cls.level === FINAL.level && ecoleComputed && <p className="b-note">** Pourcentage de l&apos;année divisé par 2 (pas de moyenne école saisie).</p>}
          </div>
          <div className="b-sign">
            <p>Fait à ........................................, le ..... / ..... / ..........</p>
            <p>Sceau de l&apos;École</p>
            <p><b>Le Chef d&apos;Établissement</b><br />Noms et signature</p>
          </div>
        </footer>
      </article>
    );
  };

  return (
    <div className="stack marks-root bulletin-root">
      {nav}
      <div className="no-print b-bar">
        <div>
          <h2>{tr("marks.bulletinTitle")}</h2>
          <p className="muted">{tr("marks.bulletinIntro")}</p>
        </div>
        <span className="b-actions">
          <PrintButton label={tr("marks.print")} />
          <Link className="btn ghost sm" href={`${base}/results?class=${cls.id}`}>{tr("marks.backToClass")}</Link>
        </span>
      </div>
      {(!school?.ministryCode || !school?.province) && <div className="no-print"><Notice tone="warning">{tr("marks.bulletinSchoolMissing")} <Link href={`/${locale}/schools/${p.siteId}/setup#school`}>{tr("setup.school")}</Link></Notice></div>}
      {shown.length === 0 ? <EmptyRow icon="users" title={tr("ux.noRoster")} /> : shown.map((s) => card(s.id))}
    </div>
  );
}
