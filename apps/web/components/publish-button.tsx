"use client";
import { useState } from "react";
import { Icon } from "@/components/icons";

export interface PublishLabels {
  button: string; help: string; done: string; failed: string; view: string;
  confirm: string; body: string; demo: string; last: string; yes: string; cancel: string; network: string;
}

/**
 * Publish one layer's public snapshot. Shown only to users with the layer's publish permission.
 * Asks first, saying how many items go public, how many are demo records and when it was last published.
 */
export function PublishButton({ layer, locale, labels }: { layer: "bamboo" | "miombo" | "boreholes"; locale: string; labels: PublishLabels }) {
  const [asking, setAsking] = useState(false);
  const [state, setState] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: null, ok: false });
  const go = async () => {
    setState({ busy: true, msg: null, ok: false });
    try {
      const res = await fetch("/api/public-map/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ layer }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) setState({ busy: false, ok: true, msg: labels.done.replace("{n}", String(body.features)) });
      else setState({ busy: false, ok: false, msg: labels.failed.replace("{reason}", String(body.reason ?? body.error ?? res.status)) });
    } catch {
      setState({ busy: false, ok: false, msg: labels.network });
    }
    setAsking(false);
  };
  return (
    <div className="publish">
      {asking ? (
        <div className="confirm-panel" role="alertdialog" aria-label={labels.confirm}>
          <strong>{labels.confirm}</strong>
          <span className="confirm-q">{labels.body}{labels.demo && <> <strong>{labels.demo}</strong></>}</span>
          <span className="muted small">{labels.last} {labels.help}</span>
          <span className="confirm-actions">
            <button type="button" className="btn sm ghost" onClick={() => setAsking(false)} disabled={state.busy}>{labels.cancel}</button>
            <button type="button" className="btn sm" onClick={() => void go()} disabled={state.busy} aria-busy={state.busy || undefined} autoFocus>
              {state.busy ? <span className="spinner" aria-hidden /> : <Icon name="globe" size={15} />}{labels.yes}
            </button>
          </span>
        </div>
      ) : (
        <button className="btn secondary" type="button" onClick={() => { setAsking(true); setState({ busy: false, msg: null, ok: false }); }}><Icon name="globe" size={16} />{labels.button}</button>
      )}
      {state.msg && <p className={state.ok ? "ok" : "error"} role={state.ok ? "status" : "alert"}>{state.msg} {state.ok && <a href={`/${locale}/map`}>{labels.view}</a>}</p>}
    </div>
  );
}
