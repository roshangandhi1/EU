import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isLocale, t, type Locale } from "@eu/core/i18n";
import { criteriaFrom, type CriterionKey } from "@eu/boreholes";
import { loadBoreholes, loadSettings } from "@eu/boreholes/server";
import { currentPrincipal } from "@/lib/session";
import { db } from "@/lib/http";
import { permissions } from "@/lib/registry";
import { todayDrc } from "@/lib/dates";
import { NoAccess } from "@/components/no-access";
import { Icon } from "@/components/icons";
import { Field, Fields, FormFooter, Notice, PageHeader, Section, SubmitButton } from "@/components/ui";
import { titled } from "@/lib/meta";
import { saveCriteriaAction } from "./actions";

export const dynamic = "force-dynamic";
export const generateMetadata = titled("boreholes.cfg.title");

const SETUP: CriterionKey[] = ["commissioned", "water_quality", "caretaker", "sop", "gps", "population", "handover"];
const CHECK: CriterionKey[] = ["recent_check", "pump_delivers", "tank_taps", "flow_min", "photo"];

export default async function BoreholeSettingsPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { locale: l } = await params;
  if (!isLocale(l)) notFound();
  const locale: Locale = l;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  const b = (k: string, v?: Record<string, string | number>) => t(locale, `boreholes.${k}`, v);
  if (!permissions.can(me.user, "boreholes.settings.write", { stream: "boreholes" })) return <NoAccess locale={locale} reason={b("forbidden")} />;
  const canEdit = permissions.can(me.user, "boreholes.criteria.write", { stream: "boreholes" });
  const sp = await searchParams;
  const settings = await loadSettings(db());
  const cr = criteriaFrom(settings.criteria);
  const today = todayDrc();
  const { rows, counted } = await loadBoreholes(db(), today, "captured", today);
  const f = (k: string) => t(locale, `ui.form.${k}`);
  const box = (k: CriterionKey) => (
    <div key={k} className="fld s12 fld-bare"><span /><label className="check-row"><input type="checkbox" name="on" value={k} defaultChecked={cr.on[k]} disabled={!canEdit} /><span>{b(`cfg.c.${k}`)}</span></label><span /></div>
  );
  return (
    <section className="module" data-stream="boreholes">
      <Link className="back-link" href={`/${locale}/boreholes`}><Icon name="back" size={16} />{b("detail.back")}</Link>
      <PageHeader icon={<Icon name="wrench" size={24} />} eyebrow={b("title")} title={b("cfg.title")} subtitle={b("cfg.subtitle")} />
      {sp.ok === "saved" && <Notice tone="success">{b("cfg.saved")}</Notice>}
      {sp.error && <Notice tone="error">{sp.error === "invalid" ? b("cfg.invalid") : sp.error === "forbidden" ? b("cfg.admin_only") : b("err.unknown", { reason: sp.error })}</Notice>}
      {!canEdit && <Notice tone="info">{b("cfg.admin_only")}</Notice>}
      <Section id="criteria" icon="check" title={b("cfg.criteria")} description={b("cfg.criteria_intro")}>
        <p className="muted" style={{ marginTop: 0 }}>{b("cfg.preview", { n: counted, total: rows.length })}</p>
        <form action={saveCriteriaAction}>
          <input type="hidden" name="locale" value={locale} />
          <p className="fgroup">{b("cfg.group.setup")}</p>
          <Fields>
            {SETUP.map(box)}
            <Field span={6} label={b("cfg.wq_age")} optional={f("optional")} hint={b("cfg.wq_age_hint")}>
              <input name="wqMaxAgeDays" inputMode="numeric" pattern="[0-9 ]*" defaultValue={cr.waterQualityMaxAgeDays ?? ""} disabled={!canEdit} />
            </Field>
          </Fields>
          <p className="fgroup">{b("cfg.group.check")}</p>
          <Fields>
            {CHECK.map(box)}
            <Field span={6} label={b("cfg.window")} hint={b("cfg.check_note")}>
              <input name="maxCheckAgeDays" required inputMode="numeric" pattern="[0-9 ]*" defaultValue={settings.maxCheckAgeDays} disabled={!canEdit} />
            </Field>
          </Fields>
          {canEdit && <FormFooter><SubmitButton icon="check" pending={f("saving")}>{b("cfg.save")}</SubmitButton></FormFooter>}
        </form>
      </Section>
    </section>
  );
}
