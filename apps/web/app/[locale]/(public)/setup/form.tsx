"use client";
import Link from "next/link";
import { useState } from "react";

type Labels = { token: string; name: string; email: string; password: string; submit: string; done: string; saving: string; toLogin: string; errors: Record<string, string> };

export function SetupForm({ locale, labels }: { locale: string; labels: Labels }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string; code?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const err = (code: string) => labels.errors[code] ?? labels.errors.unknown!.replace("{reason}", code);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        setBusy(true); setMsg(null);
        try {
          const res = await fetch("/api/setup", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token: d.get("token"), name: d.get("name"), email: d.get("email"), password: d.get("password") }),
          });
          if (res.ok) {
            setMsg({ ok: true, text: labels.done });
            setTimeout(() => (window.location.href = `/${locale}/login`), 1500);
            return;
          }
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          const code = body.error ?? String(res.status);
          setMsg({ ok: false, text: err(code), code });
        } catch {
          setMsg({ ok: false, text: err("network") });
        }
        setBusy(false);
      }}
    >
      <label>{labels.token}<input name="token" required autoComplete="off" spellCheck={false} /></label>
      <label>{labels.name}<input name="name" required autoComplete="name" /></label>
      <label>{labels.email}<input name="email" type="email" required autoComplete="email" /></label>
      <label>{labels.password}<input name="password" type="password" minLength={10} required autoComplete="new-password" /></label>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "error"}>
          {msg.text}{msg.code === "closed" && <> <Link href={`/${locale}/login`}>{labels.toLogin}</Link></>}
        </p>
      )}
      <button className="btn" disabled={busy} aria-busy={busy || undefined}>{busy ? <><span className="spinner" aria-hidden />{labels.saving}</> : labels.submit}</button>
    </form>
  );
}
