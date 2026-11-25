import { colors, streamAccent } from "@eu/core/tokens";
import { distanceM } from "@eu/forestry/mobile";
import { useCallback, useEffect, useState } from "react";
import { useT } from "../../i18n";
import type { Session } from "../../session";
import { Button, EmptyState, Header, IconBadge, ListGroup, ListRow, Notice, Page, StatusChip, Toast, Txt, type Tone } from "../../ui";
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
  const dueTotal = (rows ?? []).filter((r) => r.dueCount > 0).length;

  return (
    <Page
      header={<Header title={t("boreholes.title")} subtitle={rows ? t("ux.boreholesSummary", { n: rows.length, due: dueTotal }) : undefined} onBack={onBack} backLabel={t("forestry.m.back")} accent={streamAccent.boreholes} />}
      toast={<Toast message={flash} onHide={() => setFlash(null)} />}
    >
      <Button kind="secondary" icon="locate" label={t("boreholes.m.find")} onPress={() => void findNearest()} disabled={!rows || rows.length === 0} />
      {note && <Notice tone={highlight ? "good" : "info"} icon={highlight ? "pin" : "locate"}>{note}</Notice>}
      {rows && rows.length === 0 && <EmptyState icon="drop" color={streamAccent.boreholes} title={t("app.emptyTitle")}><Txt center>{t("boreholes.m.none")}</Txt></EmptyState>}
      {sorted && sorted.length > 0 && (
        <ListGroup>
          {sorted.map((r) => {
            const worst = r.due.find((d) => d.status !== "each_visit");
            const tone: Tone = r.due.length === 0 ? "muted" : worst?.status === "overdue" ? "critical" : r.dueCount > 0 ? "warning" : "good";
            const chip = r.due.length === 0 ? t("ux.noSchedule") : r.dueCount > 0 ? t("boreholes.m.due_count", { n: r.dueCount }) : t("boreholes.due.ok");
            return (
              <ListRow
                key={r.id}
                title={r.code}
                detail={`${r.village} · ${t(`boreholes.lifecycle.${r.lifecycle}`)}`}
                leading={<IconBadge icon={r.lifecycle === "needs_repair" || r.lifecycle === "non_functional" ? "wrench" : "drop"} color={r.lifecycle === "needs_repair" || r.lifecycle === "non_functional" ? colors.statusCritical : streamAccent.boreholes} />}
                status={<StatusChip label={chip} tone={tone} />}
                onPress={() => setOpen(r)}
                highlight={r.id === highlight}
                chevron
              />
            );
          })}
        </ListGroup>
      )}
    </Page>
  );
}
