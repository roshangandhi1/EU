"use client";
import Link from "next/link";
import { useState } from "react";
import { Notice } from "@/components/ui";

type Labels = Record<"current" | "currentForced" | "next" | "nextHint" | "confirm" | "submit" | "busy" | "done" | "back" | "signOut" | "intro", string>;

export function PasswordForm({ locale, forced, labels, errors }: { locale: string; forced: boolean; labels: Labels; errors: Record<string, string> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (done)
    return (
      <div className="form">
        <Notice tone="success">{labels.done}</Notice>
        <Link className="btn" href={`/${locale}`}>{labels.back}</Link>
      </div>
    );
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const current = String(data.get("current") ?? "");
        const next = String(data.get("next") ?? "");
        if (next !== String(data.get("confirm") ?? "")) return setError(errors.mismatch!);
        setBusy(true);
        setError(null);
        try {
          const res = await fetch("/api/auth/password", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ current, next }),
          });
          if (!res.ok) {
            const code = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "unknown";
            setBusy(false);
            if (res.status === 401) return void (window.location.href = `/${locale}/login`);
            return setError(errors[code] ?? errors.unknown!);
          }
          if (forced) window.location.href = `/${locale}`;
          else setDone(true);
        } catch {
          setBusy(false);
          setError(errors.network!);
        }
      }}
    >
      <label>
        {forced ? labels.currentForced : labels.current}
        <input name="current" type="password" autoComplete="current-password" required />
      </label>
      <label>
        {labels.next}
        <input name="next" type="password" autoComplete="new-password" minLength={10} required aria-describedby="pw-hint" />
        <span id="pw-hint" className="muted small" style={{ fontWeight: 400 }}>{labels.nextHint}</span>
      </label>
      <label>
        {labels.confirm}
        <input name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </label>
      {error && <p role="alert" className="error">{error}</p>}
      <p className="muted small">{labels.intro}</p>
      <button className="btn" disabled={busy} aria-busy={busy || undefined}>{busy ? <><span className="spinner" aria-hidden />{labels.busy}</> : labels.submit}</button>
      {forced ? (
        <button
          type="button"
          className="btn ghost"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
            window.location.href = `/${locale}/login`;
          }}
        >
          {labels.signOut}
        </button>
      ) : (
        <Link className="btn ghost" href={`/${locale}`}>{labels.back}</Link>
      )}
    </form>
  );
}
