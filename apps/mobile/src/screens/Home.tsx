import type { Locale } from "@eu/core/i18n";
import { colors, space, streamAccent } from "@eu/core/tokens";
import { useContext, useState, type ReactNode } from "react";
import { StatusBar } from "expo-status-bar";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { canLoadDemo, mainRoleKey, MODULES, modulesFor, type ModuleKey } from "../access";
import { API_BASE } from "../config";
import { LocaleContext, useT } from "../i18n";
import { openModule, useModuleCounts, type ModuleCounts } from "../modules/field";
import type { Session } from "../session";
import type { IconName } from "../icons";
import { Body, BrandBar, Button, Card, EmptyState, EuBand, Header, IconBadge, IconButton, LanguageSwitch, Notice, Page, Screen, StatusChip, Title, Txt, ui, type Tone } from "../ui";
import { SyncProblems } from "./SyncProblems";

export const MODULE_ICON: Record<ModuleKey, IconName> = { schools: "school", boreholes: "drop", bamboo: "bamboo", miombo: "tree" };
const WEB_PATH: Record<ModuleKey, string> = { schools: "schools", boreholes: "boreholes", bamboo: "forestry/bamboo", miombo: "forestry/miombo" };
const COUNT_KEY: Record<ModuleKey, string> = { schools: "app.countSchools", boreholes: "app.countBoreholes", bamboo: "app.countPlots", miombo: "app.countPlots" };
const EMPTY_KEY: Record<ModuleKey, string> = { schools: "app.emptySchools", boreholes: "app.emptyBoreholes", bamboo: "app.emptyPlots", miombo: "app.emptyPlots" };

/** Home: who is signed in, sync status, and one tile per module the person's roles cover. */
export function Home({ session }: { session: Session }) {
  const t = useT();
  const { locale, setLocale } = useContext(LocaleContext);
  const counts = useModuleCounts(session);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<ModuleKey | null>(null);
  const [empty, setEmpty] = useState<ModuleKey | null>(null);
  const [problems, setProblems] = useState(false);

  if (open)
    return (
      <View style={s.moduleFrame}>
        <StatusBar style="light" />
        {openModule(open, session, () => setOpen(null))}
      </View>
    );
  if (problems)
    return (
      <>
        <StatusBar style="light" />
        <SyncProblems session={session} onBack={() => setProblems(false)} />
      </>
    );
  if (empty)
    return (
      <>
        <StatusBar style="light" />
        <EmptyModule session={session} module={empty} counts={counts} onBack={() => setEmpty(null)} />
      </>
    );

  const allowed = modulesFor(session.roles);
  // Show a module the roles point to, or one the server has sent records for.
  const shown = MODULES.filter((m) => allowed.has(m) || (counts?.[m] ?? 0) > 0);
  const total = counts ? MODULES.reduce((n, m) => n + counts[m], 0) : null;
  const role = mainRoleKey(session.roles);

  return (
    <View style={{ flex: 1, backgroundColor: ui.page }}>
      <BrandBar
        right={
          <>
            <LanguageSwitch locale={locale} onChange={(l) => setLocale(l as Locale)} onDark />
            <IconButton icon="lock" label={t("app.lock")} onPress={() => session.lock()} onDark />
          </>
        }
      />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: space.md + insets.bottom }]}>
        <View style={{ gap: 2 }}>
          <Txt variant="display">{session.user ? t("app.hello", { name: session.user.name }) : t("common.appName")}</Txt>
          {role && <Txt tone="muted">{t(role)}</Txt>}
        </View>

        <SyncCard session={session} onProblems={() => setProblems(true)} />

        <View style={s.sectionHead}>
          <Txt variant="heading">{t("app.modules")}</Txt>
          {counts?.demo && <StatusChip label={t("app.demoBadge")} tone="warning" />}
        </View>
        {shown.length === 0 ? (
          <Notice tone="info">{t("app.noModules")}</Notice>
        ) : (
          <View style={s.grid}>
            {shown.map((m) => (
              <Tile
                key={m}
                module={m}
                label={t(`app.${m}`)}
                count={counts?.[m] ?? null}
                detail={counts == null ? "…" : counts[m] === 1 ? t(`${COUNT_KEY[m]}1`) : counts[m] > 1 ? t(COUNT_KEY[m], { count: counts[m] }) : t("app.emptyTile")}
                onPress={() => ((counts?.[m] ?? 0) > 0 ? setOpen(m) : setEmpty(m))}
              />
            ))}
          </View>
        )}

        {total === 0 && canLoadDemo(session.roles) && <DemoCard session={session} />}

        <EuBand text={t("common.fundedByEu")} />
      </ScrollView>
    </View>
  );
}

function Tile({ module, label, detail, count, onPress }: { module: ModuleKey; label: string; detail: string; count: number | null; onPress: () => void }) {
  const accent = streamAccent[module];
  const empty = count === 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${detail}`} onPress={onPress} android_ripple={{ color: colors.border }} style={({ pressed }) => [s.tile, pressed && { backgroundColor: "#EEF3EA" }]}>
      <View style={[s.tileBar, { backgroundColor: accent }]} />
      <IconBadge icon={MODULE_ICON[module]} color={accent} size={48} />
      <View style={{ gap: 2 }}>
        <Txt variant="heading">{label}</Txt>
        <Txt variant="small" tone={empty ? "warning" : "muted"}>{detail}</Txt>
      </View>
    </Pressable>
  );
}

function SyncCard({ session, onProblems }: { session: Session; onProblems: () => void }) {
  const t = useT();
  const { locale } = useContext(LocaleContext);
  const st = session.status;
  const when = st.lastOk ? new Date(st.lastOk).toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  const noNet = st.noInternet || (st.last && !st.last.ok && st.last.error === "offline");
  const [icon, tone, label]: [IconName, Tone, string] = st.running
    ? ["sync", "info", t("app.syncing")]
    : st.offline
      ? ["cloudOff", "warning", t("app.syncOffline")]
      : noNet
        ? ["cloudOff", "warning", t("app.syncNoInternet")]
        : st.last && !st.last.ok
        ? ["alert", "critical", t("app.syncFailedShort")]
        : st.pending > 0
          ? ["sync", "warning", t("app.syncWaiting", { count: st.pending })]
          : st.lastOk
            ? ["cloudOk", "good", t("app.allSynced")]
            : ["sync", "muted", t("app.syncNever")];
  const notes: ReactNode[] = [];
  if (st.nextCutoff && Date.parse(st.nextCutoff.at) - Date.now() < 7 * 86_400_000)
    notes.push(<Notice key="cut" tone="warning">{t("sync.cutoffSoon", { time: new Date(st.nextCutoff.at).toLocaleString(locale), label: st.nextCutoff.label })}</Notice>);
  if (st.photosPending > 0) notes.push(<Notice key="ph" tone="warning" icon="camera">{t("sync.photosWaiting", { count: st.photosPending })}</Notice>);
  if (st.offline || noNet) notes.push(<Txt key="off" variant="small" tone="muted">{t(st.offline ? "sync.offline" : "app.noInternetHint")}</Txt>);
  if (st.clockSuspect) notes.push(<Notice key="clk" tone="critical" title={t("app.clockTitle")}>{t("app.clockBody")}</Notice>);
  if (st.rejected > 0)
    notes.push(
      <Notice key="rej" tone="critical" title={t("sync.rejected", { count: st.rejected })}>
        <Txt>{t("app.rejectedHint")}</Txt>
        <Button kind="secondary" label={t("app.seeProblems")} iconAfter="chevronRight" onPress={onProblems} />
      </Notice>,
    );
  const colour = { good: colors.statusGood, warning: colors.statusWarningText, critical: colors.statusCritical, muted: colors.textMuted, info: colors.statusInfo }[tone];
  return (
    <Card>
      <View style={s.syncRow}>
        <IconBadge icon={icon} color={colour} size={44} />
        <View style={{ flex: 1, gap: 1 }}>
          <Txt weight={700} color={tone === "muted" ? colors.text : colour}>{label}</Txt>
          {st.pending > 0 && label !== t("app.syncWaiting", { count: st.pending }) ? (
            <Txt variant="small" weight={700} tone="warning">{t("app.syncWaiting", { count: st.pending })}</Txt>
          ) : null}
          {when ? <Txt variant="small" tone="muted">{t("app.lastSyncShort", { time: when })}</Txt> : null}
        </View>
      </View>
      {notes}
      <Button kind="secondary" icon="sync" label={st.running ? t("sync.syncing") : t("sync.syncNow")} onPress={() => void session.syncNow()} disabled={st.running} />
    </Card>
  );
}

function DemoCard({ session }: { session: Session }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Card accent={colors.gcOrange}>
      <Txt variant="heading">{t("app.demoTitle")}</Txt>
      <Txt>{t("app.demoIntro")}</Txt>
      {msg && <Body tone={msg === "app.demoLoaded" ? "good" : msg === "app.demoSyncFailed" ? "warning" : "critical"}>{t(msg)}</Body>}
      <Button
        label={busy ? t("app.demoLoading") : t("app.demoLoad")}
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void session.loadDemo().then((m) => {
            setMsg(m);
            setBusy(false);
          });
        }}
      />
    </Card>
  );
}

function EmptyModule({ session, module, counts, onBack }: { session: Session; module: ModuleKey; counts: ModuleCounts | null; onBack: () => void }) {
  const t = useT();
  const { locale } = useContext(LocaleContext);
  const total = counts ? MODULES.reduce((n, m) => n + counts[m], 0) : null;
  return (
    <Page header={<Header title={t(`app.${module}`)} onBack={onBack} backLabel={t("app.back")} accent={streamAccent[module]} />}>
      <Card>
        <EmptyState icon={MODULE_ICON[module]} color={streamAccent[module]} title={t("app.emptyTitle")}>
          <Txt center>{t(EMPTY_KEY[module])}</Txt>
          <Txt center variant="small" tone="muted">{t("app.emptyAskAdmin")}</Txt>
        </EmptyState>
        {canLoadDemo(session.roles) && <Button label={t("app.openWeb")} onPress={() => void Linking.openURL(`${API_BASE}/${locale}/${WEB_PATH[module]}`)} />}
        <Button kind="secondary" icon="sync" label={session.status.running ? t("sync.syncing") : t("app.syncAgain")} disabled={session.status.running} onPress={() => void session.syncNow()} />
      </Card>
      {total === 0 && canLoadDemo(session.roles) && <DemoCard session={session} />}
    </Page>
  );
}

export function Revoked({ session }: { session: Session }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <Screen>
      <Title>{t("common.appName")}</Title>
      <Notice tone="critical" title={t("sync.deviceRevoked")}>{t("app.revokedBody")}</Notice>
      <Button
        label={t("app.signInAgain")}
        busy={busy}
        onPress={() => {
          setBusy(true);
          void session.restart().finally(() => setBusy(false));
        }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  moduleFrame: { flex: 1, backgroundColor: ui.page },
  body: { padding: space.md, gap: space.md, flexGrow: 1 },
  sectionHead: { gap: 6, marginTop: space.xs },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  tile: { width: "48.3%", minHeight: 148, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: ui.line, padding: space.md, paddingTop: space.md + 4, gap: 12, overflow: "hidden", justifyContent: "space-between" },
  tileBar: { position: "absolute", top: 0, left: 0, right: 0, height: 5 },
  syncRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
