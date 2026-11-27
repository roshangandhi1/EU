import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isLocale, t, type Locale } from "@eu/core/i18n";
import { featureCollection } from "@eu/maps";
import { MapView } from "@eu/maps/web";
import { currentPrincipal } from "@/lib/session";
import { permissions } from "@/lib/registry";
import { todayDrc } from "@/lib/dates";
import { loadBoreholeDetail } from "@/lib/borehole-detail";
import { fmtDate, fmtNum, tn } from "@/lib/format";
import { titled } from "@/lib/meta";
import { db } from "@/lib/http";
import { boreholes } from "@eu/boreholes/db/schema";
import { eq } from "drizzle-orm";
import { NoAccess } from "@/components/no-access";
import { ModalEdit } from "@/components/modal-edit";
import { Icon } from "@/components/icons";
import { Adder, Chip, ChoiceGroup, ConfirmButton, Field, Fields, FormFooter, Notice, PageHeader, Section, SubmitButton, Table } from "@/components/ui";
import { addFlowTestAction, addPopulationAction, deleteFlowTestAction, editFlowTestAction, updateBoreholeAction } from "./actions";

export const dynamic = "force-dynamic";
export const generateMetadata = titled(async (l, p) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [r] = await (db() as any).select({ code: boreholes.code }).from(boreholes).where(eq(boreholes.scopeId, p.id ?? ""));
  return r ? `${r.code} · ${t(l, "boreholes.title")}` : t(l, "boreholes.title");
});
const coord = (n: number | null, locale: string) => (n == null ? "" : locale === "fr" ? String(n).replace(".", ",") : String(n));

const LIFECYCLE = ["planned", "drilled", "equipped", "commissioned", "handed_over", "operational", "needs_repair", "non_functional"];
const DUE_COLORS: Record<string, string> = { ok: "#1C6B33", due_soon: "#2B7BB9", due: "#E8A827", overdue: "#B3261E", each_visit: "#9AA39A" };
const DUE_ICON: Record<string, string> = { ok: "✓", due_soon: "◷", due: "▲", overdue: "✕", each_visit: "↻" };
const PUMPS = [0.75, 1.1, 2.2];

function Thumbs({ ids }: { ids: string[] }) {
  if (ids.length === 0) return <span className="muted">—</span>;
  return (
    <span className="thumbs">
      {ids.map((id) => <a key={id} href={`/api/files/${id}`} target="_blank" rel="noreferrer"><img src={`/api/files/${id}`} alt="" loading="lazy" /></a>)}
    </span>
  );
}

type FlowDefaults = { testedOn: string; flowLpm: string; undertaker: string; pump: string; taps: string; notes: string };

/** The flow test fields, shared by "Log a flow test" and "Edit test". Same rules as the phone. */
function FlowFields({ b, f, today, v, k }: { b: (k: string) => string; f: (k: string) => string; today: string; v: FlowDefaults; k: string }) {
  return (
    <Fields>
      <Field span={4} label={b("ft.date")}><input type="date" name="testedOn" required defaultValue={v.testedOn} max={today} /></Field>
      <Field span={4} label={b("ft.value")} hint={b("ft.value_hint")}><input name="flowLpm" required inputMode="decimal" pattern="\s*[0-9]+([.,][0-9]+)?\s*" defaultValue={v.flowLpm} /></Field>
      <Field span={4} label={b("ft.undertaker")} hint={b("ft.undertaker_hint")}><input name="undertaker" required maxLength={200} defaultValue={v.undertaker} /></Field>
      <ChoiceGroup legend={b("ft.pump")} span={6}>
        <Chip type="radio" name="pump" value="yes" required defaultChecked={v.pump === "yes"} label={b("ft.yes")} id={`${k}-py`} />
        <Chip type="radio" name="pump" value="no" defaultChecked={v.pump === "no"} label={b("ft.no")} id={`${k}-pn`} />
      </ChoiceGroup>
      <ChoiceGroup legend={b("ft.taps")} span={6}>
        <Chip type="radio" name="taps" value="yes" required defaultChecked={v.taps === "yes"} label={b("ft.yes")} id={`${k}-ty`} />
        <Chip type="radio" name="taps" value="no" defaultChecked={v.taps === "no"} label={b("ft.no")} id={`${k}-tn`} />
        <Chip type="radio" name="taps" value="na" defaultChecked={v.taps === "na"} label={b("ft.no_taps")} id={`${k}-tx`} />
      </ChoiceGroup>
      <Field span={12} label={b("ft.notes")} optional={f("optional")}><input name="notes" maxLength={1000} defaultValue={v.notes} /></Field>
    </Fields>
  );
}

export default async function BoreholePage({ params, searchParams }: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { locale: l, id } = await params;
  if (!isLocale(l)) notFound();
  const locale: Locale = l;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  const b = (k: string, v?: Record<string, string | number>) => t(locale, `boreholes.${k}`, v);
  if (!permissions.can(me.user, "boreholes.read", { stream: "boreholes", siteId: id })) return <NoAccess locale={locale} reason={b("forbidden")} />;
  const today = todayDrc();
  const d = await loadBoreholeDetail(id, today);
  if (!d) notFound();
  const sp = await searchParams;
  const { attrs: a, row, extras: x } = d;
  const canEdit = permissions.can(me.user, "boreholes.write", { stream: "boreholes" });
  const canPop = permissions.can(me.user, "boreholes.population.write", { stream: "boreholes", siteId: id });
  const canFlow = permissions.can(me.user, "boreholes.visit.write", { stream: "boreholes", siteId: id });
  const canFixFlow = permissions.can(me.user, "boreholes.record.void", { stream: "boreholes", siteId: id });
  const f = (k: string) => t(locale, `ui.form.${k}`);
  const date = (s: string | null | undefined) => fmtDate(s, locale);
  const kw = (n: number) => `${fmtNum(n, locale, 2)} kW`;
  const lastWq = [...(a.waterQuality ?? [])].sort((p, q) => (p.testedOn < q.testedOn ? 1 : -1))[0];
  const caretakers = a.caretakersTrained ?? [];
  const label = (k: string) => {
    const lbl = d.taskLabels.get(k);
    return lbl ? lbl[locale] || lbl.en || lbl.fr : k;
  };
  const errText = sp.error ? (sp.error === "flow_invalid" ? b("ft.invalid") : sp.error === "invalid" ? b("detail.invalid") : ["forbidden", "not_found", "coords", "already_exists"].includes(sp.error) ? b(`err.${sp.error}`) : b("err.unknown", { reason: sp.error })) : null;
  const okText = sp.ok === "flow_saved" ? b("ft.saved") : sp.ok === "flow_updated" ? b("ft.updated") : sp.ok === "flow_deleted" ? b("ft.deleted") : sp.ok === "saved" ? b("detail.saved") : sp.ok === "pop" ? b("detail.pop_saved") : sp.ok === "conflict" ? b("detail.conflict") : null;
  const located = a.gpsLat != null && a.gpsLng != null;
  const overlays = located ? [{
    id: "bh", kind: "circle" as const, defaultColor: "#2B7BB9", labelBy: "code",
    data: featureCollection([{ id, geometry: { type: "Point" as const, coordinates: [a.gpsLng!, a.gpsLat!] }, properties: { code: a.code } }]),
  }] : [];

  return (
    <section className="module" data-stream="boreholes">
      <Link className="back-link" href={`/${locale}/boreholes`}><Icon name="back" size={16} />{b("detail.back")}</Link>
      <PageHeader
        icon={<Icon name="drop" size={24} />}
        eyebrow={b("title")}
        title={a.code}
        subtitle={<>{a.village} · {b(`lifecycle.${a.lifecycle}`)}</>}
        actions={canEdit ? <a className="btn secondary" href="#edit"><Icon name="pencil" size={16} />{b("detail.edit")}</a> : undefined}
      />
      {okText && <Notice tone={sp.ok === "conflict" ? "warning" : "success"}>{okText}</Notice>}
      {errText && <Notice tone="error">{errText}</Notice>}

      <div className="detail-grid">
        <Section id="key" icon="info" title={b("detail.key")} className={located ? undefined : "full"}>
          <dl className="kv">
            <div><dt>{b("detail.population")}</dt><dd className="big">{x.population === null ? <span className="muted">{b("detail.population_none")}</span> : fmtNum(x.population, locale)}</dd>
              {x.populationOn && <dd className="sub muted small">{b("detail.estimated_on", { date: date(x.populationOn) })}</dd>}</div>
            <div><dt>{b("detail.flow_latest")}</dt><dd className="big">{x.flowLpm === null ? <span className="muted">{b("detail.flow_none")}</span> : b("lpm", { n: fmtNum(x.flowLpm, locale, 1) })}</dd>
              {x.flowOn && <dd className="sub muted small">{b("detail.measured_on", { date: date(x.flowOn) })}{x.flowLpm ? ` · ${b("detail.fill_time", { s: fmtNum(1200 / x.flowLpm, locale, 0) })}` : ""}</dd>}</div>
            <div><dt>{b("village")}</dt><dd>{a.village}</dd></div>
            <div><dt>{b("lifecycle_label")}</dt><dd>{b(`lifecycle.${a.lifecycle}`)}</dd></div>
            <div><dt>{b("detail.gps")}</dt><dd>{located ? `${fmtNum(a.gpsLat, locale, 5)}, ${fmtNum(a.gpsLng, locale, 5)}` : <span className="muted">{b("detail.no_gps")}</span>}</dd></div>
            <div><dt>{b("pump_kw")}</dt><dd>{a.pumpRatingKw ? kw(a.pumpRatingKw) : "—"}</dd></div>
            <div><dt>{b("detail.caretaker")}</dt><dd>{caretakers.length === 0 ? <span className="muted">{b("detail.caretaker_none")}</span> : caretakers.map((c, i) => (
              <span key={i} style={{ display: "block" }}>{c.name}{c.phone ? ` · ${c.phone}` : ""}<span className="sub">{b("detail.trained_on", { date: date(c.trainedOn) })}</span></span>
            ))}</dd></div>
            <div><dt>{b("detail.water")}</dt><dd>{lastWq ? <>{date(lastWq.testedOn)}<span className="sub">{b("detail.water_val", { ntu: fmtNum(lastWq.turbidityNtu, locale, 1), ecoli: fmtNum(lastWq.ecoliPer100ml, locale, 0) })}</span></> : <span className="muted">{b("detail.water_none")}</span>}</dd></div>
            <div><dt>{b("detail.committee")}</dt><dd>{a.waterCommittee || "—"}</dd></div>
            <div><dt>{b("detail.commissioned_on")}</dt><dd>{date(a.commissionedOn)}</dd></div>
            <div><dt>{b("detail.handed_over_on")}</dt><dd>{date(a.handedOverOn)}</dd></div>
            <div><dt>{b("detail.sop")}</dt><dd>{b(a.sopHandedOver ? "detail.yes" : "detail.no")}</dd></div>
            {a.hasTaps === false && <div><dt>{b("ft.taps")}</dt><dd className="muted">{b("detail.no_taps_note")}</dd></div>}
            <div style={{ gridColumn: "1 / -1" }}><dt>{b("detail.status")}</dt><dd>
              {row.indicator.counted
                ? <span className="badge" style={{ borderColor: DUE_COLORS.ok }}>✓ {b("detail.counts_note")}</span>
                : <>{b("detail.not_counted")}<ul className="fails">{row.indicator.fails.map((k) => <li key={k}>{b(`fail.${k}`)}</li>)}</ul></>}
            </dd></div>
          </dl>
        </Section>
        {located && (
          <Section icon="map" title={b("detail.map")} flush>
            <div className="detail-map"><MapView overlays={overlays} height={340} zoom={13} center={[a.gpsLng!, a.gpsLat!]} ariaLabel={a.code} /></div>
          </Section>
        )}

        <Section id="schedule" icon="calendar" title={b("detail.schedule")} description={b("detail.schedule_intro")} flush className="full">
          {row.due.length === 0 ? (
            <div className="fsec-pad"><Notice tone="info">{b("detail.not_in_service")}</Notice></div>
          ) : (
            <Table
              flush
              rows={[...row.due].sort((p, q) => (p.status === "each_visit" ? 1 : 0) - (q.status === "each_visit" ? 1 : 0) || String(p.dueOn).localeCompare(String(q.dueOn)))}
              rowKey={(r) => r.taskKey}
              empty={b("detail.not_in_service")}
              columns={[
                { key: "task", header: b("detail.task"), render: (r) => <strong>{r.label[locale] || r.label.en}</strong> },
                { key: "last", header: b("detail.last_done"), render: (r) => (r.lastDoneOn ? date(r.lastDoneOn) : b("detail.never")) },
                { key: "next", header: b("detail.next_due"), render: (r) => (r.status === "each_visit" ? b("detail.each_visit") : <>{date(r.dueOn)}{r.daysOverdue > 0 && <span className="sub muted small"> · {tn(locale, "boreholes.detail.days_late", r.daysOverdue)}</span>}</>) },
                { key: "status", header: b("maintenance"), render: (r) => <span className="badge" style={{ borderColor: DUE_COLORS[r.status] }}>{DUE_ICON[r.status]} {b(`due.${r.status}`)}</span> },
              ]}
            />
          )}
        </Section>

        <Section id="faults" icon="alert" title={b("detail.faults")} count={d.openFaults.length} flush className="full">
          <Table
            flush
            rows={d.openFaults}
            rowKey={(r) => r.id}
            empty={b("detail.no_faults")}
            emptyIcon="check"
            columns={[
              { key: "desc", header: b("fault.open"), render: (r) => <><strong>{r.description}</strong>{r.taskKey && <div className="muted small">{label(r.taskKey)}</div>}</> },
              { key: "opened", header: b("detail.visit_date"), render: (r) => date(r.openedOn) },
              { key: "sev", header: b("detail.severity"), render: (r) => <span className={r.severity === "no_water" ? "pill bad" : r.severity === "reduced" ? "pill warn" : "pill"}>{b(`m.sev.${r.severity}`)}</span> },
              { key: "photos", header: b("detail.photos"), render: (r) => <Thumbs ids={r.photos} /> },
            ]}
          />
        </Section>

        <Section id="flow" icon="drop" title={b("ft.title")} description={b("ft.intro")} count={d.flowTests.length} flush className="full">
          <Table
            flush
            rows={d.flowTests}
            rowKey={(r) => r.id}
            empty={b("ft.none")}
            emptyIcon="drop"
            columns={[
              { key: "date", header: b("ft.date"), render: (r) => <strong className="nowrap">{date(r.testedOn)}</strong> },
              { key: "flow", header: b("ft.value"), numeric: true, render: (r) => <strong>{fmtNum(r.flowLpm, locale, 1)}</strong> },
              { key: "pump", header: b("ft.pump"), render: (r) => (r.pumpDelivers === null ? "—" : <span className={r.pumpDelivers ? "pill good" : "pill bad"}>{b(r.pumpDelivers ? "ft.yes" : "ft.no")}</span>) },
              { key: "taps", header: b("ft.taps"), render: (r) => (r.pumpDelivers === null ? "—" : r.tankFillsTapsOk === null ? <span className="pill">{b("ft.no_taps")}</span> : <span className={r.tankFillsTapsOk ? "pill good" : "pill bad"}>{b(r.tankFillsTapsOk ? "ft.yes" : "ft.no")}</span>) },
              { key: "by", header: b("ft.undertaker"), render: (r) => <>{r.undertaker}{r.notes && <div className="muted small">{r.notes}</div>}</> },
              { key: "src", header: b("ft.source"), render: (r) => <span className="muted small">{b(r.editable ? "ft.from_web" : "ft.from_phone")}</span> },
              ...(canFixFlow ? [{ key: "act", header: "", render: (r: (typeof d.flowTests)[number]) => (r.editable ? (
                <span className="row-tools">
                  <ModalEdit label={b("ft.edit")} close={f("close")}>
                    <form action={editFlowTestAction}>
                      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="siteId" value={id} /><input type="hidden" name="testId" value={r.id} />
                      <FlowFields b={b} f={f} today={today} k={r.id} v={{ testedOn: r.testedOn, flowLpm: coord(r.flowLpm, locale), undertaker: r.undertaker === "—" ? "" : r.undertaker,
                        pump: r.pumpDelivers === null ? "" : r.pumpDelivers ? "yes" : "no", taps: r.tankFillsTapsOk === null ? "na" : r.tankFillsTapsOk ? "yes" : "no", notes: r.notes ?? "" }} />
                      <FormFooter><SubmitButton icon="check" pending={f("saving")}>{b("ft.save")}</SubmitButton></FormFooter>
                    </form>
                  </ModalEdit>
                  <form action={deleteFlowTestAction}>
                    <input type="hidden" name="locale" value={locale} /><input type="hidden" name="siteId" value={id} /><input type="hidden" name="testId" value={r.id} />
                    <ConfirmButton label={b("ft.delete")} confirm={b("ft.delete_confirm")} yes={f("yesRemove")} no={f("keep")} />
                  </form>
                </span>
              ) : <span className="muted small" title={b("ft.phone_readonly")}>—</span>) }] : []),
            ]}
          />
          {canFlow && (
            <Adder label={b("ft.add")} cancel={f("cancel")} resetKey={sp.ok}>
              <form action={addFlowTestAction}>
                <input type="hidden" name="locale" value={locale} /><input type="hidden" name="siteId" value={id} />
                <FlowFields b={b} f={f} today={today} k="new" v={{ testedOn: today, flowLpm: "", undertaker: "", pump: "", taps: a.hasTaps === false ? "na" : "", notes: "" }} />
                <FormFooter><SubmitButton icon="check" pending={f("saving")}>{b("ft.save")}</SubmitButton></FormFooter>
              </form>
            </Adder>
          )}
        </Section>

        <Section id="visits" icon="clock" title={b("detail.visits")} count={d.visits.length} flush className="full">
          <Table
            flush
            rows={d.visits}
            rowKey={(r) => r.id}
            empty={b("detail.no_visits")}
            emptyIcon="clock"
            columns={[
              { key: "date", header: b("detail.visit_date"), render: (r) => <strong className="nowrap">{date(r.visitedOn)}</strong> },
              { key: "kind", header: b("detail.visit_kind"), render: (r) => b(`kind.${r.kind}`) },
              { key: "tech", header: b("detail.technician"), render: (r) => r.technician },
              { key: "check", header: b("detail.checklist"), render: (r) => (r.done === 0 ? "—" : r.bad === 0
                ? <span className="pill good">{tn(locale, "boreholes.detail.checklist_ok", r.done)}</span>
                : <span className="pill bad">{tn(locale, "boreholes.detail.checklist_bad", r.done, { bad: r.bad })}</span>) },
              { key: "flow", header: b("flow"), numeric: true, render: (r) => (r.flowLpm === null ? "—" : b("lpm", { n: fmtNum(r.flowLpm, locale, 1) })) },
              { key: "photos", header: b("detail.photos"), render: (r) => <Thumbs ids={r.photos} /> },
            ]}
          />
        </Section>

        <Section id="population" icon="users" title={b("detail.population")} flush className="full">
          <Table
            flush
            rows={d.populations}
            rowKey={(r) => r.id}
            empty={b("detail.population_none")}
            emptyIcon="users"
            columns={[
              { key: "on", header: b("detail.visit_date"), render: (r) => date(r.estimatedOn) },
              { key: "method", header: b("detail.method"), render: (r) => b(`population.method.${r.method}`) },
              { key: "pop", header: b("detail.population_n"), numeric: true, render: (r) => <strong>{fmtNum(r.population, locale)}</strong> },
              { key: "notes", header: b("detail.notes"), render: (r) => r.notes || "—" },
            ]}
          />
          {canPop && (
            <Adder label={b("detail.pop_add")} cancel={f("cancel")} resetKey={sp.ok}>
              <form action={addPopulationAction}>
                <input type="hidden" name="locale" value={locale} /><input type="hidden" name="siteId" value={id} />
                <Fields>
                  <Field span={4} label={b("detail.visit_date")}><input type="date" name="estimatedOn" required defaultValue={today} max={today} /></Field>
                  <Field span={8} label={b("detail.method")}>
                    <select name="method" defaultValue="household_count">
                      {["household_count", "collection_headcount", "village_census"].map((m) => <option key={m} value={m}>{b(`population.method.${m}`)}</option>)}
                    </select>
                  </Field>
                  <Field span={3} label={b("detail.households")} optional={f("optional")}><input name="households" inputMode="numeric" pattern="[0-9 ]*" /></Field>
                  <Field span={3} label={b("detail.household_size")} optional={f("optional")}><input name="size" inputMode="decimal" pattern="[0-9]+([.,][0-9]+)?" /></Field>
                  <Field span={3} label={b("detail.headcount")} optional={f("optional")}><input name="headcount" inputMode="numeric" pattern="[0-9 ]*" /></Field>
                  <Field span={3} label={b("detail.population_n")} optional={f("optional")}><input name="population" inputMode="numeric" pattern="[0-9 ]*" /></Field>
                  <Field span={12} label={b("detail.notes")} optional={f("optional")} hint={b("detail.pop_hint")}><input name="notes" maxLength={500} /></Field>
                </Fields>
                <FormFooter><SubmitButton icon="check" pending={f("saving")}>{b("detail.save_pop")}</SubmitButton></FormFooter>
              </form>
            </Adder>
          )}
        </Section>

        {canEdit && (
          <Section id="edit" icon="pencil" title={b("detail.edit")} description={b("detail.edit_intro")} className="full">
            <form action={updateBoreholeAction}>
              <input type="hidden" name="locale" value={locale} /><input type="hidden" name="siteId" value={id} />
              <input type="hidden" name="seen" value={JSON.stringify(a.fieldVersions ?? {})} />
              <p className="fgroup">{b("detail.basics")}</p>
              <Fields>
                <Field span={4} label={b("village")}><input name="village" required maxLength={120} defaultValue={a.village} /></Field>
                <Field span={4} label={b("lifecycle_label")}>
                  <select name="lifecycle" defaultValue={a.lifecycle}>{LIFECYCLE.map((k) => <option key={k} value={k}>{b(`lifecycle.${k}`)}</option>)}</select>
                </Field>
                <Field span={4} label={b("pump_kw")} optional={f("optional")}>
                  <select name="pump" defaultValue={a.pumpRatingKw == null ? "" : String(a.pumpRatingKw)}>
                    <option value="">—</option>
                    {[...new Set([...PUMPS, ...(a.pumpRatingKw ? [a.pumpRatingKw] : [])])].sort().map((p) => <option key={p} value={String(p)}>{kw(p)}</option>)}
                  </select>
                </Field>
                <Field span={4} label={b("lat")} optional={f("optional")} hint={f("latLngHint")} error={f("coordsError")}>
                  <input name="lat" inputMode="decimal" pattern="\s*(-|−)?[0-9]+([.,][0-9]+)?\s*" defaultValue={coord(a.gpsLat, locale)} />
                </Field>
                <Field span={4} label={b("lng")} optional={f("optional")} error={f("coordsError")}>
                  <input name="lng" inputMode="decimal" pattern="\s*(-|−)?[0-9]+([.,][0-9]+)?\s*" defaultValue={coord(a.gpsLng, locale)} />
                </Field>
                <Field span={4} label={b("detail.committee")} optional={f("optional")}><input name="waterCommittee" maxLength={200} defaultValue={a.waterCommittee ?? ""} /></Field>
              </Fields>
              <p className="fgroup">{b("detail.handover")}</p>
              <Fields>
                <Field span={4} label={b("detail.commissioned_on")} optional={f("optional")}><input type="date" name="commissionedOn" max={today} defaultValue={a.commissionedOn ?? ""} /></Field>
                <Field span={4} label={b("detail.handed_over_on")} optional={f("optional")}><input type="date" name="handedOverOn" max={today} defaultValue={a.handedOverOn ?? ""} /></Field>
                <div className="fld s4 fld-bare"><span /><label className="check-row"><input type="checkbox" name="sopHandedOver" value="yes" defaultChecked={a.sopHandedOver} /><span>{b("detail.sop")}</span></label><span /></div>
                <div className="fld s12 fld-bare"><span /><label className="check-row"><input type="checkbox" name="hasTaps" value="yes" defaultChecked={a.hasTaps !== false} /><span>{b("detail.has_taps")}</span></label><span /></div>
                <Field span={12} label={b("detail.notes")} optional={f("optional")}><textarea name="notes" rows={2} maxLength={4000} defaultValue={a.notes ?? ""} /></Field>
              </Fields>
              <p className="fgroup">{b("detail.add_wq")}</p>
              <Fields>
                <Field span={4} label={b("detail.wq_on")} optional={f("optional")} hint={b("detail.extra_hint")}><input type="date" name="wqOn" max={today} /></Field>
                <Field span={4} label={b("detail.wq_ntu")} optional={f("optional")}><input name="wqNtu" inputMode="decimal" pattern="[0-9]+([.,][0-9]+)?" /></Field>
                <Field span={4} label={b("detail.wq_ecoli")} optional={f("optional")}><input name="wqEcoli" inputMode="numeric" pattern="[0-9]+([.,][0-9]+)?" /></Field>
              </Fields>
              <p className="fgroup">{b("detail.add_ct")}</p>
              <Fields>
                <Field span={4} label={b("detail.ct_name")} optional={f("optional")} hint={b("detail.extra_hint")}><input name="ctName" maxLength={120} /></Field>
                <Field span={4} label={b("detail.ct_phone")} optional={f("optional")}><input name="ctPhone" type="tel" maxLength={20} /></Field>
                <Field span={4} label={b("detail.ct_on")} optional={f("optional")}><input type="date" name="ctOn" max={today} /></Field>
              </Fields>
              <FormFooter><SubmitButton icon="check" pending={f("saving")}>{b("detail.save")}</SubmitButton></FormFooter>
            </form>
          </Section>
        )}
      </div>
    </section>
  );
}
