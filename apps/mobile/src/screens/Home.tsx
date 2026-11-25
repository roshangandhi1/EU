import type { Locale } from "@eu/core/i18n";
import { useContext, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Body, Button, EuBand, Screen, Title } from "../ui";
import { LocaleContext, useT } from "../i18n";
import type { Session } from "../session";
import { ModuleTiles, useModuleTiles } from "../modules/field";
import { SchoolsApp, useHasSchools } from "../modules/schools";

/**
 * Home: who is signed in, sync status, and (later) one tile per module the user can use.
 * Module screens live in src/modules/{schools,forestry,boreholes}.
 */
export function Home({ session }: { session: Session }) {
  const t = useT();
  const { locale, setLocale } = useContext(LocaleContext);
  const [module, setModule] = useState<"schools" | null>(null);
  const hasSchools = useHasSchools(session);
  const st = session.status;
  const when = st.lastOk ? new Date(st.lastOk).toLocaleString(locale) : null;
  const tiles = useModuleTiles(session);
  const [open, setOpen] = useState<ReactNode>(null);
  if (open) return <>{open}</>;

  if (module === "schools") return <SchoolsApp session={session} onExit={() => setModule(null)} />;

  return (
    <Screen>
      <Title>{t("common.appName")}</Title>
      {session.user && <Body tone="muted">{t("auth.signedInAs", { name: session.user.name })}</Body>}

      <View style={{ gap: 6 }}>
        {st.pending > 0 ? <Body tone="warning">{t("sync.waiting", { count: st.pending })}</Body> : <Body tone="good">{t("sync.synced")}</Body>}
        {st.photosPending > 0 && <Body tone="warning">{t("sync.photosWaiting", { count: st.photosPending })}</Body>}
        <Body tone="muted">{when ? t("sync.lastSync", { time: when }) : t("sync.never")}</Body>
        {st.offline && <Body tone="muted">{t("sync.offline")}</Body>}
        {st.last && !st.last.ok && !st.offline && <Body tone="critical">{t("sync.failed")}</Body>}
        {st.last?.clockSuspect && <Body tone="critical">{t("sync.clockSuspect")}</Body>}
        {st.rejected > 0 && (
          <>
            <Body tone="critical">{t("sync.rejected", { count: st.rejected })}</Body>
            <Body tone="muted">{t("sync.rejectedHint")}</Body>
          </>
        )}
      </View>

      {hasSchools && <Button label={t("schools.nav.schools")} onPress={() => setModule("schools")} />}
      <ModuleTiles tiles={tiles} onOpen={(tile) => setOpen(tile.open(() => setOpen(null)))} />

      <Button label={st.running ? t("sync.syncing") : t("sync.syncNow")} onPress={() => void session.syncNow()} disabled={st.running} />
      <Button
        kind="secondary"
        label={`${t("common.language")}: ${locale === "fr" ? "English" : "Français"}`}
        onPress={() => setLocale((locale === "fr" ? "en" : "fr") as Locale)}
      />
      <EuBand text={t("common.fundedByEu")} />
    </Screen>
  );
}

export function Revoked() {
  const t = useT();
  return (
    <Screen>
      <Title>{t("common.appName")}</Title>
      <Body tone="critical">{t("sync.deviceRevoked")}</Body>
    </Screen>
  );
}
