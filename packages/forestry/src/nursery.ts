/** Nursery batch summary: germination %, losses, dispatched and on hand. */
export interface NurseryEventLite {
  kind: "germination_count" | "loss" | "dispatch";
  occurredOn: string;
  quantity: number;
  voidedAt?: Date | null;
}

export function summariseBatch(quantityStarted: number, events: NurseryEventLite[]) {
  const live = events.filter((e) => !e.voidedAt).sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
  // Germination counts are cumulative readings: the latest one is the germinated/rooted total.
  const lastCount = [...live].reverse().find((e) => e.kind === "germination_count");
  const germinated = lastCount?.quantity ?? null;
  const losses = live.filter((e) => e.kind === "loss").reduce((s, e) => s + e.quantity, 0);
  const dispatched = live.filter((e) => e.kind === "dispatch").reduce((s, e) => s + e.quantity, 0);
  const base = germinated ?? quantityStarted;
  return {
    germinated,
    germinationPct: germinated === null ? null : Math.round((germinated / quantityStarted) * 1000) / 10,
    losses,
    dispatched,
    onHand: Math.max(0, base - losses - dispatched),
    overDispatched: base - losses - dispatched < 0,
  };
}
