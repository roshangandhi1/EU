import { colors, radius, space, touch } from "@eu/core/tokens";
import { distanceM } from "@eu/forestry/mobile";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useT } from "../../i18n";
import type { Session } from "../../session";
import { Body, Button, Title } from "../../ui";
import { getFix, localToday } from "../location";
import { loadBoreholes, loadSchedule, type BoreholeRow, type Schedule } from "./data";
import { VisitForm } from "./VisitForm";

/** Technician view: boreholes with what is due, nearest first on request, then a maintenance visit. */
export function BoreholesHome({ session, onBack }: { session: Session; onBack: () => void }) {
  const t = useT();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [rows, setRows] = useState<BoreholeRow[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [open, setOpen] = useState<BoreholeRow | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(() => {
    void (async () => {
      const s = await loadSchedule(session.client);
      setSchedule(s);
      setRows(await loadBoreholes(session.client, s, localToday()));
    })();
  }, [session]);
  useEffect(reload, [reload, session.status.lastOk]);

  const findNearest = async () => {
    const located = (rows ?? []).filter((r) => r.gpsLat !== null && r.gpsLng !== null);
    if (located.length === 0) return setNote(t("boreholes.m.no_gps"));
    setNote(t("forestry.m.locating"));
    const fix = await getFix();
    if (fix === "denied") return setNote(t("forestry.m.gps_denied"));
    if (!fix) return setNote(t("forestry.m.gps_none"));
    const best = located.map((r) => ({ r, m: distanceM(fix.lat, fix.lng, r.gpsLat!, r.gpsLng!) })).sort((a, b) => a.m - b.m)[0]!;
    setHighlight(best.r.id);
    setNote(t("boreholes.m.nearest", { code: best.r.code, m: Math.round(best.m) }));
  };

  if (open && schedule) {
    return (
      <VisitForm
        session={session}
        borehole={open}
        schedule={schedule}
        onDone={(saved) => {
          setOpen(null);
          if (saved) setFlash(t("boreholes.m.saved"));
          reload();
        }}
      />
    );
  }

  const sorted = rows && highlight ? [...rows.filter((r) => r.id === highlight), ...rows.filter((r) => r.id !== highlight)] : rows;

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Title>{t("boreholes.title")}</Title>
      {flash && <Body tone="good">{flash}</Body>}
      <Button label={t("boreholes.m.find")} onPress={() => void findNearest()} disabled={!rows || rows.length === 0} />
      {note && <Body tone="muted">{note}</Body>}
      {rows && rows.length === 0 && <Body tone="warning">{t("boreholes.m.none")}</Body>}
      {sorted?.map((r) => {
        const worst = r.due.find((d) => d.status !== "each_visit");
        const tone = worst?.status === "overdue" ? colors.statusCritical : worst?.status === "due" ? colors.statusWarning : colors.textMuted;
        return (
          <Pressable key={r.id} accessibilityRole="button" onPress={() => setOpen(r)} style={[s.row, r.id === highlight && s.rowHot]}>
            <Text style={s.code}>{r.code}</Text>
            <Text style={s.meta}>
              {r.village} · {t(`boreholes.lifecycle.${r.lifecycle}`)}
            </Text>
            <Text style={[s.meta, { color: tone }]}>
              {r.due.length === 0 ? t("boreholes.m.not_in_service") : r.dueCount > 0 ? t("boreholes.m.due_count", { n: r.dueCount }) : t("boreholes.due.ok")}
            </Text>
          </Pressable>
        );
      })}
      <View style={{ height: space.md }} />
      <Button kind="secondary" label={t("forestry.m.back")} onPress={onBack} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space.md, paddingTop: space.xl, gap: space.sm, backgroundColor: colors.surface },
  row: { minHeight: touch.minTarget, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.sm, gap: 2 },
  rowHot: { borderColor: colors.gcGreen, borderWidth: 2 },
  code: { fontSize: touch.bodyText, fontWeight: "700", color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted },
});
