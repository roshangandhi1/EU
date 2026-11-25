import { redirect } from "next/navigation";
import { isLocale, t } from "@eu/core/i18n";
import { currentPrincipal } from "@/lib/session";
import { SignOutButton } from "./sign-out";

export const dynamic = "force-dynamic";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  return (
    <section>
      <h1>{t(locale, "common.appName")}</h1>
      <p>{me.name}</p>
      <ul>
        {me.user.assignments.map((a, i) => (
          <li key={i}>
            {a.role} · {a.scope.type === "global" ? "global" : a.scope.type === "stream" ? a.scope.stream : a.scope.siteId}
          </li>
        ))}
      </ul>
      <SignOutButton label={t(locale, "common.signOut")} locale={locale} />
    </section>
  );
}
