import Link from "next/link";
import { redirect } from "next/navigation";
import { isLocale, t, type Locale } from "@eu/core/i18n";
import { currentPrincipal } from "@/lib/session";
import { loadOverview } from "@/lib/overview";
import { loadDashboard } from "@/lib/dashboard";
import { todayDrc } from "@/lib/dates";
import { Icon } from "@/components/icons";
import { OpsMap } from "@/components/ops-map";
import { opsMapLabels } from "./operations-map/labels";

export const dynamic = "force-dynamic";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: l } = await params;
  if (!isLocale(l)) return null;
  const locale: Locale = l;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  const u = (k: string, v?: Record<string, string | number>) => t(locale, `ui.${k}`, v);
  const ov = await loadOverview(me);
  const a = ov.access;
  const today = todayDrc();
  const rows = a.dashboard ? await loadDashboard(today, "captured", today) : [];
  const earned = rows.reduce((n, r) => n + (r.valueEur ?? 0), 0);
  const ceiling = rows.reduce((n, r) => n + r.capEur, 0);
  const eur = (n: number) => n.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const nf = (n: number, d = 0) => n.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: d });
  const b = `/${locale}`;
  const first = me.name.split(/\s+/)[0] ?? me.name;

  type Card = { key: string; href: string; icon: string; title: string; sub: string; figs: [string, string][]; empty: boolean };
  const cards: Card[] = [];
  if (ov.schools) cards.push({
    key: "schools", href: `${b}/schools`, icon: "school", title: u("home.schools.title"), sub: u("home.schools.sub"), empty: ov.schools.count === 0,
    figs: [[u("home.schools.a"), nf(ov.schools.count)], [u("home.schools.b"), nf(ov.schools.pupils)], [u("home.schools.c"), ov.schools.presentPct == null ? "–" : `${ov.schools.presentPct}%`]],
  });
  if (ov.boreholes) cards.push({
    key: "boreholes", href: `${b}/boreholes`, icon: "drop", title: u("home.boreholes.title"), sub: u("home.boreholes.sub"), empty: ov.boreholes.count === 0,
    figs: [[u("home.boreholes.a"), nf(ov.boreholes.count)], [u("home.boreholes.b"), nf(ov.boreholes.counted)], [u("home.boreholes.c"), nf(ov.boreholes.overdue)], [u("home.boreholes.d"), nf(ov.boreholes.people)]],
  });
  for (const s of ["bamboo", "miombo"] as const) {
    const f = ov[s];
    if (f) cards.push({
      key: s, href: `${b}/forestry/${s}`, icon: s === "bamboo" ? "bamboo" : "tree", title: u(`home.${s}.title`), sub: u(`home.${s}.sub`), empty: f.plots === 0,
      figs: [[u(`home.${s}.a`), nf(f.plots)], [u(`home.${s}.b`), nf(f.haMapped, 2)], [u(`home.${s}.c`), nf(f.haCounted, 2)], [u(`home.${s}.d`), nf(f.planted)]],
    });
  }

  const steps = [
    ov.schools && { key: "school", done: ov.schools.count > 0, href: `${b}/schools` },
    ov.bamboo && { key: "kmz", done: ov.bamboo.plots > 0, href: `${b}/forestry/bamboo/import` },
    ov.miombo && { key: "miombo", done: ov.miombo.plots > 0, href: `${b}/forestry/miombo/import` },
    ov.boreholes && { key: "borehole", done: ov.boreholes.count > 0, href: `${b}/boreholes` },
    a.templates && { key: "template", done: ov.setup.templates > 0, href: `${b}/boreholes/templates` },
    a.users && { key: "users", done: ov.setup.users > 1, href: `${b}/admin/users` },
    a.phones && { key: "phone", done: ov.setup.phones > 0, href: `${b}/admin/phones` },
  ].filter(Boolean) as { key: string; done: boolean; href: string }[];
  const left = steps.filter((s) => !s.done).length;
  const located = Object.values(ov.map).reduce((n, c) => n + c.features.length, 0);

  return (
    <>
      <section className="atlas" aria-labelledby="welcome">
        <div className="atlas-map">
          {located > 0 ? (
            <OpsMap locale={locale} data={ov.map} labels={opsMapLabels(locale)} height="100%" compact />
          ) : (
            <div className="atlas-blank" aria-hidden />
          )}
        </div>
        <div className="atlas-panel">
          <h1 id="welcome">{u("home.greeting", { name: first })}</h1>
          <p>{u("home.intro")}</p>
          {a.dashboard && (
            <Link href={`${b}/dashboard`} className="atlas-earned">
              <span className="muted-on-dark">{u("home.earned")}</span>
              <b>{eur(earned)}</b>
              <span className="muted-on-dark">{u("home.ofCeiling", { n: eur(ceiling) })}</span>
              <span className="meter" aria-hidden><span style={{ width: `${ceiling ? Math.max(0.5, (earned / ceiling) * 100) : 0}%` }} /></span>
            </Link>
          )}
          {a.opsMap && <Link href={`${b}/operations-map`} className="btn accent sm"><Icon name="map" size={16} />{u("home.openMap")}</Link>}
        </div>
      </section>

      {cards.length === 0 && <div className="empty-state"><p>{u("home.noAccess")}</p></div>}

      <div className="overview-grid">
        <section aria-label={u("home.streamsTitle")} className="stream-list">
          {cards.map((c) => (
            <Link key={c.key} href={c.href} className="stream-card" data-stream={c.key}>
              <div className="sc-head">
                <span className="sc-icon"><Icon name={c.icon} size={22} /></span>
                <div>
                  <div className="sc-title">{c.title}</div>
                  <div className="sc-sub">{c.sub}</div>
                </div>
                <Icon name="arrow" size={18} className="sc-go" />
              </div>
              <dl>
                {c.figs.map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
            </Link>
          ))}
        </section>

        {steps.length > 0 && (
          <aside className="card setup">
            <h2>{u("home.setupTitle")}</h2>
            <p className="muted small">{left === 0 ? "✓" : u("home.setupIntro")}</p>
            <ol className="steps">
              {steps.map((s) => (
                <li key={s.key} className={s.done ? "done" : undefined}>
                  <span className="tick" aria-hidden>{s.done && <Icon name="check" size={14} />}</span>
                  <div>
                    <div className="step-title">{u(`home.steps.${s.key}.title`)}</div>
                    {!s.done && <div className="step-body">{u(`home.steps.${s.key}.body`)}</div>}
                    {!s.done && <Link className="step-link" href={s.href}>{u(`home.steps.${s.key}.link`)}</Link>}
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>
    </>
  );
}
