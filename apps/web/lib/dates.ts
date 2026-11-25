import { isRealIsoDate, todayDrc } from "@eu/core";

/** Today's date in Lubumbashi time (UTC+2, no DST), as yyyy-mm-dd. One helper for web, server and phone. */
export { todayDrc };
/** A real calendar date written yyyy-mm-dd (2026-02-30 is refused). */
export const isIsoDate = (s: unknown): s is string => typeof s === "string" && isRealIsoDate(s);
