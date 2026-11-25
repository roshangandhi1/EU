import { describe, expect, it } from "vitest";
import "../lib/registry";
import { fmtDate, fmtEur, fmtNum, parseDecimal, plural, tn, toCsv } from "../lib/format";
import { checklistOutcome, extrasFrom, visitFlow } from "../lib/borehole-detail";
import { plotExtras } from "../lib/plot-detail";
import { readsSchools } from "../lib/nav";
import { fillLabels, serverIssue, validateTasks } from "../app/[locale]/(app)/boreholes/templates/validate";
import type { MaintenanceTaskDef } from "@eu/boreholes";

const nbsp = (s: string) => s.replace(/[  ]/g, " ");

describe("format helpers", () => {
  it("reads decimals typed the French or English way", () => {
    expect(parseDecimal("2,2")).toBe(2.2);
    expect(parseDecimal(" -7.912 ")).toBe(-7.912);
    expect(parseDecimal("−7,5")).toBe(-7.5);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("1.2.3")).toBeNaN();
    expect(parseDecimal("abc")).toBeNaN();
  });

  it("formats dates, numbers and euros per locale", () => {
    expect(fmtDate("2026-11-16", "fr")).toBe("16 nov. 2026");
    expect(fmtDate("2026-11-16", "en")).toBe("16 Nov 2026");
    expect(fmtDate(null, "fr")).toBe("—");
    expect(nbsp(fmtNum(1250.5, "fr", 1))).toBe("1 250,5");
    expect(fmtNum(1250.5, "en", 1)).toBe("1,250.5");
    expect(nbsp(fmtEur(39600, "fr"))).toBe("39 600 €");
    expect(fmtEur(39600, "en")).toBe("€39,600");
  });

  it("picks the singular form by the locale's plural rule (French 0 and 1 are singular)", () => {
    const forms = { one: "{n} tâche", other: "{n} tâches" };
    expect(plural("fr", 0, forms)).toBe("0 tâche");
    expect(plural("fr", 1, forms)).toBe("1 tâche");
    expect(plural("fr", 2, forms)).toBe("2 tâches");
    expect(plural("en", 0, { one: "{n} task", other: "{n} tasks" })).toBe("0 tasks");
    expect(tn("en", "ui.phones.changes", 1)).toBe("1 change");
    expect(tn("en", "ui.phones.changes", 3)).toBe("3 changes");
    expect(tn("fr", "ui.phones.photos", 0)).toBe("0 photo");
  });

  it("writes CSV with a BOM, ';' and decimal commas for French", () => {
    const fr = toCsv([["Code", "Valeur"], ["2.2.1", 39.28], ["x;y", null]], "fr");
    expect(fr.startsWith("﻿")).toBe(true);
    expect(fr).toBe("﻿Code;Valeur\r\n2.2.1;39,28\r\n\"x;y\";\r\n");
    expect(toCsv([["a", 1.5], ['say "hi"', 2]], "en")).toBe("﻿a,1.5\r\n\"say \"\"hi\"\"\",2\r\n");
  });
});

describe("borehole detail read model", () => {
  it("keeps the latest live population and the latest measured flow per borehole", () => {
    const m = extrasFrom(
      [
        { scopeId: "b1", estimatedOn: "2026-01-01", population: 300 },
        { scopeId: "b1", estimatedOn: "2026-06-01", population: 420 },
        { scopeId: "b1", estimatedOn: "2026-09-01", population: 999, voidedAt: new Date() },
      ],
      [
        { scopeId: "b1", visitedOn: "2026-05-01", flowLpm: 30 },
        { scopeId: "b1", visitedOn: "2026-08-01", operational: { flowLpm: 24 } },
        { scopeId: "b1", visitedOn: "2026-10-01", flowLpm: null },
        { scopeId: "b2", visitedOn: "2026-10-01", flowLpm: 12 },
      ],
    );
    expect(m.get("b1")).toEqual({ population: 420, populationOn: "2026-06-01", flowLpm: 24, flowOn: "2026-08-01" });
    expect(m.get("b2")).toEqual({ population: null, populationOn: null, flowLpm: 12, flowOn: "2026-10-01" });
    expect(visitFlow({ flowLpm: 5, operational: { flowLpm: 7 } })).toBe(7);
  });

  it("counts checklist tasks done and failed, including readings out of range", () => {
    const tasks = [
      { key: "flow", label: { en: "Flow", fr: "Débit" }, frequency: { kind: "each_visit" }, appliesTo: { all: true }, proof: { kind: "reading", unit: "L/min", min: 10 }, failOpensFault: true },
      { key: "panels", label: { en: "Panels", fr: "Panneaux" }, frequency: { kind: "each_visit" }, appliesTo: { all: true }, proof: { kind: "tick" }, failOpensFault: true },
    ] as MaintenanceTaskDef[];
    expect(checklistOutcome([{ taskKey: "flow", done: true, value: 8 }, { taskKey: "panels", done: true }], tasks)).toEqual({ done: 2, bad: 1 });
    expect(checklistOutcome([{ taskKey: "panels", done: true, pass: false }, { taskKey: "flow", done: false }], tasks)).toEqual({ done: 1, bad: 1 });
  });
});

describe("plot detail read model", () => {
  const stamp = { deviceTime: new Date(), serverTime: new Date() };
  it("counts replacement planting in the total and dates the plot by its first planting", () => {
    const x = plotExtras({
      plantings: [
        { ...stamp, id: "p2", plantedOn: "2026-03-01", isGapFilling: true, photos: [], lines: [{ species: "bambusa", count: 40 }] },
        { ...stamp, id: "p1", plantedOn: "2026-01-10", isGapFilling: false, photos: [], lines: [{ species: "bambusa", count: 400 }, { species: "dendro", count: 25 }] },
        { ...stamp, id: "p3", plantedOn: "2026-02-01", isGapFilling: false, photos: [], lines: [{ species: "bambusa", count: 1000 }], voidedAt: new Date() },
      ] as never,
      visits: [],
    });
    expect(x).toEqual({ plantedOn: "2026-01-10", plants: 465, replacementPlants: 40, survivalPct: null, survivalOn: null });
  });
});

describe("schools navigation (UX-8)", () => {
  const me = (assignments: unknown[]) => ({ user: { id: "u", assignments } }) as never;
  it("shows schools only to roles that can read them", () => {
    expect(readsSchools(me([{ role: "system_admin", scope: { type: "global" } }]))).toBe(true);
    expect(readsSchools(me([{ role: "headteacher", scope: { type: "site", siteId: "s1", stream: "schools" } }]))).toBe(true);
    expect(readsSchools(me([{ role: "technician", scope: { type: "stream", stream: "boreholes" } }]))).toBe(false);
    expect(readsSchools(me([{ role: "stream_lead", scope: { type: "stream", stream: "bamboo" } }]))).toBe(false);
  });
});

describe("maintenance template checks", () => {
  const task = (over: Partial<MaintenanceTaskDef> = {}): MaintenanceTaskDef => ({
    key: "panels_clean", label: { en: "Clean panels", fr: "" }, frequency: { kind: "every_n_months", n: 1, day: 1 }, appliesTo: { all: true }, proof: { kind: "tick" }, failOpensFault: true, ...over,
  });
  it("fills the missing label language from the other", () => {
    expect(fillLabels([task()])[0]!.label).toEqual({ en: "Clean panels", fr: "Clean panels" });
  });
  it("names the task for each problem", () => {
    expect(validateTasks([task(), task()])).toEqual([{ code: "key_dup", n: 2 }]);
    expect(validateTasks([task({ label: { en: " ", fr: "" }, key: "X" })])).toEqual([{ code: "label", n: 1 }, { code: "key", n: 1 }]);
    expect(validateTasks([task({ proof: { kind: "reading", unit: "", min: 5, max: 2 } })])).toEqual([{ code: "reading", n: 1 }, { code: "min_max", n: 1 }]);
    expect(validateTasks([])).toEqual([{ code: "empty" }]);
    expect(serverIssue("tasks.2.label.fr: Too small")).toEqual({ code: "label", n: 3 });
    expect(serverIssue("name: Required")).toEqual({ code: "task" });
  });
});
