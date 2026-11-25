import type { Locale } from "@eu/core/i18n";
import { colors, space, streamAccent } from "@eu/core/tokens";
import { useContext, useState, type ReactNode } from "react";
import { StatusBar } from "expo-status-bar";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { canLoadDemo, mainRoleKey, MODULES, modulesFor, type ModuleKey } from "../access";
import { API_BASE } from "../config";
import { LocaleContext, useT } from "../i18n";
import { openModule, useModuleCounts, type ModuleCounts } from "../modules/field";
import type { Session } from "../session";
import { BackBar, Body, BrandBar, Button, Card, EmptyState, EuBand, LanguageSwitch, Pill, Screen, Subtitle, TOP, Title, ui } from "../ui";

const ICON: Record<ModuleKey, string> = { schools: "🏫", boreholes: "💧", bamboo: "🎋", miombo: "🌳" };
const WEB_PATH: Record<ModuleKey, string> = { schools: "schools", boreholes: "boreholes", bamboo: "forestry/bamboo", miombo: "forestry/miombo" };
const COUNT_KEY: Record<ModuleKey, string> = { schools: "app.countSchools", boreholes: "app.countBoreholes", bamboo: "app.countPlots", miombo: "app.countPlots" };
const EMPTY_KEY: Record<ModuleKey, string> = { schools: "app.emptySchools", boreholes: "app.emptyBoreholes", bamboo: "app.emptyPlots", miombo: "app.emptyPlots" };

/** Home: who is signed in, sync status, and one tile per module the person's roles cover. */
export function Home({ session }: { session: Session }) {
  const t = useT();
  const { locale, setLocale } = useContext(LocaleContext);
  const counts = useModuleCounts(session);
  const [open, setOpen] = useState<ModuleKey | null>(null);
  const [empty, setEmpty] = useState<ModuleKey | null>(null);

  if (open)
    return (
      <View style={s.moduleFrame}>
        <StatusBar style="dark" />
        {openModule(open, session, () => setOpen(null))}
      </View>
    );
  if (empty)
    return (
      <>
        <StatusBar style="dark" />
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
            <Pressable accessibilityRole="button" onPress={() => session.lock()} style={s.lock}>
              <Text style={s.lockText} accessibilityLabel={t("app.lock")}>🔒</Text>
            </Pressable>
          </>
        }
      />
      <ScrollView contentContainerStyle={s.body}>
        <View>
          <Title>{session.user ? t("app.hello", { name: session.user.name }) : t("common.appName")}</Title>
          {role && <Body tone="muted">{t(role)}</Body>}
        </View>

        <SyncCard session={session} />

        {counts?.demo && <Pill label={t("app.demoBadge")} tone="warning" />}

        <Subtitle>{t("app.modules")}</Subtitle>
        {shown.length === 0 ? (
          <Card>
            <Body>{t("app.noModules")}</Body>
          </Card>
        ) : (
          <View style={s.grid}>
            {shown.map((m) => (
              <Tile
                key={m}
                module={m}
                label={t(`app.${m}`)}
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

function Tile({ module, label, detail, onPress }: { module: ModuleKey; label: string; detail: string; onPress: () => void }) {
  const accent = streamAccent[module];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${detail}`} onPress={onPress} android_ripple={{ color: colors.border }} style={({ pressed }) => [s.tile, pressed && { backgroundColor: "#EEF3EA" }]}>
      <View style={[s.tileBar, { backgroundColor: accent }]} />
      <View style={[s.tileIcon, { backgroundColor: `${accent}33` }]}>
        <Text style={s.tileEmoji}>{ICON[module]}</Text>
      </View>
      <Text style={s.tileLabel}>{label}</Text>
      <Text style={s.tileDetail}>{detail}</Text>
    </Pressable>
  );
}

function SyncCard({ session }: { session: Session }) {
  const t = useT();
  const { locale } = useContext(LocaleContext);
  const st = session.status;
  const when = st.lastOk ? new Date(st.lastOk).toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) : null;
  const pill = st.running ? (
    <Pill label={t("sync.syncing")} tone="muted" />
  ) : st.offline ? (
    <Pill label={t("sync.offline").split(".")[0]!} tone="warning" />
  ) : st.last && !st.last.ok ? (
    <Pill label={t("sync.failed")} tone="critical" />
  ) : st.pending > 0 ? (
    <Pill label={t("sync.waiting", { count: st.pending })} tone="warning" />
  ) : st.lastOk ? (
    <Pill label={t("app.allSynced")} tone="good" />
  ) : (
    <Pill label={t("sync.never")} tone="muted" />
  );
  const notes: ReactNode[] = [];
  if (st.nextCutoff && Date.parse(st.nextCutoff.at) - Date.now() < 7 * 86_400_000)
    notes.push(<Body key="cut" tone="warning">{t("sync.cutoffSoon", { time: new Date(st.nextCutoff.at).toLocaleString(locale), label: st.nextCutoff.label })}</Body>);
  if (st.photosPending > 0) notes.push(<Body key="ph" tone="warning">{t("sync.photosWaiting", { count: st.photosPending })}</Body>);
  if (st.offline) notes.push(<Body key="off" tone="muted">{t("sync.offline")}</Body>);
  if (st.last?.clockSuspect) notes.push(<Body key="clk" tone="critical">{t("sync.clockSuspect")}</Body>);
  if (st.rejected > 0)
    notes.push(
      <View key="rej">
        <Body tone="critical">{t("sync.rejected", { count: st.rejected })}</Body>
        <Body tone="muted">{t("sync.rejectedHint")}</Body>
      </View>,
    );
  return (
    <Card accent={colors.gcGreen}>
      <Subtitle>{t("app.syncCard")}</Subtitle>
      {pill}
      <Body tone="muted">{when ? t("sync.lastSync", { time: when }) : t("sync.never")}</Body>
      {notes}
      <Button kind="secondary" label={st.running ? t("sync.syncing") : t("sync.syncNow")} onPress={() => void session.syncNow()} disabled={st.running} />
    </Card>
  );
}

function DemoCard({ session }: { session: Session }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Card accent={colors.gcOrange}>
      <Subtitle>{t("app.demoTitle")}</Subtitle>
      <Body>{t("app.demoIntro")}</Body>
      {msg && <Body tone={msg === "app.demoLoaded" ? "good" : "critical"}>{t(msg)}</Body>}
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
    <Screen scroll>
      <BackBar label={t("app.back")} onBack={onBack} />
      <Title>{t(`app.${module}`)}</Title>
      <Card accent={streamAccent[module]}>
        <EmptyState icon={ICON[module]} title={t("app.emptyTitle")}>
          <Body>{t(EMPTY_KEY[module])}</Body>
          <Body tone="muted">{t("app.emptyAskAdmin")}</Body>
        </EmptyState>
        {canLoadDemo(session.roles) && <Button label={t("app.openWeb")} onPress={() => void Linking.openURL(`${API_BASE}/${locale}/${WEB_PATH[module]}`)} />}
        <Button kind="secondary" label={session.status.running ? t("sync.syncing") : t("app.syncAgain")} disabled={session.status.running} onPress={() => void session.syncNow()} />
      </Card>
      {total === 0 && canLoadDemo(session.roles) && <DemoCard session={session} />}
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

const s = StyleSheet.create({
  moduleFrame: { flex: 1, backgroundColor: colors.surface, paddingTop: Math.max(0, TOP - space.xl) },
  body: { padding: space.md, gap: space.md, flexGrow: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space.md },
  tile: { width: "48%", minHeight: 150, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: "#E4E8E1", padding: space.md, paddingTop: space.md + 6, gap: 6, overflow: "hidden" },
  tileBar: { position: "absolute", top: 0, left: 0, right: 0, height: 6 },
  tileIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  tileEmoji: { fontSize: 28 },
  tileLabel: { fontSize: 18, fontWeight: "800", color: colors.text },
  tileDetail: { fontSize: 14, color: colors.textMuted },
  lock: { minHeight: 36, minWidth: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, borderRadius: 999, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)" },
  lockText: { color: colors.surface, fontWeight: "700", fontSize: 14 },
});
