import { isLocale, t } from "@eu/core/i18n";
import { SetupForm } from "./form";
import { AuthLayout } from "@/components/shell/public-chrome";

export default async function SetupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  return (
    <AuthLayout locale={locale} path="setup">
      <h1>{t(locale, "setup.title")}</h1>
      <p>{t(locale, "setup.intro")}</p>
      <SetupForm
        locale={locale}
        labels={{
          token: t(locale, "setup.token"),
          name: t(locale, "setup.name"),
          email: t(locale, "common.email"),
          password: t(locale, "common.password"),
          submit: t(locale, "common.save"),
          done: t(locale, "setup.done"),
          closed: t(locale, "setup.closed"),
        }}
      />
    </AuthLayout>
  );
}
