import { getDb, type Db } from "@eu/db/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveToken, SESSION_COOKIE, type Principal } from "./auth";

export function db(): Db {
  return getDb();
}

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * Reads a Bearer token (phones) or the session cookie (web).
 * A web session whose password an admin set is refused (403 password_change_required) everywhere
 * except the password-change endpoint. Phones are never refused for this: their unsent work must
 * keep syncing, and the app asks for the new password itself.
 */
export async function authenticate(
  req: Request,
  opts: { allowPasswordChange?: boolean } = {},
): Promise<{ ok: true; principal: Principal } | { ok: false; res: NextResponse }> {
  const header = req.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const token = bearer ?? (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const r = await resolveToken(db(), token);
  if (!r.ok) return { ok: false, res: json({ error: r.reason }, 401) };
  if (r.principal.mustChangePassword && r.principal.kind === "web" && !opts.allowPasswordChange)
    return { ok: false, res: json({ error: "password_change_required" }, 403) };
  return { ok: true, principal: r.principal };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

/** The caller's network address as Vercel reports it (first x-forwarded-for hop). */
export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || null;
}

/**
 * CSRF guard for cookie-setting endpoints (SEC-14). A browser always sends Origin (and
 * Sec-Fetch-Site) on a POST; a cross-site one is refused. Requests with neither header come from
 * non-browser clients (phones, scripts), which cannot carry a victim's cookies, and are allowed.
 */
export function sameOrigin(req: Request): boolean {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = req.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}
