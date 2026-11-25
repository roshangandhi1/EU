import { colors, radius, space, touch } from "@eu/core/tokens";
import { useEffect, type ReactNode } from "react";
import { BackHandler, Image, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

/**
 * Small, dependency-free building blocks sized for thumbs and cheap screens: no shadows or
 * blur (slow on 2 GB phones), flat colours from the shared tokens, 48 dp minimum targets.
 */
export const TOP = (StatusBar.currentHeight ?? 24) + space.sm;

export const ui = {
  page: colors.surfaceAlt,
  card: colors.surface,
  deep: "#124A23", // darker GoCongo green for pressed states and the hero
} as const;

export function Screen({ children, scroll, bare }: { children: ReactNode; scroll?: boolean; bare?: boolean }) {
  if (scroll)
    return (
      <ScrollView style={s.page} contentContainerStyle={[s.screen, bare && s.bare]} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    );
  return <View style={[s.page, s.screen, bare && s.bare]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={s.subtitle}>{children}</Text>;
}

export function Body({ children, tone }: { children: ReactNode; tone?: "muted" | "warning" | "critical" | "good" }) {
  const color =
    tone === "muted" ? colors.textMuted : tone === "warning" ? colors.statusWarning : tone === "critical" ? colors.statusCritical : tone === "good" ? colors.statusGood : colors.text;
  return <Text style={[s.body, { color }]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  disabled,
  kind = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  kind?: "primary" | "secondary" | "ghost";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: kind === "primary" ? ui.deep : colors.border }}
      style={({ pressed }) => [s.button, kind === "secondary" && s.buttonSecondary, kind === "ghost" && s.buttonGhost, pressed && kind === "primary" && { backgroundColor: ui.deep }, disabled && s.disabled]}
    >
      <Text style={[s.buttonText, kind !== "primary" && s.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, ...rest } = props;
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor={colors.textMuted} {...rest} />
    </View>
  );
}

export function Card({ children, accent }: { children: ReactNode; accent?: string }) {
  return <View style={[s.card, accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null]}>{children}</View>;
}

/** A small coloured status label: always words plus colour, never colour alone. */
export function Pill({ label, tone }: { label: string; tone: "good" | "warning" | "critical" | "muted" }) {
  const c = tone === "good" ? colors.statusGood : tone === "warning" ? colors.statusWarning : tone === "critical" ? colors.statusCritical : colors.textMuted;
  return (
    <View style={[s.pill, { borderColor: c }]}>
      <View style={[s.dot, { backgroundColor: c }]} />
      <Text style={[s.pillText, { color: c }]}>{label}</Text>
    </View>
  );
}

/** Green bar with the GoCongo wordmark, used at the top of the home screen. */
export function BrandBar({ right }: { right?: ReactNode }) {
  return (
    <View style={s.brandBar}>
      <Image source={require("../assets/logo-white.png")} style={s.brandLogo} resizeMode="contain" accessibilityLabel="GoCongo" />
      <View style={s.brandRight}>{right}</View>
    </View>
  );
}

/**
 * Back arrow at the top left of every sub-screen. While it is on screen, the Android back
 * button does the same thing, so the two always agree.
 */
export function BackBar({ onBack, label }: { onBack: () => void; label?: string }) {
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? "Back"}
      onPress={onBack}
      hitSlop={8}
      android_ripple={{ color: colors.border, borderless: true }}
      style={s.backBar}
    >
      <Text style={s.backArrow}>←</Text>
      {label ? <Text style={s.backLabel}>{label}</Text> : null}
    </Pressable>
  );
}

/** EN | FR switch. */
export function LanguageSwitch({ locale, onChange, onDark }: { locale: string; onChange: (l: "en" | "fr") => void; onDark?: boolean }) {
  return (
    <View style={[s.lang, onDark && { borderColor: "rgba(255,255,255,0.6)" }]}>
      {(["fr", "en"] as const).map((l) => {
        const on = l === locale;
        return (
          <Pressable
            key={l}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(l)}
            style={[s.langItem, on && { backgroundColor: onDark ? colors.surface : colors.gcGreen }]}
          >
            <Text style={[s.langText, { color: on ? (onDark ? colors.gcGreen : colors.surface) : onDark ? colors.surface : colors.gcGreen }]}>{l.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** EU flag drawn with views and text: no image, crisp on any screen. */
export function EuFlag({ width = 42 }: { width?: number }) {
  const h = (width * 2) / 3;
  const r = h / 3;
  const size = Math.max(6, h / 7);
  return (
    <View style={{ width, height: h, backgroundColor: colors.euBlue }} accessibilityLabel="EU">
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * 2 * Math.PI;
        return (
          <Text
            key={i}
            style={{ position: "absolute", left: width / 2 + r * Math.sin(a) - size / 2, top: h / 2 - r * Math.cos(a) - size * 0.7, fontSize: size, lineHeight: size * 1.3, color: colors.euYellow }}
          >
            ★
          </Text>
        );
      })}
    </View>
  );
}

/** "Funded by the European Union" with the flag, at the foot of every screen, as on the web. */
export function EuBand({ text }: { text: string }) {
  return (
    <View style={s.band}>
      <EuFlag width={36} />
      <Text style={s.bandText}>{text}</Text>
    </View>
  );
}

/** Full-screen message with an icon, for "nothing here yet" and similar. */
export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyIcon}>{icon}</Text>
      <Text style={s.emptyTitle}>{title}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: ui.page },
  screen: { padding: space.md, paddingTop: TOP, gap: space.md, flexGrow: 1 },
  bare: { padding: 0, paddingTop: 0, gap: 0 },
  title: { fontSize: 22, fontWeight: "700", color: colors.gcGreen },
  subtitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  body: { fontSize: touch.bodyText, lineHeight: 22 },
  button: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: colors.gcGreen,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
    overflow: "hidden",
  },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.gcGreen },
  buttonGhost: { backgroundColor: "transparent", minHeight: touch.minTarget },
  buttonText: { color: colors.surface, fontSize: touch.bodyText, fontWeight: "700" },
  buttonTextSecondary: { color: colors.gcGreen },
  disabled: { opacity: 0.45 },
  field: { gap: space.xs },
  label: { fontSize: 14, fontWeight: "600", color: colors.text },
  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: space.md,
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: space.sm, borderWidth: 1, borderColor: "#E4E8E1" },
  pill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 14, fontWeight: "700" },
  brandBar: { backgroundColor: colors.gcGreen, paddingTop: TOP, paddingBottom: space.md, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center" },
  brandLogo: { width: 112, height: 38 },
  brandRight: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: space.sm },
  lang: { flexDirection: "row", borderWidth: 1.5, borderColor: colors.gcGreen, borderRadius: 999, overflow: "hidden" },
  langItem: { minWidth: 44, minHeight: 36, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  langText: { fontSize: 14, fontWeight: "700" },
  band: { marginTop: "auto", flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  bandText: { color: colors.euBlue, fontSize: 13, fontWeight: "600", flexShrink: 1 },
  backBar: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: touch.minTarget, paddingRight: space.sm, marginLeft: -4 },
  backArrow: { fontSize: 28, lineHeight: 32, color: colors.gcGreen, fontWeight: "700" },
  backLabel: { fontSize: 17, color: colors.gcGreen, fontWeight: "700" },
  empty: { alignItems: "center", gap: space.md, paddingVertical: space.xl, paddingHorizontal: space.md },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center" },
});
