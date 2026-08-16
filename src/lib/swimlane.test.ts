import { describe, expect, it } from "vitest";
import { DEFAULT_FILTER, type CardFilter } from "./filter";
import { loadMap, loaded, taskView, unreadable } from "./fixtures";
import {
  CANONICAL_COLUMNS,
  LANE_FIGURE,
  lastColumnFoldBlockedReason,
  rowFoldAbsentReason,
  unmappedLabel,
  buildSwimlane,
  cellCount,
  CARD_ORDERS,
  CARD_ORDER_CHOICES,
  cardOrderLabel,
  DEFAULT_CARD_ORDER,
  cardComparator,
  columnFoldable,
  laneCounts,
  laneGroupLabel,
  laneNeighbourLabel,
  laneNeighbours,
  laneScrollDelta,
  rowFoldable,
  swimlaneTotals,
  totalsLabel,
  visibleCount,
  type SwimlaneRow,
} from "./swimlane";
import { cardIdentity, crossTaskId } from "./card";
import { DISCLOSURE_ICON, STEP_ICON } from "./placement";
import type { CardOrder, StatusColumn } from "./wire";

function swimlane(
  order: string[],
  loads: Map<string, ReturnType<typeof loaded>>,
  overrides: Partial<CardFilter> = {},
  hidden: string[] = [],
  cardOrder: CardOrder = DEFAULT_CARD_ORDER,
): SwimlaneRow[] {
  return buildSwimlane({
    order,
    loads,
    hidden: new Set(hidden),
    filter: { ...DEFAULT_FILTER, ...overrides },
    cardOrder,
    inconsistent: () => false,
  });
}

/** The ids the given 並び順 puts the views in, compared through the exported comparator. */
function ordered(views: ReturnType<typeof taskView>[], order: CardOrder): (string | null)[] {
  return [...views].sort(cardComparator(order)).map((view) => view.task.id);
}

function row(rows: SwimlaneRow[], slug: string): SwimlaneRow {
  const found = rows.find((r) => r.slug === slug);
  if (found === undefined) {
    throw new Error(`no row for ${slug}`);
  }
  return found;
}

function ids(row: SwimlaneRow, column: string): (string | null)[] {
  if (row.state !== "loaded") {
    throw new Error("row has no cells");
  }
  const cell = row.cells.find((c) => c.column === column);
  return (cell?.tasks ?? []).map((view) => view.task.id);
}

describe("AC #1 rows × the four canonical columns, active by default", () => {
  it("gives every row the same four columns in the fixed order", () => {
    const rows = swimlane(
      ["atlas", "geomyth"],
      loadMap(loaded("atlas", [taskView()]), loaded("geomyth", [])),
    );

    expect(rows.map((r) => r.slug)).toEqual(["atlas", "geomyth"]);
    for (const r of rows) {
      if (r.state !== "loaded") {
        throw new Error("expected a loaded row");
      }
      expect(r.cells.map((cell) => cell.column)).toEqual([...CANONICAL_COLUMNS]);
    }
  });

  it("places each task in the column its interpretation resolved to", () => {
    const rows = swimlane(
      ["atlas"],
      loadMap(
        loaded("atlas", [
          taskView({ id: "TASK-1", column: "toDo" }),
          taskView({ id: "TASK-2", column: "inProgress" }),
          taskView({ id: "TASK-3", column: "inReview" }),
          taskView({ id: "TASK-4", column: "done" }),
        ]),
      ),
    );

    const atlas = row(rows, "atlas");
    expect(ids(atlas, "toDo")).toEqual(["TASK-1"]);
    expect(ids(atlas, "inProgress")).toEqual(["TASK-2"]);
    expect(ids(atlas, "inReview")).toEqual(["TASK-3"]);
    expect(ids(atlas, "done")).toEqual(["TASK-4"]);
  });

  it("shows only active tasks by default", () => {
    const rows = swimlane(
      ["atlas"],
      loadMap(
        loaded("atlas", [
          taskView({ id: "TASK-1", storageState: "active" }),
          taskView({ id: "TASK-2", storageState: "draft" }),
          taskView({ id: "TASK-3", storageState: "completed" }),
          taskView({ id: "TASK-4", storageState: "archive" }),
        ]),
      ),
    );

    const atlas = row(rows, "atlas");
    expect(ids(atlas, "toDo")).toEqual(["TASK-1"]);
    // The row still knows how many it holds, so "filtered away" stays distinguishable from
    // "this project has nothing".
    if (atlas.state !== "loaded") {
      throw new Error("expected a loaded row");
    }
    expect(atlas.totalBeforeFilter).toBe(4);
  });
});

describe("AC #2 未分類区画", () => {
  it("collects tasks whose status maps to no column, keeping the raw status", () => {
    const rows = swimlane(
      ["atlas"],
      loadMap(
        loaded("atlas", [
          taskView({ id: "TASK-1", column: "toDo" }),
          taskView({ id: "TASK-9", status: "Blocked", column: null }),
        ]),
      ),
    );

    const atlas = row(rows, "atlas");
    if (atlas.state !== "loaded") {
      throw new Error("expected a loaded row");
    }
    expect(atlas.unmapped.map((view) => view.task.id)).toEqual(["TASK-9"]);
    expect(atlas.unmapped[0].interpretation.status?.raw).toBe("Blocked");
    // And it is nowhere in the canonical columns.
    for (const cell of atlas.cells) {
      expect(cell.tasks.map((view) => view.task.id)).not.toContain("TASK-9");
    }
  });

  it("puts a task with no status at all in the 未分類区画, not in a column", () => {
    const rows = swimlane(
      ["atlas"],
      loadMap(
        loaded("atlas", [
          taskView({
            id: null,
            title: null,
            status: null,
            sourcePath: "backlog/tasks/task-broken.md",
            health: {
              state: "degraded",
              events: [{ event: "unparseable", missingRequired: ["id", "status"], detail: null }],
            },
          }),
        ]),
      ),
    );

    const atlas = row(rows, "atlas");
    if (atlas.state !== "loaded") {
      throw new Error("expected a loaded row");
    }
    expect(atlas.unmapped).toHaveLength(1);
    expect(atlas.unmapped[0].interpretation.status).toBeNull();
    expect(atlas.cells.every((cell) => cell.tasks.length === 0)).toBe(true);
  });

  it("leaves the 未分類区画 empty when every status maps", () => {
    const rows = swimlane(["atlas"], loadMap(loaded("atlas", [taskView()])));
    const atlas = row(rows, "atlas");
    if (atlas.state !== "loaded") {
      throw new Error("expected a loaded row");
    }
    expect(atlas.unmapped).toHaveLength(0);
  });
});

describe("AC #3 card identity", () => {
  it("prefixes the task id with its project slug", () => {
    expect(crossTaskId(taskView({ project: "geomyth", id: "TASK-7" }))).toBe("geomyth:TASK-7");
  });

  it("falls back to the file name when a 解析不能 task has no id", () => {
    const view = taskView({ id: null, sourcePath: "backlog/tasks/task-broken.md" });
    expect(crossTaskId(view)).toBeNull();
    expect(cardIdentity(view)).toBe("task-broken.md");
  });
});

describe("TASK-34 AC #4 / TASK-132 AC #5 既定の並び（priority 降順）", () => {
  it("orders by priority 降順, then ordinal 昇順, then updated_date 新しい順", () => {
    const rows = swimlane(
      ["atlas"],
      loadMap(
        loaded("atlas", [
          taskView({ id: "low", priority: "low", ordinal: 1 }),
          taskView({ id: "high-late", priority: "high", ordinal: 2 }),
          taskView({ id: "high-early", priority: "high", ordinal: 1 }),
          taskView({ id: "medium", priority: "medium", ordinal: 1 }),
        ]),
      ),
    );

    expect(ids(row(rows, "atlas"), "toDo")).toEqual([
      "high-early",
      "high-late",
      "medium",
      "low",
    ]);
  });

  it("breaks an ordinal tie with the newer updated_date first", () => {
    const older = taskView({ id: "older", ordinal: 1, updatedDate: "2026-07-01 09:00" });
    const newer = taskView({ id: "newer", ordinal: 1, updatedDate: "2026-07-20 09:00" });
    expect([older, newer].sort(cardComparator(DEFAULT_CARD_ORDER)).map((v) => v.task.id)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("sorts a task with no priority, ordinal or date last within its step", () => {
    const placed = taskView({ id: "placed", ordinal: 10 });
    const unplaced = taskView({ id: "unplaced", ordinal: null });
    expect([unplaced, placed].sort(cardComparator(DEFAULT_CARD_ORDER)).map((v) => v.task.id)).toEqual([
      "placed",
      "unplaced",
    ]);
    const dated = taskView({ id: "dated", updatedDate: "2026-01-01" });
    const undated = taskView({ id: "undated", updatedDate: null });
    expect([undated, dated].sort(cardComparator(DEFAULT_CARD_ORDER)).map((v) => v.task.id)).toEqual([
      "dated",
      "undated",
    ]);
  });

  it("keeps equal-key cards in the read layer's order, so positions do not jump", () => {
    const first = taskView({ id: "TASK-1", priority: "high", ordinal: 1, updatedDate: "2026-07-01" });
    const second = taskView({ id: "TASK-2", priority: "high", ordinal: 1, updatedDate: "2026-07-01" });
    expect([first, second].sort(cardComparator(DEFAULT_CARD_ORDER)).map((v) => v.task.id)).toEqual([
      "TASK-1",
      "TASK-2",
    ]);
    // Same inputs, same result — the comparison introduces no order of its own.
    expect([second, first].sort(cardComparator(DEFAULT_CARD_ORDER)).map((v) => v.task.id)).toEqual([
      "TASK-2",
      "TASK-1",
    ]);
  });
});

describe("TASK-132 並び順を選ぶ (doc-7 §5.4)", () => {
  const PRIORITIES = [
    taskView({ id: "TASK-1", priority: "high" }),
    taskView({ id: "TASK-2", priority: "medium" }),
    taskView({ id: "TASK-3", priority: "low" }),
    taskView({ id: "TASK-4", priority: null }),
  ];

  it("AC #2 offers all five attributes in both directions, and nothing else", () => {
    // Against the record the controls read, so an attribute added to one and not the other fails
    // here rather than in the two components separately.
    expect(CARD_ORDER_CHOICES).toEqual([
      "priority_asc",
      "priority_desc",
      "task_id_asc",
      "task_id_desc",
      "updated_asc",
      "updated_desc",
      "created_asc",
      "created_desc",
      "milestone_asc",
      "milestone_desc",
    ]);
    expect(CARD_ORDER_CHOICES.map((order) => cardOrderLabel(order))).toEqual([
      "priority 昇順",
      "priority 降順",
      "task id 昇順",
      "task id 降順",
      "updated 昇順",
      "updated 降順",
      "created 昇順",
      "created 降順",
      "milestone 昇順",
      "milestone 降順",
    ]);
  });

  it("AC #1 lays the cards of a cell out in the chosen order", () => {
    const rows = swimlane(
      ["atlas"],
      loadMap(
        loaded("atlas", [
          taskView({ id: "TASK-3", updatedDate: "2026-07-03" }),
          taskView({ id: "TASK-1", updatedDate: "2026-07-01" }),
          taskView({ id: "TASK-2", updatedDate: "2026-07-02" }),
        ]),
      ),
      {},
      [],
      "updated_asc",
    );
    expect(ids(row(rows, "atlas"), "toDo")).toEqual(["TASK-1", "TASK-2", "TASK-3"]);
  });

  it("AC #1 lays the 未分類区画 out in the same order as the cells", () => {
    const rows = swimlane(
      ["atlas"],
      loadMap(
        loaded("atlas", [
          taskView({ id: "TASK-2", status: "Blocked", column: null, updatedDate: "2026-07-02" }),
          taskView({ id: "TASK-1", status: "Blocked", column: null, updatedDate: "2026-07-01" }),
        ]),
      ),
      {},
      [],
      "updated_asc",
    );
    const built = row(rows, "atlas");
    if (built.state !== "loaded") {
      throw new Error("row has no cells");
    }
    expect(built.unmapped.map((view) => view.task.id)).toEqual(["TASK-1", "TASK-2"]);
  });

  it("AC #2 reverses the order of the present values when the direction is flipped", () => {
    const dated = [
      taskView({ id: "TASK-1", createdDate: "2026-07-01" }),
      taskView({ id: "TASK-2", createdDate: "2026-07-02" }),
      taskView({ id: "TASK-3", createdDate: "2026-07-03" }),
    ];
    expect(ordered(dated, "created_asc")).toEqual(["TASK-1", "TASK-2", "TASK-3"]);
    expect(ordered(dated, "created_desc")).toEqual(["TASK-3", "TASK-2", "TASK-1"]);
  });

  it("AC #2 reads a task id and a milestone as numbers, so 2 comes before 10", () => {
    const numbered = [
      taskView({ id: "TASK-10" }),
      taskView({ id: "TASK-2" }),
      taskView({ id: "TASK-1" }),
    ];
    expect(ordered(numbered, "task_id_asc")).toEqual(["TASK-1", "TASK-2", "TASK-10"]);
    expect(ordered(numbered, "task_id_desc")).toEqual(["TASK-10", "TASK-2", "TASK-1"]);

    const milestones = [
      taskView({ id: "m-10", milestone: "m-10" }),
      taskView({ id: "m-2", milestone: "m-2" }),
      taskView({ id: "m-1", milestone: "m-1" }),
    ];
    expect(ordered(milestones, "milestone_asc")).toEqual(["m-1", "m-2", "m-10"]);
  });

  it("AC #2 orders sub-numbered ids by segment, not as decimals", () => {
    // `TASK-1.2` and `TASK-1.10` are two ids whose second segments are 2 and 10 — read as decimals
    // the second would sort first, which is the reading this comparison does not take.
    const nested = [
      taskView({ id: "TASK-1.10" }),
      taskView({ id: "TASK-1.2" }),
      taskView({ id: "TASK-1" }),
    ];
    expect(ordered(nested, "task_id_asc")).toEqual(["TASK-1", "TASK-1.2", "TASK-1.10"]);
  });

  it("AC #2 does not consult a locale, so the same ledger reads the same everywhere", () => {
    // `Intl.Collator` answers this pair differently in de and sv (measured), and it reads the
    // *runtime's* default locale — which is what doc-7 §5.4 rules out. The assertion is not that
    // one of those answers is right: it is that this comparison gives neither locale's answer
    // conditionally, but the same one always.
    const named = [taskView({ id: "m-ä", milestone: "m-ä" }), taskView({ id: "m-z", milestone: "m-z" })];
    const collate = (locale: string): (string | null)[] =>
      [...named]
        .sort((a, b) =>
          new Intl.Collator(locale, { numeric: true }).compare(
            a.task.milestone ?? "",
            b.task.milestone ?? "",
          ),
        )
        .map((view) => view.task.id);
    expect(collate("de")).toEqual(["m-ä", "m-z"]);
    expect(collate("sv")).toEqual(["m-z", "m-ä"]);
    expect(ordered(named, "milestone_asc")).toEqual(["m-z", "m-ä"]);
    expect(ordered([...named].reverse(), "milestone_asc")).toEqual(["m-z", "m-ä"]);
  });

  it("AC #4 moves priority 段なし with the direction, because it is the lowest step", () => {
    expect(ordered(PRIORITIES, "priority_desc")).toEqual([
      "TASK-1",
      "TASK-2",
      "TASK-3",
      "TASK-4",
    ]);
    expect(ordered(PRIORITIES, "priority_asc")).toEqual([
      "TASK-4",
      "TASK-3",
      "TASK-2",
      "TASK-1",
    ]);
  });

  it("AC #4 keeps a task with no value last whichever direction is chosen", () => {
    const dates = [
      taskView({ id: "none", updatedDate: null }),
      taskView({ id: "older", updatedDate: "2026-07-01" }),
      taskView({ id: "newer", updatedDate: "2026-07-20" }),
    ];
    expect(ordered(dates, "updated_asc")).toEqual(["older", "newer", "none"]);
    expect(ordered(dates, "updated_desc")).toEqual(["newer", "older", "none"]);

    const milestones = [
      taskView({ id: "none", milestone: null }),
      taskView({ id: "m-1", milestone: "m-1" }),
      taskView({ id: "m-2", milestone: "m-2" }),
    ];
    expect(ordered(milestones, "milestone_asc")).toEqual(["m-1", "m-2", "none"]);
    expect(ordered(milestones, "milestone_desc")).toEqual(["m-2", "m-1", "none"]);
  });

  it("AC #3 breaks a tie with the 既定の 3 段, in that order", () => {
    // All three on the same milestone, so the chosen order says nothing and every step of the shared
    // tie-break is exercised: priority first, then ordinal, then the newer updated_date.
    const tied = [
      taskView({ id: "low", milestone: "m-1", priority: "low", ordinal: 1 }),
      taskView({
        id: "high-later-ordinal",
        milestone: "m-1",
        priority: "high",
        ordinal: 2,
      }),
      taskView({
        id: "high-older",
        milestone: "m-1",
        priority: "high",
        ordinal: 1,
        updatedDate: "2026-07-01",
      }),
      taskView({
        id: "high-newer",
        milestone: "m-1",
        priority: "high",
        ordinal: 1,
        updatedDate: "2026-07-20",
      }),
    ];
    expect(ordered(tied, "milestone_asc")).toEqual([
      "high-newer",
      "high-older",
      "high-later-ordinal",
      "low",
    ]);
  });

  it("AC #3 leaves cards equal on every step in the order they were read", () => {
    const same = { milestone: "m-1", priority: "high", ordinal: 1, updatedDate: "2026-07-01" };
    const first = taskView({ id: "TASK-9", ...same });
    const second = taskView({ id: "TASK-8", ...same });
    // Read order, not id order: the last step of doc-7 §5.4 is the scan's, and these two differ in
    // an id the chosen order never looks at.
    expect(ordered([first, second], "milestone_asc")).toEqual(["TASK-9", "TASK-8"]);
    expect(ordered([second, first], "milestone_asc")).toEqual(["TASK-8", "TASK-9"]);
  });

  it("AC #3 gives every order a total answer for the same pair of cards", () => {
    // The contract is that each of the ten is deterministic, not that they agree: a and b are
    // compared in both argument positions, and the two answers must be opposite (or both zero).
    const a = taskView({
      id: "TASK-1",
      priority: "high",
      ordinal: 1,
      milestone: "m-1",
      createdDate: "2026-07-01",
      updatedDate: "2026-07-02",
    });
    const b = taskView({
      id: "TASK-2",
      priority: "low",
      ordinal: 2,
      milestone: "m-2",
      createdDate: "2026-07-03",
      updatedDate: "2026-07-04",
    });
    for (const order of CARD_ORDER_CHOICES) {
      const compare = cardComparator(order);
      expect(Math.sign(compare(a, b)), order).toBe(-Math.sign(compare(b, a)));
      expect(compare(a, a), order).toBe(0);
    }
  });

  it("AC #5 leaves the 既定 identical to the order this screen had before the choice existed", () => {
    // The old comparator, written out here rather than imported — it is what AC #5 fixes the 既定
    // against, and importing the new one would compare it with itself.
    const before = (x: ReturnType<typeof taskView>, y: ReturnType<typeof taskView>): number => {
      const rank = (view: ReturnType<typeof taskView>): number =>
        ({ high: 3, medium: 2, low: 1 })[view.task.priority ?? ""] ?? 0;
      const priority = rank(y) - rank(x);
      if (priority !== 0) {
        return priority;
      }
      const ordinals = [x.task.ordinal, y.task.ordinal];
      if (ordinals[0] !== ordinals[1]) {
        if (ordinals[0] === null) {
          return 1;
        }
        if (ordinals[1] === null) {
          return -1;
        }
        return ordinals[0] - ordinals[1];
      }
      const dates = [x.task.updatedDate, y.task.updatedDate];
      if (dates[0] === dates[1]) {
        return 0;
      }
      if (dates[0] === null) {
        return 1;
      }
      if (dates[1] === null) {
        return -1;
      }
      return dates[0] < dates[1] ? 1 : -1;
    };
    const views = [
      taskView({ id: "a", priority: "high", ordinal: 2, updatedDate: "2026-07-02" }),
      taskView({ id: "b", priority: "high", ordinal: 1, updatedDate: "2026-07-01" }),
      taskView({ id: "c", priority: null, ordinal: null, updatedDate: null }),
      taskView({ id: "d", priority: "low", ordinal: 1, updatedDate: "2026-07-09" }),
      taskView({ id: "e", priority: "high", ordinal: 2, updatedDate: "2026-07-20" }),
      taskView({ id: "f", priority: "medium", ordinal: null, updatedDate: "2026-07-01" }),
    ];
    expect(ordered(views, DEFAULT_CARD_ORDER)).toEqual(
      [...views].sort(before).map((view) => view.task.id),
    );
    expect(DEFAULT_CARD_ORDER).toBe("priority_desc");
    expect(cardOrderLabel(DEFAULT_CARD_ORDER)).toBe("priority 降順");
  });
});

describe("AC #5/#6 rows: unreadable, empty, hidden, reordered", () => {
  it("keeps an unreadable root's row with its reason, and leaves other rows alone", () => {
    const rows = swimlane(
      ["broken", "atlas"],
      loadMap(unreadable("broken", "backlog root has no config.yml"), loaded("atlas", [taskView()])),
    );

    const broken = row(rows, "broken");
    expect(broken.state).toBe("unreadable");
    if (broken.state !== "unreadable") {
      throw new Error("expected an unreadable row");
    }
    expect(broken.detail).toBe("backlog root has no config.yml");
    expect(row(rows, "atlas").state).toBe("loaded");
  });

  it("distinguishes an unreadable row from a project with no tasks", () => {
    const rows = swimlane(
      ["broken", "empty"],
      loadMap(unreadable("broken"), loaded("empty", [])),
    );

    expect(row(rows, "broken").state).toBe("unreadable");
    const empty = row(rows, "empty");
    if (empty.state !== "loaded") {
      throw new Error("expected a loaded row");
    }
    expect(empty.cells.every((cell) => cell.tasks.length === 0)).toBe(true);
    expect(empty.totalBeforeFilter).toBe(0);
  });

  it("reports a row whose root has not been read yet as pending", () => {
    const rows = swimlane(["atlas"], loadMap());
    expect(rows[0].state).toBe("pending");
  });

  it("follows the given row order and drops hidden rows", () => {
    const loads = loadMap(
      loaded("atlas", [taskView()]),
      loaded("geomyth", [taskView()]),
      loaded("serenebach", [taskView()]),
    );

    expect(swimlane(["geomyth", "atlas", "serenebach"], loads).map((r) => r.slug)).toEqual([
      "geomyth",
      "atlas",
      "serenebach",
    ]);
    expect(swimlane(["atlas", "geomyth"], loads, {}, ["geomyth"]).map((r) => r.slug)).toEqual([
      "atlas",
    ]);
  });

  it("keeps the row and column skeleton when a filter matches nothing", () => {
    const rows = swimlane(
      ["atlas"],
      loadMap(loaded("atlas", [taskView({ id: "TASK-1" })])),
      { text: "no such task" },
    );

    const atlas = row(rows, "atlas");
    if (atlas.state !== "loaded") {
      throw new Error("expected a loaded row");
    }
    expect(atlas.cells).toHaveLength(CANONICAL_COLUMNS.length);
    expect(atlas.cells.every((cell) => cell.tasks.length === 0)).toBe(true);
    expect(atlas.totalBeforeFilter).toBe(1);
  });
});

// TASK-54: 前後移動 (doc-8 §2.2) reads the grid as drawn, so its tests live with the grid's.
describe("AC #5 同一レーンセル内の前後タスクへ位置つきで移れる", () => {
  const cell = [
    taskView({ id: "TASK-1", sourcePath: "a.md", priority: "high" }),
    taskView({ id: "TASK-2", sourcePath: "b.md", ordinal: 1 }),
    taskView({ id: "TASK-3", sourcePath: "c.md", ordinal: 2 }),
  ];

  it("names the position in the cell and the tasks either side, in the cell's own order", () => {
    const rows = swimlane(["atlas"], loadMap(loaded("atlas", cell)));
    const middle = laneNeighbours(rows, { slug: "atlas", sourcePath: "b.md" });

    expect(middle).not.toBeNull();
    expect(middle!.group).toEqual({ kind: "column", column: "toDo" });
    expect(middle!.position).toBe(2);
    expect(middle!.total).toBe(3);
    expect(middle!.previous?.task.id).toBe("TASK-1");
    expect(middle!.next?.task.id).toBe("TASK-3");
    expect(laneNeighbourLabel(middle!)).toBe("2 / 3 件");
  });

  it("has no previous at the head and no next at the tail", () => {
    const rows = swimlane(["atlas"], loadMap(loaded("atlas", cell)));
    expect(laneNeighbours(rows, { slug: "atlas", sourcePath: "a.md" })?.previous).toBeNull();
    expect(laneNeighbours(rows, { slug: "atlas", sourcePath: "c.md" })?.next).toBeNull();
  });

  it("moves within one cell only — a task in another column is not a neighbour", () => {
    const rows = swimlane(
      ["atlas"],
      loadMap(
        loaded("atlas", [
          taskView({ id: "TASK-1", sourcePath: "a.md", column: "toDo" }),
          taskView({ id: "TASK-2", sourcePath: "b.md", column: "inProgress" }),
        ]),
      ),
    );

    const first = laneNeighbours(rows, { slug: "atlas", sourcePath: "a.md" });
    expect(first?.total).toBe(1);
    expect(first?.next).toBeNull();
  });

  it("counts the 未分類区画 as its own run of cards, named apart from a canonical column", () => {
    const rows = swimlane(
      ["atlas"],
      loadMap(
        loaded("atlas", [
          taskView({ id: "TASK-1", sourcePath: "a.md", column: null }),
          taskView({ id: "TASK-2", sourcePath: "b.md", column: null }),
        ]),
      ),
    );

    const first = laneNeighbours(rows, { slug: "atlas", sourcePath: "a.md" });
    expect(first?.group).toEqual({ kind: "unmapped" });
    // 未分類区画はレーンセルではない (doc-7 §1), so the 位置表示 does not call it one — asserted both
    // ways because the wording it must not use is the one it had (doc-8 §2.2).
    // 位置表示 no longer carries the group's name (TASK-72), so what has to be checked here is the
    // place that still does: 未分類区画 must not be called a cell by the controls that name it.
    expect(laneNeighbourLabel(first!)).toBe("1 / 2 件");
    expect(laneGroupLabel(first!.group)).toBe("未分類区画");
    expect(laneGroupLabel(first!.group)).not.toContain("セル");
    expect(first?.next?.task.id).toBe("TASK-2");
  });

  it("gives no neighbours for a task the grid is not showing (filtered, hidden or unreadable)", () => {
    const loads = loadMap(loaded("atlas", cell));
    const filtered = swimlane(["atlas"], loads, { text: "no such task" });
    expect(laneNeighbours(filtered, { slug: "atlas", sourcePath: "b.md" })).toBeNull();

    const hidden = swimlane(["atlas"], loads, {}, ["atlas"]);
    expect(laneNeighbours(hidden, { slug: "atlas", sourcePath: "b.md" })).toBeNull();

    const broken = swimlane(["atlas"], loadMap(unreadable("atlas")), {});
    expect(laneNeighbours(broken, { slug: "atlas", sourcePath: "b.md" })).toBeNull();
  });
});

// TASK-50: 折畳み (doc-7 §2.2・§2.3・§5.1). The counts are what a fold keeps, so they are what the
// tests are about — the widths and the toggles are the component's, the numbers are here.
describe("AC #2 列折畳みは全行同時にのみ効き、畳んだ列が列名と行ごとの件数を残す", () => {
  it("keeps each row's own count in the folded column, so the 縦読み survives the fold", () => {
    const rows = swimlane(
      ["atlas", "geomyth"],
      loadMap(
        loaded("atlas", [
          taskView({ id: "TASK-1", sourcePath: "a.md", column: "inProgress" }),
          taskView({ id: "TASK-2", sourcePath: "b.md", column: "inProgress" }),
        ]),
        loaded("geomyth", []),
      ),
    );

    expect(cellCount(row(rows, "atlas"), "inProgress")).toBe(2);
    expect(cellCount(row(rows, "geomyth"), "inProgress")).toBe(0);
  });
});

describe("AC #3 行折畳みでレーンセル群が畳まれ、列別の件数がレーンヘッダ行に出る", () => {
  it("gives the four canonical columns in their fixed order, zeros included", () => {
    const rows = swimlane(
      ["atlas"],
      loadMap(
        loaded("atlas", [
          taskView({ id: "TASK-1", sourcePath: "a.md", column: "toDo" }),
          taskView({ id: "TASK-2", sourcePath: "b.md", column: "done" }),
          taskView({ id: "TASK-3", sourcePath: "c.md", column: "done" }),
        ]),
      ),
    );

    expect(laneCounts(row(rows, "atlas"), false)).toEqual([
      { column: "toDo", label: "To Do", count: 1 },
      { column: "inProgress", label: "In Progress", count: 0 },
      { column: "inReview", label: "In Review", count: 0 },
      { column: "done", label: "Done", count: 2 },
    ]);
  });

  it("adds 未分類 only while the grid is showing that column", () => {
    const rows = swimlane(
      ["atlas"],
      loadMap(
        loaded("atlas", [taskView({ id: "TASK-1", sourcePath: "a.md", column: null })]),
      ),
    );

    expect(laneCounts(row(rows, "atlas"), false).map((entry) => entry.label)).not.toContain(
      unmappedLabel(),
    );
    expect(laneCounts(row(rows, "atlas"), true).at(-1)).toEqual({
      column: null,
      label: unmappedLabel(),
      count: 1,
    });
  });

  it("counts what the filter left, so a folded row reports the grid it was folded from", () => {
    const loads = loadMap(
      loaded("atlas", [
        taskView({ id: "TASK-1", sourcePath: "a.md", column: "toDo", title: "parser" }),
        taskView({ id: "TASK-2", sourcePath: "b.md", column: "toDo", title: "reader" }),
      ]),
    );

    expect(laneCounts(row(swimlane(["atlas"], loads), "atlas"), false)[0].count).toBe(2);
    expect(
      laneCounts(row(swimlane(["atlas"], loads, { text: "parser" }), "atlas"), false)[0].count,
    ).toBe(1);
  });
});

describe("AC #4 行折畳みと行非表示は件数が読めるか否かで分かれる", () => {
  it("folding leaves the row's counts computable; hiding takes the row out of the grid", () => {
    const loads = loadMap(
      loaded("atlas", [taskView({ id: "TASK-1", sourcePath: "a.md", column: "toDo" })]),
    );

    // 行折畳み is not a row state: the row is still built, and its counts are still there to draw.
    const folded = row(swimlane(["atlas"], loads), "atlas");
    expect(visibleCount(folded)).toBe(1);
    expect(laneCounts(folded, false)[0].count).toBe(1);

    // 行非表示 removes the row itself, so there is no count left to read anywhere (doc-7 §5.1).
    expect(swimlane(["atlas"], loads, {}, ["atlas"])).toEqual([]);
  });
});

// TASK-50 の AC #5, and what became of its AC #6. That one excluded the 未分類列 from 列折畳み;
// TASK-69 replaced it, and doc-7 §2.2 now folds the 未分類列 like any other column. The現行契約 is the
// one the tests below pin — the exclusion is history, not the rule.
describe("折畳みの対象にしないもの、および TASK-69 が対象にしたもの", () => {
  it("withholds 行折畳み from a row with no cells to fold, with the reason spelled out", () => {
    const rows = swimlane(
      ["broken", "waiting", "atlas"],
      loadMap(unreadable("broken"), loaded("atlas", [taskView()])),
    );

    expect(rowFoldable(row(rows, "broken"))).toBe(false);
    expect(rowFoldable(row(rows, "waiting"))).toBe(false);
    expect(rowFoldable(row(rows, "atlas"))).toBe(true);
    expect(rowFoldAbsentReason()).not.toBe("");
  });

  // TASK-69: 残り 1 列は畳めない (doc-7 §2.2). The rule is about a direction, not a count, so both
  // directions are asserted from the same states.
  it("refuses 列折畳み for the last open column, and never refuses unfolding", () => {
    expect(columnFoldable([], "toDo")).toBe(true);
    expect(columnFoldable(["inProgress", "inReview"], "toDo")).toBe(true);

    // Three folded: the one left open is the only place a card can be read, so it cannot be folded.
    const threeFolded: StatusColumn[] = ["inProgress", "inReview", "done"];
    expect(columnFoldable(threeFolded, "toDo")).toBe(false);
    // Its own control still works — that press unfolds rather than folds.
    for (const folded of threeFolded) {
      expect(columnFoldable(threeFolded, folded)).toBe(true);
    }
    expect(lastColumnFoldBlockedReason()).not.toBe("");
  });

  it("folds 未分類 like any column, but never lets it be the column left open", () => {
    // 未分類 is not a 正準ステータス列 (it has no entry among them and its 列別件数 carry a null column),
    // and since TASK-69 that no longer keeps it out of 列折畳み (doc-7 §2.2).
    expect(CANONICAL_COLUMNS).not.toContain(unmappedLabel());
    expect(laneCounts(row(swimlane(["atlas"], loadMap(loaded("atlas", []))), "atlas"), true).at(-1)
      ?.column).toBeNull();

    expect(columnFoldable([], "unmapped")).toBe(true);
    // Three status columns folded: 未分類 may still be folded — doing so takes no status column away.
    expect(columnFoldable(["toDo", "inProgress", "inReview"], "unmapped")).toBe(true);
    // 常に畳める is asserted at the one input that separates it from ほぼ常に: a state the screen cannot
    // reach (the fourth column's control is refused), but this function is exported and says "always".
    expect(columnFoldable(["toDo", "inProgress", "inReview", "done"], "unmapped")).toBe(true);
    // …and it does not stand in for the one left open: 'done' is still refused with 未分類 open, since
    // the 未分類区画 disappears once no row has such a task (doc-7 §2.2).
    expect(columnFoldable(["toDo", "inProgress", "inReview"], "done")).toBe(false);
  });
});

// TASK-66.
describe("AC #2・#3 見出し横の総件数", () => {
  const three = loadMap(
    loaded("atlas", [
      taskView({ id: "TASK-1", sourcePath: "a.md", column: "toDo", title: "parser" }),
      taskView({ id: "TASK-2", sourcePath: "b.md", column: "done" }),
    ]),
    loaded("geomyth", [taskView({ id: "TASK-3", sourcePath: "c.md", column: "toDo" })]),
    loaded("kanri", [taskView({ id: "TASK-4", sourcePath: "d.md", column: "inReview" })]),
  );

  it("counts every card of every drawn row, and every registered project", () => {
    const totals = swimlaneTotals(swimlane(["atlas", "geomyth", "kanri"], three), 3);

    expect(totals).toEqual({ shownCards: 4, totalCards: 4, shownLanes: 3, totalLanes: 3 });
    expect(totalsLabel(totals)).toBe("表示 4 / 4 件 ・ 3 / 3 プロジェクト");
  });

  it("moves 表示数 alone when the filter takes cards away", () => {
    // 絞り込みはカードの取捨のみを行う (doc-7 §5.2), so 全件 and both lane numbers stand still and the
    // pair says how much of the grid the filter is keeping back.
    const totals = swimlaneTotals(
      swimlane(["atlas", "geomyth", "kanri"], three, { text: "parser" }),
      3,
    );

    expect(totals).toEqual({ shownCards: 1, totalCards: 4, shownLanes: 3, totalLanes: 3 });
  });

  it("takes a hidden row out of both card numbers but only out of 表示数 for the lanes", () => {
    // The card totals are the sum of the per-row 内訳 on the drawn レーンヘッダ行 (doc-7 §5.2), so a row
    // that is not drawn is in neither. The lane pair is the opposite: 全件 is the ledger, which is what
    // makes the hidden row readable as the difference.
    const totals = swimlaneTotals(swimlane(["atlas", "geomyth", "kanri"], three, {}, ["atlas"]), 3);

    expect(totals).toEqual({ shownCards: 2, totalCards: 2, shownLanes: 2, totalLanes: 3 });
    expect(totalsLabel(totals)).toBe("表示 2 / 2 件 ・ 2 / 3 プロジェクト");
  });

  it("counts a 読取不能行 as a lane on screen that contributes no cards", () => {
    const totals = swimlaneTotals(
      swimlane(
        ["atlas", "broken"],
        loadMap(
          loaded("atlas", [taskView({ id: "TASK-1", sourcePath: "a.md", column: "toDo" })]),
          unreadable("broken"),
        ),
      ),
      2,
    );

    expect(totals).toEqual({ shownCards: 1, totalCards: 1, shownLanes: 2, totalLanes: 2 });
  });
});

// TASK-61. Only the arithmetic is here: whether the two rows *look* right when stuck is a matter of
// the stylesheet, which no environment these tests run in lays out (AGENTS の テスト節).
describe("2 層スティッキーの下への着地", () => {
  const grid = { headHeight: 32, laneHeight: 24, viewportHeight: 300 };

  it("leaves a lane alone when its header is already whole and clear of the 列ヘッダ行", () => {
    expect(laneScrollDelta({ ...grid, offset: 100 })).toBe(0);
    // Sitting exactly on the 列ヘッダ行's lower edge is where a 着地 puts it, so it is not a move.
    expect(laneScrollDelta({ ...grid, offset: 32 })).toBe(0);
    // The last position at which the whole header still fits above the lower edge.
    expect(laneScrollDelta({ ...grid, offset: 276 })).toBe(0);
  });

  it("returns to a lane the grid has scrolled past", () => {
    // −500 is 500 above the scrollport's top; the landing is 32 below it, hence 532 back.
    expect(laneScrollDelta({ ...grid, offset: -500 })).toBe(-532);
  });

  it("returns to a lane whose header is behind the 列ヘッダ行 rather than off the screen", () => {
    // The whole reason the test is against `headHeight` and not against 0: at offset 8 the lane's
    // header is within the scrollport, and every "is it visible" answer that reads a rect says yes,
    // while what the user sees at that line is the 列ヘッダ行.
    expect(laneScrollDelta({ ...grid, offset: 8 })).toBe(-24);
  });

  it("brings up a lane below the fold, and one the fold cuts in half", () => {
    expect(laneScrollDelta({ ...grid, offset: 900 })).toBe(868);
    // 290 + 24 > 300: the header is on screen but clipped, which is not 見えている.
    expect(laneScrollDelta({ ...grid, offset: 290 })).toBe(258);
  });

  it("follows the 列ヘッダ行's height rather than a written-down one", () => {
    // 受入条件 #3: the 列ヘッダ行's height is not a constant — the root font-size scales its one line,
    // and anything later added to a head moves it — so the landing follows the measured height. The
    // same lane position lands differently only by the difference in the height it is stuck below.
    const folded = { ...grid, headHeight: 56 };
    expect(laneScrollDelta({ ...folded, offset: 8 })).toBe(-48);
    expect(laneScrollDelta({ ...folded, offset: 40 })).toBe(-16);
    // …and what was already in place under a 32px head is not under a 56px one.
    expect(laneScrollDelta({ ...grid, offset: 40 })).toBe(0);
  });
});

// 図形の族 (doc-11 §2.4 の 同じ図形を別の操作へ与えない, TASK-139). The rule is cross-screen — chevron は
// 折畳み、arrow は移動、and no figure belongs to both — so it is checked against both screens' tables at
// once: this screen's `LANE_FIGURE` and タスク詳細's `DISCLOSURE_ICON` (doc-8 §3). Reading only one of
// them would let the other take a chevron for a move without anything noticing, which is exactly what
// the rule was written for: 行末の入口 looks like `›` and the nearest figure by shape is the 列折畳み's.
describe("レーンの図形", () => {
  /** The figures the two screens draw, by family — every one the rule speaks about. */
  const FOLD = [
    ...Object.values(LANE_FIGURE.rowFold),
    ...Object.values(LANE_FIGURE.columnFold),
    ...Object.values(DISCLOSURE_ICON),
  ];
  const MOVE = [
    LANE_FIGURE.moveUp,
    LANE_FIGURE.moveDown,
    LANE_FIGURE.openProject,
    ...Object.values(STEP_ICON),
  ];

  /** The figures two given sets have in common — an empty result is what the rule asks for. */
  const shared = (a: readonly string[], b: readonly string[]): string[] =>
    [...new Set(a.filter((figure) => b.includes(figure)))];

  it("折畳みは chevron、移動は arrow で描く", () => {
    for (const figure of FOLD) {
      expect(figure).toMatch(/^chevron-/);
    }
    for (const figure of MOVE) {
      expect(figure).toMatch(/^arrow-/);
    }
  });

  it("同じ図形が折畳みと移動の両方に出ない", () => {
    expect(shared(FOLD, MOVE)).toEqual([]);
  });

  // 行折畳み points at the state (doc-7 §2.3), 列折畳み at what the press does (§2.2) — so neither pair
  // may be the other's, and neither may print one figure in both of its states. The check is on the
  // intersection rather than on the pairs being unequal: a pair that shares *one* figure with the other
  // already puts a single chevron on both「この行は開いている」and「押すとこの列が開く」, on the screen
  // that draws both, and comparing the pairs as wholes would let that through.
  it("2 つの折畳みは 1 つも図形を共有せず、各組の 2 態も違う図形になる", () => {
    expect(LANE_FIGURE.rowFold.open).not.toBe(LANE_FIGURE.rowFold.folded);
    expect(LANE_FIGURE.columnFold.fold).not.toBe(LANE_FIGURE.columnFold.unfold);
    expect(shared(Object.values(LANE_FIGURE.rowFold), Object.values(LANE_FIGURE.columnFold))).toEqual(
      [],
    );
  });

  // 行の並べ替え と 前後移動 は同じ 2 つを取る (doc-11 §2.4): both move one step up or down, and the
  // 脇パネル配置 puts them on screen together — the rule bars sharing between operations that point at
  // different things, so this pair being shared is the rule holding rather than an exception to it.
  // Read from both tables rather than restated once, so a change to either side has to move the other.
  it("並べ替えは 前後移動 と同じ組を取り、行末の入口だけが別の図形になる", () => {
    expect([LANE_FIGURE.moveUp, LANE_FIGURE.moveDown]).toEqual([STEP_ICON.previous, STEP_ICON.next]);
    expect([STEP_ICON.previous, STEP_ICON.next]).toEqual(["arrow-up", "arrow-down"]);
    expect(LANE_FIGURE.openProject).not.toBe(LANE_FIGURE.moveUp);
    expect(LANE_FIGURE.openProject).not.toBe(LANE_FIGURE.moveDown);
  });
});
