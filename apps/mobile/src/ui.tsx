import { t as translate } from "@eu/core/i18n";
import { colors, radius, space, touch, type as scale } from "@eu/core/tokens";
import { Children, Fragment, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  ActivityIndicator, Animated, BackHandler, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LocaleContext } from "./i18n";
import { Icon, type IconName } from "./icons";

/**
 * The phone app's component kit: one header, one list row, one form field, one action bar, so
 * every screen looks and behaves the same. Sized for thumbs and bright sun on cheap phones:
 * 48 dp minimum targets, 16 dp body text, flat colours from the shared tokens, no shadows or blur
 * (slow on 2 GB phones).
 */

/** Inter Tight, bundled per weight (Android cannot synthesise weights from one file). */
export const FONT = {
  regular: "InterTight_400Regular",
  semibold: "InterTight_600SemiBold",
  bold: "InterTight_700Bold",
  heavy: "InterTight_800ExtraBold",
} as const;
const fam = (w: number) => (w >= 800 ? FONT.heavy : w >= 700 ? FONT.bold : w >= 600 ? FONT.semibold : FONT.regular);
const typo = (k: keyof typeof scale): TextStyle => ({ fontSize: scale[k].size, lineHeight: scale[k].line, fontFamily: fam(scale[k].weight) });

export const ui = {
  page: colors.surfaceAlt,
  card: colors.surface,
  deep: colors.gcGreenDark,
  line: "#E4E8E1",
  dangerTint: "#FBEAE9",
  warnTint: "#FCF1DE",
  goodTint: colors.gcGreenTint,
  infoTint: "#E7F0F9",
} as const;

export type Tone = "good" | "warning" | "critical" | "muted" | "info";
const toneColor: Record<Tone, string> = {
  good: colors.statusGood,
  warning: colors.statusWarningText,
  critical: colors.statusCritical,
  muted: colors.textMuted,
  info: colors.statusInfo,
};
/** The kit's own words (screen-reader labels, dialog buttons), in the app's language. */
function useKitT() {
  const { locale } = useContext(LocaleContext);
  return (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
}

const toneTint: Record<Tone, string> = { good: ui.goodTint, warning: ui.warnTint, critical: ui.dangerTint, muted: "#EDF0EA", info: ui.infoTint };

/* ------------------------------------------------------------------ text */

type Variant = keyof typeof scale;
export function Txt({ children, variant = "body", tone, color, weight, center, lines, style }: {
  children: ReactNode; variant?: Variant; tone?: Tone; color?: string; weight?: 400 | 600 | 700 | 800; center?: boolean; lines?: number; style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      numberOfLines={lines}
      style={[typo(variant), { color: color ?? (tone ? toneColor[tone] : colors.text) }, weight ? { fontFamily: fam(weight) } : null, center && { textAlign: "center" }, style]}
    >
      {children}
    </Text>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Txt variant="title">{children}</Txt>;
}
export function Subtitle({ children }: { children: ReactNode }) {
  return <Txt variant="heading">{children}</Txt>;
}
export function Body({ children, tone }: { children: ReactNode; tone?: Tone }) {
  return <Txt tone={tone}>{children}</Txt>;
}

/* ------------------------------------------------------------- page frame */

/** Hardware back does what the on-screen back arrow does, while the screen is shown. */
function useHardwareBack(onBack?: () => void) {
  useEffect(() => {
    if (!onBack) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);
}

/**
 * Green bar at the top of every screen inside a module: back arrow, the screen's title, and what
 * it is about (the school, plot or borehole). The coloured stripe underneath is the module's own
 * colour, so you always know which stream you are in.
 */
export function Header({ title, subtitle, onBack, backLabel, accent = colors.gcLime, right }: {
  title: string; subtitle?: string; onBack?: () => void; backLabel?: string; accent?: string; right?: ReactNode;
}) {
  const kt = useKitT();
  const insets = useSafeAreaInsets();
  useHardwareBack(onBack);
  return (
    <View>
      <View style={[s.header, { paddingTop: insets.top + 6 }]}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel={backLabel ?? kt("app.back")} onPress={onBack} hitSlop={6} android_ripple={{ color: ui.deep, borderless: true, radius: 24 }} style={s.headerBack}>
            <Icon name="back" color={colors.surface} size={26} strokeWidth={2.2} />
          </Pressable>
        ) : (
          <View style={{ width: space.sm }} />
        )}
        <View style={s.headerText}>
          <Txt variant="heading" color={colors.surface} lines={1} style={{ fontSize: 20, lineHeight: 25 }}>{title}</Txt>
          {subtitle ? <Txt variant="small" color="rgba(255,255,255,0.82)" lines={1}>{subtitle}</Txt> : null}
        </View>
        {right}
      </View>
      <View style={[s.headerStripe, { backgroundColor: accent }]} />
    </View>
  );
}

/** Kept for screens built before the header existed: a back arrow that also handles hardware back. */
export function BackBar({ onBack, label }: { onBack: () => void; label?: string }) {
  const kt = useKitT();
  useHardwareBack(onBack);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label ?? kt("app.back")} onPress={onBack} hitSlop={8} style={s.backBar}>
      <Icon name="back" color={colors.gcGreen} />
      {label ? <Txt weight={700} color={colors.gcGreen}>{label}</Txt> : null}
    </Pressable>
  );
}

/**
 * A screen: optional header, scrolling content on the page grey, and an optional action bar held
 * at the bottom (above the keyboard and the Android navigation bar), so Save is always in reach.
 */
export function Page({ header, children, footer, scroll = true, bare, gap = space.md, toast, form }: {
  header?: ReactNode; children: ReactNode; footer?: ReactNode; scroll?: boolean; gap?: number; toast?: ReactNode;
  /** The content manages its own scrolling (a FlatList): no padding, no ScrollView. */
  bare?: boolean;
  /** Lets the form scroll to its first error (see useFormScroll / Anchor). */
  form?: FormScroll;
}) {
  const insets = useSafeAreaInsets();
  const pad = { padding: space.md, gap, paddingBottom: footer ? space.lg : space.lg + insets.bottom };
  return (
    <KeyboardAvoidingView style={s.page} behavior="height">
      {header}
      {bare ? (
        <View style={{ flex: 1 }}>{children}</View>
      ) : scroll ? (
        <ScrollView ref={form?.ref as never} style={{ flex: 1 }} contentContainerStyle={[pad, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad]}>{children}</View>
      )}
      {toast}
      {footer ? <View style={[s.actionBar, { paddingBottom: space.sm + insets.bottom }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

/** Where each named part of a form sits in its scrolling page, so Save can scroll to the first error. */
type ScrollHandle = { scrollTo: (o: { y: number; animated?: boolean }) => void };
export interface FormScroll {
  ref: RefObject<ScrollHandle | null>;
  ys: Map<string, number>;
  scrollTo: (name: string | undefined) => void;
}
export function useFormScroll(): FormScroll {
  const ref = useRef<ScrollHandle | null>(null);
  const ys = useRef(new Map<string, number>()).current;
  return useMemo(
    () => ({
      ref,
      ys,
      scrollTo: (name) => {
        const y = name ? ys.get(name) : undefined;
        if (y !== undefined) ref.current?.scrollTo({ y: Math.max(0, y - space.sm), animated: true });
      },
    }),
    [ys],
  );
}
/** Marks a direct child of a Page as a place to scroll to. */
export function Anchor({ form, name, children }: { form: FormScroll; name: string; children: ReactNode }) {
  return <View style={{ gap: space.md }} onLayout={(e) => form.ys.set(name, e.nativeEvent.layout.y)}>{children}</View>;
}

/** Simple padded page with no header (status messages, loading). */
export function Screen({ children, scroll, bare }: { children: ReactNode; scroll?: boolean; bare?: boolean }) {
  const insets = useSafeAreaInsets();
  const style = [s.screen, { paddingTop: insets.top + space.md }, bare && s.bare];
  if (scroll)
    return (
      <ScrollView style={s.page} contentContainerStyle={style} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    );
  return <View style={[s.page, ...style]}>{children}</View>;
}

/* --------------------------------------------------------------- buttons */

export function Button({ label, onPress, disabled, kind = "primary", icon, iconAfter, flex, busy }: {
  label: string; onPress: () => void; disabled?: boolean; kind?: "primary" | "secondary" | "ghost" | "danger"; icon?: IconName; iconAfter?: IconName; flex?: number; busy?: boolean;
}) {
  const fg = kind === "primary" || kind === "danger" ? colors.surface : kind === "secondary" ? colors.gcGreen : colors.gcGreen;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      onPress={onPress}
      disabled={disabled || busy}
      android_ripple={{ color: kind === "primary" ? ui.deep : colors.border }}
      style={({ pressed }) => [
        s.button,
        kind === "secondary" && s.buttonSecondary,
        kind === "ghost" && s.buttonGhost,
        kind === "danger" && { backgroundColor: colors.statusCritical },
        pressed && kind === "primary" && { backgroundColor: ui.deep },
        pressed && kind !== "primary" && kind !== "danger" && { backgroundColor: ui.goodTint },
        disabled && s.disabled,
        flex ? { flex } : null,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} color={fg} size={22} strokeWidth={2.1} /> : null}
      <Txt weight={700} color={fg} lines={2} center style={{ flexShrink: 1 }}>{label}</Txt>
      {iconAfter ? <Icon name={iconAfter} color={fg} size={22} strokeWidth={2.1} /> : null}
    </Pressable>
  );
}

/** Round icon-only button (48 dp), for header actions. */
export function IconButton({ icon, label, onPress, onDark }: { icon: IconName; label: string; onPress: () => void; onDark?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} android_ripple={{ color: onDark ? ui.deep : colors.border, borderless: true, radius: 24 }} style={s.iconButton}>
      <Icon name={icon} color={onDark ? colors.surface : colors.gcGreen} size={22} />
    </Pressable>
  );
}

/* ------------------------------------------------------------ containers */

export function Card({ children, accent, style }: { children: ReactNode; accent?: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null, style]}>{children}</View>;
}

/** A titled white block in a form: groups related questions so long forms read in steps. */
export function Section({ title, hint, right, children }: { title?: string; hint?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={s.section}>
      {title ? (
        <View style={s.sectionHead}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="heading">{title}</Txt>
            {hint ? <Txt variant="small" tone="muted">{hint}</Txt> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Small heading above a list group. */
export function GroupLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.groupLabel}>
      <Txt variant="label" tone="muted" style={{ flex: 1 }}>{children}</Txt>
      {right}
    </View>
  );
}

/** Rows in one white block with hairlines between them: lighter than a box per row. */
export function ListGroup({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={s.group}>
      {items.map((child, i) => (
        <Fragment key={child.key ?? i}>
          {i > 0 && <View style={s.hairline} />}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

/**
 * The ListGroup look for one row of a FlatList (long lists must be virtualised on cheap phones):
 * white block, rounded at the ends, a hairline between rows.
 */
export function groupItemStyle(i: number, n: number): ViewStyle {
  return {
    backgroundColor: colors.surface,
    marginHorizontal: space.md,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: ui.line,
    overflow: "hidden",
    ...(i === 0 ? { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg } : null),
    ...(i === n - 1 ? { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg } : null),
  };
}

export function ListRow({ title, detail, leading, trailing, status, onPress, chevron, highlight, tone }: {
  title: string; detail?: string; leading?: ReactNode; trailing?: ReactNode; status?: ReactNode; onPress?: () => void; chevron?: boolean; highlight?: boolean; tone?: Tone;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      disabled={!onPress}
      android_ripple={{ color: colors.border }}
      style={({ pressed }) => [s.row, highlight && s.rowHighlight, tone && { backgroundColor: toneTint[tone] }, pressed && { backgroundColor: "#EEF3EA" }]}
    >
      {leading}
      <View style={{ flex: 1, gap: 1 }}>
        <Txt weight={600} lines={1}>{title}</Txt>
        {detail ? <Txt variant="small" tone="muted" lines={2}>{detail}</Txt> : null}
        {status ? <View style={{ marginTop: 4 }}>{status}</View> : null}
      </View>
      {trailing}
      {chevron ? <Icon name="chevronRight" color={colors.textMuted} size={20} /> : null}
    </Pressable>
  );
}

/** Coloured round icon at the start of a row or tile. */
export function IconBadge({ icon, color = colors.gcGreen, size = 40 }: { icon: IconName; color?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}22`, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} color={color} size={size * 0.55} />
    </View>
  );
}

/** Initials in a circle, for pupils. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: ui.goodTint, alignItems: "center", justifyContent: "center" }}>
      <Txt variant="label" weight={700} color={colors.gcGreen}>{initials}</Txt>
    </View>
  );
}

/* --------------------------------------------------------------- status */

/** A small status label: always words plus colour, never colour alone. */
export function StatusChip({ label, tone, icon }: { label: string; tone: Tone; icon?: IconName }) {
  return (
    <View style={[s.chip, { backgroundColor: toneTint[tone] }]}>
      {icon ? <Icon name={icon} size={15} color={toneColor[tone]} strokeWidth={2.3} /> : <View style={[s.dot, { backgroundColor: toneColor[tone] }]} />}
      <Txt variant="label" color={toneColor[tone]} lines={1}>{label}</Txt>
    </View>
  );
}
/** Older name for StatusChip. */
export const Pill = StatusChip;

/** Tinted message box: information, a warning, an error, or a success. */
export function Notice({ tone = "info", title, children, icon }: { tone?: Tone; title?: string; children?: ReactNode; icon?: IconName }) {
  const ic: IconName = icon ?? (tone === "good" ? "check" : tone === "critical" || tone === "warning" ? "alert" : "info");
  return (
    <View style={[s.notice, { backgroundColor: toneTint[tone] }]}>
      <Icon name={ic} color={toneColor[tone]} size={22} strokeWidth={2.1} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Txt weight={700} color={toneColor[tone] === colors.textMuted ? colors.text : toneColor[tone]}>{title}</Txt> : null}
        {typeof children === "string" ? <Txt color={colors.text}>{children}</Txt> : children}
      </View>
    </View>
  );
}

/** A big number with a label under it. */
export function Stat({ value, label, tone }: { value: string | number; label: string; tone?: Tone }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt variant="display" color={tone ? toneColor[tone] : colors.text} style={{ fontVariant: ["tabular-nums"] }}>{value}</Txt>
      <Txt variant="small" tone="muted">{label}</Txt>
    </View>
  );
}

/**
 * Confirmation that slides up above the action bar after a save, then goes away: the same words
 * every time, so people learn that "saved on this phone" means it will sync by itself.
 */
export function Toast({ message, onHide, tone = "good" }: { message: string | null; onHide: () => void; tone?: "good" | "critical" }) {
  const y = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<string | null>(message);
  useEffect(() => {
    if (!message) return;
    setShown(message);
    Animated.timing(y, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const timer = setTimeout(() => Animated.timing(y, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => onHide()), tone === "critical" ? 6000 : 3200);
    return () => clearTimeout(timer);
  }, [message]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!message || !shown) return null;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[s.toast, tone === "critical" && { backgroundColor: colors.statusCritical }, { opacity: y, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}
    >
      <View style={[s.toastIcon, tone === "critical" && { backgroundColor: colors.surface }]}>
        <Icon name={tone === "critical" ? "alert" : "check"} color={tone === "critical" ? colors.statusCritical : colors.gcGreenDeep} size={18} strokeWidth={2.6} />
      </View>
      <Txt color={colors.surface} weight={600} style={{ flex: 1 }}>{shown}</Txt>
    </Animated.View>
  );
}

/* ----------------------------------------------------------------- forms */

/** Browser preview only: the focus ring is drawn by the field border, not the browser outline. */
const noOutline = (Platform.OS === "web" ? { outlineStyle: "none" } : null) as unknown as TextStyle;

export function Field(props: TextInputProps & { label: string; hint?: string; error?: string | null; suffix?: string; icon?: IconName; big?: boolean }) {
  const { label, hint, error, suffix, icon, big, style, ...rest } = props;
  const [focus, setFocus] = useState(false);
  return (
    <View style={s.field}>
      <Txt variant="label">{label}</Txt>
      <View style={[s.inputWrap, focus && s.inputFocus, !!error && { borderColor: colors.statusCritical }, rest.multiline && { alignItems: "flex-start" }]}>
        {icon ? <Icon name={icon} color={colors.textMuted} size={22} /> : null}
        <TextInput
          style={[s.input, noOutline, big && s.inputBig, rest.multiline && { minHeight: 88, textAlignVertical: "top", paddingTop: 12 }, style]}
          placeholderTextColor="#8B958C"
          onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
          {...rest}
        />
        {suffix ? <Txt weight={600} tone="muted">{suffix}</Txt> : null}
      </View>
      {error ? <Txt variant="small" tone="critical">{error}</Txt> : hint ? <Txt variant="small" tone="muted">{hint}</Txt> : null}
    </View>
  );
}

/** Whole number with − and + either side, for counting plants or minutes without much typing. */
export function NumberField({ label, value, onChange, step = 1, min = 0, max, suffix, compact }: {
  label: string; value: string; onChange: (v: string) => void; step?: number; min?: number; max?: number; suffix?: string; compact?: boolean;
}) {
  const n = Number(value.replace(/\s/g, "")) || 0;
  const bump = (d: number) => {
    const next = Math.max(min, Math.min(max ?? Number.MAX_SAFE_INTEGER, (value === "" ? 0 : n) + d));
    onChange(String(next));
  };
  return (
    <View style={[s.field, compact && { flex: 1 }]}>
      <Txt variant="label" lines={1}>{label}</Txt>
      <View style={s.stepper}>
        <Pressable accessibilityRole="button" accessibilityLabel={`− ${label}`} onPress={() => bump(-step)} android_ripple={{ color: colors.border }} style={s.stepBtn}>
          <Icon name="minus" color={colors.gcGreen} strokeWidth={2.4} />
        </Pressable>
        <TextInput
          value={value}
          onChangeText={(v) => onChange(v.replace(/[^\d]/g, ""))}
          keyboardType="number-pad"
          selectTextOnFocus
          placeholder="0"
          placeholderTextColor="#A3ACA4"
          accessibilityLabel={label}
          style={[s.stepInput, noOutline, typo("title"), { fontVariant: ["tabular-nums"] }]}
        />
        {suffix ? <Txt variant="small" tone="muted" style={{ marginRight: 4 }}>{suffix}</Txt> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`+ ${label}`} onPress={() => bump(step)} android_ripple={{ color: colors.border }} style={s.stepBtn}>
          <Icon name="plus" color={colors.gcGreen} strokeWidth={2.4} />
        </Pressable>
      </View>
    </View>
  );
}

const DAY = 86_400_000;
const isoShift = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

/** "mar. 25 nov." / "Tue 25 Nov" for a YYYY-MM-DD date. */
export function useDateLabel() {
  const { locale } = useContext(LocaleContext);
  return (d: string, withYear = false) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { weekday: "short", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}

/**
 * Pick a day without typing: arrows step a day at a time, with one-tap Today and Yesterday.
 * Dates after `max` (today, by default) cannot be chosen.
 */
export function DateField({ label, value, onChange, max, min, todayLabel, yesterdayLabel }: {
  label?: string; value: string; onChange: (d: string) => void; max: string; min?: string; todayLabel: string; yesterdayLabel: string;
}) {
  const fmt = useDateLabel();
  const kt = useKitT();
  const atMin = min !== undefined && value <= min;
  const old = Math.abs(Date.parse(max) - Date.parse(value)) > 300 * DAY;
  return (
    <View style={s.field}>
      {label ? <Txt variant="label">{label}</Txt> : null}
      <View style={s.dateRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={kt("ux.prevDay")}
          accessibilityState={{ disabled: atMin }}
          disabled={atMin}
          onPress={() => onChange(isoShift(value, -1))}
          android_ripple={{ color: colors.border }}
          style={[s.stepBtn, atMin && s.disabled]}
        >
          <Icon name="chevronLeft" color={colors.gcGreen} strokeWidth={2.4} />
        </Pressable>
        <View style={s.dateMid}>
          <Icon name="calendar" color={colors.gcGreen} size={20} />
          <Txt weight={700}>{fmt(value, old)}</Txt>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={kt("ux.nextDay")}
          accessibilityState={{ disabled: value >= max }}
          disabled={value >= max}
          onPress={() => onChange(isoShift(value, 1))}
          android_ripple={{ color: colors.border }}
          style={[s.stepBtn, value >= max && s.disabled]}
        >
          <Icon name="chevronRight" color={colors.gcGreen} strokeWidth={2.4} />
        </Pressable>
      </View>
      <Segmented
        small
        value={value}
        onChange={onChange}
        options={[{ value: isoShift(max, -1), label: yesterdayLabel }, { value: max, label: todayLabel }]}
      />
    </View>
  );
}

/**
 * One choice from a few, as equal buttons in a row (or a grid with `columns`), so options line up
 * instead of wrapping raggedly.
 */
export function Segmented<T extends string | boolean>({ options, value, onChange, columns, small, tones }: {
  options: { value: T; label: string }[]; value: T | null | undefined; onChange: (v: T) => void; columns?: number; small?: boolean; tones?: Partial<Record<string, Tone>>;
}) {
  const cols = columns ?? options.length;
  const tight = cols >= 3;
  const rows: { value: T; label: string }[][] = [];
  for (let i = 0; i < options.length; i += cols) rows.push(options.slice(i, i + cols));
  return (
    <View style={{ gap: 6 }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: "row", gap: 6 }}>
          {row.map((o) => {
            const on = o.value === value;
            const tone = tones?.[String(o.value)];
            const bg = on ? (tone ? toneColor[tone] : colors.gcGreen) : colors.surface;
            return (
              <Pressable
                key={String(o.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => onChange(o.value)}
                android_ripple={{ color: colors.border }}
                style={[s.seg, small && s.segSmall, tight && { paddingHorizontal: 4 }, { backgroundColor: bg, borderColor: on ? bg : colors.border }]}
              >
                {on && !small && !tight ? <Icon name="check" size={18} color={colors.surface} strokeWidth={2.6} /> : null}
                <Txt weight={on ? 700 : 600} color={on ? colors.surface : colors.text} center lines={2} style={small || tight ? { fontSize: 14.5 } : null}>{o.label}</Txt>
              </Pressable>
            );
          })}
          {row.length < cols && Array.from({ length: cols - row.length }, (_, i) => <View key={`pad${i}`} style={{ flex: 1 }} />)}
        </View>
      ))}
    </View>
  );
}

/** Several choices from many (threats, species): wrapping chips with a tick when chosen. */
export function Chips<T extends string>({ options, selected, onToggle }: { options: { value: T; label: string }[]; selected: readonly T[]; onToggle: (v: T) => void }) {
  return (
    <View style={s.chips}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <Pressable
            key={o.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => onToggle(o.value)}
            android_ripple={{ color: colors.border }}
            style={[s.chipBtn, on && s.chipBtnOn]}
          >
            {on ? <Icon name="check" size={16} color={colors.surface} strokeWidth={2.6} /> : null}
            <Txt weight={600} color={on ? colors.surface : colors.text}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A yes/no question with the answer as a tick box row (e.g. "this is a different pupil"). */
export function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={s.checkRow}>
      <View style={[s.checkBox, checked && { backgroundColor: colors.gcGreen, borderColor: colors.gcGreen }]}>
        {checked ? <Icon name="check" size={18} color={colors.surface} strokeWidth={2.8} /> : null}
      </View>
      <Txt style={{ flex: 1 }}>{label}</Txt>
    </Pressable>
  );
}

/* --------------------------------------------------------------- dialogs */

export interface DialogAction<V> {
  label: string;
  value: V;
  kind?: "primary" | "secondary" | "ghost" | "danger";
}
export interface DialogOptions<V> {
  title: string;
  message?: string;
  body?: ReactNode;
  actions: DialogAction<V>[];
}

/** A question over the screen, with full-width answers (easy to hit, no wrapped labels). Back = no answer. */
export function Dialog<V>({ title, message, body, actions, onClose }: DialogOptions<V> & { onClose: (v: V | null) => void }) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => onClose(null)} statusBarTranslucent>
      <Pressable style={s.scrim} onPress={() => onClose(null)} accessibilityLabel={title}>
        <Pressable style={s.dialog} onPress={() => undefined}>
          <Txt variant="heading">{title}</Txt>
          {message ? <Txt>{message}</Txt> : null}
          {body}
          <View style={{ gap: space.sm, marginTop: space.xs }}>
            {actions.map((a, i) => (
              <Button key={i} label={a.label} kind={a.kind ?? (i === 0 ? "primary" : "secondary")} onPress={() => onClose(a.value)} />
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export type Ask = <V>(opts: DialogOptions<V>) => Promise<V | null>;

/** `ask(...)` shows a Dialog and resolves with the chosen value (null if dismissed); render `node`. */
export function useDialog(): { ask: Ask; node: ReactNode } {
  const [open, setOpen] = useState<{ opts: DialogOptions<unknown>; resolve: (v: unknown) => void } | null>(null);
  const ask = useCallback(<V,>(opts: DialogOptions<V>) => new Promise<V | null>((resolve) => setOpen({ opts: opts as DialogOptions<unknown>, resolve: resolve as (v: unknown) => void })), []) as Ask;
  const node = open ? (
    <Dialog
      {...open.opts}
      onClose={(v) => {
        open.resolve(v);
        setOpen(null);
      }}
    />
  ) : null;
  return { ask, node };
}

/**
 * Back (arrow or Android back) from a form with unsaved input asks first:
 * "Quitter sans enregistrer ?" — continue typing, or leave and lose it.
 */
export function useLeaveGuard(dirty: boolean, leave: () => void, ask: Ask): () => void {
  const kt = useKitT();
  return () => {
    if (!dirty) return leave();
    void ask({
      title: kt("ux.leaveTitle"),
      message: kt("ux.leaveBody"),
      actions: [
        { label: kt("ux.keepEditing"), value: false, kind: "primary" },
        { label: kt("ux.leaveAnyway"), value: true, kind: "danger" },
      ],
    }).then((v) => v && leave());
  };
}

/* ------------------------------------------------------------ brand bits */

/** Green bar with the GoCongo wordmark, used at the top of the home screen. */
export function BrandBar({ right }: { right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.brandBar, { paddingTop: insets.top + space.sm }]}>
      <Image source={require("../assets/logo-white.png")} style={s.brandLogo} resizeMode="contain" accessibilityLabel="GoCongo" />
      <View style={s.brandRight}>{right}</View>
    </View>
  );
}

/** FR | EN switch, 48 dp tall. */
export function LanguageSwitch({ locale, onChange, onDark }: { locale: string; onChange: (l: "en" | "fr") => void; onDark?: boolean }) {
  return (
    <View style={[s.lang, onDark && { borderColor: "rgba(255,255,255,0.55)" }]}>
      {(["fr", "en"] as const).map((l) => {
        const on = l === locale;
        return (
          <Pressable key={l} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(l)} style={[s.langItem, on && { backgroundColor: onDark ? colors.surface : colors.gcGreen }]}>
            <Txt variant="label" weight={700} color={on ? (onDark ? colors.gcGreen : colors.surface) : onDark ? colors.surface : colors.gcGreen}>{l.toUpperCase()}</Txt>
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
          <Text key={i} style={{ position: "absolute", left: width / 2 + r * Math.sin(a) - size / 2, top: h / 2 - r * Math.cos(a) - size * 0.7, fontSize: size, lineHeight: size * 1.3, color: colors.euYellow }}>
            ★
          </Text>
        );
      })}
    </View>
  );
}

/** "Funded by the European Union" with the flag, at the foot of the home and sign-in screens. */
export function EuBand({ text }: { text: string }) {
  return (
    <View style={s.band}>
      <EuFlag width={36} />
      <Txt variant="small" weight={600} color={colors.euBlue} style={{ flexShrink: 1 }}>{text}</Txt>
    </View>
  );
}

/** Lime, yellow and orange dashes from the GoCongo leaf: the app's signature mark. */
export function LeafStripe({ width = 28 }: { width?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[colors.gcLime, colors.gcYellow, colors.gcOrange].map((c) => <View key={c} style={{ width, height: 4, borderRadius: 2, backgroundColor: c }} />)}
    </View>
  );
}

/** "Nothing here yet", with what to do about it. */
export function EmptyState({ icon, title, children, color = colors.gcGreen }: { icon: IconName; title: string; children?: ReactNode; color?: string }) {
  return (
    <View style={s.empty}>
      <IconBadge icon={icon} color={color} size={72} />
      <Txt variant="heading" center>{title}</Txt>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: ui.page },
  screen: { padding: space.md, gap: space.md, flexGrow: 1 },
  bare: { padding: 0, paddingTop: 0, gap: 0 },
  header: { backgroundColor: colors.gcGreen, flexDirection: "row", alignItems: "center", paddingBottom: 10, paddingRight: space.sm, minHeight: 56 },
  headerBack: { width: 52, height: 48, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, gap: 1, paddingRight: space.sm },
  headerStripe: { height: 4 },
  backBar: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: touch.minTarget, paddingRight: space.sm },
  actionBar: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: ui.line },
  button: { minHeight: 52, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.gcGreen, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: space.sm, paddingHorizontal: space.md, overflow: "hidden" },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.gcGreen },
  buttonGhost: { backgroundColor: "transparent", minHeight: touch.minTarget },
  disabled: { opacity: 0.4 },
  iconButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: space.sm, borderWidth: 1, borderColor: ui.line },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: space.md, borderWidth: 1, borderColor: ui.line },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  groupLabel: { flexDirection: "row", alignItems: "center", marginBottom: -space.sm, paddingHorizontal: 4 },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: ui.line, overflow: "hidden" },
  hairline: { height: 1, backgroundColor: ui.line, marginLeft: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingVertical: 10, paddingHorizontal: space.md },
  rowHighlight: { backgroundColor: ui.goodTint, borderLeftWidth: 4, borderLeftColor: colors.gcGreen, paddingLeft: space.md - 4 },
  chip: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  notice: { flexDirection: "row", gap: 12, padding: 14, borderRadius: radius.md, alignItems: "flex-start" },
  toast: { position: "absolute", left: space.md, right: space.md, bottom: 92, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.gcGreenDeep, borderRadius: 14, paddingVertical: 14, paddingHorizontal: space.md },
  scrim: { flex: 1, backgroundColor: "rgba(10,25,15,0.55)", justifyContent: "center", padding: space.md },
  dialog: { backgroundColor: colors.surface, borderRadius: 18, padding: space.lg, gap: space.sm },
  toastIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.gcLime, alignItems: "center", justifyContent: "center" },
  field: { gap: 6 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 54, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, backgroundColor: colors.surface },
  inputFocus: { borderColor: colors.gcGreen, borderWidth: 2 },
  input: { flex: 1, minWidth: 0, minHeight: 50, fontSize: 17, fontFamily: FONT.regular, color: colors.text, paddingVertical: 0 },
  inputBig: { fontSize: 24, fontFamily: FONT.bold, letterSpacing: 1 },
  stepper: { flexDirection: "row", alignItems: "center", minHeight: 56, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, overflow: "hidden" },
  stepBtn: { width: 52, minHeight: 54, alignItems: "center", justifyContent: "center", backgroundColor: "#F5F8F3" },
  stepInput: { flex: 1, minWidth: 0, textAlign: "center", color: colors.text, minHeight: 54, paddingVertical: 0 },
  dateRow: { flexDirection: "row", alignItems: "stretch", minHeight: 60, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, overflow: "hidden" },
  dateMid: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  seg: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 8 },
  segSmall: { minHeight: touch.minTarget, borderRadius: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chipBtn: { minHeight: touch.minTarget, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  chipBtnOn: { backgroundColor: colors.gcGreen, borderColor: colors.gcGreen },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: touch.minTarget },
  checkBox: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: colors.textMuted, alignItems: "center", justifyContent: "center" },
  brandBar: { backgroundColor: colors.gcGreen, paddingBottom: space.md, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center" },
  brandLogo: { width: 112, height: 38 },
  brandRight: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4 },
  lang: { flexDirection: "row", borderWidth: 1.5, borderColor: colors.gcGreen, borderRadius: 999, overflow: "hidden" },
  langItem: { minWidth: 48, minHeight: 45, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  band: { marginTop: "auto", flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  empty: { alignItems: "center", gap: space.md, paddingVertical: space.lg, paddingHorizontal: space.sm },
});
