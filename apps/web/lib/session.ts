import { cookies } from "next/headers";
import { resolveToken, SESSION_COOKIE, type Principal } from "./auth";
import { db } from "./http";

/** The signed-in web user for a server component, or null. */
export async function currentPrincipal(): Promise<Principal | null> {
  if (!process.env.DATABASE_URL) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const r = await resolveToken(db(), token);
  return r.ok ? r.principal : null;
}
