import { colors, radius, space, touch } from "@eu/core/tokens";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

/** Small, dependency-free building blocks sized for gloved thumbs and cheap screens. */
export function Screen({ children }: { children: ReactNode }) {
  return <View style={s.screen}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}

export function Body({ children, tone }: { children: ReactNode; tone?: "muted" | "warning" | "critical" | "good" }) {
  const color =
    tone === "muted" ? colors.textMuted : tone === "warning" ? colors.statusWarning : tone === "critical" ? colors.statusCritical : tone === "good" ? colors.statusGood : colors.text;
  return <Text style={[s.body, { color }]}>{children}</Text>;
}

export function Button({ label, onPress, disabled, kind = "primary" }: { label: string; onPress: () => void; disabled?: boolean; kind?: "primary" | "secondary" }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[s.button, kind === "secondary" && s.buttonSecondary, disabled && s.disabled]}
    >
      <Text style={[s.buttonText, kind === "secondary" && s.buttonTextSecondary]}>{label}</Text>
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

/** Thin EU band at the bottom of every screen, as on the web. */
export function EuBand({ text }: { text: string }) {
  return (
    <View style={s.band}>
      <Text style={s.bandText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, padding: space.md, paddingTop: space.xl, gap: space.md },
  title: { fontSize: 22, fontWeight: "700", color: colors.gcGreen },
  body: { fontSize: touch.bodyText, lineHeight: 22 },
  button: { minHeight: touch.minTarget, borderRadius: radius.md, backgroundColor: colors.gcGreen, alignItems: "center", justifyContent: "center", paddingHorizontal: space.md },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.gcGreen },
  buttonText: { color: colors.surface, fontSize: touch.bodyText, fontWeight: "600" },
  buttonTextSecondary: { color: colors.gcGreen },
  disabled: { opacity: 0.5 },
  field: { gap: space.xs },
  label: { fontSize: 14, color: colors.textMuted },
  input: { minHeight: touch.minTarget, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.sm, fontSize: touch.bodyText, color: colors.text },
  band: { marginTop: "auto", backgroundColor: colors.euBlue, padding: space.sm, borderRadius: radius.sm },
  bandText: { color: colors.euYellow, fontSize: 13, textAlign: "center" },
});
