"use client";
import { useState } from "react";

type Labels = { token: string; name: string; email: string; password: string; submit: string; done: string; closed: string };

export function SetupForm({ locale, labels }: { locale: string; labels: Labels }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        const res = await fetch("/api/setup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: d.get("token"), name: d.get("name"), email: d.get("email"), password: d.get("password") }),
        });
        if (res.ok) {
          setMsg(labels.done);
          setTimeout(() => (window.location.href = `/${locale}/login`), 1500);
        } else {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setMsg(body.error === "closed" ? labels.closed : (body.error ?? "error"));
        }
      }}
    >
      <label>{labels.token}<input name="token" required /></label>
      <label>{labels.name}<input name="name" required /></label>
      <label>{labels.email}<input name="email" type="email" required /></label>
      <label>{labels.password}<input name="password" type="password" minLength={10} required /></label>
      {msg && <p role="status">{msg}</p>}
      <button className="btn">{labels.submit}</button>
    </form>
  );
}
