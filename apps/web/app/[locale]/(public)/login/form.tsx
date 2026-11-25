"use client";
import { useState } from "react";

type Labels = { email: string; password: string; submit: string; invalid: string; locked: string };

export function LoginForm({ locale, labels }: { locale: string; labels: Labels }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const data = new FormData(e.currentTarget);
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
        });
        setBusy(false);
        if (res.ok) window.location.href = `/${locale}`;
        else setError(res.status === 429 ? labels.locked : labels.invalid);
      }}
    >
      <label>
        {labels.email}
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        {labels.password}
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="btn" disabled={busy}>{labels.submit}</button>
    </form>
  );
}
