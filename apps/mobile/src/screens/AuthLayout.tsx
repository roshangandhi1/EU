import { colors, space } from "@eu/core/tokens";
import type { Locale } from "@eu/core/i18n";
import { useContext, type ReactNode } from "react";
import { Image, KeyboardAvoidingView, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LocaleContext, useT } from "../i18n";
import { EuBand, LanguageSwitch, LeafStripe, Txt, ui } from "../ui";

/** Branded frame for sign-in and PIN screens: green hero with the logo, a white form card, the EU band. */
export function AuthLayout({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  const t = useT();
  const { locale, setLocale } = useContext(LocaleContext);
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: ui.page }} behavior="height">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={[s.hero, { paddingTop: insets.top + space.sm }]}>
          <View style={s.langRow}>
            <LanguageSwitch locale={locale} onChange={(l) => setLocale(l as Locale)} onDark />
          </View>
          <Image source={require("../../assets/logo-white.png")} style={s.logo} resizeMode="contain" accessibilityLabel="GoCongo" />
          <Txt variant="small" color="rgba(255,255,255,0.88)" center style={{ marginTop: space.sm }}>{t("app.tagline")}</Txt>
          <View style={{ marginTop: space.md }}>
            <LeafStripe />
          </View>
        </View>
        <View style={s.card}>
          <View style={{ gap: 6 }}>
            <Txt variant="title">{title}</Txt>
            {intro ? <Txt tone="muted">{intro}</Txt> : null}
          </View>
          {children}
        </View>
        <View style={[s.foot, { paddingBottom: space.md + insets.bottom }]}>
          <EuBand text={t("common.fundedByEu")} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: colors.gcGreen, paddingHorizontal: space.lg, paddingBottom: 56, alignItems: "center" },
  langRow: { alignSelf: "stretch", alignItems: "flex-end", marginBottom: space.md },
  logo: { width: 220, height: 74 },
  card: { backgroundColor: colors.surface, marginHorizontal: space.md, marginTop: -36, borderRadius: 20, padding: space.lg, gap: space.md, borderWidth: 1, borderColor: ui.line },
  foot: { marginTop: "auto", paddingHorizontal: space.md, paddingTop: space.lg },
});
