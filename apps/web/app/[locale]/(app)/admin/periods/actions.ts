"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAction } from "@/lib/admin";
import { db } from "@/lib/http";
import { parseDecimal } from "@/lib/format";
import { INDICATORS } from "@/lib/indicator-defs";
import { addPeriod, loadOutcomes, saveOutcome, savePeriod, type PeriodIndicator } from "@/lib/periods";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const opt = (fd: FormData, k: string) => str(fd, k) || null;
const back = (path: string, q: Record<string, string>): never => redirect(`${path}?${new URLSearchParams(q)}`);
const refresh = (locale: string) => {
  for (const p of ["admin/periods", "dashboard", "boreholes", "forestry/bamboo", "forestry/miombo"]) revalidatePath(`/${locale}/${p}`);
};

export async function addPeriodAction(fd: FormData) {
  const { me, locale } = await requireAction(str(fd, "locale"), "periods.manage");
  const n = await addPeriod(db(), me.user.id);
  refresh(locale);
  redirect(`/${locale}/admin/periods/${n}`);
}

export async function savePeriodAction(fd: FormData) {
  const { me, locale } = await requireAction(str(fd, "locale"), "periods.manage");
  const n = Number(str(fd, "n"));
  const path = `/${locale}/admin/periods/${n}`;
  const indicators: Record<string, PeriodIndicator> = {};
  for (const d of INDICATORS) {
    const k = d.code.replaceAll(".", "_");
    const target = parseDecimal(str(fd, `t_${k}`)) ?? 0;
    const validated = parseDecimal(str(fd, `v_${k}`));
    if (Number.isNaN(target) || Number.isNaN(validated)) back(path, { error: "number" });
    indicators[d.code] = { target, validated, noteEn: opt(fd, `nen_${k}`), noteFr: opt(fd, `nfr_${k}`) };
  }
  const status = str(fd, "status") === "validated" ? "validated" : "open";
  const r = await savePeriod(db(), {
    n, startsOn: str(fd, "startsOn"), endsOn: str(fd, "endsOn"), status,
    tpaFrom: opt(fd, "tpaFrom"), tpaTo: opt(fd, "tpaTo"), noteEn: opt(fd, "noteEn"), noteFr: opt(fd, "noteFr"), indicators,
  }, me.user.id);
  refresh(locale);
  back(path, r.ok ? { ok: "1" } : { error: r.reason });
}

export async function saveOutcomesAction(fd: FormData) {
  const { me, locale } = await requireAction(str(fd, "locale"), "periods.manage");
  const path = `/${locale}/admin/periods/outcomes`;
  for (const o of await loadOutcomes(db())) {
    const k = o.code.replace(".", "_");
    const r = await saveOutcome(db(), {
      code: o.code, targetEn: str(fd, `ten_${k}`) || o.targetEn, targetFr: str(fd, `tfr_${k}`) || o.targetFr,
      reportedEn: opt(fd, `ren_${k}`), reportedFr: opt(fd, `rfr_${k}`), reportedOn: opt(fd, `on_${k}`),
    }, me.user.id);
    if (!r.ok) back(path, { error: r.reason });
  }
  refresh(locale);
  back(path, { ok: "1" });
}
