"use client";

export function SignOutButton({ label, locale }: { label: string; locale: string }) {
  return (
    <button
      className="btn secondary"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = `/${locale}/login`;
      }}
    >
      {label}
    </button>
  );
}
