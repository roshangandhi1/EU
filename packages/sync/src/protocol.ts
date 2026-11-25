import { z } from "zod";

export const MAX_PUSH_BATCH = 100;
export const DEFAULT_PULL_LIMIT = 200;
export const MAX_PULL_LIMIT = 500;

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

export const mutationSchema = z.object({
  mutationId: z.uuid(),
  entity: z.string().min(1),
  recordId: z.uuid(),
  op: z.enum(["insert", "update", "void"]),
  /** The site the record belongs to. Required on insert; ignored afterwards (the server's value wins). */
  scopeId: z.string().min(1),
  fields: z.record(z.string(), z.unknown()).optional(),
  /** field_merge: the field versions the device last saw for the fields it changes. */
  baseFieldVersions: z.record(z.string(), z.number().int().nonnegative()).optional(),
  voidReason: z.string().max(500).optional(),
  /** When the change was made on the phone. */
  deviceTime: isoDate,
});
export type Mutation = z.infer<typeof mutationSchema>;

export const pushRequestSchema = z.object({
  /** The phone's clock at the moment of sending, to detect wrong clocks. */
  deviceNow: isoDate,
  mutations: z.array(mutationSchema).max(MAX_PUSH_BATCH),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

/** A record as it travels over the wire: plain JSON, dates as ISO strings. */
export type WireRecord = Record<string, unknown> & { id: string; scopeId: string; version: number };

export type MutationStatus =
  | "applied" // fully applied
  | "duplicate" // already received earlier; no change
  | "partial" // field_merge: some fields conflicted and were held for review
  | "superseded" // lww_history: a later edit already won; kept in history only
  | "rejected"; // not allowed or invalid; nothing changed

export interface MutationResult {
  mutationId: string;
  status: MutationStatus;
  reason?: string;
  conflicts?: string[];
  /** The record as it now stands on the server, when it exists and the user may read it. */
  record?: WireRecord;
}

export interface PushResponse {
  results: MutationResult[];
  serverNow: string;
  clockSuspect: boolean;
}

export const pullRequestSchema = z.object({
  cursor: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(MAX_PULL_LIMIT).optional(),
});
export type PullRequest = z.infer<typeof pullRequestSchema>;

export interface PullResponse {
  changes: { entity: string; record: WireRecord }[];
  cursor: number;
  hasMore: boolean;
}
