import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTER,
  collectFacets,
  isDefaultFilter,
  matchesFilter,
  toggleTypeSelection,
  toggleValue,
  typeSelectionKey,
  type CardFilter,
} from "./filter";
import { taskView, type } from "./fixtures";
import type { TaskView } from "./wire";

function filter(overrides: Partial<CardFilter> = {}): CardFilter {
  return { ...DEFAULT_FILTER, ...overrides };
}

/**
 * 不整合 の判定 (decision-22). The production shell folds its バージョン不整合 record in here; these
 * tests use the read's own findings unless a case says otherwise, which is what `readInconsistent`
 * spells out — the parameter exists so a filter can never silently fall back to health alone.
 */
const readInconsistent = (view: TaskView): boolean => view.task.health.state === "degraded";

describe("保存区分 (doc-7 §5)", () => {
  it("defaults to active alone", () => {
    expect(isDefaultFilter(DEFAULT_FILTER)).toBe(true);
    expect(matchesFilter(taskView({ storageState: "active" }), filter(), readInconsistent)).toBe(true);
    for (const state of ["draft", "completed", "archive"] as const) {
      expect(matchesFilter(taskView({ storageState: state }), filter(), readInconsistent)).toBe(false);
    }
  });

  it("shows a storage state once it is selected, alongside active", () => {
    const withDrafts = filter({ storage: ["active", "draft"] });
    expect(matchesFilter(taskView({ storageState: "draft" }), withDrafts, readInconsistent)).toBe(true);
    expect(matchesFilter(taskView({ storageState: "active" }), withDrafts, readInconsistent)).toBe(true);
    expect(matchesFilter(taskView({ storageState: "completed" }), withDrafts, readInconsistent)).toBe(false);
  });

  it("never treats an indeterminate storage state as active, but can select it", () => {
    const view = taskView({ storageState: null });
    expect(matchesFilter(view, filter(), readInconsistent)).toBe(false);
    expect(matchesFilter(view, filter({ storage: ["indeterminate"] }), readInconsistent)).toBe(true);
  });

  it("shows nothing when no storage state is selected", () => {
    expect(matchesFilter(taskView(), filter({ storage: [] }), readInconsistent)).toBe(false);
  });
});

describe("Type filter (decision-5, doc-7 §5)", () => {
  it("keeps a task when any of its Type values matches", () => {
    const view = taskView({ types: [type("feature"), type("research")] });
    const byResearch = filter({ types: [{ kind: "value", value: "research" }] });
    expect(matchesFilter(view, byResearch, readInconsistent)).toBe(true);
    expect(matchesFilter(taskView({ types: [type("bug")] }), byResearch, readInconsistent)).toBe(false);
  });

  it("matches Type values case-insensitively while keeping the project's spelling", () => {
    const view = taskView({ types: [type("Feature")] });
    expect(matchesFilter(view, filter({ types: [{ kind: "value", value: "feature" }] }), readInconsistent)).toBe(
      true,
    );
    expect(view.interpretation.types[0].value).toBe("Feature");
  });

  it("selects 未設定 and 未知 as their own choices", () => {
    const unset = taskView({ types: [] });
    const unknown = taskView({ types: [type("spike", false)] });
    expect(matchesFilter(unset, filter({ types: [{ kind: "unset" }] }), readInconsistent)).toBe(true);
    expect(matchesFilter(unknown, filter({ types: [{ kind: "unset" }] }), readInconsistent)).toBe(false);
    expect(matchesFilter(unknown, filter({ types: [{ kind: "unknown" }] }), readInconsistent)).toBe(true);
    expect(matchesFilter(taskView({ types: [type("feature")] }), filter({ types: [{ kind: "unknown" }] }), readInconsistent)).toBe(
      false,
    );
  });

  it("toggles a selection on and off", () => {
    const one = toggleTypeSelection(DEFAULT_FILTER, { kind: "value", value: "bug" });
    expect(one.types).toHaveLength(1);
    expect(toggleTypeSelection(one, { kind: "value", value: "bug" }).types).toHaveLength(0);
    expect(typeSelectionKey({ kind: "value", value: "bug" })).toBe("value:bug");
  });
});

describe("label / priority / assignee / text / 縮退", () => {
  it("matches any selected normal label", () => {
    const view = taskView({ labels: ["ui", "backend"] });
    expect(matchesFilter(view, filter({ labels: ["backend"] }), readInconsistent)).toBe(true);
    expect(matchesFilter(view, filter({ labels: ["docs"] }), readInconsistent)).toBe(false);
  });

  it("matches priority regardless of case, and drops tasks without one", () => {
    expect(matchesFilter(taskView({ priority: "High" }), filter({ priorities: ["high"] }), readInconsistent)).toBe(
      true,
    );
    expect(matchesFilter(taskView({ priority: null }), filter({ priorities: ["high"] }), readInconsistent)).toBe(
      false,
    );
  });

  it("matches any selected assignee", () => {
    const view = taskView({ assignee: ["@takkyun"] });
    expect(matchesFilter(view, filter({ assignees: ["@takkyun"] }), readInconsistent)).toBe(true);
    expect(matchesFilter(view, filter({ assignees: ["@someone"] }), readInconsistent)).toBe(false);
  });

  it("matches text against the cross-task-id and the title, case-insensitively", () => {
    const view = taskView({ project: "geomyth", id: "TASK-7", title: "Swimlane screen" });
    expect(matchesFilter(view, filter({ text: "geomyth:task-7" }), readInconsistent)).toBe(true);
    expect(matchesFilter(view, filter({ text: "SWIMLANE" }), readInconsistent)).toBe(true);
    expect(matchesFilter(view, filter({ text: "  " }), readInconsistent)).toBe(true);
    expect(matchesFilter(view, filter({ text: "detail" }), readInconsistent)).toBe(false);
  });

  it("extracts 不整合 tasks on their own", () => {
    const degraded = taskView({
      health: { state: "degraded", events: [{ event: "unexpectedSchema", detail: "unknown status" }] },
    });
    expect(matchesFilter(degraded, filter({ inconsistentOnly: true }), readInconsistent)).toBe(true);
    expect(matchesFilter(taskView(), filter({ inconsistentOnly: true }), readInconsistent)).toBe(false);
  });

  /**
   * decision-22 のカードは、読み取りの由来が無くてもシェルが記録した バージョン不整合 だけで ⚠️ を
   * 出す。判定を health だけで書くと、その ⚠️ を出しているカードを 不整合 の絞り込みが隠すことに
   * なる — 同じ画面が同じタスクについて 2 つのことを言う状態である。
   */
  it("keeps a task whose 不整合 is only the shell's バージョン不整合 record", () => {
    const clean = taskView();
    const conflicted = (view: TaskView): boolean => view === clean;
    expect(matchesFilter(clean, filter({ inconsistentOnly: true }), conflicted)).toBe(true);
    expect(matchesFilter(clean, filter({ inconsistentOnly: true }), readInconsistent)).toBe(false);
  });

  it("combines facets with AND", () => {
    const view = taskView({ types: [type("feature")], labels: ["ui"], priority: "high" });
    expect(
      matchesFilter(
        view,
        filter({ types: [{ kind: "value", value: "feature" }], labels: ["ui"], priorities: ["high"] }),
        readInconsistent,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        view,
        filter({ types: [{ kind: "value", value: "feature" }], labels: ["backend"] }),
        readInconsistent,
      ),
    ).toBe(false);
  });

  it("toggles a plain string facet", () => {
    expect(toggleValue(["ui"], "backend")).toEqual(["ui", "backend"]);
    expect(toggleValue(["ui", "backend"], "ui")).toEqual(["backend"]);
  });
});

describe("facets offered by the control", () => {
  it("gathers values from every task, including ones the current filter hides", () => {
    const facets = collectFacets([
      taskView({ types: [type("feature")], labels: ["ui"], priority: "medium", assignee: ["a"] }),
      taskView({
        storageState: "archive",
        types: [type("spike", false)],
        labels: ["backend"],
        priority: "high",
        assignee: ["b"],
      }),
      taskView({ types: [] }),
    ], readInconsistent);

    expect(facets.labels.map((value) => value.value)).toEqual(["backend", "ui"]);
    // Ranked high → low rather than alphabetical.
    expect(facets.priorities.map((value) => value.value)).toEqual(["high", "medium"]);
    expect(facets.assignees.map((value) => value.value)).toEqual(["a", "b"]);
    expect(facets.types.map((value) => typeSelectionKey(value.value))).toEqual([
      "value:feature",
      "value:spike",
      "unset",
      "unknown",
    ]);
  });

  it("offers 未設定 and 未知 only when some task is in that state", () => {
    const facets = collectFacets([taskView({ types: [type("feature")] })], readInconsistent);
    expect(facets.types.map((value) => typeSelectionKey(value.value))).toEqual(["value:feature"]);
  });

  it("counts each value over every read task, so the popover can show 値ごとの件数", () => {
    const facets = collectFacets([
      taskView({ types: [type("feature")], labels: ["ui", "backend"], priority: "high" }),
      taskView({ types: [type("feature"), type("spike", false)], labels: ["ui"] }),
      taskView({
        storageState: "archive",
        types: [],
        health: { state: "degraded", events: [{ event: "unexpectedSchema", detail: "x" }] },
      }),
    ], readInconsistent);

    expect(facets.labels).toEqual([
      { value: "backend", count: 1 },
      { value: "ui", count: 2 },
    ]);
    expect(facets.priorities).toEqual([{ value: "high", count: 1 }]);
    expect(facets.types.map((value) => value.count)).toEqual([2, 1, 1, 1]);
    expect(facets.inconsistent).toBe(1);
  });

  it("offers the four 保存区分 whatever their counts, and 保存区分不明 only when one is", () => {
    const known = collectFacets([taskView({ storageState: "draft" })], readInconsistent);
    expect(known.storage).toEqual([
      { value: "active", count: 0 },
      { value: "draft", count: 1 },
      { value: "completed", count: 0 },
      { value: "archive", count: 0 },
    ]);

    const indeterminate = collectFacets([taskView({ storageState: null })], readInconsistent);
    expect(indeterminate.storage.at(-1)).toEqual({ value: "indeterminate", count: 1 });
  });
});
