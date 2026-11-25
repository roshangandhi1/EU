import { colors, radius, space, touch } from "@eu/core/tokens";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

/** Schools-only pieces on top of src/ui.tsx. */
export function Scroll({ children }: { children: ReactNode }) {
  return <ScrollView contentContainerStyle={{ gap: space.sm, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}

export function Row({ title, detail, onPress, selected, right, onRightPress }: {
  title: string; detail?: string; onPress?: () => void; selected?: boolean; right?: string; onRightPress?: () => void;
}) {
  return (
    <View style={[s.row, selected && s.rowSelected]}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={onPress} style={s.rowMain} disabled={!onPress}>
        <Text style={[s.rowTitle, selected && s.rowTitleSelected]}>{title}</Text>
        {detail ? <Text style={s.rowDetail}>{detail}</Text> : null}
      </Pressable>
      {right ? (
        <Pressable accessibilityRole="button" onPress={onRightPress} style={s.chip} disabled={!onRightPress}>
          <Text style={s.chipText}>{right}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Choice<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.choices}>
      {options.map((o) => (
        <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: o.value === value }} onPress={() => onChange(o.value)}
          style={[s.choice, o.value === value && s.choiceOn]}>
          <Text style={[s.choiceText, o.value === value && s.choiceTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: touch.minTarget, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  rowSelected: { backgroundColor: "#FBEAEA", borderColor: colors.statusCritical },
  rowMain: { flex: 1, paddingVertical: space.sm, paddingHorizontal: space.sm },
  rowTitle: { fontSize: touch.bodyText, color: colors.text },
  rowTitleSelected: { color: colors.statusCritical, fontWeight: "600" },
  rowDetail: { fontSize: 13, color: colors.textMuted },
  chip: { minHeight: touch.minTarget, justifyContent: "center", paddingHorizontal: space.sm, borderLeftWidth: 1, borderLeftColor: colors.border },
  chipText: { fontSize: 14, color: colors.statusCritical },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  choice: { minHeight: touch.minTarget, justifyContent: "center", paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gcGreen },
  choiceOn: { backgroundColor: colors.gcGreen },
  choiceText: { fontSize: touch.bodyText, color: colors.gcGreen },
  choiceTextOn: { color: colors.surface },
});
