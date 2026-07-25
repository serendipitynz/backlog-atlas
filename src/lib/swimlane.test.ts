import { describe, expect, it } from "vitest";
import { DEFAULT_FILTER, type CardFilter } from "./filter";
import { loadMap, loaded, taskView, unreadable } from "./fixtures";
import {
  CANONICAL_COLUMNS,
  buildSwimlane,
  compareCards,
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
