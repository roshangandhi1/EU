"use client";
import { useState } from "react";

/** Publish one layer's public snapshot. Shown only to users with the layer's publish permission. */
export function PublishButton({ layer, locale, labels }: { layer: "bamboo" | "miombo" | "boreholes"; locale: string; labels: { button: string; help: string; done: string; failed: string; view: string } }) {
  const [state, setState] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: null, ok: false });
  const go = async () => {
    setState({ busy: true, msg: null, ok: false });
    try {
      const res = await fetch("/api/public-map/publish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ layer }) });
      const body = await res.json();
      if (res.ok && body.ok) setState({ busy: false, ok: true, msg: labels.done.replace("{n}", String(body.features)) });
      else setState({ busy: false, ok: false, msg: labels.failed.replace("{reason}", String(body.reason ?? body.error ?? res.status)) });
    } catch (e) {
      setState({ busy: false, ok: false, msg: labels.failed.replace("{reason}", String(e)) });
    }
  };
  return (
    <div className="publish">
      <button className="btn secondary" type="button" title={labels.help} aria-describedby={undefined} onClick={() => void go()} disabled={state.busy}>{labels.button}</button>
      {state.msg && <p className={state.ok ? "ok" : "error"}>{state.msg} {state.ok && <a href={`/${locale}/map`}>{labels.view}</a>}</p>}
    </div>
  );
}
