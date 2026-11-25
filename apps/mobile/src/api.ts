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
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify(body),
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
  user: { id: string; name: string; email: string; locale: string };
}

/** Phone sign-in: registers this phone and returns its long-lived token. */
export function registerDevice(email: string, password: string, deviceId: string, deviceName: string): Promise<SignedIn> {
  return post<SignedIn>("/api/devices/register", { email, password, deviceId, deviceName, appVersion: APP_VERSION });
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
