import { notFound, redirect } from "next/navigation";
import { isLocale, t } from "@eu/core/i18n";
import { loadTemplates } from "@eu/boreholes/server";
import { currentPrincipal } from "@/lib/session";
import { db } from "@/lib/http";
import { permissions } from "@/lib/registry";
import { TemplateEditor } from "./template-editor";

export const dynamic = "force-dynamic";

const KEYS = ["task", "label_en", "label_fr", "frequency", "proof", "applies", "fail_fault", "add", "remove", "save", "saved", "builtin"] as const;

export default async function TemplatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  if (!permissions.can(me.user, "boreholes.template.write", { stream: "boreholes" })) return <p className="error">{t(locale, "boreholes.forbidden")}</p>;
  const templates = await loadTemplates(db());
  return (
    <section className="module" data-stream="boreholes">
      <h1>{t(locale, "boreholes.template.title")}</h1>
      {templates.map((tpl) => (
        <TemplateEditor
          key={tpl.templateKey}
          locale={locale}
          template={tpl}
          versionLabel={tpl.templateVersion === 0 ? t(locale, "boreholes.template.builtin") : t(locale, "boreholes.template.version", { n: tpl.templateVersion })}
          labels={{
            ...Object.fromEntries(KEYS.map((k) => [k, t(locale, `boreholes.template.${k}`)])),
            freq: Object.fromEntries(["each_visit", "every_n_days", "every_n_months", "yearly"].map((k) => [k, t(locale, `boreholes.freq.${k}`)])),
            proofs: Object.fromEntries(["tick", "reading", "photo"].map((k) => [k, t(locale, `boreholes.proof.${k}`)])),
            all: t(locale, "boreholes.applies.all"), pumps: t(locale, "boreholes.applies.pumps"),
            unit: t(locale, "boreholes.unit"), min: t(locale, "boreholes.min"), max: t(locale, "boreholes.max"),
            n: t(locale, "boreholes.n"), day: t(locale, "boreholes.day"), month: t(locale, "boreholes.month"), key: t(locale, "boreholes.key"),
            error: t(locale, "boreholes.error"),
          } as never}
        />
      ))}
    </section>
  );
}
