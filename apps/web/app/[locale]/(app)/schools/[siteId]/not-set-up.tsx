import Link from "next/link";
import type { Principal } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { can, tr as trFor } from "@/lib/schools";
import type { Locale } from "@eu/core/i18n";

/**
 * "This school is not set up yet": the next step depends on the role. Someone who can configure
 * gets a link to Setup; everyone else is told whom to ask, never pointed at a tab they cannot see.
 */
export function NotSetUp({ me, siteId, locale, what = "classes" }: { me: Principal; siteId: string; locale: Locale; what?: "classes" | "fees" }) {
  const tr = trFor(locale);
  if (can(me, "school.configure", siteId)) {
    return (
      <Notice tone="warning">
        {tr(what === "fees" ? "setupHint.feesCan" : "setupHint.classesCan")}{" "}
        <Link href={`/${locale}/schools/${siteId}/setup${what === "fees" ? "/fees" : "#classes"}`}>{tr("setupHint.goSetup")}</Link>
      </Notice>
    );
  }
  return <Notice tone="warning">{tr(what === "fees" ? "setupHint.feesAsk" : "setupHint.classesAsk")}</Notice>;
}
