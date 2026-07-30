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

function filter(overrides: Partial<CardFilter> = {}): CardFilter {
  return { ...DEFAULT_FILTER, ...overrides };
}

describe("保存区分 (doc-7 §5)", () => {
  it("defaults to active alone", () => {
    expect(isDefaultFilter(DEFAULT_FILTER)).toBe(true);
    expect(matchesFilter(taskView({ storageState: "active" }), filter())).toBe(true);
    for (const state of ["draft", "completed", "archive"] as const) {
      expect(matchesFilter(taskView({ storageState: state }), filter())).toBe(false);
    }
  });

  it("shows a storage state once it is selected, alongside active", () => {
    const withDrafts = filter({ storage: ["active", "draft"] });
    expect(matchesFilter(taskView({ storageState: "draft" }), withDrafts)).toBe(true);
    expect(matchesFilter(taskView({ storageState: "active" }), withDrafts)).toBe(true);
    expect(matchesFilter(taskView({ storageState: "completed" }), withDrafts)).toBe(false);
  });

  it("never treats an indeterminate storage state as active, but can select it", () => {
    const view = taskView({ storageState: null });
    expect(matchesFilter(view, filter())).toBe(false);
    expect(matchesFilter(view, filter({ storage: ["indeterminate"] }))).toBe(true);
  });

  it("shows nothing when no storage state is selected", () => {
    expect(matchesFilter(taskView(), filter({ storage: [] }))).toBe(false);
  });
});

describe("Type filter (decision-5, doc-7 §5)", () => {
  it("keeps a task when any of its Type values matches", () => {
    const view = taskView({ types: [type("feature"), type("research")] });
    const byResearch = filter({ types: [{ kind: "value", value: "research" }] });
    expect(matchesFilter(view, byResearch)).toBe(true);
    expect(matchesFilter(taskView({ types: [type("bug")] }), byResearch)).toBe(false);
  });

  it("matches Type values case-insensitively while keeping the project's spelling", () => {
    const view = taskView({ types: [type("Feature")] });
    expect(matchesFilter(view, filter({ types: [{ kind: "value", value: "feature" }] }))).toBe(
      true,
    );
    expect(view.interpretation.types[0].value).toBe("Feature");
  });

  it("selects 未設定 and 未知 as their own choices", () => {
    const unset = taskView({ types: [] });
    const unknown = taskView({ types: [type("spike", false)] });
    expect(matchesFilter(unset, filter({ types: [{ kind: "unset" }] }))).toBe(true);
    expect(matchesFilter(unknown, filter({ types: [{ kind: "unset" }] }))).toBe(false);
    expect(matchesFilter(unknown, filter({ types: [{ kind: "unknown" }] }))).toBe(true);
    expect(matchesFilter(taskView({ types: [type("feature")] }), filter({ types: [{ kind: "unknown" }] }))).toBe(
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
    expect(matchesFilter(view, filter({ labels: ["backend"] }))).toBe(true);
    expect(matchesFilter(view, filter({ labels: ["docs"] }))).toBe(false);
  });

  it("matches priority regardless of case, and drops tasks without one", () => {
    expect(matchesFilter(taskView({ priority: "High" }), filter({ priorities: ["high"] }))).toBe(
      true,
    );
    expect(matchesFilter(taskView({ priority: null }), filter({ priorities: ["high"] }))).toBe(
      false,
    );
  });

  it("matches any selected assignee", () => {
    const view = taskView({ assignee: ["@takkyun"] });
    expect(matchesFilter(view, filter({ assignees: ["@takkyun"] }))).toBe(true);
    expect(matchesFilter(view, filter({ assignees: ["@someone"] }))).toBe(false);
  });

  it("matches text against the cross-task-id and the title, case-insensitively", () => {
    const view = taskView({ project: "geomyth", id: "TASK-7", title: "Swimlane screen" });
    expect(matchesFilter(view, filter({ text: "geomyth:task-7" }))).toBe(true);
    expect(matchesFilter(view, filter({ text: "SWIMLANE" }))).toBe(true);
    expect(matchesFilter(view, filter({ text: "  " }))).toBe(true);
    expect(matchesFilter(view, filter({ text: "detail" }))).toBe(false);
  });

  it("extracts degraded tasks on their own", () => {
    const degraded = taskView({
      health: { state: "degraded", events: [{ event: "unexpectedSchema", detail: "unknown status" }] },
    });
    expect(matchesFilter(degraded, filter({ degradedOnly: true }))).toBe(true);
    expect(matchesFilter(taskView(), filter({ degradedOnly: true }))).toBe(false);
  });

  it("combines facets with AND", () => {
    const view = taskView({ types: [type("feature")], labels: ["ui"], priority: "high" });
    expect(
      matchesFilter(
        view,
        filter({ types: [{ kind: "value", value: "feature" }], labels: ["ui"], priorities: ["high"] }),
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        view,
        filter({ types: [{ kind: "value", value: "feature" }], labels: ["backend"] }),
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
    ]);

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
    const facets = collectFacets([taskView({ types: [type("feature")] })]);
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
    ]);

    expect(facets.labels).toEqual([
      { value: "backend", count: 1 },
      { value: "ui", count: 2 },
    ]);
    expect(facets.priorities).toEqual([{ value: "high", count: 1 }]);
    expect(facets.types.map((value) => value.count)).toEqual([2, 1, 1, 1]);
    expect(facets.degraded).toBe(1);
  });

  it("offers the four 保存区分 whatever their counts, and 保存区分不明 only when one is", () => {
    const known = collectFacets([taskView({ storageState: "draft" })]);
    expect(known.storage).toEqual([
      { value: "active", count: 0 },
      { value: "draft", count: 1 },
      { value: "completed", count: 0 },
      { value: "archive", count: 0 },
    ]);

    const indeterminate = collectFacets([taskView({ storageState: null })]);
    expect(indeterminate.storage.at(-1)).toEqual({ value: "indeterminate", count: 1 });
  });
});
