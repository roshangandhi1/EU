import { isLocale, t } from "@eu/core/i18n";
import { LoginForm } from "./form";
import { AuthLayout } from "@/components/shell/public-chrome";
import { titled } from "@/lib/meta";

export const generateMetadata = titled("ui.meta.signIn");

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  return (
    <AuthLayout locale={locale} path="login">
      <h1>{t(locale, "common.signIn")}</h1>
      <LoginForm
        locale={locale}
        labels={{
          email: t(locale, "common.email"),
          password: t(locale, "common.password"),
          submit: t(locale, "common.signIn"),
          invalid: t(locale, "auth.invalid"),
          locked: t(locale, "auth.locked"),
          ...Object.fromEntries((["show", "hide", "showAria", "hideAria", "forgot", "network"] as const).map((k) => [k, t(locale, `ui.login.${k}`)])),
          busy: t(locale, "common.signIn") + "…",
        } as never}
      />
    </AuthLayout>
  );
}
