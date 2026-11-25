/** Phone clocks more than this far from the server's are flagged as suspect. */
export const CLOCK_SKEW_LIMIT_MS = 10 * 60 * 1000;

export function clockSkewMs(serverNow: Date, deviceNow: Date): number {
  return serverNow.getTime() - deviceNow.getTime();
}

export function isClockSuspect(skewMs: number): boolean {
  return Math.abs(skewMs) > CLOCK_SKEW_LIMIT_MS;
}
