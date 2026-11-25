import { isLocale, t } from "@eu/core/i18n";
import { LoginForm } from "./form";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  return (
    <section className="card narrow">
      <h1>{t(locale, "common.signIn")}</h1>
      <LoginForm
        locale={locale}
        labels={{
          email: t(locale, "common.email"),
          password: t(locale, "common.password"),
          submit: t(locale, "common.signIn"),
          invalid: t(locale, "auth.invalid"),
          locked: t(locale, "auth.locked"),
        }}
      />
    </section>
  );
}
