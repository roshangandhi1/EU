import { boolean, integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Columns every synced table carries. Spread into a table definition:
 *   pgTable("school_payments", { ...syncColumns(), amountCdf: integer("amount_cdf").notNull() })
 *
 * - id: generated on the device, so records can be created offline.
 * - scopeId: the site the record belongs to; drives who receives it on sync.
 * - deviceTime: when it was captured on the phone (self-reported).
 * - serverTime: when the server first received it (trusted); evidence exports count by this.
 * - updatedServerTime / editedDeviceTime: server and device time of the last applied change.
 * - clockSuspect: the phone's clock was more than 10 minutes off the server's at sync.
 * - fieldVersions: per-field version counters, used only by field_merge entities.
 * - voidedAt/voidReason: the only way to retire a record; nothing is ever deleted.
 */
export function syncColumns() {
  return {
    id: uuid("id").primaryKey(),
    scopeId: text("scope_id").notNull(),
    createdBy: text("created_by").notNull(),
    deviceId: text("device_id").notNull(),
    deviceTime: timestamp("device_time", { withTimezone: true }).notNull(),
    serverTime: timestamp("server_time", { withTimezone: true }).notNull(),
    updatedServerTime: timestamp("updated_server_time", { withTimezone: true }).notNull(),
    /** Device time of the last applied edit; lww_history compares against it. */
    editedDeviceTime: timestamp("edited_device_time", { withTimezone: true }).notNull(),
    version: integer("version").notNull().default(1),
    fieldVersions: jsonb("field_versions").$type<Record<string, number>>().notNull().default({}),
    clockSuspect: boolean("clock_suspect").notNull().default(false),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
  };
}

/** Column keys managed by the sync engine; clients may not write them directly. */
export const SYNC_MANAGED_KEYS = [
  "id",
  "scopeId",
  "createdBy",
  "deviceId",
  "deviceTime",
  "serverTime",
  "updatedServerTime",
  "editedDeviceTime",
  "version",
  "fieldVersions",
  "clockSuspect",
  "voidedAt",
  "voidReason",
] as const;
