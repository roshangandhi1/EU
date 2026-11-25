import { auditLog, devices, evidenceCutoffs, evidenceDecisions, type Db } from "@eu/db";
import type { EntityDef, EntityRegistry } from "@eu/sync";
import { toCsv, yes, type CsvLocale } from "./csv";
import { and, asc, eq, getTableColumns, gt, gte, isNull, lte, or, sql } from "drizzle-orm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

export type Cutoff = typeof evidenceCutoffs.$inferSelect;
export type Decision = "admitted" | "excluded";

export interface LateRecord {
  entity: string;
  recordId: string;
  scopeId: string;
  createdBy: string;
  deviceId: string | null;
  deviceTime: Date;
  serverTime: Date;
  clockSuspect: boolean;
  decision: Decision | null;
  reason: string | null;
}

export interface EntitySummary {
  entity: string;
  label: { en: string; fr: string };
  counted: number;
  lateAdmitted: number;
  latePending: number;
  lateExcluded: number;
  clockSuspect: number;
}

export async function createCutoff(db: Db, input: { label: string; cutoffAt: Date; userId: string }): Promise<Cutoff> {
  const [row] = await (db as AnyDb)
    .insert(evidenceCutoffs)
    .values({ label: input.label.trim(), cutoffAt: input.cutoffAt, createdBy: input.userId })
    .returning();
  return row;
}

export async function listCutoffs(db: Db): Promise<Cutoff[]> {
  return (db as AnyDb).select().from(evidenceCutoffs).orderBy(sql`${evidenceCutoffs.cutoffAt} desc`);
}

export async function getCutoff(db: Db, id: string): Promise<Cutoff | undefined> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return undefined;
  const [row] = await (db as AnyDb).select().from(evidenceCutoffs).where(eq(evidenceCutoffs.id, id));
  return row;
}

/** The soonest cut-off still ahead, so phones can prompt "sync before …". */
export async function nextCutoff(db: Db, now = new Date()): Promise<Cutoff | undefined> {
  const [row] = await (db as AnyDb).select().from(evidenceCutoffs).where(gt(evidenceCutoffs.cutoffAt, now)).orderBy(asc(evidenceCutoffs.cutoffAt)).limit(1);
  return row;
}

/** Not voided by the cut-off, and captured on the phone by then. */
function capturedBy(cols: AnyDb, at: Date) {
  return and(lte(cols.deviceTime, at), or(isNull(cols.voidedAt), gt(cols.voidedAt, at)));
}

async function decisionsFor(db: Db, cutoffId: string, entity: string): Promise<Map<string, { decision: Decision; reason: string }>> {
  const rows = (await (db as AnyDb)
    .select()
    .from(evidenceDecisions)
    .where(and(eq(evidenceDecisions.cutoffId, cutoffId), eq(evidenceDecisions.entity, entity)))) as { recordId: string; decision: Decision; reason: string }[];
  return new Map(rows.map((r) => [r.recordId, { decision: r.decision, reason: r.reason }]));
}

/** Ids a reviewer admitted for this cut-off: pass these to a module's as-at split (admittedIds). */
export async function admittedIds(db: Db, cutoffId: string, entity: string): Promise<Set<string>> {
  const d = await decisionsFor(db, cutoffId, entity);
  return new Set([...d].filter(([, v]) => v.decision === "admitted").map(([k]) => k));
}

/** Every record id admitted for this cut-off, across record types (ids are UUIDs, unique across tables). */
export async function admittedRecordIds(db: Db, cutoffId: string): Promise<Set<string>> {
  const rows = (await (db as AnyDb)
    .select({ recordId: evidenceDecisions.recordId })
    .from(evidenceDecisions)
    .where(and(eq(evidenceDecisions.cutoffId, cutoffId), eq(evidenceDecisions.decision, "admitted")))) as { recordId: string }[];
  return new Set(rows.map((r) => r.recordId));
}

/**
 * The cut-off an evidence-mode report as at `asAt` (a Haut-Lomami date) stands for: the latest
 * cut-off falling on that day, if any. Its admit decisions then apply to the report.
 */
export async function cutoffOn(db: Db, asAt: string): Promise<Cutoff | undefined> {
  const from = new Date(`${asAt}T00:00:00+02:00`);
  const to = new Date(`${asAt}T23:59:59.999+02:00`);
  const [row] = await (db as AnyDb)
    .select()
    .from(evidenceCutoffs)
    .where(and(gte(evidenceCutoffs.cutoffAt, from), lte(evidenceCutoffs.cutoffAt, to)))
    .orderBy(sql`${evidenceCutoffs.cutoffAt} desc`)
    .limit(1);
  return row;
}

/** Records captured before the cut-off that reached the server after it, with any decision taken. */
export async function lateRecords(db: Db, entity: EntityDef, cutoff: Cutoff): Promise<LateRecord[]> {
  const cols = getTableColumns(entity.table) as AnyDb;
  const rows = (await (db as AnyDb)
    .select()
    .from(entity.table)
    .where(and(capturedBy(cols, cutoff.cutoffAt), gt(cols.serverTime, cutoff.cutoffAt)))
    .orderBy(asc(cols.serverTime))) as AnyDb[];
  const decided = await decisionsFor(db, cutoff.id, entity.name);
  return rows.map((r) => ({
    entity: entity.name,
    recordId: String(r.id),
    scopeId: String(r.scopeId),
    createdBy: String(r.createdBy),
    deviceId: r.deviceId ?? null,
    deviceTime: r.deviceTime,
    serverTime: r.serverTime,
    clockSuspect: Boolean(r.clockSuspect),
    decision: decided.get(String(r.id))?.decision ?? null,
    reason: decided.get(String(r.id))?.reason ?? null,
  }));
}

export async function summarise(db: Db, registry: EntityRegistry, cutoff: Cutoff): Promise<EntitySummary[]> {
  const out: EntitySummary[] = [];
  for (const entity of registry.all()) {
    const cols = getTableColumns(entity.table) as AnyDb;
    const [c] = (await (db as AnyDb)
      .select({
        counted: sql<number>`count(*) filter (where ${cols.serverTime} <= ${cutoff.cutoffAt})::int`,
        clock: sql<number>`count(*) filter (where ${cols.clockSuspect})::int`,
      })
      .from(entity.table)
      .where(capturedBy(cols, cutoff.cutoffAt))) as { counted: number; clock: number }[];
    const late = await lateRecords(db, entity, cutoff);
    if (!c?.counted && late.length === 0) continue;
    out.push({
      entity: entity.name,
      label: entity.label,
      counted: c?.counted ?? 0,
      lateAdmitted: late.filter((l) => l.decision === "admitted").length,
      latePending: late.filter((l) => l.decision === null).length,
      lateExcluded: late.filter((l) => l.decision === "excluded").length,
      clockSuspect: c?.clock ?? 0,
    });
  }
  return out;
}

/** Records a reviewer's decision (it can be changed later; every change is audited). */
export async function decide(
  db: Db,
  input: { cutoffId: string; entity: EntityDef; recordId: string; decision: Decision; reason: string; userId: string },
): Promise<{ ok: true } | { ok: false; reason: "reason_required" | "not_late" }> {
  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, reason: "reason_required" };
  const cutoff = await getCutoff(db, input.cutoffId);
  if (!cutoff) return { ok: false, reason: "not_late" };
  const late = await lateRecords(db, input.entity, cutoff);
  const rec = late.find((l) => l.recordId === input.recordId);
  if (!rec) return { ok: false, reason: "not_late" };
  await (db as AnyDb).transaction(async (tx: AnyDb) => {
    await tx
      .insert(evidenceDecisions)
      .values({ cutoffId: cutoff.id, entity: input.entity.name, recordId: input.recordId, decision: input.decision, reason, decidedBy: input.userId })
      .onConflictDoUpdate({
        target: [evidenceDecisions.cutoffId, evidenceDecisions.entity, evidenceDecisions.recordId],
        set: { decision: input.decision, reason, decidedBy: input.userId, decidedAt: new Date() },
      });
    await tx.insert(auditLog).values({
      entity: input.entity.name,
      recordId: input.recordId,
      scopeId: rec.scopeId,
      op: `evidence_${input.decision}`,
      userId: input.userId,
      oldValues: rec.decision ? { decision: rec.decision, reason: rec.reason } : null,
      newValues: { cutoffId: cutoff.id, cutoffAt: cutoff.cutoffAt.toISOString(), decision: input.decision },
      note: reason,
    });
  });
  return { ok: true };
}

const EVIDENCE_HEADERS = {
  en: ["entity", "record_id", "scope_id", "status", "device_time", "server_time", "device_id", "created_by", "clock_suspect", "decision_reason"],
  fr: ["type_enregistrement", "id_enregistrement", "site", "statut", "heure_telephone", "heure_serveur", "telephone", "cree_par", "horloge_douteuse", "motif_decision"],
};
const EVIDENCE_STATUS_FR: Record<string, string> = {
  counted: "compte",
  late_admitted: "en_retard_admis",
  late_pending: "en_retard_a_examiner",
  late_excluded: "en_retard_exclu",
};

/**
 * One row per record captured by the cut-off, across all record types, with its evidence status:
 * counted (server had it by the cut-off), late_admitted, late_pending or late_excluded.
 * Formula-safe, with a BOM; French headers and ";" separators for locale "fr".
 */
export async function evidenceCsv(db: Db, registry: EntityRegistry, cutoff: Cutoff, locale: CsvLocale = "en"): Promise<string> {
  const status = (s: string) => (locale === "fr" ? (EVIDENCE_STATUS_FR[s] ?? s) : s);
  const rows: unknown[][] = [EVIDENCE_HEADERS[locale]];
  for (const entity of registry.all()) {
    const cols = getTableColumns(entity.table) as AnyDb;
    const counted = (await (db as AnyDb)
      .select()
      .from(entity.table)
      .where(and(capturedBy(cols, cutoff.cutoffAt), lte(cols.serverTime, cutoff.cutoffAt)))
      .orderBy(asc(cols.serverTime))) as AnyDb[];
    for (const r of counted)
      rows.push([entity.name, r.id, r.scopeId, status("counted"), r.deviceTime, r.serverTime, r.deviceId, r.createdBy, yes(r.clockSuspect, locale), ""]);
    for (const l of await lateRecords(db, entity, cutoff))
      rows.push([entity.name, l.recordId, l.scopeId, status(`late_${l.decision ?? "pending"}`), l.deviceTime, l.serverTime, l.deviceId, l.createdBy, yes(l.clockSuspect, locale), l.reason ?? ""]);
  }
  return toCsv(rows, locale);
}

/** Phones report what they still hold unsynced on every sync. */
export async function recordDeviceStatus(db: Db, deviceId: string, s: { pendingChanges: number; pendingPhotos: number }, now = new Date()) {
  await (db as AnyDb).update(devices).set({ pendingChanges: s.pendingChanges, pendingPhotos: s.pendingPhotos, statusAt: now }).where(eq(devices.id, deviceId));
}
