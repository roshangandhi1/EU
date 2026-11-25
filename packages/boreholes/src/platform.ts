/**
 * TEMPORARY adapter for platform foundation interfaces (@eu/db, @eu/sync, @eu/core).
 * Signatures follow the contract agreed with the platform thread on 2026-11-25.
 * When the foundation PR merges, replace the bodies below with re-exports:
 *   export { syncColumns } from "@eu/db";
 *   export { defineEntity } from "@eu/sync";
 *   export type { ActionMap } from "@eu/core";
 */
import { boolean, integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ZodType } from "zod";

export const syncColumns = () => ({
  id: uuid("id").primaryKey(),
  scopeId: uuid("scope_id").notNull(),
  createdBy: uuid("created_by").notNull(),
  deviceId: text("device_id"),
  deviceTime: timestamp("device_time", { withTimezone: true }).notNull(),
  serverTime: timestamp("server_time", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
  fieldVersions: jsonb("field_versions").$type<Record<string, number>>().notNull().default({}),
  clockSuspect: boolean("clock_suspect").notNull().default(false),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason"),
});

export type SyncPolicy = "append_only" | "field_merge" | "lww_history" | "server_authoritative";
export type Stream = "bamboo" | "miombo" | "boreholes" | "schools";

export interface EntityDef {
  name: string;
  stream: Stream | Stream[];
  table: unknown;
  schema: ZodType;
  policy: SyncPolicy;
  actions: { read: string; write: string; void?: string };
  label: { en: string; fr: string };
}
export const defineEntity = <T extends EntityDef>(def: T): T => def;

export type Role = "system_admin" | "programme_manager" | "stream_lead" | "field_officer" | "viewer";
export type ActionMap = Record<string, { stream: Stream | Stream[]; roles: Role[] }>;
