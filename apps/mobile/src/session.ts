import type { RoleAssignment } from "@eu/core";
import NetInfo from "@react-native-community/netinfo";
import { DeviceRevokedError, SyncClient, type SyncOutcome } from "@eu/sync/client";
import type { SqlStore } from "@eu/sync/sql-store";
import * as Crypto from "expo-crypto";
import { AppState } from "react-native";
import { ApiError, getMe, httpTransport, loadDemo, registerDevice, reportStatus } from "./api";
import { PIN_MAX_FAILURES, SYNC_INTERVAL_MS } from "./config";
import { openStore } from "./db";
import { EvidenceFiles } from "./files";
import * as secure from "./secure";

export type Phase = "loading" | "signIn" | "setPin" | "unlock" | "home" | "revoked";

export interface SyncStatus {
  running: boolean;
  pending: number;
  photosPending: number;
  nextCutoff: { at: string; label: string } | null;
  rejected: number;
  lastOk: string | null;
  last: SyncOutcome | null;
  offline: boolean;
}

type Listener = () => void;

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
  status: SyncStatus = { running: false, pending: 0, photosPending: 0, nextCutoff: null, rejected: 0, lastOk: null, last: null, offline: false };
  store!: SqlStore;
  client!: SyncClient;
  /** Photo evidence: files.capture({ entity, scopeId }) → { fileId } to store in a record. */
  files!: EvidenceFiles;
  private listeners = new Set<Listener>();
  private stopLoop: (() => void) | null = null;

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
    const { store, driver } = await openStore(await secure.dbKey());
    this.store = store;
    this.files = await EvidenceFiles.open(driver, secure.token.get);
    this.client = new SyncClient(store, httpTransport(secure.token.get), { newId: () => Crypto.randomUUID() });
    this.user = await secure.savedUser();
    this.roles = await secure.savedRoles.get();
    const [tok, hasPin] = await Promise.all([secure.token.get(), secure.pin.isSet()]);
    await this.refreshCounts();
    this.go(!tok ? "signIn" : hasPin ? "unlock" : "setPin");
  }

  async signIn(email: string, password: string): Promise<string | null> {
    const id = await secure.deviceId();
    try {
      const res = await registerDevice(email.trim(), password, id, "Android");
      const previous = await secure.savedUser();
      if (previous && previous.id !== res.user.id) {
        // Never mix two people's work: the previous user must sync first, then the phone is cleared.
        if ((await this.store.outboxSize()) > 0) return "auth.otherUserPending";
        await this.store.wipe();
        await this.files.wipe();
      }
      await secure.token.set(res.token);
      this.user = { id: res.user.id, name: res.user.name };
      await secure.saveUser(this.user);
      if (res.user.assignments) {
        this.roles = res.user.assignments;
        await secure.savedRoles.set(this.roles);
      }
      this.go("setPin");
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
      this.go("signIn", "auth.pinLockedOut");
    }
    return { ok: false, remaining: r };
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
      if (wasOffline && !offline) void this.syncNow();
      wasOffline = offline;
      if (this.status.offline !== offline) {
        this.status = { ...this.status, offline };
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
    if (out.ok && !revoked) {
      try {
        await this.files.upload();
      } catch (e) {
        if (e instanceof DeviceRevokedError) revoked = true;
      }
    }
    if (revoked) {
      this.stopLoop?.();
      await this.store.wipe();
      await this.files.wipe();
      await secure.forgetAll();
      this.user = null;
      this.go("revoked");
      return;
    }
    this.status = { ...this.status, running: false, last: out, lastOk: out.ok ? new Date().toISOString() : this.status.lastOk };
    await this.refreshCounts();
    if (out.ok) await this.report();
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
    return "app.demoLoaded";
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
}
