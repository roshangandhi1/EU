"use client";
import { useState } from "react";

type Labels = { email: string; password: string; submit: string; invalid: string; locked: string; show: string; hide: string; showAria: string; hideAria: string; forgot: string; network: string; busy: string };

/**
 * Sign-in. After success the person lands on the app in their own language (from their profile),
 * keeping a ?next= path inside the app when there is one.
 */
export function LoginForm({ locale, labels }: { locale: string; labels: Labels }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const data = new FormData(e.currentTarget);
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
          });
          if (!res.ok) {
            setBusy(false);
            return setError(res.status === 429 ? labels.locked : labels.invalid);
          }
          const me = (await fetch("/api/me").then((r) => (r.ok ? r.json() : null)).catch(() => null)) as { locale?: string; mustChangePassword?: boolean } | null;
          const home = `/${me?.locale === "en" || me?.locale === "fr" ? me.locale : locale}`;
          window.location.href = me?.mustChangePassword ? `${home}/password` : home;
        } catch {
          setBusy(false);
          setError(labels.network);
        }
      }}
    >
      <label>
        {labels.email}
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        {labels.password}
        <span className="pw-row">
          <input name="password" type={show ? "text" : "password"} autoComplete="current-password" required />
          <button type="button" className="btn ghost sm" aria-pressed={show} aria-label={show ? labels.hideAria : labels.showAria} onClick={() => setShow(!show)}>
            {show ? labels.hide : labels.show}
          </button>
        </span>
      </label>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="btn" disabled={busy} aria-busy={busy || undefined}>{busy ? <><span className="spinner" aria-hidden />{labels.busy}</> : labels.submit}</button>
      <p className="muted small">{labels.forgot}</p>
    </form>
  );
}
