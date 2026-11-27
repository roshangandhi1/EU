"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { ConfirmButton, SubmitButton } from "@/components/ui/form";
import { deleteSiteAction, previewDelete, restoreSiteAction, type DeletePreview } from "@/lib/delete-actions";

export interface DeleteLabels {
  action: string; title: string; loading: string; alsoGoes: string; nothingLinked: string; effect: string;
  reason: string; reasonHint: string; reasonDefault: string; yes: string; no: string; deleting: string;
  failed: string; forbidden: string; network: string;
}

/**
 * Per-row delete for system administrators: a trash button that opens a confirmation dialog
 * naming the record and listing what is recorded under it (fetched when the dialog opens).
 */
export function DeleteSite({ siteId, kind, name, locale, back, labels }: {
  siteId: string; kind: "borehole" | "plot" | "school"; name: string; locale: "en" | "fr"; back: string; labels: DeleteLabels;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<DeletePreview | "loading" | "network" | null>(null);
  const [state, action] = useActionState(deleteSiteAction, null);
  const title = labels.title.replace("{name}", name);

  const open = async () => {
    ref.current?.showModal();
    setPreview("loading");
    try { setPreview(await previewDelete(siteId, kind)); } catch { setPreview("network"); }
  };
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // A click on the backdrop (outside the panel) closes the dialog, like Escape.
    const away = (e: MouseEvent) => { if (e.target === d) d.close(); };
    d.addEventListener("click", away);
    return () => d.removeEventListener("click", away);
  }, []);

  const linked = preview && typeof preview === "object" && preview.ok ? preview.linked.filter((l) => !l.own) : [];
  const failure = state && !state.ok ? state.reason : preview && typeof preview === "object" && !preview.ok ? preview.reason : null;
  const ready = preview && typeof preview === "object" && preview.ok;

  return (
    <>
      <button type="button" className="icon-btn danger-hover" aria-label={`${labels.action} ${name}`} title={labels.action}
        onClick={(e) => { e.stopPropagation(); void open(); }}>
        <Icon name="archive" size={17} />
      </button>
      <dialog ref={ref} className="del-dialog" aria-labelledby={`del-${siteId}`} onClick={(e) => e.stopPropagation()}>
        <form action={action} className="del-panel">
          <input type="hidden" name="siteId" value={siteId} /><input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="locale" value={locale} /><input type="hidden" name="back" value={back} />
          <div className="del-head">
            <span className="del-icon"><Icon name="archive" size={20} /></span>
            <h2 id={`del-${siteId}`}>{title}</h2>
          </div>
          {preview === "loading" && <p className="muted"><span className="spinner" aria-hidden /> {labels.loading}</p>}
          {preview === "network" && <p className="del-error">{labels.network}</p>}
          {ready && (linked.length === 0 ? <p>{labels.nothingLinked}</p> : (
            <>
              <p>{labels.alsoGoes}</p>
              <ul className="del-list">{linked.map((l, i) => <li key={i}><span>{l.label[locale]}</span><strong>{l.n.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB")}</strong></li>)}</ul>
            </>
          ))}
          {ready && <p className="small muted">{labels.effect}</p>}
          {ready && (
            <label className="del-reason">
              <span>{labels.reason}</span>
              <input name="reason" maxLength={500} defaultValue={labels.reasonDefault} />
              <span className="small muted">{labels.reasonHint}</span>
            </label>
          )}
          {failure && <p className="del-error" role="alert">{failure === "forbidden" ? labels.forbidden : labels.failed.replace("{reason}", failure)}</p>}
          <div className="del-actions">
            <button type="button" className="btn ghost" onClick={() => ref.current?.close()}>{labels.no}</button>
            <SubmitButton variant="danger" icon="archive" pending={labels.deleting} disabled={!ready}>{labels.yes}</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Restore for one archived site: a confirm-then-submit button; failures show inline. */
export function RestoreSite({ siteId, kind, name, locale, back, labels }: {
  siteId: string; kind: "borehole" | "plot" | "school"; name: string; locale: "en" | "fr"; back: string;
  labels: { restore: string; restoreConfirm: string; restoring: string; no: string; restoreFailed: string; codeTaken: string; forbidden: string };
}) {
  const [state, action] = useActionState(restoreSiteAction, null);
  const failure = state && !state.ok ? state.reason : null;
  return (
    <form action={action} className="restore-form">
      <input type="hidden" name="siteId" value={siteId} /><input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="back" value={back} />
      <ConfirmButton label={labels.restore} text={labels.restore} icon="undo" variant="secondary" confirm={labels.restoreConfirm.replace("{name}", name)}
        yes={labels.restore} no={labels.no} pending={labels.restoring} />
      {failure && <p className="del-error small" role="alert">{failure === "code_taken" ? labels.codeTaken : failure === "forbidden" ? labels.forbidden : labels.restoreFailed.replace("{reason}", failure)}</p>}
    </form>
  );
}
