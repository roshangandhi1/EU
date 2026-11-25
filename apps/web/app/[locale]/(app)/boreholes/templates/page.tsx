import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { isLocale, t } from "@eu/core/i18n";
import { loadTemplates } from "@eu/boreholes/server";
import { currentPrincipal } from "@/lib/session";
import { db } from "@/lib/http";
import { permissions } from "@/lib/registry";
import { TemplateEditor } from "./template-editor";
import { loadBoreholes } from "@eu/boreholes/server";
import { NoAccess } from "@/components/no-access";
import { titled } from "@/lib/meta";
import { intlLocale } from "@/lib/format";
import { todayDrc } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const generateMetadata = titled("boreholes.template.title");

const KEYS = ["task", "label_en", "label_fr", "frequency", "proof", "applies", "fail_fault", "add", "remove", "save", "saved", "builtin", "remove_confirm", "advanced", "label_hint", "pumps_all", "pumps_some", "pumps_hint"] as const;
const ERRS = ["label", "key", "key_dup", "min_max", "reading", "frequency", "task", "empty"] as const;

export default async function TemplatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  if (!permissions.can(me.user, "boreholes.template.write", { stream: "boreholes" })) return <NoAccess locale={locale} reason={t(locale, "boreholes.forbidden")} />;
  const [templates, boreholes] = await Promise.all([loadTemplates(db()), loadBoreholes(db(), todayDrc(), "captured", todayDrc())]);
  const pumps = [...new Set(boreholes.rows.map((b) => b.pumpRatingKw).filter((x): x is number => typeof x === "number" && x > 0))];
  const months = Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(2026, m, 1)).toLocaleDateString(intlLocale(locale), { month: "long", timeZone: "UTC" }));
  return (
    <section className="module" data-stream="boreholes">
      <PageHeader icon={<Icon name="wrench" size={24} />} title={t(locale, "boreholes.template.title")} />
      {templates.map((tpl) => (
        <TemplateEditor
          key={tpl.templateKey}
          locale={locale}
          template={tpl}
          pumps={pumps}
          versionLabel={tpl.templateVersion === 0 ? t(locale, "boreholes.template.builtin") : t(locale, "boreholes.template.version", { n: tpl.templateVersion })}
          labels={{
            ...Object.fromEntries(KEYS.map((k) => [k, t(locale, `boreholes.template.${k}`)])),
            freq: Object.fromEntries(["each_visit", "every_n_days", "every_n_months", "yearly"].map((k) => [k, t(locale, `boreholes.freq.${k}`)])),
            proofs: Object.fromEntries(["tick", "reading", "photo"].map((k) => [k, t(locale, `boreholes.proof.${k}`)])),
            all: t(locale, "boreholes.applies.all"), pumps: t(locale, "boreholes.applies.pumps"),
            unit: t(locale, "boreholes.unit"), min: t(locale, "boreholes.min"), max: t(locale, "boreholes.max"),
            n: t(locale, "boreholes.n"), day: t(locale, "boreholes.day"), month: t(locale, "boreholes.month"), key: t(locale, "boreholes.key"),
            error: t(locale, "boreholes.error"),
            nDays: t(locale, "ui.form.nDays"), nMonths: t(locale, "ui.form.nMonths"), taskN: t(locale, "ui.form.taskN"), tasks: t(locale, "ui.form.tasks"), tasks_one: t(locale, "ui.form.tasks_one"),
            cancel: t(locale, "ui.form.cancel"), leave: t(locale, "ui.form.leaveConfirm"), network: t(locale, "ui.login.network"), months,
            errors: Object.fromEntries(ERRS.map((k) => [k, t(locale, `boreholes.template.err.${k}`)])),
            unsaved: t(locale, "ui.form.unsaved"), savedAll: t(locale, "ui.form.savedAll"), saving: t(locale, "ui.form.saving"), keyHint: t(locale, "ui.form.keyHint"), optional: t(locale, "ui.form.optional"),
          } as never}
        />
      ))}
    </section>
  );
}
