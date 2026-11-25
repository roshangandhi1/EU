import type { RoleAssignment } from "@eu/core";
import { DeviceRevokedError, type Transport } from "@eu/sync/client";
import { API_BASE, APP_VERSION } from "./config";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

async function post<T>(path: string, body: unknown, bearer?: string): Promise<T> {
  return call<T>("POST", path, body, bearer);
}

async function call<T>(method: "GET" | "POST", path: string, body: unknown, bearer?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(0, "offline");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    if (res.status === 401 && data.error === "device_revoked") throw new DeviceRevokedError();
    throw new ApiError(res.status, data.error ?? `http_${res.status}`);
  }
  return data;
}

export interface SignedIn {
  token: string;
  user: { id: string; name: string; email: string; locale: string; assignments?: RoleAssignment[] };
}

/** Who this phone's token belongs to now, with current roles (they can change on the web). */
export function getMe(token: string): Promise<{ id: string; name: string; assignments: RoleAssignment[] }> {
  return call("GET", "/api/me", undefined, token);
}

/** Loads the demo data set (system admin or programme manager only). */
export function loadDemo(token: string): Promise<{ ok: true; created: string[] }> {
  return post("/api/admin/demo", { action: "load" }, token);
}

/** Phone sign-in: registers this phone and returns its long-lived token. */
export function registerDevice(email: string, password: string, deviceId: string, deviceName: string): Promise<SignedIn> {
  return post<SignedIn>("/api/devices/register", { email, password, deviceId, deviceName, appVersion: APP_VERSION });
}

/** Tells the server what this phone still holds unsynced; learns the next evidence cut-off. */
export function reportStatus(token: string, s: { pendingChanges: number; pendingPhotos: number }): Promise<{ nextCutoff: { at: string; label: string } | null }> {
  return post("/api/device/status", s, token);
}

export function httpTransport(getToken: () => Promise<string | null>): Transport {
  const withToken = async <T,>(path: string, body: unknown) => {
    const t = await getToken();
    if (!t) throw new ApiError(401, "signed_out");
    return post<T>(path, body, t);
  };
  return {
    push: (req) => withToken("/api/sync/push", req),
    pull: (req) => withToken("/api/sync/pull", req),
  };
}
