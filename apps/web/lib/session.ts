import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveToken, SESSION_COOKIE, type Principal } from "./auth";
import { db } from "./http";

/**
 * The signed-in web user for a server component or server action, or null.
 * Someone whose password an admin set is sent to choose their own first: no page or action runs
 * for them until they do (pass allowPasswordChange only on the password page itself).
 */
export async function currentPrincipal(opts: { allowPasswordChange?: boolean } = {}): Promise<Principal | null> {
  if (!process.env.DATABASE_URL) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const r = await resolveToken(db(), token);
  if (!r.ok) return null;
  if (r.principal.mustChangePassword && !opts.allowPasswordChange) {
    redirect(`/${r.principal.locale === "en" ? "en" : "fr"}/password`);
  }
  return r.principal;
}
