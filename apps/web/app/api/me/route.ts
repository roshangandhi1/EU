import { authenticate, json } from "@/lib/http";

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.res;
  const p = auth.principal;
  return json({ id: p.user.id, name: p.name, email: p.email, locale: p.locale, assignments: p.user.assignments });
}
