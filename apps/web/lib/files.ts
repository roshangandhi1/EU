import { clockSkewMs, isClockSuspect, type PermissionRegistry, type UserContext } from "@eu/core";
import { files, type Db } from "@eu/db";
import { checkScope, writeTarget } from "@eu/sync/server";
import type { EntityRegistry } from "@eu/sync";
import { eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

export const MAX_FILE_BYTES = 4 * 1024 * 1024; // under Vercel's 4.5 MB request limit
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export const fileMetaSchema = z.object({
  id: z.string().uuid(),
  entity: z.string().min(3),
  scopeId: z.string().min(1),
  mime: z.enum(ALLOWED_MIME),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  accuracyM: z.number().min(0).nullable().optional(),
  takenAt: z.string().datetime(),
  deviceNow: z.string().datetime(),
});
export type FileMeta = z.infer<typeof fileMetaSchema>;

/** Where the bytes go: Vercel Blob in production, an in-memory map in tests. */
export interface BlobStore {
  put(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(path: string): Promise<{ stream: ReadableStream<Uint8Array>; mime: string } | null>;
}

export interface FileContext {
  db: Db;
  user: UserContext;
  deviceId: string | null;
  permissions: PermissionRegistry;
  entities: EntityRegistry;
  blobs: BlobStore;
  now?: Date;
}

export type UploadResult =
  | { status: "uploaded" | "duplicate"; id: string }
  | { status: "rejected"; reason: string };

/**
 * Accepts one evidence file. Idempotent: re-sending the same id and bytes answers "duplicate",
 * so a phone that lost the response can simply retry.
 */
export async function acceptUpload(ctx: FileContext, meta: FileMeta, bytes: Uint8Array): Promise<UploadResult> {
  const reject = (reason: string): UploadResult => ({ status: "rejected", reason });
  if (bytes.byteLength === 0) return reject("empty");
  if (bytes.byteLength > MAX_FILE_BYTES) return reject("too_large");
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== meta.sha256) return reject("checksum_mismatch");

  const entity = ctx.entities.get(meta.entity);
  if (!entity) return reject("unknown_entity");
  if (!ctx.permissions.can(ctx.user, entity.actions.write, writeTarget(entity, meta.scopeId))) return reject("forbidden");

  const db = ctx.db as AnyDb;
  const [existing] = await db.select().from(files).where(eq(files.id, meta.id));
  if (existing) return existing.sha256 === sha ? { status: "duplicate", id: meta.id } : reject("id_exists");

  const scopeProblem = await checkScope(db, entity, meta.scopeId);
  if (scopeProblem) return reject(scopeProblem);

  const now = ctx.now ?? new Date();
  const ext = meta.mime === "image/png" ? "png" : meta.mime === "image/webp" ? "webp" : "jpg";
  const blobPath = `evidence/${entity.stream}/${meta.id}.${ext}`;
  await ctx.blobs.put(blobPath, bytes, meta.mime);
  await db
    .insert(files)
    .values({
      id: meta.id,
      entity: meta.entity,
      scopeId: meta.scopeId,
      mime: meta.mime,
      bytes: bytes.byteLength,
      sha256: sha,
      blobPath,
      lat: meta.lat ?? null,
      lng: meta.lng ?? null,
      accuracyM: meta.accuracyM ?? null,
      takenAt: new Date(meta.takenAt),
      clockSuspect: isClockSuspect(clockSkewMs(now, new Date(meta.deviceNow))),
      createdBy: ctx.user.id,
      deviceId: ctx.deviceId,
      uploadedAt: now,
    })
    .onConflictDoNothing();
  return { status: "uploaded", id: meta.id };
}

/**
 * For indicators and evidence exports: which of these file ids have arrived (optionally by a
 * cut-off). Pass the record's `scopeId` and only photos uploaded for that site count (SEC-5): a
 * photo of one site never evidences another. With a cut-off (evidence), demo placeholder photos
 * never count (DATA-7).
 */
export async function uploadedFileIds(db: Db, ids: string[], cutoff?: Date, scopeId?: string): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = (await (db as AnyDb)
    .select({ id: files.id, uploadedAt: files.uploadedAt, scopeId: files.scopeId, sha256: files.sha256 })
    .from(files)
    .where(inArray(files.id, ids))) as { id: string; uploadedAt: Date; scopeId: string; sha256: string }[];
  return new Set(
    rows
      .filter((r) => (!cutoff || r.uploadedAt <= cutoff) && (scopeId === undefined || r.scopeId === scopeId) && !(cutoff && r.sha256 === "demo"))
      .map((r) => r.id),
  );
}

/** May this user see the file? Same rule as the records it belongs to. */
export async function readableFile(ctx: Omit<FileContext, "blobs" | "deviceId">, id: string) {
  const [row] = await (ctx.db as AnyDb).select().from(files).where(eq(files.id, id));
  if (!row) return null;
  const entity = ctx.entities.get(row.entity);
  if (!entity) return null;
  const target = row.scopeId === entity.stream ? { stream: entity.stream, siteId: null, streamWide: true } : { stream: entity.stream, siteId: row.scopeId };
  return ctx.permissions.can(ctx.user, entity.actions.read, target) ? (row as typeof files.$inferSelect) : null;
}
