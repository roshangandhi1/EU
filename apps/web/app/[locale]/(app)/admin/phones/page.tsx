import { CLOCK_SKEW_LIMIT_MS } from "@eu/core";
import { Icon } from "@/components/icons";
import { devices, users } from "@eu/db";
import { desc, eq } from "drizzle-orm";
import { Check, FormFooter, Notice, PageHeader, RowMenu, SubmitButton, Table } from "@/components/ui";
import { formatLocal, requireAction } from "@/lib/admin";
import { db } from "@/lib/http";
import { revokeAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function PhonesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { locale, tr } = await requireAction((await params).locale, "devices.manage");
  const sp = await searchParams;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await (db() as any)
    .select({ d: devices, userName: users.name })
    .from(devices)
    .innerJoin(users, eq(users.id, devices.userId))
    .orderBy(desc(devices.lastSeenAt))) as { d: typeof devices.$inferSelect; userName: string }[];

  return (
    <section>
      <PageHeader icon={<Icon name="phone" size={24} />} title={tr("phones")} subtitle={tr("phonesIntro")} />
      {sp.error === "confirm" && <Notice tone="error">{tr("revokeConfirm")}</Notice>}
      {sp.ok && <Notice tone="success">{tr("saved")}</Notice>}
      <Table
        rows={rows}
        rowKey={(r) => r.d.id}
        empty={tr("none")}
        emptyIcon="phone"
        columns={[
          { key: "user", header: tr("user"), render: (r) => <strong>{r.userName}</strong> },
          { key: "phone", header: tr("phone"), render: (r) => `${r.d.name}${r.d.appVersion ? ` · v${r.d.appVersion}` : ""}` },
          { key: "seen", header: tr("lastSync"), render: (r) => formatLocal(r.d.lastSeenAt, locale) },
          {
            key: "unsynced",
            header: tr("unsynced"),
            render: (r) => (r.d.statusAt ? `${r.d.pendingChanges ?? 0} / ${r.d.pendingPhotos ?? 0}` : "—"),
          },
          {
            key: "clock",
            header: tr("clock"),
            render: (r) =>
              r.d.lastSkewMs == null ? "—" : Math.abs(r.d.lastSkewMs) > CLOCK_SKEW_LIMIT_MS ? <strong>{tr("clockOff", { minutes: Math.round(r.d.lastSkewMs / 60000) })}</strong> : tr("clockOk"),
          },
          {
            key: "action",
            header: "",
            shrink: true,
            render: (r) =>
              r.d.revokedAt ? (
                <span className="pill bad">{tr("revoked")}</span>
              ) : (
                <RowMenu label={tr("revoke")} icon="x" tone="danger" wide>
                  <form action={revokeAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="deviceId" value={r.d.id} />
                    <p style={{ margin: "0 0 4px", color: "var(--text)", fontWeight: 650 }}>{r.userName} · {r.d.name}</p>
                    <p style={{ margin: "0 0 8px" }}>
                      {r.d.statusAt
                        ? tr("revokeWarn", { changes: r.d.pendingChanges ?? 0, photos: r.d.pendingPhotos ?? 0, when: formatLocal(r.d.statusAt, locale) })
                        : tr("revokeUnknown")}
                    </p>
                    <Check name="confirm" value="yes" label={tr("revokeConfirm")} required />
                    <FormFooter><SubmitButton variant="danger" small>{tr("revoke")}</SubmitButton></FormFooter>
                  </form>
                </RowMenu>
              ),
          },
        ]}
      />
    </section>
  );
}
