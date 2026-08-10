import { describe, expect, it } from "vitest";
import { DEFAULT_FILTER, defaultFilter, toggleValue, withStorage, type CardFilter } from "./filter";
import {
  addCondition,
  conditionCount,
  conditionKey,
  filterTokens,
  hasCondition,
  lastCondition,
  nothingToClear,
  removeCondition,
  removeLastCondition,
  setPeriodEnd,
  setText,
  toggleCondition,
  type FilterCondition,
} from "./token";

/** Build a filter by adding conditions in order, the way the bar and the popover do. */
function built(...conditions: FilterCondition[]): CardFilter {
  return conditions.reduce(addCondition, DEFAULT_FILTER);
}

function names(filter: CardFilter): string[] {
  return filterTokens(filter).map((token) =>
    token.value === null ? token.facet : `${token.facet}:${token.value}`,
  );
}

describe("絞り込みトークン (doc-7 §5.2)", () => {
  it("shows only the conditions in force, in the order they were added", () => {
    const filter = built(
      { facet: "label", value: "ui" },
      { facet: "type", value: { kind: "value", value: "feature" } },
      { facet: "assignee", value: "@takkyun" },
      { facet: "label", value: "backend" },
    );

    // 保存区分's 既定 first (nobody added it), then the four in 追加順 — not grouped by facet.
    expect(names(filter)).toEqual([
      "保存区分:active",
      "ラベル:ui",
      "Type:feature",
      "assignee:@takkyun",
      "ラベル:backend",
    ]);
  });

  it("names the facet and the value, and drops the value where the facet is the condition", () => {
    const tokens = filterTokens(built({ facet: "inconsistent" }, { facet: "priority", value: "high" }));
    expect(tokens.map((token) => [token.facet, token.value])).toEqual([
      ["保存区分", "active"],
      ["不整合", null],
      ["priority", "high"],
    ]);
  });

  it("marks 保存区分's 既定 as the baseline and an added division as not", () => {
    const filter = addCondition(DEFAULT_FILTER, { facet: "storage", value: "draft" });
    expect(filterTokens(filter).map((token) => [token.value, token.baseline])).toEqual([
      ["active", true],
      ["draft", false],
    ]);
  });

  it("keeps a label and an assignee spelled the same as two conditions", () => {
    const filter = built({ facet: "label", value: "ops" }, { facet: "assignee", value: "ops" });
    expect(filter.labels).toEqual(["ops"]);
    expect(filter.assignees).toEqual(["ops"]);
    expect(conditionKey({ facet: "label", value: "ops" })).not.toBe(
      conditionKey({ facet: "assignee", value: "ops" }),
    );
    expect(names(filter)).toEqual(["保存区分:active", "ラベル:ops", "assignee:ops"]);
  });

  it("toggles a condition off through its own ×, leaving the rest in order", () => {
    const filter = built(
      { facet: "label", value: "ui" },
      { facet: "priority", value: "high" },
      { facet: "label", value: "backend" },
    );
    const without = removeCondition(filter, { facet: "priority", value: "high" });
    expect(names(without)).toEqual(["保存区分:active", "ラベル:ui", "ラベル:backend"]);
    expect(hasCondition(without, { facet: "priority", value: "high" })).toBe(false);
    expect(toggleCondition(without, { facet: "label", value: "ui" }).labels).toEqual(["backend"]);
  });
});

describe("直前の 1 つを戻す・既定に戻す (doc-7 §5.2)", () => {
  it("takes conditions back from the tail, one at a time", () => {
    let filter = built(
      { facet: "label", value: "ui" },
      { facet: "storage", value: "draft" },
      { facet: "assignee", value: "@takkyun" },
    );

    filter = removeLastCondition(filter);
    expect(names(filter)).toEqual(["保存区分:active", "ラベル:ui", "保存区分:draft"]);
    filter = removeLastCondition(filter);
    expect(names(filter)).toEqual(["保存区分:active", "ラベル:ui"]);
    filter = removeLastCondition(filter);
    expect(names(filter)).toEqual(["保存区分:active"]);
  });

  it("stops at 保存区分's 既定 rather than filtering the screen down to nothing", () => {
    expect(lastCondition(DEFAULT_FILTER)).toBeNull();
    expect(removeLastCondition(DEFAULT_FILTER)).toEqual(DEFAULT_FILTER);
  });

  it("keeps 既定に戻す offered while 追加順 still holds something to undo", () => {
    // The selections come back to the 既定 by a route that records history: 保存区分's 既定 taken
    // off its token, then the same division picked again in the popover.
    const retaken = addCondition(removeCondition(DEFAULT_FILTER, { facet: "storage", value: "active" }), {
      facet: "storage",
      value: "active",
    });
    expect(retaken.storage).toEqual(DEFAULT_FILTER.storage);
    expect(lastCondition(retaken)).toEqual({ facet: "storage", value: "active" });
    // Blocking 既定に戻す here would leave that history with no way to clear it, beside an enabled
    // 直前の 1 つを戻す whose press empties the grid.
    expect(nothingToClear(retaken, ["active"])).toBe(false);

    const cleared = defaultFilter(["active"]);
    expect(nothingToClear(cleared, ["active"])).toBe(true);
    expect(lastCondition(cleared)).toBeNull();
  });

  it("returns to the 既定の保存区分 on 既定に戻す, not to an empty selection", () => {
    const filter = built({ facet: "label", value: "ui" }, { facet: "inconsistent" });
    const cleared = defaultFilter(["active", "draft"]);
    expect(cleared.storage).toEqual(["active", "draft"]);
    expect(conditionCount(cleared)).toBe(2);
    expect(conditionCount(filter)).toBe(3);
  });
});

describe("テキスト (doc-7 §5.2: a condition with no token of its own)", () => {
  it("counts as a condition and takes its place in 追加順, without a token", () => {
    const filter = setText(built({ facet: "label", value: "ui" }), "swimlane");
    expect(names(filter)).toEqual(["保存区分:active", "ラベル:ui"]);
    expect(conditionCount(filter)).toBe(3);
    expect(lastCondition(filter)).toEqual({ facet: "text", value: "swimlane" });
    expect(removeLastCondition(filter).text).toBe("");
  });

  it("keeps its place while it is edited, and leaves 追加順 once it is emptied", () => {
    const typed = setText(DEFAULT_FILTER, "swim");
    const extended = addCondition(setText(typed, "swimlane"), { facet: "label", value: "ui" });
    expect(extended.order).toEqual(["text", "label:ui"]);

    const emptied = setText(extended, "   ");
    expect(emptied.order).toEqual(["label:ui"]);
    expect(lastCondition(emptied)).toEqual({ facet: "label", value: "ui" });
  });
});

describe("order kept as a hint, never as a second source of truth", () => {
  it("appends conditions written field by field, in the canonical facet order", () => {
    const written: CardFilter = {
      ...DEFAULT_FILTER,
      labels: ["ui"],
      priorities: ["high"],
      types: [{ kind: "unset" }],
    };
    expect(names(written)).toEqual([
      "保存区分:active",
      "Type:Type 未設定",
      "ラベル:ui",
      "priority:high",
    ]);
    // Nothing was *added*, so there is nothing to take back — the conditions stay as written.
    expect(lastCondition(written)).toBeNull();
  });

  it("ignores order entries whose condition is no longer held", () => {
    const stale: CardFilter = {
      ...built({ facet: "label", value: "ui" }, { facet: "assignee", value: "@takkyun" }),
      labels: [],
    };
    expect(names(stale)).toEqual(["保存区分:active", "assignee:@takkyun"]);
    expect(lastCondition(stale)).toEqual({ facet: "assignee", value: "@takkyun" });
  });

  it("drops the order entry of a 保存区分 that 既定の保存区分 took away", () => {
    const filter = addCondition(DEFAULT_FILTER, { facet: "storage", value: "draft" });
    expect(filter.order).toEqual(["storage:draft"]);

    // アプリ設定 arriving with its own 既定 (App.svelte's `applySettings`).
    const applied = withStorage(filter, ["active", "completed"]);
    expect(applied.order).toEqual([]);
    expect(names(applied)).toEqual(["保存区分:active", "保存区分:completed"]);
    expect(lastCondition(applied)).toBeNull();
  });

  it("draws one token per condition when a hand-edited 既定の保存区分 repeats a value", () => {
    // `settings.toml` is hand-editable and the boundary reads the list as written, so this reaches
    // the screen; two tokens keyed alike would throw out of Svelte's keyed each instead of drawing.
    const repeated: CardFilter = { ...DEFAULT_FILTER, storage: ["active", "active", "draft"] };
    const keys = filterTokens(repeated).map((token) => token.key);
    expect(keys).toEqual(["storage:active", "storage:draft"]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(conditionCount(repeated)).toBe(2);
  });

  it("survives a facet toggled without going through a condition", () => {
    const filter = { ...built({ facet: "label", value: "ui" }) };
    const direct = { ...filter, labels: toggleValue(filter.labels, "backend") };
    expect(names(direct)).toEqual(["保存区分:active", "ラベル:backend", "ラベル:ui"]);
  });
});

describe("更新期間のトークン (doc-7 §5.2)", () => {
  const from = (filter: CardFilter, day: string) => setPeriodEnd(filter, "from", day);
  const to = (filter: CardFilter, day: string) => setPeriodEnd(filter, "to", day);
  const both = to(from(DEFAULT_FILTER, "2026-08-01"), "2026-08-09");

  it("draws one token per end, each naming the day it takes in", () => {
    expect(names(both)).toEqual([
      "保存区分:active",
      "updated 期間:2026-08-01 以降",
      "updated 期間:2026-08-09 以前",
    ]);
  });

  it("takes the ends back one at a time, in 追加順", () => {
    const once = removeLastCondition(both);
    expect([once.updatedFrom, once.updatedTo]).toEqual(["2026-08-01", ""]);
    const twice = removeLastCondition(once);
    expect([twice.updatedFrom, twice.updatedTo]).toEqual(["", ""]);
  });

  it("takes one end off by its own ×, leaving the other standing", () => {
    const dropped = removeCondition(both, { facet: "updated", end: "from", value: "2026-08-01" });
    expect([dropped.updatedFrom, dropped.updatedTo]).toEqual(["", "2026-08-09"]);
  });

  it("keeps an end's place in 追加順 when its day is corrected", () => {
    const withLabel = addCondition(from(DEFAULT_FILTER, "2026-08-01"), { facet: "label", value: "ui" });
    const corrected = from(withLabel, "2026-07-01");
    expect(names(corrected)).toEqual([
      "保存区分:active",
      "updated 期間:2026-07-01 以降",
      "ラベル:ui",
    ]);
    // 直前の 1 つを戻す therefore still takes the label — the end was edited, not added again.
    expect(removeLastCondition(corrected).labels).toEqual([]);
    expect(removeLastCondition(corrected).updatedFrom).toBe("2026-07-01");
  });

  it("drops the condition when an end is emptied, rather than leaving one that restricts nothing", () => {
    const cleared = from(from(DEFAULT_FILTER, "2026-08-01"), "");
    expect(cleared.updatedFrom).toBe("");
    expect(cleared.order).toEqual([]);
    expect(lastCondition(cleared)).toBeNull();
  });

  it("is counted by 選択数 and reached by 既定に戻す", () => {
    expect(conditionCount(both)).toBe(3);
    expect(nothingToClear(both, ["active"])).toBe(false);

    const cleared = defaultFilter(["active"]);
    expect([cleared.updatedFrom, cleared.updatedTo]).toEqual(["", ""]);
    expect(nothingToClear(cleared, ["active"])).toBe(true);
  });
});
