export type Frequency =
  | { kind: "each_visit" }
  | { kind: "every_n_days"; n: number }
  | { kind: "every_n_months"; n: number; day: number } // day 1-28
  | { kind: "yearly"; month: number; day: number };

export type AppliesTo = { all: true } | { pumpRatingsKw?: number[]; villages?: string[]; siteIds?: string[] };

export type ProofSpec =
  | { kind: "tick" }
  | { kind: "reading"; unit: string; min?: number; max?: number }
  | { kind: "photo" };

export interface TaskResult {
  taskKey: string;
  done: boolean;
  pass?: boolean; // tick: done implies pass unless marked failed
  value?: number; // reading
  photoFileId?: string;
  note?: string;
}

/** The proposed written "operational" checklist (scope doc), recorded on a visit. */
export interface OperationalCheck {
  pumpDelivers: boolean;
  flowLpm: number | null;
  tankFillsTapsOk: boolean;
}
