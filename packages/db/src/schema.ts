import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
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
    /** Set when an admin chose the password (new account or reset): the person must pick their own at next sign-in. */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
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
  /** What the phone last said it still holds unsynced (so an admin is warned before revoking). */
  pendingChanges: integer("pending_changes"),
  pendingPhotos: integer("pending_photos"),
  statusAt: timestamp("status_at", { withTimezone: true }),
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

/**
 * Photos and other evidence files. The phone picks the id when the photo is taken, so records can
 * reference it offline; the row appears when the upload arrives. A file counts as evidence only
 * once uploaded_at is set (and, for an export, on or before the cut-off).
 */
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey(),
    /** The entity whose write permission governs this file, e.g. "forestry.visit". */
    entity: text("entity").notNull(),
    scopeId: text("scope_id").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
    blobPath: text("blob_path").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    accuracyM: doublePrecision("accuracy_m"),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    clockSuspect: boolean("clock_suspect").notNull().default(false),
    createdBy: text("created_by").notNull(),
    deviceId: text("device_id"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("files_scope").on(t.scopeId)],
);

/** Evidence cut-offs: an assessor counts only what the server had received by `cutoffAt`. */
export const evidenceCutoffs = pgTable("evidence_cutoffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  cutoffAt: timestamp("cutoff_at", { withTimezone: true }).notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A reviewer's decision on a record captured before a cut-off but synced after it.
 * Only "admitted" records join the evidence count; every decision carries a reason and is audited.
 */
export const evidenceDecisions = pgTable(
  "evidence_decisions",
  {
    cutoffId: uuid("cutoff_id")
      .notNull()
      .references(() => evidenceCutoffs.id),
    entity: text("entity").notNull(),
    recordId: text("record_id").notNull(),
    decision: text("decision").notNull(), // admitted | excluded
    reason: text("reason").notNull(),
    decidedBy: text("decided_by").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("evidence_decisions_record").on(t.cutoffId, t.entity, t.recordId)],
);

/**
 * EU contract reporting periods. Each ends with a third-party assessment (TPA) that validates the
 * indicator values and sets the payment. Budgets are derived from the per-indicator targets.
 */
export const programmePeriods = pgTable("programme_periods", {
  n: integer("n").primaryKey(),
  startsOn: date("starts_on", { mode: "string" }).notNull(),
  endsOn: date("ends_on", { mode: "string" }).notNull(),
  /** open: targets are milestones still to reach; validated: the TPA has reported. */
  status: text("status").notNull().default("open"),
  tpaFrom: date("tpa_from", { mode: "string" }),
  tpaTo: date("tpa_to", { mode: "string" }),
  noteEn: text("note_en"),
  noteFr: text("note_fr"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Units due per indicator in a period (not cumulative), what the TPA validated, and what it will check. */
export const programmePeriodIndicators = pgTable(
  "programme_period_indicators",
  {
    periodN: integer("period_n")
      .notNull()
      .references(() => programmePeriods.n),
    code: text("code").notNull(),
    target: numeric("target", { mode: "number" }).notNull().default(0),
    validated: numeric("validated", { mode: "number" }),
    noteEn: text("note_en"),
    noteFr: text("note_fr"),
  },
  (t) => [primaryKey({ columns: [t.periodN, t.code] })],
);

/** Logframe outcome indicators: free text, since most targets await the baseline survey. */
export const programmeOutcomes = pgTable("programme_outcomes", {
  code: text("code").primaryKey(),
  sort: integer("sort").notNull(),
  targetEn: text("target_en").notNull(),
  targetFr: text("target_fr").notNull(),
  reportedEn: text("reported_en"),
  reportedFr: text("reported_fr"),
  reportedOn: date("reported_on", { mode: "string" }),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
