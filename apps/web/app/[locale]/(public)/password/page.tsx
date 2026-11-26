import { redirect } from "next/navigation";
import { isLocale, t } from "@eu/core/i18n";
import { AuthLayout } from "@/components/shell/public-chrome";
import { currentPrincipal } from "@/lib/session";
import { titled } from "@/lib/meta";
import { PasswordForm } from "./form";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const generateMetadata = titled("ui.password.title");

/** Change your own password. Also where someone lands when an admin set their password. */
export default async function PasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await currentPrincipal({ allowPasswordChange: true });
  if (!me) redirect(`/${locale}/login`);
  const p = (k: string) => t(locale, `ui.password.${k}`);
  const forced = me.mustChangePassword;
  const keys = ["current", "currentForced", "next", "nextHint", "confirm", "submit", "busy", "done", "back", "signOut"] as const;
  const errs = ["wrong_password", "locked", "weak_password", "same_password", "mismatch", "network", "unknown"] as const;
  return (
    <AuthLayout locale={locale} path="password">
      <h1>{p(forced ? "forcedTitle" : "title")}</h1>
      {forced && <Notice tone="warning">{p("forcedIntro")}</Notice>}
      <p className="muted small">{t(locale, "auth.signedInAs", { name: me.name })} · {me.email}</p>
      <PasswordForm
        locale={locale}
        forced={forced}
        labels={{ ...Object.fromEntries(keys.map((k) => [k, p(k)])), intro: p("intro") } as never}
        errors={Object.fromEntries(errs.map((k) => [k, p(`err.${k}`)]))}
      />
    </AuthLayout>
  );
}
