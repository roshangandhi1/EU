"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Field, Fields, FormFooter, Notice } from "@/components/ui";
import { fmtNum, parseDecimal } from "@/lib/format";

type L = Record<"code" | "village" | "lat" | "lng" | "pump" | "stage" | "create" | "created" | "optional" | "saving" | "latLngHint" | "coordsError" | "open", string> & {
  lifecycle: Record<string, string>; errors: Record<string, string>;
};

const COORD = "\\s*(-|−)?[0-9]+([.,][0-9]+)?\\s*";

/**
 * Adds a borehole site. Coordinates are optional (they can come from the phone later) but must fall
 * inside the DRC; they accept a decimal comma or point, as people type them.
 */
export function NewBoreholeForm({ locale, labels }: { locale: string; labels: L }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; siteId?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const err = (code: string) => labels.errors[code] ?? labels.errors.unknown!.replace("{reason}", code);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const f = new FormData(e.currentTarget);
    const lat = parseDecimal(String(f.get("lat") ?? ""));
    const lng = parseDecimal(String(f.get("lng") ?? ""));
    const outside = (n: number | null, min: number, max: number) => n !== null && (Number.isNaN(n) || n < min || n > max);
    if (outside(lat, -14, 6) || outside(lng, 12, 32) || (lat === null) !== (lng === null)) return setMsg({ ok: false, text: err("coords") });
    const code = String(f.get("code") ?? "").trim().toUpperCase();
    setBusy(true);
    try {
      const res = await fetch("/api/boreholes", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, village: f.get("village"), lat, lng, pumpRatingKw: f.get("pump") ? Number(f.get("pump")) : null, lifecycle: f.get("lifecycle") }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        setMsg({ ok: true, text: labels.created.replace("{code}", code), siteId: body.siteId });
        form.current?.reset();
        router.refresh();
      } else setMsg({ ok: false, text: err(String(body.reason ?? body.error ?? res.status)) });
    } catch {
      setMsg({ ok: false, text: err("network") });
    }
    setBusy(false);
  }
  return (
    <form ref={form} onSubmit={submit}>
      {msg && <div className="notice-tight"><Notice tone={msg.ok ? "success" : "error"}>{msg.text}{msg.siteId && <> <Link href={`/${locale}/boreholes/${msg.siteId}`}>{labels.open}</Link></>}</Notice></div>}
      <Fields>
        <Field span={4} label={labels.code}><input name="code" required maxLength={40} placeholder="BH-003" autoCapitalize="characters" style={{ textTransform: "uppercase" }} /></Field>
        <Field span={4} label={labels.village}><input name="village" required maxLength={120} /></Field>
        <Field span={4} label={labels.stage}><select name="lifecycle" defaultValue="planned">{Object.entries(labels.lifecycle).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field span={4} label={labels.lat} optional={labels.optional} hint={labels.latLngHint} error={labels.coordsError}><input name="lat" inputMode="decimal" pattern={COORD} placeholder={fmtNum(-7.912, locale, 3)} /></Field>
        <Field span={4} label={labels.lng} optional={labels.optional} error={labels.coordsError}><input name="lng" inputMode="decimal" pattern={COORD} placeholder={fmtNum(24.371, locale, 3)} /></Field>
        <Field span={4} label={labels.pump} optional={labels.optional}>
          <select name="pump" defaultValue=""><option value="">—</option>{[2.2, 1.1, 0.75].map((k) => <option key={k} value={String(k)}>{fmtNum(k, locale, 2)} kW</option>)}</select>
        </Field>
      </Fields>
      <FormFooter>
        <button className="btn" disabled={busy} aria-busy={busy || undefined}>{busy ? <span className="spinner" aria-hidden /> : <Icon name="plus" size={17} />}{busy ? labels.saving : labels.create}</button>
      </FormFooter>
    </form>
  );
}
