import { colors } from "@eu/core/tokens";
import { useCallback, useContext, useEffect, useState } from "react";
import { View } from "react-native";
import { LocaleContext, useT } from "../i18n";
import type { RejectionRow, Session } from "../session";
import { Button, Card, EmptyState, Header, Notice, Page, StatusChip, Txt, useDateLabel } from "../ui";

const DATE_FIELDS = ["date", "paidOn", "visitedOn", "plantedOn", "openedOn", "enrolledOn"] as const;
const KNOWN_ENTITIES = new Set([
  "school.register", "school.absence", "school.payment", "school.student", "school.enrolment",
  "boreholes.visit", "boreholes.fault", "bamboo.planting", "bamboo.visit", "miombo.planting", "miombo.visit",
]);
const OLD_APP = /^(managed_field|unknown_column|unknown_entity)/;
const SCOPE = /^(unknown_scope|scope_)/;

/** The server's refusal code in words the person can act on. */
export function reasonKey(r: Pick<RejectionRow, "status" | "reason" | "conflicts">): { key: string; vars?: Record<string, string> } {
  if (r.status === "partial") return { key: "app.rej.partial", vars: { fields: (r.conflicts ?? []).join(", ") } };
  if (r.status === "superseded") return { key: "app.rej.superseded" };
  const reason = r.reason ?? "";
  if (reason === "forbidden") return { key: "app.rej.forbidden" };
  if (reason === "id_exists") return { key: "app.rej.idExists" };
  if (reason === "not_found") return { key: "app.rej.notFound" };
  if (reason === "void_reason_required") return { key: "app.rej.voidReason" };
  if (OLD_APP.test(reason)) return { key: "app.rej.oldApp" };
  if (SCOPE.test(reason)) return { key: "app.rej.scope" };
  if (reason.startsWith("invalid:")) return { key: "app.rej.invalid", vars: { field: reason.split(":")[1] || "?" } };
  return { key: "app.rej.other", vars: { reason: reason || r.status } };
}

/** Records the server refused or held back, each with why and what to do; "Compris" clears one. */
export function SyncProblems({ session, onBack }: { session: Session; onBack: () => void }) {
  const t = useT();
  const { locale } = useContext(LocaleContext);
  const dateLabel = useDateLabel();
  const [rows, setRows] = useState<RejectionRow[] | null>(null);
  const load = useCallback(() => void session.listRejections().then(setRows), [session]);
  useEffect(load, [load]);

  const describe = (r: RejectionRow) => {
    const f = r.record ?? {};
    const name = [f.lastName, f.postName, f.firstName].filter(Boolean).join(" ");
    const parts: string[] = [];
    if (typeof f.code === "string") parts.push(f.code);
    if (name) parts.push(name);
    else if (typeof f.studentNumber === "string") parts.push(f.studentNumber);
    if (typeof f.receiptNumber === "number") parts.push(t("ux.receiptNo", { n: f.receiptNumber }));
    if (typeof f.amount === "number") parts.push(`${f.amount.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB")} FC`);
    const d = DATE_FIELDS.map((k) => f[k]).find((v): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));
    if (d) parts.push(dateLabel(d, true));
    return parts.join(" · ");
  };

  return (
    <Page header={<Header title={t("app.problemsTitle")} subtitle={rows ? t("app.problemsCount", { count: rows.length }) : undefined} onBack={onBack} />}>
      {rows && rows.length === 0 && (
        <EmptyState icon="cloudOk" color={colors.statusGood} title={t("app.problemsNone")} />
      )}
      {rows && rows.length > 0 && <Notice tone="info">{t("app.problemsIntro")}</Notice>}
      {rows?.map((r) => {
        const why = reasonKey(r);
        // Field names to words where the app knows them (pupil fields), raw otherwise.
        if (why.vars?.fields) why.vars.fields = (r.conflicts ?? []).map((f) => { const k = `schools.student.${f}`; const w = t(k); return w === k ? f : w.toLowerCase(); }).join(", ");
        const label = KNOWN_ENTITIES.has(r.entity) ? t(`app.entity.${r.entity.replace(".", "_")}`) : t("app.entity.other");
        const detail = describe(r);
        return (
          <Card key={r.rowId} accent={r.status === "partial" || r.status === "superseded" ? colors.statusWarning : colors.statusCritical}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Txt variant="heading" style={{ flex: 1 }}>{label}</Txt>
              <StatusChip
                label={t(r.status === "partial" ? "app.rej.chipConflict" : r.status === "superseded" ? "app.rej.chipLater" : "app.rej.chipRefused")}
                tone={r.status === "rejected" ? "critical" : "warning"}
              />
            </View>
            {detail ? <Txt weight={600}>{detail}</Txt> : null}
            <Txt>{t(why.key, why.vars)}</Txt>
            <Txt variant="small" tone="muted">{t("app.rej.when", { time: new Date(r.at).toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</Txt>
            <Button kind="secondary" icon="check" label={t("app.rej.dismiss")} onPress={() => void session.dismissRejection(r.rowId).then(load)} />
          </Card>
        );
      })}
    </Page>
  );
}
