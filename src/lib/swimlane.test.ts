import { describe, expect, it } from "vitest";
import { DEFAULT_FILTER, type CardFilter } from "./filter";
import { loadMap, loaded, taskView, unreadable } from "./fixtures";
import {
  CANONICAL_COLUMNS,
  ROW_FOLD_ABSENT_REASON,
  UNMAPPED_FOLD_ABSENT_REASON,
  UNMAPPED_LABEL,
  buildSwimlane,
  cellCount,
  columnTotal,
  compareCards,
  laneCounts,
  laneNeighbourLabel,
  laneNeighbours,
  rowFoldable,
  visibleCount,
  type SwimlaneRow,
} from "./swimlane";
import { cardIdentity, crossTaskId } from "./card";

function swimlane(
  order: string[],
  loads: Map<string, ReturnType<typeof loaded>>,
  overrides: Partial<CardFilter> = {},
  hidden: string[] = [],
): SwimlaneRow[] {
  return buildSwimlane({
    order,
    loads,
    hidden: new Set(hidden),
    filter: { ...DEFAULT_FILTER, ...overrides },
  });
}

function row(rows: SwimlaneRow[], slug: string): SwimlaneRow {
  const found = rows.find((r) => r.slug === slug);
  if (found === undefined) throw new Error(`no row for ${slug}`);
  return found;
}

function ids(row: SwimlaneRow, column: string): (string | null)[] {
  if (row.state !== "loaded") throw new Error("row has no cells");
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
      if (r.state !== "loaded") throw new Error("expected a loaded row");
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
    if (atlas.state !== "loaded") throw new Error("expected a loaded row");
    expect(atlas.totalBeforeFilter).toBe(4);
  });
});

describe("AC #2 未対応区画", () => {
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
    if (atlas.state !== "loaded") throw new Error("expected a loaded row");
    expect(atlas.unmapped.map((view) => view.task.id)).toEqual(["TASK-9"]);
    expect(atlas.unmapped[0].interpretation.status?.raw).toBe("Blocked");
    // And it is nowhere in the canonical columns.
    for (const cell of atlas.cells) {
      expect(cell.tasks.map((view) => view.task.id)).not.toContain("TASK-9");
    }
  });

  it("puts a task with no status at all in the 未対応区画, not in a column", () => {
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
    if (atlas.state !== "loaded") throw new Error("expected a loaded row");
    expect(atlas.unmapped).toHaveLength(1);
    expect(atlas.unmapped[0].interpretation.status).toBeNull();
    expect(atlas.cells.every((cell) => cell.tasks.length === 0)).toBe(true);
  });

  it("leaves the 未対応区画 empty when every status maps", () => {
    const rows = swimlane(["atlas"], loadMap(loaded("atlas", [taskView()])));
    const atlas = row(rows, "atlas");
    if (atlas.state !== "loaded") throw new Error("expected a loaded row");
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

describe("AC #4 セル内の安定並び", () => {
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
    expect([older, newer].sort(compareCards).map((v) => v.task.id)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("sorts a task with no priority, ordinal or date last within its step", () => {
    const placed = taskView({ id: "placed", ordinal: 10 });
    const unplaced = taskView({ id: "unplaced", ordinal: null });
    expect([unplaced, placed].sort(compareCards).map((v) => v.task.id)).toEqual([
      "placed",
      "unplaced",
    ]);
    const dated = taskView({ id: "dated", updatedDate: "2026-01-01" });
    const undated = taskView({ id: "undated", updatedDate: null });
    expect([undated, dated].sort(compareCards).map((v) => v.task.id)).toEqual([
      "dated",
      "undated",
    ]);
  });

  it("keeps equal-key cards in the read layer's order, so positions do not jump", () => {
    const first = taskView({ id: "TASK-1", priority: "high", ordinal: 1, updatedDate: "2026-07-01" });
    const second = taskView({ id: "TASK-2", priority: "high", ordinal: 1, updatedDate: "2026-07-01" });
    expect([first, second].sort(compareCards).map((v) => v.task.id)).toEqual([
      "TASK-1",
      "TASK-2",
    ]);
    // Same inputs, same result — the comparison introduces no order of its own.
    expect([second, first].sort(compareCards).map((v) => v.task.id)).toEqual([
      "TASK-2",
      "TASK-1",
    ]);
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
    if (broken.state !== "unreadable") throw new Error("expected an unreadable row");
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
    if (empty.state !== "loaded") throw new Error("expected a loaded row");
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
    if (atlas.state !== "loaded") throw new Error("expected a loaded row");
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
    expect(laneNeighbourLabel(middle!)).toBe("To Do セル内 2 / 3 件");
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

  it("counts the 未対応区画 as its own run of cards, named apart from a canonical column", () => {
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
    expect(laneNeighbourLabel(first!)).toBe("未対応 セル内 1 / 2 件");
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
describe("AC #2 列折畳みは全行同時にのみ効き、畳んだ列が列名と件数を残す", () => {
  it("counts a column across every row, which is what a folded column can still show", () => {
    const rows = swimlane(
      ["atlas", "geomyth"],
      loadMap(
        loaded("atlas", [
          taskView({ id: "TASK-1", sourcePath: "a.md", column: "toDo" }),
          taskView({ id: "TASK-2", sourcePath: "b.md", column: "toDo" }),
          taskView({ id: "TASK-3", sourcePath: "c.md", column: "done" }),
        ]),
        loaded("geomyth", [taskView({ id: "TASK-4", sourcePath: "d.md", column: "toDo" })]),
      ),
    );

    expect(columnTotal(rows, "toDo")).toBe(3);
    expect(columnTotal(rows, "done")).toBe(1);
    expect(columnTotal(rows, "inReview")).toBe(0);
  });

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

  it("adds 未対応 only while the grid is showing that column", () => {
    const rows = swimlane(
      ["atlas"],
      loadMap(
        loaded("atlas", [taskView({ id: "TASK-1", sourcePath: "a.md", column: null })]),
      ),
    );

    expect(laneCounts(row(rows, "atlas"), false).map((entry) => entry.label)).not.toContain(
      UNMAPPED_LABEL,
    );
    expect(laneCounts(row(rows, "atlas"), true).at(-1)).toEqual({
      column: null,
      label: UNMAPPED_LABEL,
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

describe("AC #5・#6 折畳みの対象にしないもの", () => {
  it("withholds 行折畳み from a row with no cells to fold, with the reason spelled out", () => {
    const rows = swimlane(
      ["broken", "waiting", "atlas"],
      loadMap(unreadable("broken"), loaded("atlas", [taskView()])),
    );

    expect(rowFoldable(row(rows, "broken"))).toBe(false);
    expect(rowFoldable(row(rows, "waiting"))).toBe(false);
    expect(rowFoldable(row(rows, "atlas"))).toBe(true);
    expect(ROW_FOLD_ABSENT_REASON).not.toBe("");
  });

  it("leaves 未対応 out of the columns 列折畳み can reach", () => {
    // 列折畳み is offered per `CANONICAL_COLUMNS` entry, and 未対応 is not one of them (doc-7 §2.2).
    expect(CANONICAL_COLUMNS).not.toContain(UNMAPPED_LABEL);
    expect(laneCounts(row(swimlane(["atlas"], loadMap(loaded("atlas", []))), "atlas"), true).at(-1)
      ?.column).toBeNull();
    expect(UNMAPPED_FOLD_ABSENT_REASON).not.toBe("");
  });
});
