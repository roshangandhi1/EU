import { describe, expect, it } from "vitest";
import { dueList, failedResults, nextDue, onTimeRate, type BoreholeLite } from "../src/maintenance";
import { defaultTemplate } from "../src/defaults";
import { templateSchema } from "../src/validation";

const bh: BoreholeLite = { siteId: "s1", village: "Malambwe", pumpRatingKw: 1.1, handedOverOn: "2026-06-15", commissionedOn: "2026-06-10" };
const opts = { dueSoonDays: 7, overdueGraceDays: 7 };

describe("nextDue", () => {
  it("every N days", () => {
    expect(nextDue({ kind: "every_n_days", n: 30 }, "2026-01-10", "2026-01-01")).toBe("2026-02-09");
    expect(nextDue({ kind: "every_n_days", n: 30 }, null, "2026-01-01")).toBe("2026-01-01");
  });
  it("monthly on a day, quarterly", () => {
    expect(nextDue({ kind: "every_n_months", n: 1, day: 1 }, null, "2026-06-15")).toBe("2026-07-01");
    expect(nextDue({ kind: "every_n_months", n: 1, day: 1 }, "2026-07-03", "2026-06-15")).toBe("2026-08-01");
    expect(nextDue({ kind: "every_n_months", n: 3, day: 1 }, "2026-11-20", "2026-06-15")).toBe("2027-02-01");
  });
  it("yearly, clamped to month length", () => {
    expect(nextDue({ kind: "yearly", month: 9, day: 1 }, null, "2026-06-15")).toBe("2026-09-01");
    expect(nextDue({ kind: "yearly", month: 9, day: 1 }, null, "2026-10-01")).toBe("2027-09-01");
    expect(nextDue({ kind: "yearly", month: 9, day: 1 }, "2026-09-03", "2026-06-15")).toBe("2027-09-01");
    // done early in August still satisfies September of the same year
    expect(nextDue({ kind: "yearly", month: 9, day: 1 }, "2027-08-20", "2026-06-15")).toBe("2028-09-01");
    expect(nextDue({ kind: "yearly", month: 2, day: 31 }, null, "2027-01-01")).toBe("2027-02-28");
  });
});

describe("dueList", () => {
  it("builds the due list from the default template", () => {
    const visits = [{ visitedOn: "2026-11-02", results: [{ taskKey: "flow_measure", done: true, value: 22 }] }];
    const list = dueList(bh, defaultTemplate.tasks, visits, "2026-11-25", opts);
    const by = Object.fromEntries(list.map((i) => [i.taskKey, i]));
    expect(by.panels_clean!.status).toBe("each_visit");
    expect(by.flow_measure!.dueOn).toBe("2026-12-01");
    expect(by.flow_measure!.status).toBe("due_soon");
    expect(by.taps_fittings!.dueOn).toBe("2026-07-01");
    expect(by.taps_fittings!.status).toBe("overdue");
    expect(by.tank_disinfect!.dueOn).toBe("2026-09-01");
  });

  it("nothing due before the borehole is in service", () => {
    expect(dueList({ ...bh, handedOverOn: null, commissionedOn: null }, defaultTemplate.tasks, [], "2026-11-25", opts)).toEqual([]);
  });

  it("respects appliesTo filters", () => {
    const tasks = [{ ...defaultTemplate.tasks[2]!, appliesTo: { pumpRatingsKw: [2.2] } }];
    expect(dueList(bh, tasks, [], "2026-11-25", opts)).toEqual([]);
  });

  it("ignores voided visits", () => {
    const visits = [{ visitedOn: "2026-11-02", results: [{ taskKey: "flow_measure", done: true }], voidedAt: new Date() }];
    const flow = dueList(bh, defaultTemplate.tasks, visits, "2026-11-25", opts).find((i) => i.taskKey === "flow_measure")!;
    expect(flow.lastDoneOn).toBeNull();
  });
});

describe("on-time rate and faults", () => {
  it("counts monthly completions within grace", () => {
    const tasks = [defaultTemplate.tasks[2]!]; // monthly flow on the 1st
    const visits = ["2026-07-02", "2026-08-05", "2026-09-20", "2026-10-01"].map((d) => ({ visitedOn: d, results: [{ taskKey: "flow_measure", done: true }] }));
    const r = onTimeRate(bh, tasks, visits, "2026-07-01", "2026-10-31", 7);
    // due Jul 1 (done Jul 2 ok), Aug 1 (Aug 5 ok), Sep 1 (missed; Sep 20 late), Oct 1 (ok)
    expect(r.due).toBe(4);
    expect(r.onTime).toBe(3);
  });

  it("opens faults for failed ticks and out-of-range readings", () => {
    const res = [
      { taskKey: "leaks_check", done: true, pass: false },
      { taskKey: "flow_measure", done: true, value: 0 },
      { taskKey: "panels_clean", done: true, pass: false }, // failOpensFault false
      { taskKey: "water_quality", done: true, value: 3 },
    ];
    expect(failedResults(defaultTemplate.tasks, res).map((r) => r.taskKey)).toEqual(["leaks_check", "flow_measure"]);
  });

  it("default template validates", () => {
    expect(templateSchema.safeParse({ ...defaultTemplate, templateVersion: 1 }).success).toBe(true);
  });
});
