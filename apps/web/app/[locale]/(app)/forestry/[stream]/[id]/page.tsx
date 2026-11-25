import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { isLocale, t, type Locale } from "@eu/core/i18n";
import { fa, type ForestryStream } from "@eu/forestry";
import { plots } from "@eu/forestry/db/schema";
import { featureCollection } from "@eu/maps";
import { MapView } from "@eu/maps/web";
import { currentPrincipal } from "@/lib/session";
import { db } from "@/lib/http";
import { permissions } from "@/lib/registry";
import { todayDrc } from "@/lib/dates";
import { loadPlotDetail } from "@/lib/plot-detail";
import { fmtDate, fmtNum, tn } from "@/lib/format";
import { titled } from "@/lib/meta";
import { NoAccess } from "@/components/no-access";
import { Icon } from "@/components/icons";
import { Chip, ChoiceGroup, Field, Fields, FormFooter, Notice, PageHeader, Section, SubmitButton, Table } from "@/components/ui";
import { approveBoundaryAction, updatePlotAction } from "./actions";

export const dynamic = "force-dynamic";
export const generateMetadata = titled(async (l, p) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [r] = await (db() as any).select({ code: plots.code }).from(plots).where(and(eq(plots.scopeId, p.id ?? ""), eq(plots.stream, p.stream === "miombo" ? "miombo" : "bamboo")));
  const s = t(l, `forestry.${p.stream === "miombo" ? "miombo" : "bamboo"}`);
  return r ? `${r.code} · ${s}` : s;
});

const OUTCOME_COLORS: Record<string, string> = { counted: "#1C6B33", below_density: "#E8A827", missing_evidence: "#E8A827", not_planted: "#9AA39A", no_authoritative_boundary: "#B3261E" };
const OUTCOME_ICON: Record<string, string> = { counted: "✓", below_density: "▲", missing_evidence: "▲", not_planted: "○", no_authoritative_boundary: "✕" };
const STATUSES = ["planned", "pegged", "planted", "established", "failed", "harvested"];

function Thumbs({ ids }: { ids: string[] }) {
  if (ids.length === 0) return <span className="muted">—</span>;
  return <span className="thumbs">{ids.map((id) => <a key={id} href={`/api/files/${id}`} target="_blank" rel="noreferrer"><img src={`/api/files/${id}`} alt="" loading="lazy" /></a>)}</span>;
}

export default async function PlotPage({ params, searchParams }: {
  params: Promise<{ locale: string; stream: string; id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { locale: l, stream, id } = await params;
  if (!isLocale(l) || (stream !== "bamboo" && stream !== "miombo")) notFound();
  const locale: Locale = l;
  const s = stream as ForestryStream;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  const fo = (k: string, v?: Record<string, string | number>) => t(locale, `forestry.${k}`, v);
  if (!permissions.can(me.user, fa(s, "plot.read"), { stream: s, siteId: id })) return <NoAccess locale={locale} reason={fo("forbidden")} />;
  const today = todayDrc();
  const d = await loadPlotDetail(s, id, today);
  if (!d) notFound();
  const sp = await searchParams;
  const { plot: p, result: r, extras: x } = d;
  const canApprove = permissions.can(me.user, fa(s, "boundary.approve"), { stream: s, siteId: id });
  const canEdit = permissions.can(me.user, fa(s, "plot.write"), { stream: s, siteId: id });
  const f = (k: string) => t(locale, `ui.form.${k}`);
  const date = (v: string | Date | null | undefined) => fmtDate(v, locale);
  const latin = new Map(d.settings.speciesList.map((x) => [x.key, x.latin]));
  const sp2 = (k: string) => latin.get(k) ?? k;
  const area = d.latest?.areaHa ?? r.areaHa;
  const perHa = area > 0 ? x.plants / area : 0;
  const okText = sp.ok === "approved" ? fo("detail.approved_ok") : sp.ok === "saved" ? fo("detail.saved") : sp.ok === "conflict" ? fo("detail.conflict") : null;
  const errText = sp.error ? (sp.error === "invalid" ? fo("detail.invalid") : sp.error === "forbidden" ? fo("forbidden") : fo("detail.err", { reason: sp.error })) : null;
  const lastVisit = d.visits[0];
  const overlays = d.latest ? [{
    id: "plot", kind: "fill" as const, defaultColor: OUTCOME_COLORS[r.outcome] ?? "#AFC437", labelBy: "code", solidWhen: "approved",
    data: featureCollection([{ id, geometry: d.latest.geom, properties: { code: p.code, approved: d.latestApproved } }]),
  }] : [];

  return (
    <section className="module" data-stream={s}>
      <Link className="back-link" href={`/${locale}/forestry/${s}`}><Icon name="back" size={16} />{fo("detail.back")}</Link>
      <PageHeader
        icon={<Icon name={s === "bamboo" ? "bamboo" : "tree"} size={24} />}
        eyebrow={fo(s)}
        title={p.code}
        subtitle={<>{p.village} · {fo(`status.${p.status}`)}</>}
        actions={<span className="badge" style={{ borderColor: OUTCOME_COLORS[r.outcome] }}>{OUTCOME_ICON[r.outcome]} {fo(`outcome.${r.outcome}`)}</span>}
      />
      {okText && <Notice tone={sp.ok === "conflict" ? "warning" : "success"}>{okText}</Notice>}
      {errText && <Notice tone="error">{errText}</Notice>}

      <div className="detail-grid">
        <Section id="key" icon="info" title={fo("detail.key")}>
          <dl className="kv">
            <div><dt>{fo("area_ha")}</dt><dd className="big">{fmtNum(area, locale, 2)}</dd></div>
            <div><dt>{fo("detail.per_ha")}</dt><dd className="big">{fmtNum(perHa, locale, 0)}</dd><dd className="sub muted small">{fo("detail.rule", { n: fmtNum(d.settings.densityRulePerHa, locale) })}</dd></div>
            <div><dt>{fo("detail.total_planted")}</dt><dd className="big">{fmtNum(x.plants, locale)}</dd>
              {x.replacementPlants > 0 && <dd className="sub muted small">{fo("detail.incl_replacement", { n: fmtNum(x.replacementPlants, locale) })}</dd>}</div>
            <div><dt>{fo("survival")}</dt><dd className="big">{x.survivalPct === null ? "—" : `${fmtNum(x.survivalPct, locale, 0)} %`}</dd>
              {x.survivalOn && <dd className="sub muted small">{date(x.survivalOn)}</dd>}</div>
            <div><dt>{fo("village")}</dt><dd>{p.village}</dd></div>
            <div><dt>{fo("detail.status")}</dt><dd>{fo(`status.${p.status}`)}</dd></div>
            {p.localName && <div><dt>{fo("detail.local_name")}</dt><dd>{p.localName}</dd></div>}
            <div><dt>{fo("planted_on")}</dt><dd>{date(x.plantedOn)}</dd></div>
            <div><dt>{fo("detail.species")}</dt><dd>{p.species.length ? <i>{p.species.map(sp2).join(", ")}</i> : "—"}</dd></div>
            <div><dt>{fo("detail.public")}</dt><dd>{t(locale, p.publicVisible ? "boreholes.detail.yes" : "boreholes.detail.no")}</dd></div>
            <div style={{ gridColumn: "1 / -1" }}><dt>{fo("outcome_label")}</dt><dd><span className="badge" style={{ borderColor: OUTCOME_COLORS[r.outcome] }}>{OUTCOME_ICON[r.outcome]} {fo(`outcome.${r.outcome}`)}</span></dd></div>
          </dl>
        </Section>

        <Section id="boundary" icon="map" title={fo("detail.boundary")}>
          {d.latest ? (
            <>
              <div className="detail-map"><MapView overlays={overlays} height={300} ariaLabel={p.code} /></div>
              <p className="muted small" style={{ margin: "10px 0" }}>{fo("detail.source_line", { s: fo(`detail.source.${d.latest.source}`), date: date(d.latest.recordedAt) })}</p>
              {d.approval && <Notice tone={d.latestApproved ? "success" : "info"}>
                {fo("detail.boundary_approved", { date: date(d.approval.effectiveFrom) })}
                {d.approval.checkedAgainst && <> {fo("detail.checked_against", { x: d.approval.checkedAgainst })}</>}
                {!d.latestApproved && <> {fo("detail.boundary_newer")}</>}
              </Notice>}
              {!d.approval && <Notice tone="warning">{fo("detail.boundary_pending")}</Notice>}
              {canApprove && !d.latestApproved && (
                <form action={approveBoundaryAction} style={{ marginTop: 14 }}>
                  <input type="hidden" name="locale" value={locale} /><input type="hidden" name="stream" value={s} />
                  <input type="hidden" name="siteId" value={id} /><input type="hidden" name="boundaryId" value={d.latest.id} />
                  <p className="small" style={{ marginTop: 0 }}>{fo("detail.approve_intro")}</p>
                  <Fields>
                    <Field span={4} label={fo("detail.approve_from")}><input type="date" name="effectiveFrom" required defaultValue={today} max={today} /></Field>
                    <Field span={8} label={fo("detail.approve_checked")} optional={f("optional")}><input name="checkedAgainst" maxLength={200} /></Field>
                    <Field span={12} label={fo("detail.approve_note")} optional={f("optional")}><input name="note" maxLength={1000} /></Field>
                  </Fields>
                  <FormFooter><SubmitButton icon="check" pending={f("saving")}>{fo("detail.approve")}</SubmitButton></FormFooter>
                </form>
              )}
            </>
          ) : <Notice tone="warning">{fo("detail.boundary_none")}</Notice>}
        </Section>

        <Section id="planting" icon="bamboo" title={fo("detail.plantings")} count={d.plantings.length} flush className="full">
          <Table
            flush
            rows={d.plantings}
            rowKey={(e) => e.id}
            empty={fo("detail.planting_none")}
            emptyIcon="calendar"
            columns={[
              { key: "date", header: fo("planting.date"), render: (e) => <strong className="nowrap">{date(e.plantedOn)}</strong> },
              { key: "kind", header: fo("detail.kind"), render: (e) => (e.isGapFilling ? <span className="pill info">{fo("detail.replacement")}</span> : fo("detail.first")) },
              { key: "species", header: fo("planting.species"), render: (e) => e.lines.map((ln, i) => <div key={i}><i>{sp2(ln.species)}</i> · {fmtNum(Number(ln.count), locale)}</div>) },
              { key: "count", header: fo("planting.count"), numeric: true, render: (e) => <strong>{fmtNum(e.lines.reduce((n, ln) => n + ln.count, 0), locale)}</strong> },
              { key: "by", header: fo("m.team"), render: (e) => e.team || e.by },
              { key: "photos", header: fo("detail.photos"), render: (e) => <Thumbs ids={e.photos} /> },
            ]}
          />
        </Section>

        <Section id="monitoring" icon="search" title={fo("detail.monitoring")} count={d.visits.length} flush className="full">
          {lastVisit?.estimate && (
            <div className="fsec-pad">
              <dl className="kv">
                <div><dt>{fo("detail.latest_visit")}</dt><dd>{date(lastVisit.visitedOn)}<span className="sub">{tn(locale, "forestry.detail.samples", lastVisit.estimate.samplesUsed)}</span></dd></div>
                {lastVisit.estimate.survivalPct && <div><dt>{fo("survival")}</dt><dd>{fo("detail.survival_val", { pct: fmtNum(lastVisit.estimate.survivalPct.value, locale, 0) })}
                  {Number.isFinite(lastVisit.estimate.survivalPct.low) && <span className="sub">{fo("detail.range", { low: fmtNum(lastVisit.estimate.survivalPct.low, locale, 0), high: `${fmtNum(lastVisit.estimate.survivalPct.high, locale, 0)} %` })}</span>}</dd></div>}
                <div><dt>{fo("detail.per_ha")}</dt><dd>{fo("detail.living_val", { n: fmtNum(lastVisit.estimate.livingPerHa.value, locale, 0) })}
                  {Number.isFinite(lastVisit.estimate.livingPerHa.low) && <span className="sub">{fo("detail.range", { low: fmtNum(lastVisit.estimate.livingPerHa.low, locale, 0), high: fmtNum(lastVisit.estimate.livingPerHa.high, locale, 0) })}</span>}</dd></div>
              </dl>
            </div>
          )}
          <Table
            flush
            rows={d.visits}
            rowKey={(v) => v.id}
            empty={fo("detail.visit_none")}
            emptyIcon="search"
            columns={[
              { key: "date", header: fo("m.visit_date"), render: (v) => <strong className="nowrap">{date(v.visitedOn)}</strong> },
              { key: "survival", header: fo("survival"), numeric: true, render: (v) => (v.estimate?.survivalPct ? `${fmtNum(v.estimate.survivalPct.value, locale, 0)} %` : "—") },
              { key: "living", header: fo("detail.per_ha"), numeric: true, render: (v) => (v.estimate ? fmtNum(v.estimate.livingPerHa.value, locale, 0) : "—") },
              { key: "threats", header: fo("detail.threats"), render: (v) => (v.threats.length ? v.threats.map((k) => fo(`threat.${k}`)).join(", ") : "—") },
              { key: "by", header: t(locale, "boreholes.detail.technician"), render: (v) => v.by },
              { key: "photos", header: fo("detail.photos"), render: (v) => <Thumbs ids={v.photos} /> },
            ]}
          />
        </Section>

        {canEdit && (
          <Section id="edit" icon="pencil" title={fo("detail.edit")} className="full">
            <form action={updatePlotAction}>
              <input type="hidden" name="locale" value={locale} /><input type="hidden" name="stream" value={s} /><input type="hidden" name="siteId" value={id} />
              <input type="hidden" name="seen" value={JSON.stringify(p.fieldVersions ?? {})} />
              <Fields>
                <Field span={4} label={fo("village")}><input name="village" required maxLength={120} defaultValue={p.village} /></Field>
                <Field span={4} label={fo("detail.local_name")} optional={f("optional")}><input name="localName" maxLength={120} defaultValue={p.localName ?? ""} /></Field>
                <Field span={4} label={fo("detail.status")}>
                  <select name="status" defaultValue={p.status}>{STATUSES.map((k) => <option key={k} value={k}>{fo(`status.${k}`)}</option>)}</select>
                </Field>
                {d.settings.speciesList.length > 0 && (
                  <ChoiceGroup legend={fo("detail.species")} optional={f("optional")}>
                    {d.settings.speciesList.map((x) => <Chip key={x.key} name="species" value={x.key} defaultChecked={p.species.includes(x.key) || p.species.includes(x.latin)} label={<em>{x.latin}</em>} />)}
                    {p.species.filter((v) => !d.settings.speciesList.some((x) => x.key === v || x.latin === v)).map((v) => <Chip key={v} name="species" value={v} defaultChecked label={<em>{v}</em>} />)}
                  </ChoiceGroup>
                )}
                <div className="fld s12 fld-bare"><span /><label className="check-row"><input type="checkbox" name="publicVisible" value="yes" defaultChecked={p.publicVisible} /><span>{fo("detail.public")}</span></label><span /></div>
              </Fields>
              <FormFooter><SubmitButton icon="check" pending={f("saving")}>{fo("detail.save")}</SubmitButton></FormFooter>
            </form>
          </Section>
        )}
      </div>
    </section>
  );
}
