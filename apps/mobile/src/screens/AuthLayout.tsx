import { colors, space } from "@eu/core/tokens";
import type { Locale } from "@eu/core/i18n";
import { useContext, type ReactNode } from "react";
import { Image, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from "react-native";
import { LocaleContext, useT } from "../i18n";
import { EuBand, LanguageSwitch, TOP, ui } from "../ui";

/** Branded frame for sign-in and PIN screens: green hero with the logo, a white form card, the EU band. */
export function AuthLayout({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  const t = useT();
  const { locale, setLocale } = useContext(LocaleContext);
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: ui.page }} behavior="height">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={s.hero}>
          <View style={s.langRow}>
            <LanguageSwitch locale={locale} onChange={(l) => setLocale(l as Locale)} onDark />
          </View>
          <Image source={require("../../assets/logo-white.png")} style={s.logo} resizeMode="contain" accessibilityLabel="GoCongo" />
          <Text style={s.tagline}>{t("app.tagline")}</Text>
          <View style={s.stripe}>
            <View style={[s.stripeBit, { backgroundColor: colors.gcLime }]} />
            <View style={[s.stripeBit, { backgroundColor: colors.gcYellow }]} />
            <View style={[s.stripeBit, { backgroundColor: colors.gcOrange }]} />
          </View>
        </View>
        <View style={s.card}>
          <Text style={s.title}>{title}</Text>
          {intro && <Text style={s.intro}>{intro}</Text>}
          {children}
        </View>
        <View style={s.foot}>
          <EuBand text={t("common.fundedByEu")} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: colors.gcGreen, paddingTop: TOP, paddingHorizontal: space.lg, paddingBottom: 56, alignItems: "center" },
  langRow: { alignSelf: "stretch", alignItems: "flex-end", marginBottom: space.lg },
  logo: { width: 240, height: 80 },
  tagline: { color: "rgba(255,255,255,0.9)", fontSize: 14, marginTop: space.sm, textAlign: "center" },
  stripe: { flexDirection: "row", gap: 6, marginTop: space.md },
  stripeBit: { width: 28, height: 4, borderRadius: 2 },
  card: { backgroundColor: colors.surface, marginHorizontal: space.md, marginTop: -36, borderRadius: 20, padding: space.lg, gap: space.md, borderWidth: 1, borderColor: "#E4E8E1" },
  title: { fontSize: 24, fontWeight: "800", color: colors.text },
  intro: { fontSize: 15, lineHeight: 21, color: colors.textMuted },
  foot: { marginTop: "auto", paddingHorizontal: space.md, paddingTop: space.lg, paddingBottom: space.md },
});
