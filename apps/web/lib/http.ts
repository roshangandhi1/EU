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

/** Reads a Bearer token (phones) or the session cookie (web). */
export async function authenticate(req: Request): Promise<{ ok: true; principal: Principal } | { ok: false; res: NextResponse }> {
  const header = req.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const token = bearer ?? (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const r = await resolveToken(db(), token);
  if (!r.ok) return { ok: false, res: json({ error: r.reason }, 401) };
  return { ok: true, principal: r.principal };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
