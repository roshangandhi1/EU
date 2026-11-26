import type { RoleAssignment } from "@eu/core";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

/** Everything secret the phone keeps, in Android Keystore-backed secure storage. */
const K = {
  token: "eu.token",
  deviceId: "eu.deviceId",
  userId: "eu.userId",
  userName: "eu.userName",
  pin: "eu.pin", // "salt:hash"
  pinFailures: "eu.pinFailures",
  dbKey: "eu.dbKey",
  locale: "eu.locale",
  roles: "eu.roles", // JSON role assignments, to choose which home tiles to show offline
  userEmail: "eu.userEmail",
  notice: "eu.notice", // an i18n key to show on the sign-in screen after a restart (session ended)
  mustChangePassword: "eu.mustChangePassword", // "1" while an admin-set password has not been replaced
  clock: "eu.clock", // JSON { serverMs, deviceMs, suspect }: last server time seen, to check the clock offline
} as const;

const get = (k: string) => SecureStore.getItemAsync(k);
const set = (k: string, v: string) => SecureStore.setItemAsync(k, v);
const del = (k: string) => SecureStore.deleteItemAsync(k);

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stable per-install id; also the device id the server registers. */
export async function deviceId(): Promise<string> {
  let id = await get(K.deviceId);
  if (!id) {
    id = Crypto.randomUUID();
    await set(K.deviceId, id);
  }
  return id;
}

/** Random 256-bit SQLCipher key, created on first launch and never leaving the phone. `created`: it is new. */
export async function dbKey(): Promise<{ key: string; created: boolean }> {
  const key = await get(K.dbKey);
  if (key) return { key, created: false };
  const fresh = hex(Crypto.getRandomBytes(32));
  await set(K.dbKey, fresh);
  return { key: fresh, created: true };
}
export const forgetDbKey = () => del(K.dbKey);

export const token = { get: () => get(K.token), set: (v: string) => set(K.token, v), clear: () => del(K.token) };

export async function savedUser(): Promise<{ id: string; name: string; email: string | null } | null> {
  const [id, name, email] = await Promise.all([get(K.userId), get(K.userName), get(K.userEmail)]);
  return id ? { id, name: name ?? "", email } : null;
}
export async function saveUser(u: { id: string; name: string; email?: string }): Promise<void> {
  await Promise.all([set(K.userId, u.id), set(K.userName, u.name), u.email ? set(K.userEmail, u.email) : Promise.resolve()]);
}

/** The signed-in person's role assignments, kept so the home screen works offline. */
export const savedRoles = {
  get: async (): Promise<RoleAssignment[] | undefined> => {
    try {
      const raw = await get(K.roles);
      return raw ? (JSON.parse(raw) as RoleAssignment[]) : undefined;
    } catch {
      return undefined;
    }
  },
  set: (r: RoleAssignment[]) => set(K.roles, JSON.stringify(r)),
  clear: () => del(K.roles),
};

/** An admin set this person's password: they choose their own before using the app (survives a restart). */
export const mustChangePassword = {
  get: async () => (await get(K.mustChangePassword)) === "1",
  set: () => set(K.mustChangePassword, "1"),
  clear: () => del(K.mustChangePassword),
};

/** A notice for the sign-in screen that must survive a restart. */
export const pendingNotice = { get: () => get(K.notice), set: (k: string) => set(K.notice, k), clear: () => del(K.notice) };

export interface ClockState {
  serverMs: number;
  deviceMs: number;
  suspect: boolean;
}
export const clock = {
  get: async (): Promise<ClockState | null> => {
    try {
      const raw = await get(K.clock);
      return raw ? (JSON.parse(raw) as ClockState) : null;
    } catch {
      return null;
    }
  },
  set: (c: ClockState) => set(K.clock, JSON.stringify(c)),
};

export const savedLocale = { get: () => get(K.locale), set: (v: string) => set(K.locale, v) };

/** PIN: salted, stretched SHA-256. Brute force is bounded by the failure limit, not by the hash. */
async function hashPin(pin: string, salt: string): Promise<string> {
  let h = `${salt}:${pin}`;
  for (let i = 0; i < 2000; i++) h = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, h);
  return h;
}

export const pin = {
  async isSet(): Promise<boolean> {
    return (await get(K.pin)) != null;
  },
  async set(value: string): Promise<void> {
    const salt = hex(Crypto.getRandomBytes(16));
    await set(K.pin, `${salt}:${await hashPin(value, salt)}`);
    await set(K.pinFailures, "0");
  },
  /** Returns remaining attempts, or "ok". Counting survives app restarts. */
  async check(value: string, maxFailures: number): Promise<"ok" | number> {
    const stored = await get(K.pin);
    if (!stored) return 0;
    const [salt, expected] = stored.split(":");
    if (salt && expected && (await hashPin(value, salt)) === expected) {
      await set(K.pinFailures, "0");
      return "ok";
    }
    const failures = Number((await get(K.pinFailures)) ?? "0") + 1;
    await set(K.pinFailures, String(failures));
    return Math.max(0, maxFailures - failures);
  },
  async failures(): Promise<number> {
    return Number((await get(K.pinFailures)) ?? "0");
  },
  /** After too many wrong PINs: forget PIN and token so an online sign-in is needed. Data stays. */
  async lockOut(): Promise<void> {
    await Promise.all([del(K.pin), del(K.token), set(K.pinFailures, "0")]);
  },
};

/**
 * Device revoked by an admin: forget everything, including the database key and the device id,
 * so the phone registers again as a new device if it is issued to someone.
 */
export async function forgetAll(): Promise<void> {
  await Promise.all(Object.values(K).filter((k) => k !== K.locale).map(del));
}
