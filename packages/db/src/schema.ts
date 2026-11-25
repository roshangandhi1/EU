import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    locale: text("locale").notNull().default("fr"),
    active: boolean("active").notNull().default(true),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)],
);

/** scopeType: global | stream | site. scopeValue: null, the stream name, or the site id. */
export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeValue: text("scope_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (t) => [index("role_assignments_user").on(t.userId)],
);

export const devices = pgTable("devices", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  lastSkewMs: integer("last_skew_ms"),
  appVersion: text("app_version"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/** Web sessions and device tokens. Only a SHA-256 hash of the token is stored. */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").notNull(), // "web" | "device"
    deviceId: text("device_id").references(() => devices.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

/**
 * Every place the programme works: schools, TVET centres, boreholes, plots, villages.
 * Modules keep their own attributes in tables keyed by site_id.
 */
export const sites = pgTable(
  "sites",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(), // school | tvet | borehole | plot | village | nursery
    stream: text("stream").notNull(),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sites_kind").on(t.kind)],
);

/** Append-only history of every change to synced data, from phone or web. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entity: text("entity").notNull(),
    recordId: text("record_id").notNull(),
    scopeId: text("scope_id"),
    op: text("op").notNull(), // insert | update | void | superseded | conflict | rejected
    userId: text("user_id").notNull(),
    deviceId: text("device_id"),
    deviceTime: timestamp("device_time", { withTimezone: true }),
    serverTime: timestamp("server_time", { withTimezone: true }).notNull().defaultNow(),
    clockSuspect: boolean("clock_suspect").notNull().default(false),
    mutationId: uuid("mutation_id"),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    note: text("note"),
  },
  (t) => [index("audit_log_record").on(t.entity, t.recordId)],
);

/** Monotonic feed of changed records; devices pull from a cursor into this. */
export const changeLog = pgTable(
  "change_log",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    entity: text("entity").notNull(),
    recordId: text("record_id").notNull(),
    scopeId: text("scope_id").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/** Idempotency: each device mutation is applied at most once; replays get the stored result. */
export const syncMutations = pgTable("sync_mutations", {
  mutationId: uuid("mutation_id").primaryKey(),
  deviceId: text("device_id").notNull(),
  userId: text("user_id").notNull(),
  entity: text("entity").notNull(),
  recordId: text("record_id").notNull(),
  status: text("status").notNull(),
  result: jsonb("result").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Same-field edits that field_merge could not reconcile; resolved by a person. */
export const syncConflicts = pgTable(
  "sync_conflicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entity: text("entity").notNull(),
    recordId: text("record_id").notNull(),
    scopeId: text("scope_id").notNull(),
    field: text("field").notNull(),
    serverValue: jsonb("server_value"),
    clientValue: jsonb("client_value"),
    mutationId: uuid("mutation_id").notNull(),
    userId: text("user_id").notNull(),
    deviceId: text("device_id").notNull(),
    status: text("status").notNull().default("open"), // open | kept_server | took_client
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("sync_conflicts_open").on(t.status, t.scopeId)],
);

export const loginAttempts = pgTable("login_attempts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  email: text("email").notNull(),
  ok: boolean("ok").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
