import { isClockSuspect, type RoleAssignment } from "@eu/core";
import NetInfo from "@react-native-community/netinfo";
import { DeviceRevokedError, SyncClient, type Rejection, type SyncOutcome } from "@eu/sync/client";
import type { SqlDriver, SqlStore } from "@eu/sync/sql-store";
import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import { AppState } from "react-native";
import { ApiError, changePassword, getMe, httpTransport, loadDemo, registerDevice, reportStatus, serverClock, SessionEndedError } from "./api";
import { PIN_MAX_FAILURES, SYNC_INTERVAL_MS } from "./config";
import { deleteDb, openStore } from "./db";
import { Drafts } from "./drafts";
import { EvidenceFiles } from "./files";
import * as secure from "./secure";

export type Phase = "loading" | "signIn" | "changePassword" | "setPin" | "unlock" | "home" | "revoked";

export interface SyncStatus {
  running: boolean;
  pending: number;
  photosPending: number;
  nextCutoff: { at: string; label: string } | null;
  rejected: number;
  lastOk: string | null;
  last: SyncOutcome | null;
  offline: boolean;
  /** Connected to a network that does not reach the internet (no data bundle, captive Wi-Fi). */
  noInternet: boolean;
  /** The phone's clock looks wrong; stays until a sync shows it is right again. */
  clockSuspect: boolean;
}

/** A sync problem as the problems screen lists it. */
export interface RejectionRow extends Rejection {
  rowId: number;
  /** A few fields of the record, to say which one it was (date, name, number). */
  record?: Record<string, unknown>;
}

/** Why someone else cannot sign in yet: the previous person's unsent work. */
export interface OtherUserBlock {
  name: string;
  records: number;
  photos: number;
  /** The previous person's token is still here, so their work can be sent now. */
  canSendNow: boolean;
}

type Listener = () => void;

/** Locks after this long in the background (shared school phones, lost phones). */
export const AUTO_LOCK_MS = 10 * 60_000;

/** Raised by boot() when the database exists but cannot be opened with its key. */
export class BootError extends Error {}

/**
 * Everything the app knows that is not a screen: the encrypted store, the sync client,
 * who is signed in, and when to sync. Screens read `phase`/`status` and call the methods.
 */
export class Session {
  phase: Phase = "loading";
  user: { id: string; name: string } | null = null;
  /** Role assignments from the server, saved for offline use; undefined until first known. */
  roles: RoleAssignment[] | undefined = undefined;
  notice: string | null = null; // an i18n key to show on the next screen
  /** On the change-password screen: true when an admin set the password and it must be replaced. */
  passwordForced = false;
  /** The password just typed at sign-in, kept in memory only, so the forced change does not ask for it again. */
  private signInPassword: string | null = null;
  /** Set when sign-in is refused because the previous person still has unsent work. */
  otherUser: OtherUserBlock | null = null;
  status: SyncStatus = {
    running: false, pending: 0, photosPending: 0, nextCutoff: null, rejected: 0, lastOk: null, last: null,
    offline: false, noInternet: false, clockSuspect: false,
  };
  /** Goes up whenever records change on the phone (a save here, or a sync that sent or brought something). */
  changes = 0;
  store!: SqlStore;
  client!: SyncClient;
  /** Photo evidence: files.capture({ entity, scopeId }) → { fileId } to store in a record. */
  files!: EvidenceFiles;
  /** Half-filled forms, kept across app kills and auto-lock. */
  drafts!: Drafts;
  private driver!: SqlDriver;
  private db: SQLiteDatabase | null = null;
  private listeners = new Set<Listener>();
  private stopLoop: (() => void) | null = null;
  private backgroundAt: number | null = null;
  private appWatch: { remove: () => void } | null = null;

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    for (const l of this.listeners) l();
  }
  private go(phase: Phase, notice: string | null = null) {
    this.phase = phase;
    this.notice = notice;
    this.emit();
  }

  async boot(): Promise<void> {
    const { key, created } = await secure.dbKey();
    let opened;
    try {
      opened = await openStore(key);
    } catch (e) {
      // A database no key opens: after a revoke wiped the key, or a key lost with app data.
      // With a new key there is nothing to save, so start again with an empty database.
      if (!created) throw new BootError(String(e));
      console.warn("database could not be opened with a new key; starting fresh", e);
      await deleteDb();
      opened = await openStore(key);
    }
    const { store, driver, db } = opened;
    this.store = store;
    this.driver = driver;
    this.db = db;
    this.drafts = await Drafts.open(driver);
    this.files = await EvidenceFiles.open(driver, secure.token.get, this.drafts);
    this.client = new SyncClient(store, httpTransport(secure.token.get), { newId: () => Crypto.randomUUID() });
    serverClock.onDate = (serverMs, deviceMs) => void this.noteServerTime(serverMs, deviceMs);
    const saved = await secure.savedUser();
    this.user = saved ? { id: saved.id, name: saved.name } : null;
    this.roles = await secure.savedRoles.get();
    await this.checkClockOffline();
    const [tok, hasPin, notice, mustChange] = await Promise.all([secure.token.get(), secure.pin.isSet(), secure.pendingNotice.get(), secure.mustChangePassword.get()]);
    await this.refreshCounts();
    await this.files.recoverPending();
    this.watchAppState();
    this.passwordForced = !!tok && mustChange;
    this.go(!tok ? "signIn" : this.passwordForced ? "changePassword" : hasPin ? "unlock" : "setPin", !tok ? notice : null);
  }

  /** After a boot error the person chose to reset: delete the unreadable database and start again. */
  async resetPhone(): Promise<void> {
    await deleteDb(this.db);
    this.db = null;
    await secure.forgetDbKey();
    await this.boot();
  }

  /** Revoked screen → sign in again (the phone registers as a new device). */
  async restart(): Promise<void> {
    this.phase = "loading";
    this.emit();
    await this.boot();
  }

  /** Lock after AUTO_LOCK_MS in the background; drafts keep what was being typed. */
  private watchAppState() {
    this.appWatch?.remove();
    this.appWatch = AppState.addEventListener("change", (s) => {
      if (s === "background") this.backgroundAt = Date.now();
      else if (s === "active") {
        const away = this.backgroundAt === null ? 0 : Date.now() - this.backgroundAt;
        this.backgroundAt = null;
        if (this.phase === "home" && away >= AUTO_LOCK_MS) this.lock();
        void this.checkClockOffline();
      }
    });
  }

  async signIn(email: string, password: string): Promise<string | null> {
    this.otherUser = null;
    const id = await secure.deviceId();
    const previous = await secure.savedUser();
    // Same check before registering, so the server is not told this phone changed hands yet.
    if (previous?.email && previous.email.toLowerCase() !== email.trim().toLowerCase()) {
      const block = await this.pendingWorkOf(previous);
      if (block) return block;
    }
    try {
      const res = await registerDevice(email.trim(), password, id, "Android");
      if (previous && previous.id !== res.user.id) {
        // Never mix two people's work: the previous user must sync first, then the phone is cleared.
        const block = await this.pendingWorkOf(previous);
        if (block) return block;
        await this.store.wipe();
        await this.files.wipe();
        await this.drafts.wipe();
        await this.clearRejections();
        // The previous person's tiles must not linger if the server sends no roles.
        this.roles = undefined;
        await secure.savedRoles.clear();
      }
      await secure.token.set(res.token);
      await secure.pendingNotice.clear();
      this.user = { id: res.user.id, name: res.user.name };
      await secure.saveUser({ ...this.user, email: res.user.email || email.trim() });
      if (res.user.assignments) {
        this.roles = res.user.assignments;
        await secure.savedRoles.set(this.roles);
      }
      if (res.user.mustChangePassword) {
        await secure.mustChangePassword.set();
        this.passwordForced = true;
        this.signInPassword = password;
        this.go("changePassword");
      } else {
        await secure.mustChangePassword.clear();
        this.go("setPin");
      }
      return null;
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "offline") return "auth.offline";
        if (e.code === "locked") return "auth.locked";
        if (e.status === 401) return "auth.invalid";
      }
      return "sync.failed";
    }
  }

  /** Whether the change-password screen must ask for the current password (not kept from sign-in). */
  needsCurrentPassword(): boolean {
    return this.signInPassword === null;
  }

  /** From home: open the change-password screen (the person can go back). */
  openChangePassword(): void {
    this.stopLoop?.();
    this.stopLoop = null;
    this.passwordForced = false;
    this.signInPassword = null;
    this.go("changePassword");
  }

  /** Back from a voluntary change. A forced change has no way back except signing in again. */
  cancelChangePassword(): void {
    if (this.passwordForced) return;
    this.enterHome();
  }

  /**
   * Changes the password on the server. Nothing on the phone is touched: unsent work stays in the
   * outbox and syncs as soon as home opens. Returns an i18n key for an error, or null when done.
   */
  async changePassword(current: string | null, next: string): Promise<string | null> {
    const tok = await secure.token.get();
    if (!tok) {
      this.go("signIn", "app.sessionEnded");
      return null;
    }
    try {
      await changePassword(tok, current ?? this.signInPassword ?? "", next);
    } catch (e) {
      if (e instanceof DeviceRevokedError) {
        await this.wipeRevoked();
        return null;
      }
      if (e instanceof ApiError) {
        if (e.code === "offline") return "auth.offline";
        if (e.status === 401) {
          // This phone's session ended meanwhile: sign in again, keeping all data.
          this.signInPassword = null;
          await this.endSession();
          return null;
        }
        if (["wrong_password", "weak_password", "same_password", "locked"].includes(e.code)) return `app.pw_${e.code}`;
      }
      return "app.pw_failed";
    }
    const forced = this.passwordForced;
    this.signInPassword = null;
    this.passwordForced = false;
    await secure.mustChangePassword.clear();
    if (forced && !(await secure.pin.isSet())) this.go("setPin", "app.pwChanged");
    else {
      this.go("home", "app.pwChanged");
      this.startLoop();
    }
    return null;
  }

  /** Records and photos the previous person has not sent: blocks a different person's sign-in. */
  private async pendingWorkOf(previous: { name: string }): Promise<string | null> {
    const [records, photos, tok] = await Promise.all([this.store.outboxSize(), this.files.pendingCount(), secure.token.get()]);
    if (records === 0 && photos === 0) return null;
    this.otherUser = { name: previous.name, records, photos, canSendNow: !!tok };
    return "app.otherUserPending";
  }

  /** From the sign-in screen: send the previous person's work with their still-valid token. */
  async sendPreviousWork(): Promise<"sent" | "partly" | "failed"> {
    this.status = { ...this.status, running: true };
    this.emit();
    let out: SyncOutcome;
    try {
      out = await this.client.sync();
      if (out.ok) await this.files.upload();
    } catch {
      out = { ok: false, pushed: 0, pulled: 0, clockSuspect: false };
    }
    this.status = { ...this.status, running: false };
    await this.refreshCounts();
    const [records, photos] = [this.status.pending, this.status.photosPending];
    if (this.otherUser) this.otherUser = { ...this.otherUser, records, photos };
    this.emit();
    if (records === 0 && photos === 0) {
      this.otherUser = null;
      return "sent";
    }
    return out.ok ? "partly" : "failed";
  }

  async setPin(value: string): Promise<void> {
    await secure.pin.set(value);
    this.enterHome();
  }

  async unlock(value: string): Promise<{ ok: true } | { ok: false; remaining: number }> {
    const r = await secure.pin.check(value, PIN_MAX_FAILURES);
    if (r === "ok") {
      this.enterHome();
      return { ok: true };
    }
    if (r <= 0) {
      await secure.pin.lockOut();
      this.go("signIn", "app.pinLockedOut");
    }
    return { ok: false, remaining: r };
  }

  /** "Forgot PIN / not you?": go to the online sign-in. The data and the token stay until someone signs in. */
  toSignIn(): void {
    this.go("signIn", "app.forgotPinNotice");
  }
  /** Back from sign-in to the PIN screen, when a PIN and a token are still here. */
  async canUnlock(): Promise<boolean> {
    const [tok, pin] = await Promise.all([secure.token.get(), secure.pin.isSet()]);
    return !!tok && pin;
  }
  backToUnlock(): void {
    this.otherUser = null;
    this.go("unlock");
  }

  lock(): void {
    this.stopLoop?.();
    this.stopLoop = null;
    this.go("unlock");
  }

  private enterHome() {
    this.go("home");
    this.startLoop();
  }

  /** Sync now, when the app comes to the foreground, every few minutes, and when the network returns. */
  private startLoop() {
    this.stopLoop?.();
    void this.syncNow();
    const timer = setInterval(() => void this.syncNow(), SYNC_INTERVAL_MS);
    const appSub = AppState.addEventListener("change", (s) => {
      if (s === "active") void this.syncNow();
    });
    let wasOffline = false;
    const netUnsub = NetInfo.addEventListener((n) => {
      const offline = n.isConnected === false;
      const noInternet = !offline && n.isInternetReachable === false;
      if (wasOffline && !offline) void this.syncNow();
      wasOffline = offline;
      if (this.status.offline !== offline || this.status.noInternet !== noInternet) {
        this.status = { ...this.status, offline, noInternet };
        this.emit();
      }
    });
    this.stopLoop = () => {
      clearInterval(timer);
      appSub.remove();
      netUnsub();
    };
  }

  async syncNow(): Promise<void> {
    if (this.status.running || this.phase !== "home") return;
    this.status = { ...this.status, running: true };
    this.emit();
    const out = await this.client.sync();
    let revoked = out.revoked ?? false;
    let ended = (out as { sessionEnded?: boolean }).sessionEnded === true || out.error === "session_ended";
    if (out.ok && !revoked && !ended) {
      try {
        await this.files.upload();
      } catch (e) {
        if (e instanceof DeviceRevokedError) revoked = true;
        if (e instanceof SessionEndedError) ended = true;
      }
    }
    if (revoked) return this.wipeRevoked();
    if (ended) return this.endSession();
    if (out.clockSuspect && !this.status.clockSuspect) await this.setClockSuspect(true);
    if (out.pushed + out.pulled > 0) this.changes++;
    this.status = { ...this.status, running: false, last: out, lastOk: out.ok ? new Date().toISOString() : this.status.lastOk };
    await this.refreshCounts();
    if (out.ok) await this.report();
  }

  /** Revoked by an admin: delete everything, including the database file and the device id. */
  private async wipeRevoked(): Promise<void> {
    this.stopLoop?.();
    this.stopLoop = null;
    try {
      await this.store.wipe();
      await this.files.wipe();
      await this.drafts.wipe();
    } catch (e) {
      console.warn("wipe failed", e);
    }
    await deleteDb(this.db);
    this.db = null;
    await secure.forgetAll();
    this.user = null;
    this.roles = undefined;
    this.status = { ...this.status, running: false, pending: 0, photosPending: 0, rejected: 0 };
    this.go("revoked");
  }

  /**
   * The server ended this person's session (password reset, account deactivated, token expired).
   * Nothing is wiped: unsent records and photos wait until the same person signs in again.
   */
  private async endSession(): Promise<void> {
    this.stopLoop?.();
    this.stopLoop = null;
    await secure.token.clear();
    await secure.pendingNotice.set("app.sessionEnded");
    this.status = { ...this.status, running: false };
    await this.refreshCounts();
    this.go("signIn", "app.sessionEnded");
  }

  /** Best effort: lets an admin see unsynced work before removing this phone, and fetches the next cut-off. */
  private async report(): Promise<void> {
    const tok = await secure.token.get();
    if (!tok) return;
    try {
      const r = await reportStatus(tok, { pendingChanges: this.status.pending, pendingPhotos: this.status.photosPending });
      this.status = { ...this.status, nextCutoff: r.nextCutoff };
      this.emit();
    } catch {
      // offline or server busy: the next sync tries again
    }
    try {
      const me = await getMe(tok);
      if (JSON.stringify(me.assignments) !== JSON.stringify(this.roles)) {
        this.roles = me.assignments;
        await secure.savedRoles.set(me.assignments);
        this.emit();
      }
    } catch {
      // keep the saved roles
    }
  }

  /* ---------------------------------------------------------------- clock */

  /** Every server answer carries the server's time: a phone more than 10 minutes off is flagged. */
  private async noteServerTime(serverMs: number, deviceMs: number): Promise<void> {
    const suspect = isClockSuspect(serverMs - deviceMs);
    await secure.clock.set({ serverMs, deviceMs, suspect }).catch(() => undefined);
    if (suspect !== this.status.clockSuspect) {
      this.status = { ...this.status, clockSuspect: suspect };
      this.emit();
    }
  }

  private async setClockSuspect(suspect: boolean) {
    const c = await secure.clock.get();
    if (c) await secure.clock.set({ ...c, suspect }).catch(() => undefined);
    this.status = { ...this.status, clockSuspect: suspect };
    this.emit();
  }

  /**
   * Without signal: the clock is suspect if it was last time, or if it now reads earlier than the
   * last server time seen (someone set it back), allowing the 10-minute margin.
   */
  async checkClockOffline(): Promise<void> {
    const c = await secure.clock.get();
    if (!c) return;
    const now = Date.now();
    const goneBack = now < c.serverMs && isClockSuspect(c.serverMs - now);
    const suspect = c.suspect || goneBack;
    if (suspect !== this.status.clockSuspect) {
      this.status = { ...this.status, clockSuspect: suspect };
      this.emit();
    }
  }

  /* ------------------------------------------------------- demo, counts */

  /** Loads the demo data on the server, then syncs so it arrives here. Returns an i18n key for the outcome. */
  async loadDemo(): Promise<string> {
    const tok = await secure.token.get();
    if (!tok) return "app.demoFailed";
    try {
      await loadDemo(tok);
    } catch {
      return "app.demoFailed";
    }
    while (this.status.running) await new Promise((r) => setTimeout(r, 300));
    await this.syncNow();
    return this.status.last?.ok ? "app.demoLoaded" : "app.demoSyncFailed";
  }

  /** A form saved records on the phone: screens that show them reload, and the counts update. */
  async localSaved(): Promise<void> {
    this.changes++;
    await this.refreshCounts();
  }

  async refreshCounts(): Promise<void> {
    const [pending, rejected, photosPending] = await Promise.all([
      this.store.outboxSize(),
      this.store.rejections().then((r) => r.length),
      this.files.pendingCount(),
    ]);
    this.status = { ...this.status, pending, rejected, photosPending };
    this.emit();
  }

  /* ------------------------------------------------------------ problems */

  /** What the server refused, newest first, with the record's own fields when the phone still has it. */
  async listRejections(): Promise<RejectionRow[]> {
    const rows = await this.driver.all<{ id: number; body: string }>("SELECT id, body FROM rejections ORDER BY id DESC");
    const out: RejectionRow[] = [];
    for (const r of rows) {
      try {
        const rej = JSON.parse(r.body) as Rejection;
        const record = await this.client.get(rej.entity, rej.recordId).catch(() => undefined);
        out.push({ ...rej, rowId: Number(r.id), ...(record ? { record } : {}) });
      } catch {
        // skip a row that cannot be read
      }
    }
    return out;
  }

  /** "Compris": the person has seen this problem; it leaves the list and the home count. */
  async dismissRejection(rowId: number): Promise<void> {
    await this.driver.run("DELETE FROM rejections WHERE id = ?", [rowId]);
    await this.refreshCounts();
  }

  private async clearRejections(): Promise<void> {
    await this.driver.run("DELETE FROM rejections");
  }
}
