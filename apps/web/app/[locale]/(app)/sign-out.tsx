"use client";
import { Icon } from "@/components/icons";

export function SignOutButton({ label, locale, className = "btn secondary" }: { label: string; locale: string; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = `/${locale}/login`;
      }}
    >
      <Icon name="logout" size={16} />
      {label}
    </button>
  );
}
