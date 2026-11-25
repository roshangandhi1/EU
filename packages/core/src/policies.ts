/**
 * How the sync engine resolves concurrent writes to one record type.
 *
 * - append_only: records are created once and never edited. The only permitted
 *   change after creation is a void (voided_at + void_reason).
 * - field_merge: concurrent edits to different fields merge; concurrent edits to
 *   the same field keep the server value and open a conflict for review.
 * - lww_history: the edit with the later device time wins; every edit, including
 *   superseded ones, is kept in the audit log.
 * - server_authoritative: only changed on the server (web admin) by users holding
 *   the entity's configure action; devices receive it read-only.
 */
export const CONFLICT_POLICIES = ["append_only", "field_merge", "lww_history", "server_authoritative"] as const;
export type ConflictPolicy = (typeof CONFLICT_POLICIES)[number];
